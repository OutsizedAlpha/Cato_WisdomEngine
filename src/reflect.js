const path = require("node:path");
const { parseFrontmatter } = require("./markdown");
const { confidenceLabel, promoteOutputToSynthesis, updateManagedNote, writeOutputByFamily } = require("./research");
const { ensureProjectStructure } = require("./project");
const { buildCompiledSelfModel, loadSelfNotes, renderSelfModelMarkdownBlock } = require("./self-model");
const { readText, relativeToRoot, makeId, nowIso, slugify } = require("./utils");

function buildReflectionBody(selfNotes, context) {
  const declared = selfNotes.filter((note) => note.sourceBasis === "declared");
  const learned = selfNotes.filter((note) => note.sourceBasis !== "declared");

  return `
# Self Reflection

## Executive Summary

The current self-model contains ${selfNotes.length} structured note${selfNotes.length === 1 ? "" : "s"}. Confidence is ${confidenceLabel(selfNotes)} because the reflection is only as strong as the operating rules and postmortems currently captured in the repo.

## Active Rules Most In Play

${renderSelfModelMarkdownBlock(context, { title: "Current Operating Constitution" })}

## Declared Versus Learned Rules

- Declared directly: ${declared.length}
- Learned from history or postmortems: ${learned.length}
- Learned from postmortem: ${context.learnedFromPostmortems.length}

## Conflict Register

${context.conflicts.length ? context.conflicts.map((conflict) => `- ${conflict.winner_title} overrides ${conflict.loser_title} because ${conflict.reason}.`).join("\n") : "- No declared rule conflicts are active right now."}

## Review Queue

${context.staleReview.length ? context.staleReview.map((entry) => `- ${entry.title}: ${entry.review_trigger} (${entry.days_since_review} days since review).`).join("\n") : "- No stale review candidates surfaced right now."}

## What To Add Next

- Add postmortems after major calls or trades so the self-model learns from outcomes rather than only declared beliefs.
- Tighten conflicts explicitly when two good rules genuinely compete by command or mode.
- Review stale rules when your operating style or mandate has changed materially.
`;
}

function writeReflection(root, options = {}) {
  ensureProjectStructure(root);
  const selfNotes = loadSelfNotes(root);
  const context = buildCompiledSelfModel(root).globalContext;
  const output = writeOutputByFamily(root, "self-reflection", {
    title: "Self Reflection",
    fileSlug: "self-reflection",
    body: buildReflectionBody(selfNotes, context),
    sources: selfNotes.map((note) => note.relativePath),
    frontmatter: {
      reflection_scope: "self-model"
    }
  });

  const tensionRegisterPath = path.join(root, "wiki", "self", "tension-register.md");
  const existing = readText(tensionRegisterPath);
  const existingFrontmatter = parseFrontmatter(existing).frontmatter;
  updateManagedNote(
    tensionRegisterPath,
    Object.keys(existingFrontmatter).length
      ? existingFrontmatter
      : {
          id: makeId("SELF", slugify("tension-register").padEnd(12, "t")),
          kind: "reflection-note",
          title: "Tension Register",
          status: "active"
        },
    "Tension Register",
    {
      reflection: `
## Managed Reflection

- Last updated: ${nowIso()}

${context.conflicts.length
  ? context.conflicts.map((conflict) => `- ${conflict.winner_title} overrides ${conflict.loser_title} because ${conflict.reason}.`).join("\n")
  : "- No declared rule conflicts are active right now."}
`
    }
  );

  let promotedPath = "";
  if (options.promote) {
    promotedPath = promoteOutputToSynthesis(root, output.outputPath, {
      title: "Self Reflection",
      sources: selfNotes.map((note) => note.relativePath),
      reason: "Promoted from reflect workflow for durable self-model synthesis."
    });
  }

  return {
    outputPath: output.outputPath,
    tensionRegisterPath: relativeToRoot(root, tensionRegisterPath),
    promotedPath
  };
}

module.exports = {
  writeReflection
};
