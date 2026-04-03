const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { RAW_SUBDIR_BY_SOURCE_TYPE, SOURCE_TYPE_BY_EXTENSION, STOPWORDS } = require("./constants");
const { renderMarkdown } = require("./markdown");
const { extractCandidateConcepts, isMeaningfulExplicitConcept, buildConceptOntologyIndex } = require("./concept-quality");
const { extractContent } = require("./extraction");
const { ensureProjectStructure, loadSettings } = require("./project");
const { downloadWebSource } = require("./web-import");
const {
  appendJsonl,
  computeHash,
  copyFile,
  ensureDir,
  makeId,
  moveFile,
  nowIso,
  readJson,
  relativeToRoot,
  slugify,
  titleFromFilename,
  truncate,
  uniquePath,
  writeJson,
  writeText
} = require("./utils");

const REPO_MARKER_NAMES = new Set([
  ".git",
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "gemfile",
  "mix.exs"
]);

const REPO_CODE_EXTENSIONS = new Set([
  ".c",
  ".cpp",
  ".cs",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".py",
  ".r",
  ".rb",
  ".rs",
  ".scala",
  ".sql",
  ".swift",
  ".ts",
  ".tsx"
]);

const INGEST_SKIP_DIRS = new Set([".git", "node_modules", ".venv", "__pycache__"]);
const SOURCE_METADATA_SIDECAR_SUFFIX = ".cato-meta.json";

function detectSourceType(targetPath, targetKind = "file") {
  if (targetKind === "directory") {
    return "repo";
  }
  return SOURCE_TYPE_BY_EXTENSION[path.extname(targetPath).toLowerCase()] || "note";
}

function prepareUrlDrop(inboxDir, url, explicitTitle = "") {
  ensureDir(inboxDir);
  return downloadWebSource(inboxDir, url, {
    title: explicitTitle,
    captureSource: "explicit_url"
  }).filePath;
}

function safeDirectoryEntries(directoryPath) {
  try {
    return fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch (error) {
    return [];
  }
}

function looksLikeRepoSnapshot(directoryPath) {
  const directEntries = safeDirectoryEntries(directoryPath);
  const directNames = new Set(directEntries.map((entry) => entry.name.toLowerCase()));
  if ([...directNames].some((name) => REPO_MARKER_NAMES.has(name))) {
    return true;
  }

  let scannedFiles = 0;
  let codeFiles = 0;
  let readmeFound = false;

  const visit = (currentDir, depth = 0) => {
    if (scannedFiles >= 200 || codeFiles >= 5 || (readmeFound && codeFiles >= 2)) {
      return;
    }

    for (const entry of safeDirectoryEntries(currentDir)) {
      if (scannedFiles >= 200 || codeFiles >= 5 || (readmeFound && codeFiles >= 2)) {
        return;
      }

      if (entry.isDirectory()) {
        if (INGEST_SKIP_DIRS.has(entry.name.toLowerCase()) || depth >= 2) {
          continue;
        }
        visit(path.join(currentDir, entry.name), depth + 1);
        continue;
      }

      scannedFiles += 1;
      const lowerName = entry.name.toLowerCase();
      const extension = path.extname(lowerName);
      if (lowerName.startsWith("readme")) {
        readmeFound = true;
      }
      if (REPO_MARKER_NAMES.has(lowerName)) {
        codeFiles += 2;
      } else if (REPO_CODE_EXTENSIONS.has(extension)) {
        codeFiles += 1;
      }
    }
  };

  visit(directoryPath);
  return codeFiles >= 5 || (readmeFound && codeFiles >= 2);
}

function listIngestTargets(inboxDir) {
  if (!fs.existsSync(inboxDir)) {
    return [];
  }
  if (fs.statSync(inboxDir).isDirectory() && looksLikeRepoSnapshot(inboxDir)) {
    return [{ path: inboxDir, kind: "directory" }];
  }

  const results = [];
  const visit = (currentDir) => {
    for (const entry of safeDirectoryEntries(currentDir)) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (INGEST_SKIP_DIRS.has(entry.name.toLowerCase())) {
          continue;
        }
        if (looksLikeRepoSnapshot(fullPath)) {
          results.push({ path: fullPath, kind: "directory" });
        } else {
          visit(fullPath);
        }
        continue;
      }

      if (entry.name.toLowerCase().endsWith(SOURCE_METADATA_SIDECAR_SUFFIX)) {
        continue;
      }
      results.push({ path: fullPath, kind: "file" });
    }
  };

  visit(inboxDir);
  return results.sort((left, right) => left.path.localeCompare(right.path));
}

