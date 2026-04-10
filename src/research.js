const fs = require("node:fs");
const path = require("node:path");
const { parseFrontmatter, renderMarkdown, stripMarkdownFormatting, toWikiLink, upsertManagedBlock } = require("./markdown");
const { writeSafeGeneratedMarkdown } = require("./generated-note-safety");
const { getOutputFamily } = require("./output-registry");
const { ensureProjectStructure, listMarkdownNotes, loadSettings } = require("./project");
const { tokenize } = require("./search");
const { loadSelfNotes } = require("./self-model");
const { renderRetrievalBudgetBlock, retrieveEvidence } = require("./retrieval");
const {
  appendJsonl,
  makeId,
  moveFile,
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
  const pack = retrieveEvidence(root, query, {
    budget: options.budget || settings.search?.defaultBudget || "L2",
    limit: Number(options.limit || settings.search?.defaultLimit || 8),
    excerptLength: Number(options.excerptLength || settings.search?.excerptLength || 280),
    excludePrefixes: options.excludePrefixes || [],
    mode: options.mode || "default",
    minGrounding: Number(options.minGrounding || settings.search?.minGrounding || 3),
    noEscalate: Boolean(options.noEscalate)
  });
  return pack.results;
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

  writeSafeGeneratedMarkdown(outputPath, frontmatter, options.body, {
    label: `${options.kind} output`,
    maxBodyChars: options.maxBodyChars,
    maxTotalChars: options.maxTotalChars
  });
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

function rollingOutputRelativePath(options) {
  const slugSeed = slugify(options.fileSlug || options.title).slice(0, 80) || options.idPrefix.toLowerCase();
  return {
    slugSeed,
    outputPath: path.join(options.outputDir, `${slugSeed}.md`),
    archiveDir: path.join(options.outputDir, "archive", slugSeed)
  };
}

function writeRollingOutputDocument(root, options) {
  ensureProjectStructure(root);
  const rolling = rollingOutputRelativePath(options);
  return writeCanonicalDocument(root, {
    ...options,
    fileSlug: options.fileSlug || rolling.slugSeed,
    outputPath: options.outputPath || rolling.outputPath,
    archiveDir: options.archiveDir || rolling.archiveDir
  });
}

function writeOutputByFamily(root, familyName, options) {
  const config = getOutputFamily(familyName);
  const sharedOptions = {
    ...options,
    idPrefix: options.idPrefix || config.idPrefix,
    kind: options.kind || config.kind,
    outputDir: options.outputDir || config.outputDir,
    frontmatter: {
      ...(config.frontmatter || {}),
      ...(options.frontmatter || {})
    }
  };

  if (config.canonical || options.outputPath && options.archiveDir) {
    return writeCanonicalDocument(root, {
      ...sharedOptions,
      outputPath: options.outputPath,
      archiveDir: options.archiveDir
    });
  }
  if (config.rolling) {
    return writeRollingOutputDocument(root, sharedOptions);
  }
  if (options.outputPath) {
    return writeFixedDocument(root, {
      ...sharedOptions,
      outputPath: options.outputPath
    });
  }
  return writeOutputDocument(root, sharedOptions);
}

function migrateLegacyRollingOutputs(root, outputDir) {
  ensureProjectStructure(root);
  const absoluteDir = path.join(root, outputDir);
  const summary = {
    outputDir,
    promoted: 0,
    archived: 0,
    promotedPaths: [],
    archivedPaths: []
  };

  if (!fs.existsSync(absoluteDir)) {
    return summary;
  }

  const timestampPattern = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)-(.+)\.md$/i;
  const grouped = new Map();
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      continue;
    }
    const match = entry.name.match(timestampPattern);
    if (!match) {
      continue;
    }
    const slug = match[2];
    if (!grouped.has(slug)) {
      grouped.set(slug, []);
    }
    grouped.get(slug).push(entry.name);
  }

  for (const [slug, files] of grouped.entries()) {
    const sorted = files.slice().sort((left, right) => left.localeCompare(right));
    const canonicalRelativePath = path.join(outputDir, `${slug}.md`);
    const canonicalAbsolutePath = path.join(root, canonicalRelativePath);
    const latestFile = sorted[sorted.length - 1];
    const archiveDir = path.join(root, outputDir, "archive", slug);

    if (!fs.existsSync(canonicalAbsolutePath)) {
      moveFile(path.join(absoluteDir, latestFile), canonicalAbsolutePath);
      summary.promoted += 1;
      summary.promotedPaths.push(relativeToRoot(root, canonicalAbsolutePath));
      sorted.pop();
    }

    for (const fileName of sorted) {
      const archivePath = uniquePath(path.join(archiveDir, fileName));
      moveFile(path.join(absoluteDir, fileName), archivePath);
      summary.archived += 1;
      summary.archivedPaths.push(relativeToRoot(root, archivePath));
    }
  }

  if (summary.promoted || summary.archived) {
    appendJsonl(path.join(root, "logs", "actions", "output_rollover.jsonl"), {
      event: "rolling_output_migration",
      at: nowIso(),
      output_dir: outputDir,
      promoted_paths: summary.promotedPaths,
      archived_paths: summary.archivedPaths
    });
  }

  return summary;
}

