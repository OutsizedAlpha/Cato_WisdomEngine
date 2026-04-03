const fs = require("node:fs");
const path = require("node:path");
const { renderMarkdown } = require("./markdown");
const { ensureProjectStructure } = require("./project");
const { makeId, nowIso, readText, relativeToRoot, slugify, uniquePath, writeText } = require("./utils");

function buildPostmortemBody(title, notes) {
  return `
# ${title}

## Decision

## Outcome

## What Was Right

## What Was Wrong

## Lessons

## Original Input

${notes || "- Add the raw decision context, thesis, or diary note here."}
`;
}

function createPostmortem(root, title, options = {}) {
  ensureProjectStructure(root);
  const noteText = options.from && fs.existsSync(path.resolve(root, options.from))
    ? readText(path.resolve(root, options.from))
    : options.notes || "";
  const notePath = uniquePath(path.join(root, "wiki", "self", "postmortems", `${slugify(title).slice(0, 80) || "postmortem"}.md`));
  const frontmatter = {
    id: makeId("POSTMORTEM", slugify(title).padEnd(12, "p")),
    kind: "postmortem-note",
    title,
    status: "active",
    confidence: options.confidence || "medium",
    declared_by: "user",
    created_at: nowIso(),
    related: []
  };

  writeText(notePath, renderMarkdown(frontmatter, buildPostmortemBody(title, noteText)));

  return {
    notePath: relativeToRoot(root, notePath)
  };
}

module.exports = {
  createPostmortem
};