function sidecarMetadataPath(targetPath) {
  return `${targetPath}${SOURCE_METADATA_SIDECAR_SUFFIX}`;
}

function readSourceSidecar(targetPath) {
  return readJson(sidecarMetadataPath(targetPath), {});
}

function cleanupSourceSidecar(targetPath) {
  const sidecarPath = sidecarMetadataPath(targetPath);
  if (fs.existsSync(sidecarPath)) {
    fs.rmSync(sidecarPath, { force: true });
  }
}

function listDirectoryFilesForHash(directoryPath) {
  const files = [];
  const visit = (currentDir) => {
    for (const entry of safeDirectoryEntries(currentDir)) {
      if (entry.isDirectory()) {
        if (INGEST_SKIP_DIRS.has(entry.name.toLowerCase())) {
          continue;
        }
        visit(path.join(currentDir, entry.name));
      } else {
        files.push(path.join(currentDir, entry.name));
      }
    }
  };
  visit(directoryPath);
  return files.sort((left, right) => left.localeCompare(right));
}

function computeDirectoryHash(directoryPath) {
  const hash = crypto.createHash("sha256");
  const files = listDirectoryFilesForHash(directoryPath);

  if (!files.length) {
    hash.update("__empty_directory__");
    return hash.digest("hex");
  }

  for (const filePath of files) {
    hash.update(path.relative(directoryPath, filePath).replace(/\\/g, "/"));
    hash.update("\n");
    hash.update(fs.readFileSync(filePath));
    hash.update("\n");
  }

  return hash.digest("hex");
}

function copyDirectory(sourcePath, destinationPath) {
  ensureDir(path.dirname(destinationPath));
  fs.cpSync(sourcePath, destinationPath, { recursive: true });
}

function moveDirectory(sourcePath, destinationPath) {
  ensureDir(path.dirname(destinationPath));
  try {
    fs.renameSync(sourcePath, destinationPath);
  } catch (error) {
    if (error.code !== "EXDEV") {
      throw error;
    }
    fs.cpSync(sourcePath, destinationPath, { recursive: true });
    fs.rmSync(sourcePath, { recursive: true, force: true });
  }
}

function transferTarget(sourcePath, destinationPath, targetKind, copyMode) {
  if (targetKind === "directory") {
    if (copyMode) {
      copyDirectory(sourcePath, destinationPath);
    } else {
      moveDirectory(sourcePath, destinationPath);
    }
    return;
  }

  if (copyMode) {
    copyFile(sourcePath, destinationPath);
  } else {
    moveFile(sourcePath, destinationPath);
  }
}

