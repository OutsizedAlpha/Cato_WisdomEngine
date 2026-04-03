const path = require("node:path");
const { parseFrontmatter } = require("./markdown");
const { confidenceLabel, loadSelfNotes, noteSummary, promoteOutputToSynthesis, updateManagedNote, writeOutputDocument } = require("./research");
const { ensureProjectStructure } = require("./project");
const { tokenize } = require("./search");
const { readText, relativeToRoot, makeId, nowIso, slugify } = require("./utils");

function keywordsFromNote(note) {
  return new Set(tokenize(`${note.title} ${note.body}`));
}

function overlappingTensions(principles, challengers) {
  const tensions = [];

  for (const principle of principles) {
    const principleTokens = keywordsFromNote(principle);
    for (const challenger of challengers) {
      const shared = [...keywordsFromNote(challenger)].filter((token) => principleTokens.has(token)).slice(0, 3);
      if (!shared.length) {
        continue;
      }
      tensions.push(
        `- ${principle.title} may be in tension with ${challenger.title} around ${shared.join(", ")}.`
      );
    }
  }

  return [...new Set(tensions)].slice(0, 8);
}

function buildReflectionBody(selfNotes, tensions) {
  const principles = selfNotes.filter((note) => ["principles", "portfolio-philosophy", "heuristics", "decision-rules"].includes(note.category));
  const challengers = selfNotes.filter((note) => ["anti-patterns", "bias-watch", "postmortems"].includes(note.category));

  return `
# Self Reflection

## Executive Summary

The current self-model contains ${selfNotes.length} structured note${selfNotes.length === 1 ? "" : "s"}. The active principle layer is strongest where the notes repeat durable views on portfolio construction, reasoning style, and challenge preference. Confidence is ${confidenceLabel(selfNotes)} because the self-model is still only as strong as the quality and volume of the notes you have ingested.

## Active Principles And Heuristics

${principles.length ? principles.map((note) => `- ${note.title}: ${noteSummary(note, 180)}`).join("\n") : "- No active principles or heuristics are recorded yet."}

## Biases, Anti-Patterns, And Failure Modes

${challengers.length ? challengers.map((note) => `- ${note.title}: ${noteSummary(note, 180)}`).join("\n") : "- No explicit biases or anti-patterns are recorded yet."}

## Tension Register Summary

${tensions.length ? tensions.join("\n") : "- No strong tensions inferred yet from the current self-model."}

## What The System Should Optimise For

- Use your principles to shape the route of reasoning, not to pre-decide conclusions.
- Keep outputs PM-grade, sparse, explicit about evidence, and willing to challenge weak assumptions.
- Surface falsifiers and counter-cases whenever a principle is doing too much explanatory work.

## What To Add Next

- Add postmortems after major calls or trades so the self-model learns from outcomes rather than only declared beliefs.
- Add more explicit bias-watch notes if you want the system to challenge you in a more targeted way.
- Promote recurring heuristics into principle or decision-rule notes when they stabilise.
`;
}

function writeReflection(root, options = {}) {
  ensureProjectStructure(root);
  const selfNotes = loadSelfNotes(root);
  const principles = selfNotes.filter((note) => ["principles", "portfolio-philosophy", "heuristics", "decision-rules"].includes(note.category));
  const challengers = selfNotes.filter((note) => ["anti-patterns", "bias-watch", "postmortems"].includes(note.category));
  const tensions = overlappingTensions(principles, challengers);
  const output = writeOutputDocument(root, {
    idPrefix: "REFLECT",
    kind: "self-reflection",
    title: "Self Reflection",
    outputDir: "outputs/memos",
    fileSlug: "self-reflection",
    body: buildReflectionBody(selfNotes, tensions),
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

${tensions.length ? tensions.join("\n") : "- No tensions inferred yet from the current self-model."}
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
