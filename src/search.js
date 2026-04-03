const fs = require("node:fs");
const path = require("node:path");
const { STOPWORDS, TEXT_EXTENSIONS } = require("./constants");
const { parseFrontmatter, stripMarkdownFormatting } = require("./markdown");
const { listFilesRecursive, readText, relativeToRoot, titleFromFilename, truncate } = require("./utils");

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && token.length > 2 && !STOPWORDS.has(token));
}

function buildTokenCounts(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function noteTitleFromContent(content, fallback) {
  const { frontmatter, body } = parseFrontmatter(content);
  return frontmatter.title || body.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function buildCorpus(root) {
  const documents = [];
  const includeDirs = ["wiki", "outputs", "extracted/text"];

  for (const relativeDir of includeDirs) {
    const absoluteDir = path.join(root, relativeDir);
    if (!fs.existsSync(absoluteDir)) {
      continue;
    }

    for (const filePath of listFilesRecursive(absoluteDir)) {
      const extension = path.extname(filePath).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension) && extension !== ".md") {
        continue;
      }

      const rawContent = readText(filePath);
      const relativePath = relativeToRoot(root, filePath);
      if (
        relativePath.startsWith("wiki/_templates/") ||
        relativePath.startsWith("wiki/watch-profiles/") ||
        relativePath === "wiki/_indices/watch-profiles.md" ||
        relativePath === "wiki/glossary/watch-ontology.md"
      ) {
        continue;
      }
      const isMarkdown = extension === ".md";
      const parsed = isMarkdown ? parseFrontmatter(rawContent) : { frontmatter: {}, body: rawContent };
      if (["inactive", "obsolete", "retired"].includes(String(parsed.frontmatter.status || "").toLowerCase())) {
        continue;
      }
      const content = isMarkdown ? stripMarkdownFormatting(parsed.body) : rawContent;
      const title = isMarkdown
        ? noteTitleFromContent(rawContent, titleFromFilename(filePath))
        : titleFromFilename(filePath);

      documents.push({
        path: filePath,
        relativePath,
        title,
        titleTokens: tokenize(title),
        bodyTokens: tokenize(content),
        content,
        rawContent
      });
    }
  }

  return documents;
}

function scoreDocument(document, query, queryTokens) {
  const titleCounts = buildTokenCounts(document.titleTokens);
  const bodyCounts = buildTokenCounts(document.bodyTokens);
  let score = 0;

  for (const token of queryTokens) {
    score += (titleCounts.get(token) || 0) * 5;
    score += bodyCounts.get(token) || 0;
    if (document.relativePath.toLowerCase().includes(token)) {
      score += 2;
    }
  }

  if (document.rawContent.toLowerCase().includes(query.toLowerCase())) {
    score += 10;
  }

  return score;
}

function buildExcerpt(content, queryTokens, length = 280) {
  if (!content.trim()) {
    return "";
  }

  const lower = content.toLowerCase();
  let bestIndex = -1;
  for (const token of queryTokens) {
    const index = lower.indexOf(token.toLowerCase());
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
    }
  }

  if (bestIndex === -1) {
    return truncate(content.replace(/\s+/g, " "), length);
  }

  const start = Math.max(0, bestIndex - Math.floor(length / 3));
  const snippet = content.slice(start, start + length).replace(/\s+/g, " ").trim();
  return start > 0 ? `…${snippet}` : snippet;
}

function searchCorpus(root, query, options = {}) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) {
    return [];
  }

  const limit = Number(options.limit || 8);
  const excerptLength = Number(options.excerptLength || 280);
  const excludePrefixes = normalizeExcludePrefixes(options.excludePrefixes);

  return buildCorpus(root)
    .filter((document) => !excludePrefixes.some((prefix) => document.relativePath.toLowerCase().startsWith(prefix)))
    .map((document) => ({
      ...document,
      score: scoreDocument(document, query, queryTokens),
      excerpt: buildExcerpt(document.content, queryTokens, excerptLength)
    }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath))
    .slice(0, limit);
}

function normalizeExcludePrefixes(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").replace(/\\/g, "/").toLowerCase())
    .filter(Boolean);
}

module.exports = {
  searchCorpus,
  tokenize
};