function deriveTitle(filePath, importedFrontmatter, extractedText) {
  const heading = extractedText.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const firstLine = extractedText.split(/\r?\n/).find((line) => line.trim());
  const title =
    importedFrontmatter.title ||
    importedFrontmatter.name ||
    heading ||
    firstLine ||
    titleFromFilename(filePath);

  return truncate(title.replace(/^#+\s*/, ""), 120);
}

function extractSourceUrl(frontmatter) {
  return frontmatter.source_url || frontmatter.url || frontmatter.source || frontmatter.origin || "";
}

function normalizeList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function summaryFromExtractedText(extractedText, sourceType) {
  if (!extractedText.trim()) {
    if (sourceType === "paper") {
      return "PDF archived. Text extraction is not available in the current runtime without an external extractor.";
    }
    if (sourceType === "image") {
      return "Image archived. No OCR or caption extraction was performed in the current runtime.";
    }
    if (sourceType === "repo") {
      return "Repo snapshot archived. No repository manifest text was extracted automatically.";
    }
    return "Source archived. No text was extracted automatically.";
  }

  const paragraphs = extractedText
    .split(/\r?\n\r?\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return truncate(paragraphs.slice(0, 2).join(" "), 420);
}

function buildDatasetPreview(extractedText) {
  const lines = extractedText.split(/\r?\n/).filter(Boolean);
  if (!lines.length) {
    return "";
  }

  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : "";
  if (!delimiter) {
    return truncate(lines.slice(0, 8).join("\n"), 800);
  }

  const rows = lines.slice(0, 6).map((line) => line.split(delimiter).map((cell) => cell.trim()));
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] || 3, cell.length, 3);
    });
  }

  const formatted = rows.map((row, index) => {
    const padded = row.map((cell, cellIndex) => cell.padEnd(widths[cellIndex], " "));
    if (index === 0) {
      return `| ${padded.join(" | ")} |\n| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
    }
    return `| ${padded.join(" | ")} |`;
  });

  return formatted.join("\n");
}

function formatFigureInventory(figureRefs) {
  if (!figureRefs.length) {
    return "- No figures were indexed automatically.";
  }

  return figureRefs
    .map((figure, index) => {
      const lines = [`### Figure ${index + 1}: ${figure.label}`];
      if (figure.src) {
        lines.push(`- Reference: \`${figure.src}\``);
      }
      if (figure.caption) {
        lines.push(`- Caption: ${figure.caption}`);
      }
      if (figure.alt) {
        lines.push(`- Alt text: ${figure.alt}`);
      }
      if (figure.title) {
        lines.push(`- Title text: ${figure.title}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function buildFigureNote(record, extraction) {
  const figureRefs = extraction.figureRefs || [];
  const body = `
# Figure Note: ${record.title}

## Source

- Source id: \`${record.id}\`
- Source type: \`${record.source_type}\`
- Raw path: \`${record.raw_path}\`
- Source note: \`${record.note_path}\`

## Figure Inventory

${formatFigureInventory(figureRefs)}

## OCR / Visible Text

${extraction.extractedText ? extraction.extractedText : "- No visible text was extracted automatically."}

## Review Notes

- Treat figure OCR and extracted captions as aids, not as final truth.
- Revisit the raw figure or surrounding source context before relying on any single chart or image.
`;

  return renderMarkdown(
    {
      id: makeId("FIG", slugify(record.title).padEnd(12, "f")),
      kind: "figure-note",
      title: record.title,
      source_id: record.id,
      source_type: record.source_type,
      figure_count: figureRefs.length,
      raw_path: record.raw_path
    },
    body
  );
}

function buildSourceNote(record) {
  const frontmatter = {
    id: record.id,
    kind: "source-note",
    title: record.title,
    source_type: record.source_type,
    source_url: record.source_url || "",
    origin_url: record.origin_url || "",
    capture_source: record.capture_source || "manual_drop",
    captured_at: record.captured_at || "",
    search_query: record.search_query || "",
    search_engine: record.search_engine || "",
    search_rank: record.search_rank || "",
    capture_notes: record.capture_notes || "",
    author: record.author || "",
    date: record.date || "",
    ingested_at: record.ingested_at,
    raw_path: record.raw_path,
    extracted_text_path: record.extracted_text_path || "",
    metadata_path: record.metadata_path,
    status: "draft",
    confidence: record.extracted_text_path ? "medium" : "low",
    tags: record.tags,
    entities: record.entities,
    concepts: record.concepts,
    related: [],
    candidate_concepts: record.candidate_concepts,
    checksum: record.checksum,
    extraction_status: record.extraction_status,
    extraction_method: record.extraction_method,
    figure_note_path: record.figure_note_path || "",
    figure_count: record.figure_count || 0
  };

  const candidateList = record.candidate_concepts.length
    ? record.candidate_concepts.map((concept) => `- ${concept}`).join("\n")
    : "- None suggested automatically yet.";
  const extractionNotes = record.extraction_notes.length
    ? record.extraction_notes.map((note) => `- ${note}`).join("\n")
    : "- No extraction notes recorded.";
  const reviewAssets = [record.figure_note_path, record.table_preview_path].filter(Boolean);

  const body = `
# ${record.title}

## Summary

${record.summary}

## What This Source Says

- Initial draft only. Refine this note after review or a frontier-model synthesis pass.

## Why It Matters

${record.capture_notes ? `- ${record.capture_notes}` : "- Link this source into concepts, entities, or theses once reviewed."}

## Key Facts / Data

- Source type: \`${record.source_type}\`
- Capture source: \`${record.capture_source || "manual_drop"}\`
- Ingested at: \`${record.ingested_at}\`
- Captured at: \`${record.captured_at || record.ingested_at}\`
- Raw path: \`${record.raw_path}\`
${record.source_url ? `- Source URL: \`${record.source_url}\`` : ""}
${record.origin_url && record.origin_url !== record.source_url ? `- Origin URL: \`${record.origin_url}\`` : ""}
${record.search_query ? `- Research query: ${record.search_query}` : ""}
${record.search_engine ? `- Search engine: \`${record.search_engine}\`` : ""}
${record.search_rank ? `- Search rank: ${record.search_rank}` : ""}
${record.table_preview_path ? `- Table preview: \`${record.table_preview_path}\`` : ""}
${record.figure_note_path ? `- Figure note: \`${record.figure_note_path}\`` : ""}
${record.source_type === "repo" ? "- Repo snapshots are indexed as structural evidence, not full code interpretation." : ""}

## Figures / Tables Worth Revisiting

${reviewAssets.length ? reviewAssets.map((assetPath) => `- Review \`${assetPath}\`.`).join("\n") : "- Add image, table, or figure-specific notes here when relevant."}

## Open Questions

- What concepts should this source strengthen?
- What is still ambiguous or unverified?

## Related Concepts

${candidateList}

## Provenance / Extraction Notes

- Metadata path: \`${record.metadata_path}\`
- Extraction status: \`${record.extraction_status}\`
- Extraction method: \`${record.extraction_method}\`
- Figure refs indexed: ${record.figure_count || 0}
- Preserve the raw source as the anchor of truth.

${extractionNotes}
`;

  return renderMarkdown(frontmatter, body);
}

function ingest(root, options = {}) {
  ensureProjectStructure(root);
  const settings = loadSettings(root);
  const ontology = readJson(path.join(root, "config", "ontology.json"), {});
  const ontologyIndex = buildConceptOntologyIndex(ontology);
  const inboxDir = path.join(root, options.from || settings.paths.inbox || "inbox/drop_here");
  const copyMode = Boolean(options.copy);
  if (options.url) {
    prepareUrlDrop(inboxDir, options.url, options.title);
  }
  const hashIndexPath = path.join(root, "manifests", "file_hashes.json");
  const hashIndex = readJson(hashIndexPath, {});
  const targets = listIngestTargets(inboxDir);
  const results = [];

  for (const target of targets) {
    const sourceSidecar = target.kind === "file" ? readSourceSidecar(target.path) : {};
    const sourceType = detectSourceType(target.path, target.kind);
    const checksum = target.kind === "directory" ? computeDirectoryHash(target.path) : computeHash(target.path);
    const rawSubdir = RAW_SUBDIR_BY_SOURCE_TYPE[sourceType] || "notes";
    const id = makeId("SRC", checksum);
    const destinationName = `${id}__${path.basename(target.path)}`;
    const rawDestination = uniquePath(path.join(root, "raw", rawSubdir, destinationName));
    ensureDir(path.dirname(rawDestination));

    transferTarget(target.path, rawDestination, target.kind, copyMode);

    const extraction = extractContent(rawDestination, {
      ...options,
      targetKind: target.kind
    });
    const importedFrontmatter = {
      ...extraction.importedFrontmatter,
      ...sourceSidecar
    };
    const title = deriveTitle(rawDestination, importedFrontmatter, extraction.extractedText);
    const extractedTextPath = extraction.extractedText ? path.join(root, "extracted", "text", `${id}.txt`) : null;
    const metadataPath = path.join(root, "extracted", "metadata", `${id}.json`);
    const tablePreviewPath =
      sourceType === "dataset" && extraction.extractedText ? path.join(root, "extracted", "tables", `${id}.md`) : null;
    const sourceNotePath = uniquePath(path.join(root, "wiki", "source-notes", `${slugify(title) || id}.md`));

    if (extractedTextPath) {
      writeText(extractedTextPath, `${extraction.extractedText}\n`);
    }
    if (tablePreviewPath) {
      writeText(
        tablePreviewPath,
        `# Dataset Preview\n\nSource: \`${relativeToRoot(root, rawDestination)}\`\n\n${buildDatasetPreview(extraction.extractedText) || "- No preview available."}\n`
      );
    }

    const concepts = normalizeList(importedFrontmatter.concepts).filter((concept) =>
      isMeaningfulExplicitConcept(concept, ontologyIndex)
    );
    const entities = normalizeList(importedFrontmatter.entities);
    const tags = normalizeList(importedFrontmatter.tags);
    const record = {
      id,
      title,
      source_type: sourceType,
      source_url: extractSourceUrl(importedFrontmatter),
      origin_url: importedFrontmatter.origin_url || "",
      capture_source: importedFrontmatter.capture_source || "manual_drop",
      captured_at: importedFrontmatter.captured_at || importedFrontmatter.fetched_at || "",
      search_query: importedFrontmatter.research_query || importedFrontmatter.search_query || "",
      search_engine: importedFrontmatter.search_engine || "",
      search_rank: Number(importedFrontmatter.search_rank || 0) || "",
      search_snippet: importedFrontmatter.search_snippet || "",
      capture_notes: importedFrontmatter.capture_notes || "",
      author: importedFrontmatter.author || "",
      date: importedFrontmatter.date || importedFrontmatter.published || "",
      ingested_at: nowIso(),
      raw_path: relativeToRoot(root, rawDestination),
      extracted_text_path: extractedTextPath ? relativeToRoot(root, extractedTextPath) : "",
      table_preview_path: tablePreviewPath ? relativeToRoot(root, tablePreviewPath) : "",
      figure_note_path: "",
      metadata_path: relativeToRoot(root, metadataPath),
      note_path: relativeToRoot(root, sourceNotePath),
      checksum,
      status: hashIndex[checksum] ? "duplicate" : "processed",
      duplicate_of: hashIndex[checksum]?.id || "",
      extraction_status: extraction.extractionStatus,
      extraction_method: extraction.extractionMethod,
      extraction_notes: extraction.extractionNotes,
      tags,
      entities,
      concepts,
      candidate_concepts: extractCandidateConcepts(title, extraction.extractedText, ontology),
      figure_count: (extraction.figureRefs || []).length,
      summary: summaryFromExtractedText(extraction.extractedText, sourceType)
    };

    if (record.figure_count || sourceType === "image") {
      const figureNotePath = path.join(root, "extracted", "figures", `${id}.md`);
      record.figure_note_path = relativeToRoot(root, figureNotePath);
      writeText(figureNotePath, buildFigureNote(record, extraction));
    }

    writeJson(metadataPath, {
      ...record,
      imported_frontmatter: importedFrontmatter,
      figure_refs: extraction.figureRefs || [],
      target_kind: target.kind
    });
    writeText(sourceNotePath, buildSourceNote(record));

    appendJsonl(path.join(root, "manifests", "sources.jsonl"), record);
    appendJsonl(path.join(root, "logs", "actions", "ingest.jsonl"), {
      event: "ingest",
      at: record.ingested_at,
      id: record.id,
      raw_path: record.raw_path,
      note_path: record.note_path,
      status: record.status
    });

    hashIndex[checksum] = {
      id,
      raw_path: record.raw_path,
      note_path: record.note_path
    };

    results.push(record);

    if (!copyMode && target.kind === "file") {
      cleanupSourceSidecar(target.path);
    }
  }

  writeJson(hashIndexPath, hashIndex);
  return {
    ingested: results.length,
    results
  };
}

module.exports = {
  ingest
};
