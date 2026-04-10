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

function normalizeList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  return String(value)
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeReviewStatus(frontmatter = {}) {
  return String(frontmatter.review_status || "").trim().toLowerCase();
}

function isVisualReview(frontmatter = {}) {
  const reviewStatus = normalizeReviewStatus(frontmatter);
  const reviewMethod = String(frontmatter.review_method || "").trim().toLowerCase();
  if (["visual_reviewed", "visual-and-text-reviewed", "operator_reviewed"].includes(reviewStatus)) {
    return true;
  }
  return /visual|page image|chart review|rendered pages/.test(reviewMethod);
}

function isReviewedSource(frontmatter = {}) {
  const reviewStatus = normalizeReviewStatus(frontmatter);
  return ["text_reviewed", "visual_reviewed", "visual-and-text-reviewed", "operator_reviewed"].includes(reviewStatus);
}

function reviewScoreAdjustment(document) {
  const frontmatter = document.frontmatter || {};
  const status = String(frontmatter.status || "").trim().toLowerCase();
  const documentClass = String(frontmatter.document_class || "").trim().toLowerCase();
  const captureSource = String(frontmatter.capture_source || "").trim().toLowerCase();
  const reviewStatus = normalizeReviewStatus(frontmatter);
  let score = 0;

  if (document.relativePath.startsWith("wiki/source-notes/")) {
    if (isReviewedSource(frontmatter)) {
      score += 12;
    } else if (reviewStatus === "unreviewed" || status === "draft") {
      score -= 4;
    }

    if (captureSource === "codex_pdf_vision_handoff" && (reviewStatus === "unreviewed" || status === "draft")) {
      score -= 3;
    }

    if (documentClass === "chartpack_or_visual") {
      score += isVisualReview(frontmatter) ? 6 : -15;
    }
  }

  if (status === "stale") {
    score -= 3;
  }

  return score;
}

function metadataTokenBlock(frontmatter = {}) {
  return [
    ...normalizeList(frontmatter.concepts),
    ...normalizeList(frontmatter.entities),
    ...normalizeList(frontmatter.tags),
    frontmatter.document_class || "",
    frontmatter.kind || ""
  ].join(" ");
}

function buildTokenDocumentStats(documents, field) {
  const termDocumentCounts = new Map();
  let totalLength = 0;

  for (const document of documents) {
    const tokens = document[field] || [];
    totalLength += tokens.length;
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      termDocumentCounts.set(token, (termDocumentCounts.get(token) || 0) + 1);
    }
  }

  return {
    averageLength: documents.length ? totalLength / documents.length : 0,
    termDocumentCounts
  };
}

function bm25Idf(documentFrequency, documentCount) {
  return Math.log(1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

function bm25FieldScore(queryTokens, tokens, counts, stats, options = {}) {
  if (!queryTokens.length || !tokens.length) {
    return 0;
  }

  const k1 = Number(options.k1 || 1.2);
  const b = Number(options.b ?? 0.75);
  const averageLength = Math.max(stats.averageLength || 0, 1);
  const fieldLength = Math.max(tokens.length, 1);
  let score = 0;

  for (const token of queryTokens) {
    const termFrequency = counts.get(token) || 0;
    if (!termFrequency) {
      continue;
    }
    const documentFrequency = stats.termDocumentCounts.get(token) || 0;
    const idf = bm25Idf(documentFrequency, stats.documentCount);
    score +=
      idf *
      ((termFrequency * (k1 + 1)) / (termFrequency + k1 * (1 - b + b * (fieldLength / averageLength))));
  }

  return score;
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
      if (["inactive", "obsolete", "retired", "superseded"].includes(String(parsed.frontmatter.status || "").toLowerCase())) {
        continue;
      }
      const content = isMarkdown ? stripMarkdownFormatting(parsed.body) : rawContent;
      const title = isMarkdown
        ? noteTitleFromContent(rawContent, titleFromFilename(filePath))
        : titleFromFilename(filePath);
      const metadataTokens = tokenize(metadataTokenBlock(parsed.frontmatter));

      documents.push({
        path: filePath,
        relativePath,
        title,
        frontmatter: parsed.frontmatter,
        titleTokens: tokenize(title),
        bodyTokens: tokenize(content),
        metadataTokens,
        content,
        rawContent
      });
    }
  }

  return documents;
}

function scoreDocument(document, query, queryTokens, stats) {
  const titleCounts = buildTokenCounts(document.titleTokens);
  const bodyCounts = buildTokenCounts(document.bodyTokens);
  const metadataCounts = buildTokenCounts(document.metadataTokens);
  let score = reviewScoreAdjustment(document);

  score += bm25FieldScore(queryTokens, document.titleTokens, titleCounts, stats.title, {
    k1: 1.1,
    b: 0.4
  }) * 5;
  score += bm25FieldScore(queryTokens, document.metadataTokens, metadataCounts, stats.metadata, {
    k1: 1.1,
    b: 0.3
  }) * 3;
  score += bm25FieldScore(queryTokens, document.bodyTokens, bodyCounts, stats.body, {
    k1: 1.5,
    b: 0.75
  });

  const exactPhrase = query.toLowerCase();
  if (document.title.toLowerCase().includes(exactPhrase)) {
    score += 10;
  }
  if (document.relativePath.toLowerCase().includes(exactPhrase)) {
    score += 4;
  }

  for (const token of queryTokens) {
    if (document.relativePath.toLowerCase().includes(token)) {
      score += 2;
    }
    if ((metadataCounts.get(token) || 0) > 0 && String(document.relativePath || "").startsWith("wiki/")) {
      score += 1;
    }
  }

  if (document.rawContent.toLowerCase().includes(exactPhrase)) {
    score += 6;
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
  return start > 0 ? `...${snippet}` : snippet;
}

function searchCorpus(root, query, options = {}) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) {
    return [];
  }

  const limit = Number(options.limit || 8);
  const excerptLength = Number(options.excerptLength || 280);
  const excludePrefixes = normalizeExcludePrefixes(options.excludePrefixes);
  const includePrefixes = normalizeExcludePrefixes(options.includePrefixes);
  const documents = buildCorpus(root);
  const stats = {
    title: {
      ...buildTokenDocumentStats(documents, "titleTokens"),
      documentCount: documents.length
    },
    body: {
      ...buildTokenDocumentStats(documents, "bodyTokens"),
      documentCount: documents.length
    },
    metadata: {
      ...buildTokenDocumentStats(documents, "metadataTokens"),
      documentCount: documents.length
    }
  };

  return documents
    .filter((document) => {
      if (excludePrefixes.some((prefix) => document.relativePath.toLowerCase().startsWith(prefix))) {
        return false;
      }
      if (includePrefixes.length && !includePrefixes.some((prefix) => document.relativePath.toLowerCase().startsWith(prefix))) {
        return false;
      }
      return true;
    })
    .map((document) => ({
      ...document,
      score: scoreDocument(document, query, queryTokens, stats),
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
