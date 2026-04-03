const fs = require("node:fs");
const path = require("node:path");
const { parseFrontmatter, renderMarkdown, stripMarkdownFormatting } = require("./markdown");
const { ensureProjectStructure, loadSettings } = require("./project");
const {
  appendJsonl,
  computeHash,
  copyFile,
  ensureDir,
  listFilesRecursive,
  makeId,
  moveFile,
  nowIso,
  readText,
  relativeToRoot,
  slugify,
  titleFromFilename,
  truncate,
  uniquePath,
  writeText
} = require("./utils");

function classifySelfNote(filePath, content) {
  const lower = `${path.basename(filePath)}\n${content}`.toLowerCase();
  if (lower.includes("postmortem") || lower.includes("what went wrong")) {
    return { folder: "postmortems", kind: "postmortem-note" };
  }
  if (lower.includes("bias") || lower.includes("blind spot")) {
    return { folder: "bias-watch", kind: "bias-watch-note" };
  }
  if (lower.includes("anti-pattern") || lower.includes("avoid this")) {
    return { folder: "anti-patterns", kind: "anti-pattern-note" };
  }
  if (lower.includes("communication") || lower.includes("tone") || lower.includes("how to write")) {
    return { folder: "communication-style", kind: "communication-style-note" };
  }
  if (lower.includes("decision rule") || lower.includes("sizing rule")) {
    return { folder: "decision-rules", kind: "decision-rule-note" };
  }
  if (lower.includes("portfolio") || lower.includes("diversification") || lower.includes("satellite")) {
    return { folder: "portfolio-philosophy", kind: "portfolio-philosophy-note" };
  }
  if (lower.includes("heuristic") || lower.includes("rule of thumb") || lower.includes("when in doubt")) {
    return { folder: "heuristics", kind: "heuristic-note" };
  }
  return { folder: "principles", kind: "principle-note" };
}

function sectionSkeleton(kind) {
  switch (kind) {
    case "postmortem-note":
      return `
## Decision

## Outcome

## What Was Right

## What Was Wrong

## Lessons

## Original Input
`;
    case "bias-watch-note":
      return `
## Observed Bias / Tendency

## Why It Matters

## Mitigation

## Original Input
`;
    case "anti-pattern-note":
      return `
## Anti-Pattern

## Why It Is Attractive

## Why It Fails

## Better Alternative

## Original Input
`;
    case "communication-style-note":
      return `
## Preferred Output Style

## What To Avoid

## Good Challenge Style

## Original Input
`;
    case "heuristic-note":
      return `
## Heuristic

## When It Helps

## Failure Modes

## Counterpoints

## Original Input
`;
    default:
      return `
## Principle Statement

## Mechanism

## When It Works

## When It Fails

## Common Objections

## What Would Falsify It

## Original Input
`;
  }
}

function selfNoteTitle(filePath, content) {
  const parsed = parseFrontmatter(content);
  const body = stripMarkdownFormatting(parsed.body).trim();
  const firstLine = body.split(/\r?\n/).find((line) => line.trim());
  return truncate(parsed.frontmatter.title || firstLine || titleFromFilename(filePath), 120);
}

function buildSelfNote(record, originalInput) {
  const frontmatter = {
    id: record.id,
    kind: record.kind,
    title: record.title,
    status: "active",
    confidence: "medium",
    declared_by: "user",
    derived_from: [record.raw_path],
    related: []
  };

  const body = `
# ${record.title}
${sectionSkeleton(record.kind)}
${originalInput.trim()}
`;

  return renderMarkdown(frontmatter, body);
}

function selfIngest(root, options = {}) {
  ensureProjectStructure(root);
  const settings = loadSettings(root);
  const inboxDir = path.join(root, options.from || settings.paths.selfInbox || "inbox/self");
  const copyMode = Boolean(options.copy);
  const files = listFilesRecursive(inboxDir).filter((filePath) => fs.statSync(filePath).isFile());
  const results = [];

  for (const filePath of files) {
    const content = readText(filePath);
    const classification = options.type && options.type !== "auto"
      ? { folder: options.type, kind: `${options.type.replace(/s$/, "")}-note` }
      : classifySelfNote(filePath, content);
    const checksum = computeHash(filePath);
    const id = makeId("SELF", checksum);
    const rawDestination = uniquePath(path.join(root, "raw", "notes", "self", `${id}__${path.basename(filePath)}`));
    ensureDir(path.dirname(rawDestination));

    if (copyMode) {
      copyFile(filePath, rawDestination);
    } else {
      moveFile(filePath, rawDestination);
    }

    const title = selfNoteTitle(rawDestination, content);
    const notePath = uniquePath(
      path.join(root, "wiki", "self", classification.folder, `${slugify(title) || id}.md`)
    );
    const record = {
      id,
      title,
      kind: classification.kind,
      folder: classification.folder,
      ingested_at: nowIso(),
      raw_path: relativeToRoot(root, rawDestination),
      note_path: relativeToRoot(root, notePath),
      checksum
    };

    writeText(notePath, buildSelfNote(record, content));
    appendJsonl(path.join(root, "manifests", "self_notes.jsonl"), record);
    appendJsonl(path.join(root, "logs", "actions", "self_ingest.jsonl"), {
      event: "self-ingest",
      at: record.ingested_at,
      id: record.id,
      note_path: record.note_path
    });
    results.push(record);
  }

  return {
    ingested: results.length,
    results
  };
}

module.exports = {
  selfIngest
};
