const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileProject } = require("./compile");
const { extractContent } = require("./extraction");
const { ingest } = require("./ingest");
const { ensureProjectStructure, loadSettings } = require("./project");
const { detectDocumentClass } = require("./source-routing");
const {
  appendJsonl,
  ensureDir,
  nowIso,
  readJson,
  readText,
  relativeToRoot,
  slugify,
  timestampStamp,
  titleFromFilename,
  truncate,
  writeJson,
  writeText
} = require("./utils");

const EXTRACTION_PLACEHOLDER_MARKER = "REPLACE_WITH_AUTHORED_EXTRACTION";
const TITLE_CASE_LOWER_WORDS = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "the", "to"]);
const TITLE_CASE_UPPER_WORDS = new Set(["ai", "ce", "eu", "gtm", "jp", "jpm", "uk", "us"]);

function normalizeList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  return String(value)
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueList(values) {
  return [...new Set(normalizeList(values))];
}

function uniqueArrayStrings(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  ];
}

function normalizeLimit(value, fallback = 0) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function humanTitleFromFilename(filePath) {
  const baseTitle = titleFromFilename(filePath);
  if (!baseTitle) {
    return "";
  }

  return baseTitle
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (TITLE_CASE_UPPER_WORDS.has(lower)) {
        return lower.toUpperCase();
      }
      if (index > 0 && TITLE_CASE_LOWER_WORDS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function listPdfFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  const results = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") {
          continue;
        }
        visit(fullPath);
      } else if (entry.name.toLowerCase().endsWith(".pdf")) {
        results.push(fullPath);
      }
    }
  };

  visit(directoryPath);
  return results.sort((left, right) => left.localeCompare(right));
}

function defaultPdfRenderRunner(root, pdfPath, outputDir, options = {}) {
  const scriptPath = path.join(root, "tools", "render_pdf_pages.py");
  const pythonInvocations =
    process.platform === "win32"
      ? [
          { command: "py", args: ["-3", scriptPath] },
          { command: "python", args: [scriptPath] }
        ]
      : [{ command: "python3", args: [scriptPath] }, { command: "python", args: [scriptPath] }];

  const sharedArgs = [
    "--input",
    pdfPath,
    "--output-dir",
    outputDir,
    "--dpi",
    String(normalizeLimit(options.dpi, 144) || 144),
    "--max-pages",
    String(normalizeLimit(options.maxPages, 0))
  ];

  let lastFailure = null;
  for (const invocation of pythonInvocations) {
    const result = spawnSync(invocation.command, invocation.args.concat(sharedArgs), {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024
    });

    if (result.error) {
      lastFailure = result.error.message || String(result.error);
      continue;
    }
    if (result.status !== 0) {
      const stderr = (result.stderr || "").trim();
      const stdout = (result.stdout || "").trim();
      lastFailure = stderr || stdout || "PDF page rendering failed.";
      continue;
    }

    try {
      return JSON.parse(String(result.stdout || "{}").trim());
    } catch (error) {
      lastFailure = `Could not parse renderer output: ${error.message}`;
    }
  }

  return { ok: false, error: lastFailure || "No Python PDF renderer is available." };
}

function chooseSuggestedTitle(pdfPath, renderResult) {
  const metadataTitle = String(renderResult?.metadata?.title || "").trim();
  if (metadataTitle && metadataTitle.length >= 6) {
    return metadataTitle;
  }
  return humanTitleFromFilename(pdfPath);
}

function extractionPlaceholder(title) {
  return `${EXTRACTION_PLACEHOLDER_MARKER}

Replace this file with the Codex/GPT-authored extraction for "${title}".

Suggested shape:

# ${title}

## Clean Extracted Text

## Charts And Figures

## Tables And Data

## Uncertainties
`;
}

