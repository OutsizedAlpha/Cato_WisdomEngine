const { renderMarkdown } = require("./markdown");
const { moveFile, nowIso, relativeToRoot, timestampStamp, truncate, uniquePath, writeText, appendJsonl } = require("./utils");

const DEFAULT_MAX_BODY_CHARS = 250_000;
const DEFAULT_MAX_TOTAL_CHARS = 300_000;
const DEFAULT_MAX_TITLE_CHARS = 240;
const DEFAULT_MAX_FRONTMATTER_STRING_CHARS = 4_000;
const DEFAULT_MAX_ARRAY_ITEMS = 256;

function clipScalar(value, maxChars) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== "string") {
    return value;
  }
  return truncate(value, maxChars);
}

function sanitizeFrontmatterValue(value, maxStringChars, maxArrayItems) {
  if (Array.isArray(value)) {
    return value.slice(0, maxArrayItems).map((entry) => sanitizeFrontmatterValue(entry, maxStringChars, maxArrayItems));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeFrontmatterValue(entry, maxStringChars, maxArrayItems)])
    );
  }
  return clipScalar(value, maxStringChars);
}

function sanitizeGeneratedFrontmatter(frontmatter, options = {}) {
  const maxTitleChars = Number(options.maxTitleChars || DEFAULT_MAX_TITLE_CHARS);
  const maxFrontmatterStringChars = Number(options.maxFrontmatterStringChars || DEFAULT_MAX_FRONTMATTER_STRING_CHARS);
  const maxArrayItems = Number(options.maxArrayItems || DEFAULT_MAX_ARRAY_ITEMS);
  const sanitized = Object.fromEntries(
    Object.entries(frontmatter || {}).map(([key, value]) => [key, sanitizeFrontmatterValue(value, maxFrontmatterStringChars, maxArrayItems)])
  );
  if (sanitized.title) {
    sanitized.title = clipScalar(String(sanitized.title), maxTitleChars);
  }
  return sanitized;
}

function assertGeneratedMarkdownSafe(frontmatter, body, options = {}) {
  const label = options.label || "generated note";
  const normalizedBody = String(body || "");
  const maxBodyChars = Number(options.maxBodyChars || DEFAULT_MAX_BODY_CHARS);
  const maxTotalChars = Number(options.maxTotalChars || DEFAULT_MAX_TOTAL_CHARS);
  if (!normalizedBody.trim()) {
    throw new Error(`${label} body is empty.`);
  }
  if (normalizedBody.length > maxBodyChars) {
    throw new Error(`${label} body exceeds safety limit (${normalizedBody.length} chars).`);
  }

  const rendered = renderMarkdown(sanitizeGeneratedFrontmatter(frontmatter, options), normalizedBody);
  if (rendered.length > maxTotalChars) {
    throw new Error(`${label} markdown exceeds safety limit (${rendered.length} chars).`);
  }
  return rendered;
}

function writeSafeGeneratedMarkdown(filePath, frontmatter, body, options = {}) {
  const rendered = assertGeneratedMarkdownSafe(frontmatter, body, options);
  writeText(filePath, rendered);
  return rendered;
}

function quarantineGeneratedNote(root, relativePath, reason, options = {}) {
  const absolutePath = relativePath.includes(":") ? relativePath : require("node:path").join(root, relativePath);
  const targetPath = uniquePath(
    require("node:path").join(root, "tmp", "quarantined-generated-notes", `${timestampStamp()}-${require("node:path").basename(absolutePath)}`)
  );
  moveFile(absolutePath, targetPath);
  appendJsonl(require("node:path").join(root, "logs", "actions", "generated_note_quarantine.jsonl"), {
    event: "generated_note_quarantine",
    at: nowIso(),
    reason,
    note_path: relativeToRoot(root, targetPath),
    source_path: relativePath,
    context: options.context || ""
  });
  return relativeToRoot(root, targetPath);
}

module.exports = {
  assertGeneratedMarkdownSafe,
  quarantineGeneratedNote,
  sanitizeGeneratedFrontmatter,
  writeSafeGeneratedMarkdown
};
