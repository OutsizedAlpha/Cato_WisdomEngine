const fs = require("node:fs");
const path = require("node:path");
const { parseFrontmatter, renderMarkdown, stripMarkdownFormatting } = require("./markdown");
const { ensureProjectStructure, loadSettings } = require("./project");
const { inferSelfNoteSchema, schemaConfig } = require("./self-model");
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

function sectionSkeleton(schema) {
  switch (schema) {
    case "postmortem":
      return `
## Decision

## Outcome

## What Was Right

## What Was Wrong

## Lessons

## Original Input
`;
    case "bias":
      return `
## Observed Bias / Tendency

## Why It Matters

## Mitigation

## Original Input
`;
    case "anti-pattern":
      return `
## Anti-Pattern

## Why It Is Attractive

## Why It Fails

## Better Alternative

## Original Input
`;
    case "communication-style":
      return `
## Preferred Output Style

## What To Avoid

## Good Challenge Style

## Original Input
`;
    case "heuristic":
      return `
## Heuristic

## When It Helps

## Failure Modes

## Counterpoints

## Original Input
`;
    case "decision-rule":
      return `
## Decision Rule

## Mechanism

## When It Applies

## Failure Modes

## Counterpoints

## Original Input
`;
    case "preference":
      return `
## Preference

## Why It Helps

## What To Avoid

## Original Input
`;
    case "mode":
      return `
## Mode

## When It Applies

## Failure Modes

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

function buildStructuredFrontmatter(record, parsedFrontmatter, schema) {
  const config = schemaConfig(schema);
  return {
    ...parsedFrontmatter,
    id: record.id,
    kind: parsedFrontmatter.kind || config.kind,
    schema,
    title: record.title,
    status: parsedFrontmatter.status || "active",
    confidence: parsedFrontmatter.confidence || "medium",
    priority: parsedFrontmatter.priority ?? (schema === "constitution" ? 4 : 3),
    rule_strength: parsedFrontmatter.rule_strength || config.defaultRuleStrength,
    applicability: parsedFrontmatter.applicability || config.defaultApplicability,
    command_scope: parsedFrontmatter.command_scope || config.defaultCommandScope,
    time_horizon: parsedFrontmatter.time_horizon || config.defaultTimeHorizon,
    source_basis: parsedFrontmatter.source_basis || "declared",
    supersedes: parsedFrontmatter.supersedes || [],
    conflicts_with: parsedFrontmatter.conflicts_with || [],
    examples_good: parsedFrontmatter.examples_good || [],
    examples_bad: parsedFrontmatter.examples_bad || [],
    review_trigger: parsedFrontmatter.review_trigger || "",
    declared_by: parsedFrontmatter.declared_by || "user",
    derived_from: parsedFrontmatter.derived_from || [record.raw_path],
    related: parsedFrontmatter.related || [],
    ingested_at: record.ingested_at
  };
}

function buildSelfNote(record, originalInput, parsedInput, schema) {
  const frontmatter = buildStructuredFrontmatter(record, parsedInput.frontmatter, schema);
  const structuredBody = String(parsedInput.body || "").trim();
  const body =
    structuredBody && (Object.keys(parsedInput.frontmatter).length || structuredBody.startsWith("#"))
      ? structuredBody.startsWith("#")
        ? structuredBody
        : `# ${record.title}\n\n${structuredBody}`
      : `
# ${record.title}
${sectionSkeleton(schema)}
${originalInput.trim()}
`;

  return renderMarkdown(frontmatter, body);
}

function resolveSchemaAndStorage(filePath, content, options = {}) {
  const parsed = parseFrontmatter(content);
  const schema = inferSelfNoteSchema(filePath, content, parsed.frontmatter, options);
  const config = schemaConfig(schema);
  const frontmatter = {
    folder: config.folder,
    kind: config.kind,
    schema,
    parsed
  };
  return frontmatter;
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
    const resolved = resolveSchemaAndStorage(filePath, content, options);
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
      path.join(root, "wiki", "self", resolved.folder, `${slugify(title) || id}.md`)
    );
    const record = {
      id,
      title,
      kind: resolved.kind,
      schema: resolved.schema,
      folder: resolved.folder,
      ingested_at: nowIso(),
      raw_path: relativeToRoot(root, rawDestination),
      note_path: relativeToRoot(root, notePath),
      checksum
    };

    writeText(notePath, buildSelfNote(record, content, resolved.parsed, resolved.schema));
    appendJsonl(path.join(root, "manifests", "self_notes.jsonl"), record);
    appendJsonl(path.join(root, "logs", "actions", "self_ingest.jsonl"), {
      event: "self-ingest",
      at: record.ingested_at,
      id: record.id,
      note_path: record.note_path,
      schema: record.schema
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
