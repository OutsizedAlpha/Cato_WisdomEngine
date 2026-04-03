const path = require("node:path");
const { renderMarkdown, toWikiLink } = require("./markdown");
const { ensureProjectStructure, loadSettings } = require("./project");
const {
  confidenceLabel,
  evidenceBullets,
  promoteOutputToSynthesis,
  renderResultReference,
  selectEvidence,
  synthesisParagraphs,
  writeOutputDocument
} = require("./research");
const { makeId, relativeToRoot, slugify, writeText } = require("./utils");
const GROUNDED_EXCLUDE_PREFIXES = [
  "outputs/",
  "wiki/claims/",
  "wiki/states/",
  "wiki/regimes/",
  "wiki/decisions/",
  "wiki/surveillance/",
  "wiki/_indices/",
  "wiki/_maps/",
  "wiki/unresolved/",
  "wiki/self/",
  "wiki/timelines/source-chronology.md"
];

function buildMemoBody(question, results) {
  if (!results.length) {
    return `
# ${question}

## Executive Summary

The current corpus does not contain enough direct evidence to produce a grounded memo on this question.

## Context

- Question: ${question}
- Evidence coverage: none in the current local corpus.

## Evidence

- No matching notes were found.

## Synthesis

The correct next step is to add relevant source material, rerun ingest and compile, and only then attempt a stronger analytical memo.

## Counter-Case

- The absence of evidence in this repo is not evidence that the real-world answer is negative.

## What Would Change The View

- Add directly relevant filings, articles, notes, or transcripts.
- Promote recurring concepts into concept or thesis pages once evidence exists.
`;
  }

  const synthesis = synthesisParagraphs(question, results, { mode: "memo" });
  const route = results.slice(0, 3).map((result) => result.title).join("; ");

  return `
# ${question}

## Executive Summary

${synthesis.summary}

## Context

- Question: ${question}
- Primary evidence route: ${route}
- Corpus confidence: ${confidenceLabel(results)}

## Evidence

${evidenceBullets(results)}

## Synthesis

${synthesis.summary}

Most directly:

${synthesis.contributions}

## Counter-Case

- Check whether the current corpus is over-weighted toward one regime, one author set, or one dominant interpretation.
- Review unresolved extraction or classification gaps before treating this memo as settled.
- Treat the current memo as corpus-grounded analysis, not a substitute for fresh primary-source work.

## What Would Change The View

- Add opposing evidence if the current top matches cluster too tightly.
- Promote the strongest repeated patterns into concept, thesis, or surveillance pages.
- Expand the corpus if the current answer depends on too few sources.

## Source Map

${results.map((result) => `- ${renderResultReference(result)}`).join("\n")}
`;
}

function askQuestion(root, question, options = {}) {
  ensureProjectStructure(root);
  const settings = loadSettings(root);
  const results = selectEvidence(root, question, {
    limit: Number(options.limit || settings.ask?.defaultTopDocs || 6),
    excerptLength: 260,
    excludePrefixes: GROUNDED_EXCLUDE_PREFIXES
  });

  const output = writeOutputDocument(root, {
    idPrefix: "ASK",
    kind: "answer-memo",
    title: question,
    outputDir: settings.ask?.outputDirectory || "outputs/memos",
    fileSlug: question,
    body: buildMemoBody(question, results),
    sources: results.map((result) => result.relativePath),
    frontmatter: {
      question,
      generation_mode: "grounded_synthesis"
    }
  });

  let promotedPath = "";
  if (options.promote) {
    promotedPath = promoteOutputToSynthesis(root, output.outputPath, {
      title: question,
      sources: results.map((result) => result.relativePath),
      reason: "Promoted from ask workflow for reuse as durable synthesis."
    });
  }

  if (options.saveQuestion) {
    const questionPath = path.join(root, "wiki", "questions", `${slugify(question).slice(0, 80) || output.frontmatter.id}.md`);
    const questionFrontmatter = {
      id: makeId("QUESTION", slugify(question).padEnd(12, "q")),
      kind: "question-page",
      title: question,
      status: "open",
      confidence: results.length ? "medium" : "low",
      related: results.map((result) => result.relativePath)
    };

    const questionBody = `
# ${question}

## Exact Question

${question}

## Why It Matters

- Capture recurring research questions as durable assets.

## Relevant Pages

${results.length ? results.map((result) => `- ${renderResultReference(result)}`).join("\n") : "- None yet."}

## Current Answer

- See ${toWikiLink(relativeToRoot(root, path.join(root, output.outputPath)), path.basename(output.outputPath, ".md"))}

## Confidence

- ${results.length ? "Medium" : "Low"}

## What Would Change The Answer

- More directly relevant sources, better concept coverage, or opposing evidence.
`;

    writeText(questionPath, renderMarkdown(questionFrontmatter, questionBody));
  }

  return {
    outputPath: output.outputPath,
    results,
    promotedPath
  };
}

module.exports = {
  askQuestion,
  buildMemoBody
};
