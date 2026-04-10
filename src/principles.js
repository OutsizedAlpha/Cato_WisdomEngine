const { writeOutputByFamily } = require("./research");
const { buildCompiledSelfModel, loadSelfNotes, renderSelfModelMarkdownBlock } = require("./self-model");

function buildPrinciplesBody(selfNotes, context) {
  return `
# Principles Snapshot

## Current Operating Constitution

${renderSelfModelMarkdownBlock(context, { title: "Current Operating Constitution" })}

## Source Basis Mix

- Declared directly: ${selfNotes.filter((note) => note.sourceBasis === "declared").length}
- Learned from history or postmortems: ${selfNotes.filter((note) => note.sourceBasis !== "declared").length}
- Learned from postmortem: ${context.learnedFromPostmortems.length}

## Conflict Register

${context.conflicts.length
  ? context.conflicts.map((conflict) => `- ${conflict.winner_title} overrides ${conflict.loser_title} because ${conflict.reason}.`).join("\n")
  : "- No declared rule conflicts are active right now."}

## Stale Review Candidates

${context.staleReview.length
  ? context.staleReview.map((entry) => `- ${entry.title}: ${entry.review_trigger} (${entry.days_since_review} days since review).`).join("\n")
  : "- No stale review candidates surfaced right now."}
`;
}

function writePrinciplesSnapshot(root) {
  const selfNotes = loadSelfNotes(root);
  const context = buildCompiledSelfModel(root).globalContext;
  const output = writeOutputByFamily(root, "principles-snapshot", {
    title: "Principles Snapshot",
    fileSlug: "principles-snapshot",
    body: buildPrinciplesBody(selfNotes, context),
    sources: selfNotes.map((note) => note.relativePath)
  });

  return {
    outputPath: output.outputPath,
    selfNotes: selfNotes.length
  };
}

module.exports = {
  writePrinciplesSnapshot
};
