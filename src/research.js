const fs = require("node:fs");
const path = require("node:path");
const { parseFrontmatter, renderMarkdown, stripMarkdownFormatting, toWikiLink, upsertManagedBlock } = require("./markdown");
const { ensureProjectStructure, listMarkdownNotes, loadSettings } = require("./project");
const { searchCorpus, tokenize } = require("./search");
const {
  appendJsonl,
  makeId,
  nowIso,
  readText,
  relativeToRoot,
  slugify,
  timestampStamp,
  truncate,
  uniquePath,
  writeText
} = require("./utils");

function loadMarkdownObjects(root, relativeDir, options = {}) {
  return listMarkdownNotes(root, relativeDir)
    .filter((filePath) => (options.includeReadme ? true : !/\/(?:README|index)\.md$/i.test(relativeToRoot(root, filePath))))
    .map((filePath) => {
      const rawContent = readText(filePath);
      const parsed = parseFrontmatter(rawContent);
      return {
        path: filePath,
        relativePath: relativeToRoot(root, filePath),
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        rawContent,
        title: parsed.frontmatter.title || path.basename(filePath, ".md")
      };
    });
}

function loadSelfNotes(root) {
  return loadMarkdownObjects(root, "wiki/self")
    .filter((note) => !/\/tension-register\.md$/i.test(note.relativePath))
    .map((note) => ({
      ...note,
      category: note.relativePath.split("/").slice(2, 3)[0] || "other"
    }));
}

function renderResultReference(result) {
  if (String(result.relativePath || "").toLowerCase().endsWith(".md")) {
    return toWikiLink(result.relativePath, result.title);
  }
  return `\`${result.relativePath}\` (${result.title})`;
}

function confidenceLabel(results) {
  if (results.length >= 8) {
    return "High";
  }
  if (results.length >= 5) {
    return "Medium-High";
  }
  if (results.length >= 3) {
    return "Medium";
  }
  if (results.length >= 1) {
    return "Low";
  }
  return "Very Low";
}

