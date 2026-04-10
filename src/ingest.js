const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { RAW_SUBDIR_BY_SOURCE_TYPE, SOURCE_TYPE_BY_EXTENSION, STOPWORDS } = require("./constants");
const { renderMarkdown } = require("./markdown");
const { extractCandidateConcepts, isMeaningfulExplicitConcept, buildConceptOntologyIndex } = require("./concept-quality");
const { extractContent } = require("./extraction");
const { ensureProjectStructure, loadSettings } = require("./project");
const {
  mergeSensitiveScanResults,
  scanDirectoryForSensitiveData,
  scanFileForSensitiveData,
  scanTextForSensitiveData,
  summarizeSensitiveHits
} = require("./sensitive-data");
const {
  buildAppendReviewBody,
  detectDocumentClass,
  normalizeList,
  reviewLensForDocumentClass
} = require("./source-routing");
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
const EXTRACTION_OVERRIDE_KEYS = new Set([
  "extracted_text",
  "extraction_status",
  "extraction_method",
  "extraction_notes",
  "figure_refs",
  "imported_frontmatter"
]);
const TITLE_CASE_LOWER_WORDS = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "the", "to"]);
const TITLE_CASE_UPPER_WORDS = new Set(["cfa", "eu", "jp", "mi", "uk", "us"]);

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