function writeCanonicalDocument(root, options) {
  ensureProjectStructure(root);
  const relativeOutputPath = String(options.outputPath || "").replace(/\\/g, "/");
  if (!relativeOutputPath) {
    throw new Error("writeCanonicalDocument requires an outputPath.");
  }

  const absoluteOutputPath = path.join(root, relativeOutputPath);
  const existing = fs.existsSync(absoluteOutputPath) ? parseFrontmatter(readText(absoluteOutputPath)) : null;
  let archivedPath = "";

  if (existing && options.archiveDir) {
    const archiveFileName = `${timestampStamp()}-${path.basename(relativeOutputPath)}`;
    const archivePath = uniquePath(path.join(root, options.archiveDir, archiveFileName));
    moveFile(absoluteOutputPath, archivePath);
    archivedPath = relativeToRoot(root, archivePath);
  }

  const createdAt = existing?.frontmatter?.created_at || nowIso();
  const frontmatter = {
    id:
      existing?.frontmatter?.id ||
      makeId(options.idPrefix, slugify(options.fileSlug || options.title).slice(0, 12).padEnd(12, options.idPrefix.toLowerCase()[0] || "x")),
    kind: options.kind,
    title: options.title,
    created_at: createdAt,
    updated_at: nowIso(),
    sources: options.sources || [],
    ...options.frontmatter
  };

  writeSafeGeneratedMarkdown(absoluteOutputPath, frontmatter, options.body, {
    label: `${options.kind} canonical output`,
    maxBodyChars: options.maxBodyChars,
    maxTotalChars: options.maxTotalChars
  });
  appendJsonl(path.join(root, "logs", "report_runs", `${slugify(options.kind) || "outputs"}.jsonl`), {
    event: options.kind,
    at: frontmatter.updated_at,
    title: options.title,
    output_path: relativeOutputPath,
    archived_previous_path: archivedPath,
    sources: frontmatter.sources,
    canonical: true
  });

  return {
    outputPath: relativeOutputPath,
    archivedPath,
    frontmatter
  };
}

function writeFixedDocument(root, options) {
  ensureProjectStructure(root);
  const relativeOutputPath = String(options.outputPath || "").replace(/\\/g, "/");
  if (!relativeOutputPath) {
    throw new Error("writeFixedDocument requires an outputPath.");
  }

  const absoluteOutputPath = path.join(root, relativeOutputPath);
  const existing = fs.existsSync(absoluteOutputPath) ? parseFrontmatter(readText(absoluteOutputPath)) : null;
  const slugSeed = slugify(options.fileSlug || options.title).slice(0, 80) || options.idPrefix.toLowerCase();
  const createdAt = existing?.frontmatter?.created_at || options.frontmatter?.created_at || nowIso();
  const frontmatter = {
    ...(existing?.frontmatter || {}),
    id:
      existing?.frontmatter?.id ||
      options.frontmatter?.id ||
      makeId(options.idPrefix, slugSeed.padEnd(12, options.idPrefix.toLowerCase()[0] || "x")),
    kind: options.kind,
    title: options.title,
    created_at: createdAt,
    updated_at: nowIso(),
    sources: options.sources || existing?.frontmatter?.sources || [],
    ...options.frontmatter
  };

  writeSafeGeneratedMarkdown(absoluteOutputPath, frontmatter, options.body, {
    label: `${options.kind} fixed output`,
    maxBodyChars: options.maxBodyChars,
    maxTotalChars: options.maxTotalChars
  });
  appendJsonl(path.join(root, "logs", "report_runs", `${slugify(options.kind) || "outputs"}.jsonl`), {
    event: options.kind,
    at: frontmatter.updated_at,
    title: options.title,
    output_path: relativeOutputPath,
    sources: frontmatter.sources,
    fixed_path: true
  });

  return {
    outputPath: relativeOutputPath,
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
  let content = renderMarkdown(frontmatter, baseBody);
  if (fs.existsSync(filePath)) {
    const parsed = parseFrontmatter(readText(filePath));
    const mergedFrontmatter = {
      ...parsed.frontmatter,
      ...frontmatter
    };
    content = renderMarkdown(mergedFrontmatter, parsed.body || baseBody);
  }

  for (const [name, blockContent] of Object.entries(blocks)) {
    content = upsertManagedBlock(content, name, blockContent);
  }

  const parsed = parseFrontmatter(content);
  writeSafeGeneratedMarkdown(filePath, parsed.frontmatter, parsed.body, {
    label: `${title} managed note`,
    maxBodyChars: 300000,
    maxTotalChars: 350000
  });
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
  migrateLegacyRollingOutputs,
  noteSummary,
  promoteOutputToSynthesis,
  recurringThemes,
  renderRetrievalBudgetBlock,
  renderResultReference,
  renderSourceList,
  retrieveEvidence,
  selectEvidence,
  synthesisParagraphs,
  updateManagedNote,
  writeOutputByFamily,
  writeCanonicalDocument,
  writeFixedDocument,
  writeRollingOutputDocument,
  writeOutputDocument
};