function buildPackPrompt(pack, documents) {
  return `# PDF Vision Handoff

This pack exists so Codex/GPT can act as the PDF OCR, vision, chart-reading, and table-reading layer without embedding a model API into Cato.

Important:

- You may inspect the original PDFs directly from the paths below if your current Codex workflow supports that.
- The rendered page images under each document folder are the stable review surface and should be treated as the default inspection path.
- The baseline machine extraction is only a fallback aid. Do not trust it when the PDF is visually richer than the recovered text.

## What To Do

For each document in this pack:

1. Review the rendered page images in its \`pages/\` directory and, if useful, the original PDF path.
2. Replace the placeholder text in the document's \`authored-extraction.md\` file with a clean extraction.
3. Update the generated capture bundle with:
   - final title
   - document class
   - author/date/source URL if visible
   - tags, entities, and concepts when they are grounded
   - review_status, review_method, and review_scope once the extraction has actually been checked
   - any figure refs worth preserving
4. Keep the extraction factual. If a chart or table is ambiguous, say that explicitly instead of hallucinating precision.
5. When the bundle is ready, run:

\`\`\`powershell
.\\cato.cmd capture-pdf .\\${pack.capturePath.replace(/\//g, "\\")}
\`\`\`

## Pack Paths

- Pack manifest: \`${pack.packPath}\`
- Capture bundle: \`${pack.capturePath}\`

## Documents

${documents
  .map((document, index) => {
    const pageLine = document.rendered_pages.length
      ? `${document.rendered_pages.length} rendered page image(s)`
      : `no rendered pages (${document.render_error || "render unavailable"})`;
    return `### ${index + 1}. ${document.suggested_title}

- Source PDF: \`${document.source_path}\`
- Page images: \`${document.pages_dir}\` (${pageLine})
- Baseline extract: \`${document.baseline_extract_path}\`
- Authored extraction target: \`${document.authored_extraction_path}\`
- Suggested class: \`${document.suggested_document_class}\``;
  })
  .join("\n\n")}