function recurringThemes(subject, results) {
  const subjectTokens = new Set(tokenize(subject));
  const counts = new Map();

  for (const result of results.slice(0, 8)) {
    const tokens = tokenize(`${result.title} ${result.excerpt}`);
    for (const token of tokens) {
      if (subjectTokens.has(token)) {
        continue;
      }
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([token]) => token);
}

function evidenceBullets(results, excerptLength = 240) {
  if (!results.length) {
    return "- No matching evidence was found.";
  }

  return results
    .map(
      (result, index) =>
        `${index + 1}. ${renderResultReference(result)}\n- Why it matters: ${truncate(result.excerpt, excerptLength)}`
    )
    .join("\n");
}

function synthesisParagraphs(subject, results, options = {}) {
  const themes = recurringThemes(subject, results);
  const route = results.slice(0, 3).map((result) => result.title).join("; ");
  const themeClause = themes.length ? `Recurring themes include ${themes.join(", ")}.` : "";
  const mode = options.mode || "memo";
  const summaryPrefix =
    mode === "report"
      ? "The current corpus supports a report-level synthesis route anchored to"
      : mode === "surveillance"
        ? "The current surveillance sweep maps most directly to"
        : "The current corpus maps most directly to";

  const sentences = [
    `${summaryPrefix} ${route}.`,
    `The evidence base currently spans ${results.length} source${results.length === 1 ? "" : "s"}, so the result should be treated as grounded but still dependent on corpus coverage.`,
    themeClause,
    `Confidence is ${confidenceLabel(results).toLowerCase()} because the answer is retrieval-grounded and constrained by the local repo.`
  ].filter(Boolean);

  return {
    summary: sentences.join(" "),
    contributions: results.slice(0, 5).map((result) => `- ${result.title}: ${truncate(result.excerpt, 220)}`).join("\n")
  };
}

function selectEvidence(root, query, options = {}) {
  ensureProjectStructure(root);
  const settings = loadSettings(root);
  return searchCorpus(root, query, {
    limit: Number(options.limit || settings.search?.defaultLimit || 8),
    excerptLength: Number(options.excerptLength || settings.search?.excerptLength || 280),
    excludePrefixes: options.excludePrefixes || []
  });
}

function writeOutputDocument(root, options) {
  ensureProjectStructure(root);
  const slugSeed = slugify(options.fileSlug || options.title).slice(0, 80) || options.idPrefix.toLowerCase();
  const outputPath = uniquePath(path.join(root, options.outputDir, `${timestampStamp()}-${slugSeed}.md`));
  const frontmatter = {
    id: makeId(options.idPrefix, slugSeed.padEnd(12, options.idPrefix.toLowerCase()[0] || "x")),
    kind: options.kind,
    title: options.title,
    created_at: nowIso(),
    sources: options.sources || [],
    ...options.frontmatter
  };

  writeText(outputPath, renderMarkdown(frontmatter, options.body));
  appendJsonl(path.join(root, "logs", "report_runs", `${slugify(options.kind) || "outputs"}.jsonl`), {
    event: options.kind,
    at: frontmatter.created_at,
    title: options.title,
    output_path: relativeToRoot(root, outputPath),
    sources: frontmatter.sources
  });

  return {
    outputPath: relativeToRoot(root, outputPath),
    frontmatter
  };
}

function renderSourceList(sources) {
  if (!sources.length) {
    return "- None recorded.";
  }

  return sources
    .map((source) => {
      if (typeof source === "string") {
        const normalized = source.replace(/\\/g, "/");
        const isNoteLikeMarkdown =
          normalized.toLowerCase().endsWith(".md") &&
          (normalized.startsWith("wiki/") || normalized.startsWith("outputs/"));
        return isNoteLikeMarkdown ? `- ${toWikiLink(normalized)}` : `- \`${normalized}\``;
      }
      return `- ${renderResultReference(source)}`;
    })
    .join("\n");
}

function promoteOutputToSynthesis(root, outputRelativePath, options = {}) {
  const absoluteOutputPath = path.join(root, outputRelativePath);
  const parsed = parseFrontmatter(readText(absoluteOutputPath));
  const title = options.title || parsed.frontmatter.title || path.basename(absoluteOutputPath, ".md");
  const notePath = uniquePath(path.join(root, "wiki", "synthesis", `${slugify(title).slice(0, 80) || "synthesis"}.md`));
  const sources = options.sources || parsed.frontmatter.sources || [];
  const body = `
# ${title}

## Promoted From

- Output artifact: \`${outputRelativePath}\`
- Promotion rationale: ${options.reason || "Promoted because the generated output contains reusable synthesis."}

## Durable Synthesis

${options.summary || "Review and refine this promoted note if it becomes part of the durable knowledge layer."}

## Source Map

${renderSourceList(sources)}

## Embedded Output Reference

- See \`${outputRelativePath}\` for the full generated artefact.
`;

  writeText(
    notePath,
    renderMarkdown(
      {
        id: makeId("SYNTH", slugify(title).padEnd(12, "s")),
        kind: "synthesis-note",
        title,
        status: "draft",
        promoted_from: outputRelativePath,
        sources
      },
      body
    )
  );

  return relativeToRoot(root, notePath);
}

function updateManagedNote(filePath, frontmatter, title, blocks) {
  const baseBody = `
# ${title}

## Manual Notes
`;
  const initialContent = renderMarkdown(frontmatter, baseBody);
  let content = fs.existsSync(filePath) ? readText(filePath) : initialContent;

  for (const [name, blockContent] of Object.entries(blocks)) {
    content = upsertManagedBlock(content, name, blockContent);
  }

  writeText(filePath, content);
}

function noteSummary(note, length = 220) {
  const text = stripMarkdownFormatting(note.body).replace(/\s+/g, " ").trim();
  return truncate(text, length);
}

module.exports = {
  confidenceLabel,
  evidenceBullets,
  loadMarkdownObjects,
  loadSelfNotes,
  noteSummary,
  promoteOutputToSynthesis,
  recurringThemes,
  renderResultReference,
  renderSourceList,
  selectEvidence,
  synthesisParagraphs,
  updateManagedNote,
  writeOutputDocument
};
