const { promoteOutputToSynthesis, selectEvidence, synthesisParagraphs, writeOutputDocument } = require("./research");
const { resolveWatchSubject } = require("./watch");
const GROUNDED_EXCLUDE_PREFIXES = [
  "outputs/",
  "wiki/surveillance/",
  "wiki/_indices/",
  "wiki/_maps/",
  "wiki/unresolved/",
  "wiki/drafts/",
  "wiki/self/",
  "wiki/timelines/source-chronology.md"
];

function buildDeckBody(topic, results, watch) {
  const synthesis = synthesisParagraphs(topic, results, { mode: "report" });
  const route = results.slice(0, 4).map((result) => result.title).join("; ");
  const sourceSlides = results.slice(0, 4).map((result) => {
    return `## ${result.title}\n\n- ${result.excerpt}`;
  });
  const watchSlide = watch.profile
    ? `## Watch Frame

- Profile: [[${watch.profile.relativePath.replace(/^wiki\//, "").replace(/\.md$/i, "")}|${watch.profile.title}]]
- Priority: ${watch.profile.frontmatter.priority || "medium"}
- Cadence: ${watch.profile.frontmatter.cadence || "ad-hoc"}
- Why it matters: ${watch.profile.frontmatter.watch_context || "No watch context recorded yet."}`
    : "";

  return `
# ${topic}

Grounded deck generated from the local Cato corpus.

---

## Executive Summary

- ${synthesis.summary}
- Evidence route: ${route || "no matching evidence"}

---

## Why This Matters

- Use this deck as a working briefing surface inside Obsidian or Marp.
- Promote useful slides into thesis, surveillance, or synthesis pages if they recur.

${watchSlide ? `\n---\n\n${watchSlide}\n` : ""}

---

## Key Evidence

${results.length ? results.slice(0, 5).map((result) => `- ${result.title}: ${result.excerpt}`).join("\n") : "- No matching evidence found."}

---

## Synthesis

- ${synthesis.summary}

${synthesis.contributions || "- No direct source contributions available."}

---

## Counter-Case

- The current deck may overfit to the present corpus composition.
- Missing opposing evidence can make the narrative look cleaner than it really is.

---

## Next Questions

- Which sources should be added next?
- Which point deserves a full report instead of slides?
- What should move into surveillance if the topic is live?

---

${sourceSlides.join("\n\n---\n\n") || "## Source Map\n\n- No matching evidence found."}
`;
}

function writeDeck(root, topic, options = {}) {
  const watch = resolveWatchSubject(root, topic);
  const results = selectEvidence(root, watch.query, {
    limit: Number(options.limit || 8),
    excerptLength: 220,
    excludePrefixes: GROUNDED_EXCLUDE_PREFIXES
  });

  const output = writeOutputDocument(root, {
    idPrefix: "DECK",
    kind: "research-deck",
    title: topic,
    outputDir: "outputs/decks",
    fileSlug: topic,
    body: buildDeckBody(topic, results, watch),
    sources: results.map((result) => result.relativePath),
    frontmatter: {
      marp: true,
      paginate: true,
      theme: "default",
      generation_mode: "grounded_deck",
      watch_profile: watch.profile ? watch.profile.relativePath : ""
    }
  });

  let promotedPath = "";
  if (options.promote) {
    promotedPath = promoteOutputToSynthesis(root, output.outputPath, {
      title: `${topic} deck`,
      sources: results.map((result) => result.relativePath),
      reason: "Promoted from deck workflow for durable synthesis."
    });
  }

  return {
    outputPath: output.outputPath,
    results,
    promotedPath
  };
}

module.exports = {
  writeDeck
};