`;
}

function buildCaptureBundle(packRelativePath, documents) {
  return {
    pack_path: packRelativePath,
    capture_source: "codex_pdf_vision_handoff",
    model: "",
    notes: "",
    documents: documents.map((document) => ({
      source_path: document.source_path,
      title: document.suggested_title,
      author: document.suggested_author || "",
      date: "",
      document_class: document.suggested_document_class,
      source_url: "",
      origin_url: "",
      capture_notes: "",
      tags: [],
      entities: [],
      concepts: [],
      review_status: "unreviewed",
      reviewed_at: "",
      review_method: "",
      review_scope: "",
      extracted_text_path: document.authored_extraction_path,
      extraction_method: "llm_vision_handoff",
      extraction_notes: [
        "Replace with operator-authored notes about how the extraction was produced or any uncertainty worth carrying into Cato."
      ],
      figure_refs: []
    }))
  };
}

function resolveBundle(root, bundleInput) {
  if (typeof bundleInput === "string") {
    const bundlePath = path.isAbsolute(bundleInput) ? bundleInput : path.join(root, bundleInput);
    if (!fs.existsSync(bundlePath)) {
      throw new Error(`PDF capture bundle not found: ${bundlePath}`);
    }
    return {
      bundle: readJson(bundlePath, {}),
      bundlePath,
      bundleDir: path.dirname(bundlePath)
    };
  }
  return {
    bundle: bundleInput || {},
    bundlePath: "",
    bundleDir: root
  };
}

function resolveBundlePath(root, bundleDir, candidate) {
  if (!candidate) {
    return "";
  }
  if (path.isAbsolute(candidate)) {
    return candidate;
  }

  const bundleRelative = path.join(bundleDir, candidate);
  if (fs.existsSync(bundleRelative)) {
    return bundleRelative;
  }

  const rootRelative = path.join(root, candidate);
  if (fs.existsSync(rootRelative)) {
    return rootRelative;
  }

  return bundleRelative;
}

function readExtractedText(root, bundleDir, document) {
  const inline = String(document.extracted_text || "").trim();
  if (inline) {
    return inline;
  }

  const extractedTextPath = resolveBundlePath(root, bundleDir, document.extracted_text_path || "");
  if (!extractedTextPath || !fs.existsSync(extractedTextPath)) {
    return "";
  }

  const content = readText(extractedTextPath).trim();
  if (!content || content.includes(EXTRACTION_PLACEHOLDER_MARKER)) {
    return "";
  }
  return content;
}

function writePdfPack(root, options = {}) {
  ensureProjectStructure(root);
  const settings = loadSettings(root);
  const fromDir = path.join(root, options.from || settings.paths.inbox || "inbox/drop_here");
  const limit = normalizeLimit(options.limit, 0);
  const dpi = normalizeLimit(options.dpi, 144) || 144;
  const maxPages = normalizeLimit(options["max-pages"] || options.maxPages, 0);
  const renderRunner =
    typeof options.renderRunner === "function"
      ? (pdfPath, outputDir, renderOptions) => options.renderRunner(root, pdfPath, outputDir, renderOptions)
      : (pdfPath, outputDir, renderOptions) => defaultPdfRenderRunner(root, pdfPath, outputDir, renderOptions);

  const pdfFiles = listPdfFiles(fromDir);
  const selected = limit ? pdfFiles.slice(0, limit) : pdfFiles;
  if (!selected.length) {
    throw new Error(`No PDF files found under ${fromDir}`);
  }

  const batchSlug = `${timestampStamp()}-pdf-vision-pack`;
  const batchDir = path.join(root, "cache", "pdf-packs", batchSlug);
  const documentsDir = path.join(batchDir, "documents");
  ensureDir(documentsDir);

  const documents = [];
  for (const [index, pdfPath] of selected.entries()) {
    const documentSlug = `${String(index + 1).padStart(2, "0")}-${slugify(path.basename(pdfPath, ".pdf")).slice(0, 72) || "document"}`;
    const documentDir = path.join(documentsDir, documentSlug);
    const pagesDir = path.join(documentDir, "pages");
    ensureDir(pagesDir);

    const baseline = extractContent(pdfPath);
    const baselineExtractPath = path.join(documentDir, "baseline-extract.txt");
    writeText(
      baselineExtractPath,
      `${baseline.extractedText || ""}${baseline.extractedText ? "\n" : ""}`
    );

    const renderResult = renderRunner(pdfPath, pagesDir, { dpi, maxPages });
    const suggestedTitle = chooseSuggestedTitle(pdfPath, renderResult);
    const suggestedClass = detectDocumentClass("paper", suggestedTitle, baseline.extractedText, {
      author: renderResult?.metadata?.author || ""
    });
    const authoredExtractionPath = path.join(documentDir, "authored-extraction.md");
    writeText(authoredExtractionPath, extractionPlaceholder(suggestedTitle));

    const renderedPages = Array.isArray(renderResult?.rendered_pages)
      ? renderResult.rendered_pages.map((page) => ({
          page: page.page,
          path: relativeToRoot(root, path.join(pagesDir, page.path)),
          width: page.width || 0,
          height: page.height || 0
        }))
      : [];

    documents.push({
      source_path: relativeToRoot(root, pdfPath),
      source_absolute_path: pdfPath,
      suggested_title: suggestedTitle,
      suggested_author: String(renderResult?.metadata?.author || "").trim(),
      suggested_document_class: suggestedClass,
      page_count: Number(renderResult?.page_count || 0) || 0,
      pages_dir: relativeToRoot(root, pagesDir),
      rendered_pages: renderedPages,
      baseline_extract_path: relativeToRoot(root, baselineExtractPath),
      baseline_extraction_method: baseline.extractionMethod,
      baseline_extraction_status: baseline.extractionStatus,
      authored_extraction_path: relativeToRoot(root, authoredExtractionPath),
      render_error: renderResult?.ok === false ? renderResult.error || "Render failed." : "",
      renderer: renderResult?.renderer || "",
      baseline_excerpt: truncate((baseline.extractedText || "").replace(/\s+/g, " "), 320)
    });
  }

  const packPath = path.join(batchDir, `${batchSlug}-pack.json`);
  const capturePath = path.join(batchDir, `${batchSlug}-capture.json`);
  const promptPath = path.join(batchDir, `${batchSlug}-prompt.md`);
  const relativePackPath = relativeToRoot(root, packPath);
  const relativeCapturePath = relativeToRoot(root, capturePath);
  const relativePromptPath = relativeToRoot(root, promptPath);

  writeJson(packPath, {
    generated_at: nowIso(),
    from: relativeToRoot(root, fromDir),
    limit: limit || selected.length,
    dpi,
    max_pages: maxPages,
    documents
  });
  writeJson(capturePath, buildCaptureBundle(relativePackPath, documents));
  writeText(
    promptPath,
    `${buildPackPrompt(
      {
        packPath: relativePackPath,
        capturePath: relativeCapturePath
      },
      documents
    ).trim()}\n`
  );

  appendJsonl(path.join(root, "logs", "actions", "pdf_pack.jsonl"), {
    event: "pdf_pack",
    at: nowIso(),
    from: relativeToRoot(root, fromDir),
    documents: documents.length,
    pack_path: relativePackPath,
    capture_path: relativeCapturePath,
    prompt_path: relativePromptPath
  });

  return {
    documents: documents.length,
    packPath: relativePackPath,
    capturePath: relativeCapturePath,
    promptPath: relativePromptPath
  };
}

function mergeNotes(...values) {
  const merged = [];
  const seen = new Set();

  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) {
      continue;
    }

    const blocks = text.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
    for (const block of blocks) {
      if (seen.has(block)) {
        continue;
      }
      seen.add(block);
      merged.push(block);
    }
  }

  return merged.join("\n\n");
}

function capturePdf(root, bundleInput, options = {}) {
  ensureProjectStructure(root);
  const resolved = resolveBundle(root, bundleInput);
  const bundle = resolved.bundle;
  const bundleDir = resolved.bundleDir;
  const documents = Array.isArray(bundle.documents) ? bundle.documents : [];
  if (!documents.length) {
    throw new Error("PDF capture bundle does not contain any documents.");
  }

  const staged = [];
  const failures = [];
  const explicitPaths = [];

  for (const [index, document] of documents.entries()) {
    const sourcePath = resolveBundlePath(root, bundleDir, document.source_path || document.pdf_path || document.path || "");
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      failures.push({
        index,
        title: document.title || `document-${index + 1}`,
        error: "Source PDF path is missing or does not exist."
      });
      continue;
    }
    if (path.extname(sourcePath).toLowerCase() !== ".pdf") {
      failures.push({
        index,
        title: document.title || path.basename(sourcePath),
        error: "Source path is not a PDF."
      });
      continue;
    }

    const extractedText = readExtractedText(root, bundleDir, document);
    if (!extractedText) {
      failures.push({
        index,
        title: document.title || path.basename(sourcePath),
        error: "No authored extraction text was provided."
      });
      continue;
    }

    const sidecarPath = `${sourcePath}.cato-meta.json`;
    const existing = readJson(sidecarPath, {});
    const sidecar = {
      ...existing,
      title: document.title || existing.title || humanTitleFromFilename(sourcePath),
      author: document.author || existing.author || "",
      date: document.date || existing.date || "",
      document_class: document.document_class || existing.document_class || "",
      source_url: document.source_url || existing.source_url || "",
      origin_url: document.origin_url || existing.origin_url || "",
      capture_source: document.capture_source || bundle.capture_source || existing.capture_source || "codex_pdf_vision_handoff",
      capture_model: document.model || bundle.model || existing.capture_model || "",
      captured_at: nowIso(),
      capture_notes: mergeNotes(existing.capture_notes, bundle.notes, document.capture_notes),
      tags: uniqueList([...(existing.tags || []), ...(document.tags || [])]),
      entities: uniqueList([...(existing.entities || []), ...(document.entities || [])]),
      concepts: uniqueList([...(existing.concepts || []), ...(document.concepts || [])]),
      review_status: document.review_status || existing.review_status || "unreviewed",
      reviewed_at: document.reviewed_at || existing.reviewed_at || "",
      review_method: document.review_method || existing.review_method || "",
      review_scope: document.review_scope || existing.review_scope || "",
      extracted_text: extractedText,
      extraction_status: document.extraction_status || existing.extraction_status || "extracted",
      extraction_method: document.extraction_method || existing.extraction_method || "llm_vision_handoff",
      extraction_notes: uniqueArrayStrings([
        ...(existing.extraction_notes || []),
        ...(document.extraction_notes || []),
        bundle.model ? `Model: ${bundle.model}` : ""
      ]),
      figure_refs: Array.isArray(document.figure_refs) ? document.figure_refs : existing.figure_refs || []
    };

    writeJson(sidecarPath, sidecar);
    explicitPaths.push(sourcePath);
    staged.push({
      sourcePath: relativeToRoot(root, sourcePath),
      sidecarPath: relativeToRoot(root, sidecarPath),
      title: sidecar.title
    });
  }

  if (!explicitPaths.length) {
    throw new Error(`No valid PDF documents were staged from the capture bundle. Failures: ${failures.length}`);
  }

  const ingestResult = ingest(root, {
    paths: explicitPaths,
    copy: Boolean(options.copy),
    ocrRunner: options.ocrRunner
  });
  const compileResult = compileProject(root, {
    promoteCandidates: Boolean(options["promote-candidates"])
  });

  appendJsonl(path.join(root, "logs", "actions", "pdf_capture.jsonl"), {
    event: "pdf_capture",
    at: nowIso(),
    bundle_path: resolved.bundlePath ? relativeToRoot(root, resolved.bundlePath) : "",
    staged: staged.length,
    ingested: ingestResult.ingested,
    failures: failures.length
  });

  return {
    staged,
    failures,
    ingested: ingestResult.ingested,
    results: ingestResult.results,
    compileResult
  };
}

module.exports = {
  capturePdf,
  writePdfPack
};