function normalizeExplicitPaths(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  return String(value)
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function listExplicitTargets(root, value) {
  const candidates = normalizeExplicitPaths(value);
  if (!candidates.length) {
    return [];
  }

  const results = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const absolutePath = path.isAbsolute(candidate) ? candidate : path.join(root, candidate);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    if (absolutePath.toLowerCase().endsWith(SOURCE_METADATA_SIDECAR_SUFFIX)) {
      continue;
    }

    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      const nested = looksLikeRepoSnapshot(absolutePath) ? [{ path: absolutePath, kind: "directory" }] : listIngestTargets(absolutePath);
      for (const target of nested) {
        const key = `${target.kind}:${target.path}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        results.push(target);
      }
      continue;
    }

    const key = `file:${absolutePath}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push({ path: absolutePath, kind: "file" });
  }

  return results.sort((left, right) => left.path.localeCompare(right.path));
}

function sidecarMetadataPath(targetPath) {
  return `${targetPath}${SOURCE_METADATA_SIDECAR_SUFFIX}`;
}

function readSourceSidecar(targetPath) {
  return readJson(sidecarMetadataPath(targetPath), {});
}

function splitSourceSidecar(sourceSidecar) {
  const importedFrontmatter = {};
  const extractionOverride = {};

  for (const [key, value] of Object.entries(sourceSidecar || {})) {
    if (EXTRACTION_OVERRIDE_KEYS.has(key)) {
      extractionOverride[key] = value;
    } else {
      importedFrontmatter[key] = value;
    }
  }

  return {
    importedFrontmatter,
    extractionOverride
  };
}

function normalizeExtractionNotes(value, fallback = []) {
  if (!value) {
    return fallback;
  }
  if (Array.isArray(value)) {
    const notes = value.map((entry) => String(entry || "").trim()).filter(Boolean);
    return notes.length ? notes : fallback;
  }
  const note = String(value).trim();
  return note ? [note] : fallback;
}

function applyExtractionOverride(extraction, extractionOverride = {}) {
  if (!extractionOverride || !Object.keys(extractionOverride).length) {
    return extraction;
  }

  const overrideText = typeof extractionOverride.extracted_text === "string" ? extractionOverride.extracted_text.trim() : "";
  const usingOverrideText = Boolean(overrideText);
  const overrideFrontmatter =
    extractionOverride.imported_frontmatter && typeof extractionOverride.imported_frontmatter === "object"
      ? extractionOverride.imported_frontmatter
      : {};

  return {
    ...extraction,
    extractedText: usingOverrideText ? overrideText : extraction.extractedText,
    extractionStatus: extractionOverride.extraction_status || (usingOverrideText ? "extracted" : extraction.extractionStatus),
    extractionMethod: extractionOverride.extraction_method || (usingOverrideText ? "llm_vision_handoff" : extraction.extractionMethod),
    extractionNotes: normalizeExtractionNotes(
      extractionOverride.extraction_notes,
      usingOverrideText ? ["Applied model-authored extraction override from source sidecar."] : extraction.extractionNotes
    ),
    figureRefs: Array.isArray(extractionOverride.figure_refs) ? extractionOverride.figure_refs : extraction.figureRefs,
    importedFrontmatter: {
      ...extraction.importedFrontmatter,
      ...overrideFrontmatter
    }
  };
}

function hasExtractionOverrideText(extractionOverride = {}) {
  return typeof extractionOverride.extracted_text === "string" && extractionOverride.extracted_text.trim().length > 0;
}

function emptyExtractionResult(note = "") {
  return {
    extractedText: "",
    extractionStatus: note ? "extracted" : "not_supported",
    extractionMethod: note ? "provided_override" : "none",
    extractionNotes: note ? [note] : [],
    figureRefs: [],
    importedFrontmatter: {}
  };
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

function isPathInside(basePath, targetPath) {
  const relative = path.relative(basePath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function buildSensitiveScan(target, extraction, options = {}) {
  const scans = [];
  if (target.kind === "directory") {
    scans.push(
      scanDirectoryForSensitiveData(target.path, {
        sourceLabel: path.basename(target.path),
        maxHits: 10,
        sourceType: options.sourceType
      })
    );
  } else {
    scans.push(
      scanFileForSensitiveData(target.path, {
        sourceLabel: path.basename(target.path),
        maxHits: 10,
        sourceType: options.sourceType
      })
    );
  }
  if (String(extraction.extractedText || "").trim()) {
    scans.push(
      scanTextForSensitiveData(extraction.extractedText, {
        sourceLabel: "extracted_text",
        maxHits: 10
      })
    );
  }
  return mergeSensitiveScanResults(scans);
}

function quarantineTarget(root, inboxDir, target, id, sensitiveScan, options = {}) {
  const baseName = `${id}__${path.basename(target.path)}`;
  const quarantinePath = uniquePath(path.join(root, "tmp", "sensitive-quarantine", baseName));
  const shouldMoveOriginal = !options.copyMode && isPathInside(inboxDir, target.path);
  transferTarget(target.path, quarantinePath, target.kind, !shouldMoveOriginal);

  let sidecarQuarantinePath = "";
  if (target.kind === "file") {
    const sourceSidecarPath = sidecarMetadataPath(target.path);
    if (fs.existsSync(sourceSidecarPath)) {
      sidecarQuarantinePath = `${quarantinePath}${SOURCE_METADATA_SIDECAR_SUFFIX}`;
      transferTarget(sourceSidecarPath, sidecarQuarantinePath, "file", !shouldMoveOriginal);
    }
  }

  const quarantineMetadataPath = `${quarantinePath}.quarantine.json`;
  const entry = {
    id,
    target_kind: target.kind,
    original_path: target.path,
    quarantined_path: relativeToRoot(root, quarantinePath),
    sidecar_path: sidecarQuarantinePath ? relativeToRoot(root, sidecarQuarantinePath) : "",
    move_mode: shouldMoveOriginal ? "moved" : "copied",
    detected_at: nowIso(),
    sensitive_data_flagged: true,
    sensitive_data_summary: summarizeSensitiveHits(sensitiveScan.hits),
    sensitive_data_hits: sensitiveScan.hits
  };
  writeJson(quarantineMetadataPath, entry);
  appendJsonl(path.join(root, "logs", "actions", "sensitive_quarantine.jsonl"), {
    event: "sensitive_quarantine",
    at: entry.detected_at,
    id,
    target_kind: target.kind,
    move_mode: entry.move_mode,
    original_path: target.path,
    quarantined_path: entry.quarantined_path,
    sensitive_data_summary: entry.sensitive_data_summary
  });
  return {
    ...entry,
    metadata_path: relativeToRoot(root, quarantineMetadataPath)
  };
}

function cleanTitleCandidate(value) {
  return truncate(String(value || "").replace(/^#+\s*/, "").replace(/\s+/g, " ").trim(), 120);
}

function humanizeFilenameTitle(filePath) {
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

function isWeakTitleCandidate(value) {
  const candidate = cleanTitleCandidate(value);
  if (!candidate) {
    return true;
  }
  if (candidate.length < 4) {
    return true;
  }
  if (!/[A-Za-z]/.test(candidate)) {
    return true;
  }
  if (/[\u0000-\u001f]/.test(candidate)) {
    return true;
  }
  if (/[ÂÃ�]/.test(candidate)) {
    return true;
  }
  if (/^\d+([./-]\d+)*$/.test(candidate)) {
    return true;
  }
  if (/^src[-\s_]*\d{4}\b/i.test(candidate)) {
    return true;
  }
  if (/^(?:copyright|©)\s*\d{4}\b/i.test(candidate)) {
    return true;
  }

  const words = candidate.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return true;
  }

  const singleCharacterWords = words.filter((word) => word.length === 1).length;
  const shortWords = words.filter((word) => word.length <= 2).length;
  if (words.length >= 6 && singleCharacterWords / words.length >= 0.3) {
    return true;
  }
  if (/\b(?:[A-Za-z]\s+){2,}[A-Za-z]\b/.test(candidate)) {
    return true;
  }
  if (words.length >= 6 && shortWords / words.length >= 0.6 && singleCharacterWords >= 2) {
    return true;
  }

  return false;
}

function scoreTitleCandidate(value, sourceLabel, filenameTitle) {
  const candidate = cleanTitleCandidate(value);
  if (isWeakTitleCandidate(candidate)) {
    return Number.NEGATIVE_INFINITY;
  }

  const words = candidate.split(/\s+/).filter(Boolean);
  const filenameWords = cleanTitleCandidate(filenameTitle).split(/\s+/).filter(Boolean);
  const candidateTokens = slugify(candidate).split("-").filter(Boolean);
  const filenameTokens = slugify(filenameTitle).split("-").filter(Boolean);
  const filenameTokenSet = new Set(filenameTokens);
  const overlapCount = candidateTokens.filter((token) => filenameTokenSet.has(token)).length;
  const numericTokenCount = words.filter((word) => /\d/.test(word)).length;
  let score = 0;

  switch (sourceLabel) {
    case "frontmatter_title":
      score += 50;
      break;
    case "frontmatter_name":
      score += 44;
      break;
    case "heading":
      score += 30;
      break;
    case "first_line":
      score += 24;
      break;
    case "filename":
      score += 20;
      break;
    default:
      break;
  }

  score += Math.min(words.length, 8);
  if (/\b\d{4}\b/.test(candidate) || /\b(?:vol(?:ume)?|level|part|chapter)\b/i.test(candidate)) {
    score += 4;
  }
  if (words.length <= 2) {
    score -= 10;
  }
  if (/^[A-Z0-9\s&|/.,:()'-]+$/.test(candidate) && words.length <= 3) {
    score -= 6;
  }
  if (numericTokenCount >= 2 || /%/.test(candidate)) {
    score -= 12;
  }
  if (sourceLabel !== "filename" && filenameWords.length >= 3 && overlapCount === 0) {
    score -= 14;
  }
  if (sourceLabel !== "filename" && overlapCount > 0) {
    score += Math.min(overlapCount, 4);
  }

  const normalizedCandidate = slugify(candidate).replace(/-/g, " ");
  const normalizedFilename = slugify(filenameTitle).replace(/-/g, " ");
  if (
    sourceLabel !== "filename" &&
    normalizedCandidate &&
    normalizedFilename &&
    normalizedFilename.includes(normalizedCandidate) &&
    filenameWords.length >= words.length + 2
  ) {
    score -= 12;
  }

  return score;
}

function deriveTitle(filePath, importedFrontmatter, extractedText) {
  const heading = extractedText.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const firstLine = extractedText.split(/\r?\n/).find((line) => line.trim());
  const filenameTitle = humanizeFilenameTitle(filePath);
  const candidates = [
    { value: importedFrontmatter.title, sourceLabel: "frontmatter_title" },
    { value: importedFrontmatter.name, sourceLabel: "frontmatter_name" },
    { value: heading, sourceLabel: "heading" },
    { value: firstLine, sourceLabel: "first_line" },
    { value: filenameTitle, sourceLabel: "filename" }
  ]
    .map((candidate) => ({
      ...candidate,
      clean: cleanTitleCandidate(candidate.value),
      score: scoreTitleCandidate(candidate.value, candidate.sourceLabel, filenameTitle)
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score || right.clean.length - left.clean.length);

  if (candidates.length) {
    return candidates[0].clean;
  }

  return cleanTitleCandidate(titleFromFilename(filePath));
}

function extractSourceUrl(frontmatter) {
  return frontmatter.source_url || frontmatter.url || frontmatter.source || frontmatter.origin || "";
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

function normalizeReviewStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "unreviewed";
  }
  return normalized;
}

function noteStatusFromReviewStatus(reviewStatus) {
  return normalizeReviewStatus(reviewStatus) === "unreviewed" ? "draft" : "reviewed";
}

function reviewStatusSummary(record) {
  const reviewStatus = normalizeReviewStatus(record.review_status);
  if (["visual_reviewed", "visual-and-text-reviewed", "operator_reviewed"].includes(reviewStatus)) {
    return "Reviewed against rendered pages and the extracted text. Use this note as grounded qualitative evidence; return to the raw source if exact chart precision matters.";
  }
  if (reviewStatus === "text_reviewed") {
    return "Reviewed against the extracted text. Use this note for qualitative synthesis, but revisit source figures or tables before relying on exact numeric reads.";
  }
  return "Initial draft only. Refine this note after review or a frontier-model synthesis pass.";
}

function buildSourceNote(record) {
  const reviewStatus = normalizeReviewStatus(record.review_status);
  const frontmatter = {
    id: record.id,
    kind: "source-note",
    title: record.title,
    source_type: record.source_type,
    document_class: record.document_class,
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
    status: record.note_status || noteStatusFromReviewStatus(reviewStatus),
    review_status: reviewStatus,
    reviewed_at: record.reviewed_at || "",
    review_method: record.review_method || "",
    review_scope: record.review_scope || "",
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
    draft_workspace_path: record.draft_workspace_path || "",
    figure_count: record.figure_count || 0,
    sensitive_data_flagged: Boolean(record.sensitive_data_flagged),
    sensitive_data_summary: record.sensitive_data_summary || ""
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

## Review Status

- Note status: \`${record.note_status || noteStatusFromReviewStatus(reviewStatus)}\`
- Review status: \`${reviewStatus}\`
- Reviewed at: \`${record.reviewed_at || "not yet reviewed"}\`
- Review method: ${record.review_method ? `\`${record.review_method}\`` : "not yet recorded"}
- Review scope: ${record.review_scope || "not yet recorded"}

## What This Source Says

- ${reviewStatusSummary(record)}

## Why It Matters

${record.capture_notes ? `- ${record.capture_notes}` : "- Link this source into concepts, entities, or theses once reviewed."}

## Key Facts / Data

- Source type: \`${record.source_type}\`
- Document class: \`${record.document_class}\`
- Capture source: \`${record.capture_source || "manual_drop"}\`
- Ingested at: \`${record.ingested_at}\`
- Captured at: \`${record.captured_at || record.ingested_at}\`
- Raw path: \`${record.raw_path}\`
${record.source_url ? `- Source URL: \`${record.source_url}\`` : ""}
${record.origin_url && record.origin_url !== record.source_url ? `- Origin URL: \`${record.origin_url}\`` : ""}
${record.search_query ? `- Research query: ${record.search_query}` : ""}
${record.search_engine ? `- Search engine: \`${record.search_engine}\`` : ""}
${record.search_rank ? `- Search rank: ${record.search_rank}` : ""}
${record.draft_workspace_path ? `- Draft workspace: \`${record.draft_workspace_path}\`` : ""}
${record.table_preview_path ? `- Table preview: \`${record.table_preview_path}\`` : ""}
${record.figure_note_path ? `- Figure note: \`${record.figure_note_path}\`` : ""}
${record.source_type === "repo" ? "- Repo snapshots are indexed as structural evidence, not full code interpretation." : ""}

## Figures / Tables Worth Revisiting

${reviewAssets.length ? reviewAssets.map((assetPath) => `- Review \`${assetPath}\`.`).join("\n") : "- Add image, table, or figure-specific notes here when relevant."}

## Sensitive Data Review

- Sensitive data flagged: \`${record.sensitive_data_flagged ? "true" : "false"}\`
- Summary: ${record.sensitive_data_summary || "No secret-like patterns were detected during ingest."}

## Open Questions

- What concepts should this source strengthen?
- What is still ambiguous or unverified?
- What is the strongest counter-reading?

## Related Concepts

${candidateList}

## Provenance / Extraction Notes

- Metadata path: \`${record.metadata_path}\`
- Extraction status: \`${record.extraction_status}\`
- Extraction method: \`${record.extraction_method}\`
- Figure refs indexed: ${record.figure_count || 0}
- Review lens: ${record.review_lens}
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
  const allowSensitive = Boolean(options["allow-sensitive"] || options.allowSensitive);
  const copyMode = Boolean(options.copy);
  if (options.url) {
    prepareUrlDrop(inboxDir, options.url, options.title);
  }
  const hashIndexPath = path.join(root, "manifests", "file_hashes.json");
  const hashIndex = readJson(hashIndexPath, {});
  const runExtraction = typeof options.extractor === "function" ? options.extractor : extractContent;
  const explicitTargets = listExplicitTargets(root, options.paths);
  const targets = explicitTargets.length ? explicitTargets : listIngestTargets(inboxDir);
  const results = [];
  const quarantinedResults = [];

  for (const target of targets) {
    const sourceSidecar = target.kind === "file" ? readSourceSidecar(target.path) : {};
    const { importedFrontmatter: sourceSidecarFrontmatter, extractionOverride } = splitSourceSidecar(sourceSidecar);
    const sourceType = detectSourceType(target.path, target.kind);
    const checksum = target.kind === "directory" ? computeDirectoryHash(target.path) : computeHash(target.path);
    const rawSubdir = RAW_SUBDIR_BY_SOURCE_TYPE[sourceType] || "notes";
    const id = makeId("SRC", checksum);
    const destinationName = `${id}__${path.basename(target.path)}`;
    const rawDestination = uniquePath(path.join(root, "raw", rawSubdir, destinationName));
    ensureDir(path.dirname(rawDestination));

    const extractionBase = hasExtractionOverrideText(extractionOverride)
      ? emptyExtractionResult("Skipped built-in extraction because a source sidecar supplied extracted_text.")
      : runExtraction(target.path, {
          ...options,
          targetKind: target.kind
        });
    const extraction = applyExtractionOverride(extractionBase, extractionOverride);
    const sensitiveScan = buildSensitiveScan(target, extraction, { sourceType });
    if (sensitiveScan.flagged && !allowSensitive) {
      quarantinedResults.push(
        quarantineTarget(root, inboxDir, target, id, sensitiveScan, {
          copyMode
        })
      );
      continue;
    }

    transferTarget(target.path, rawDestination, target.kind, copyMode);
    const importedFrontmatter = {
      ...extraction.importedFrontmatter,
      ...sourceSidecarFrontmatter
    };
    const title = deriveTitle(target.path, importedFrontmatter, extraction.extractedText);
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
    const documentClass = detectDocumentClass(sourceType, title, extraction.extractedText, importedFrontmatter, target.kind);
    const draftWorkspacePath = uniquePath(
      path.join(root, "wiki", "drafts", "append-review", `${slugify(title).slice(0, 80) || id}.md`)
    );
    const record = {
      id,
      title,
      source_type: sourceType,
      document_class: documentClass,
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
      draft_workspace_path: relativeToRoot(root, draftWorkspacePath),
      checksum,
      status: hashIndex[checksum] ? "duplicate" : "processed",
      note_status: sensitiveScan.flagged ? "draft" : importedFrontmatter.status || noteStatusFromReviewStatus(importedFrontmatter.review_status),
      duplicate_of: hashIndex[checksum]?.id || "",
      extraction_status: extraction.extractionStatus,
      extraction_method: extraction.extractionMethod,
      extraction_notes: extraction.extractionNotes,
      review_lens: reviewLensForDocumentClass(documentClass),
      review_status: normalizeReviewStatus(importedFrontmatter.review_status),
      reviewed_at: importedFrontmatter.reviewed_at || "",
      review_method: importedFrontmatter.review_method || "",
      review_scope: importedFrontmatter.review_scope || "",
      tags,
      entities,
      concepts,
      candidate_concepts: extractCandidateConcepts(title, extraction.extractedText, ontology),
      figure_count: (extraction.figureRefs || []).length,
      summary: sensitiveScan.flagged
        ? "Sensitive data was detected during ingest. Review the raw artefact directly before reusing any of its contents."
        : summaryFromExtractedText(extraction.extractedText, sourceType),
      sensitive_data_flagged: sensitiveScan.flagged,
      sensitive_data_summary: sensitiveScan.summary || "",
      sensitive_data_hits: sensitiveScan.hits || [],
      sensitive_data_override: allowSensitive && sensitiveScan.flagged
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
    writeText(
      draftWorkspacePath,
      renderMarkdown(
        {
          id: makeId("DRAFT", slugify(title).padEnd(12, "d")),
          kind: "draft-note",
          title: `Append And Review: ${title}`,
          status: "open",
          stage: "append-review",
          source_note_path: record.note_path,
          raw_path: record.raw_path,
          metadata_path: record.metadata_path,
          document_class: record.document_class,
          created_at: record.ingested_at
        },
        buildAppendReviewBody(record, extraction)
      )
    );

    appendJsonl(path.join(root, "manifests", "sources.jsonl"), record);
    appendJsonl(path.join(root, "logs", "actions", "ingest.jsonl"), {
      event: "ingest",
      at: record.ingested_at,
      id: record.id,
      raw_path: record.raw_path,
      note_path: record.note_path,
      status: record.status,
      sensitive_data_flagged: Boolean(record.sensitive_data_flagged),
      sensitive_data_summary: record.sensitive_data_summary || ""
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
    quarantined: quarantinedResults.length,
    results,
    quarantinedResults
  };
}

module.exports = {
  buildSourceNote,
  ingest
};
