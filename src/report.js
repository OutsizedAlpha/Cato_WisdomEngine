const {
  confidenceLabel,
  evidenceBullets,
  promoteOutputToSynthesis,
  renderResultReference,
  selectEvidence,
  synthesisParagraphs,
  writeOutputDocument
} = require("./research");
const { searchClaims } = require("./claims");
const { refreshState } = require("./states");
const { resolveWatchSubject } = require("./watch");
const GROUNDED_EXCLUDE_PREFIXES = [
  "outputs/",
  "wiki/surveillance/",
  "wiki/_indices/",
  "wiki/_maps/",
  "wiki/unresolved/",
  "wiki/self/",
  "wiki/timelines/source-chronology.md"
];

function buildWatchContextBlock(watch) {
  if (!watch.profile) {
    return "";
  }

  const frontmatter = watch.profile.frontmatter;
  return `
## Watch Context

- Watch profile: [[${watch.profile.relativePath.replace(/^wiki\//, "").replace(/\.md$/i, "")}|${watch.profile.title}]]
- Priority: ${frontmatter.priority || "medium"}
- Cadence: ${frontmatter.cadence || "ad-hoc"}
- Why it matters: ${frontmatter.watch_context || "No watch context recorded yet."}
- Aliases: ${Array.isArray(frontmatter.aliases) && frontmatter.aliases.length ? frontmatter.aliases.join(", ") : "None"}
- Entities: ${Array.isArray(frontmatter.entities) && frontmatter.entities.length ? frontmatter.entities.join(", ") : "None"}
- Concepts: ${Array.isArray(frontmatter.concepts) && frontmatter.concepts.length ? frontmatter.concepts.join(", ") : "None"}
`;
}

function buildClaimContextBlock(claims, state) {
  return `
## Claim Ledger

- Current state label: ${state ? state.stateLabel : "not refreshed"}
- Current state page: ${state ? `[[${state.statePath.replace(/^wiki\//, "").replace(/\.md$/i, "")}|${state.subject}]]` : "none"}
- Claims surfaced: ${claims.length}

${claims.length ? claims.slice(0, 6).map((claim) => `- ${claim.claim_text}`).join("\n") : "- No relevant claims surfaced yet."}
`;
}

function buildReportBody(topic, results, watch, claims, state) {
  if (!results.length) {
    return `
# ${topic}

## Executive Summary

The current local corpus does not yet support a grounded report on this topic.

## Context

- Topic: ${topic}
- Coverage: no relevant evidence found.

## Evidence

- None.

${buildWatchContextBlock(watch)}

${buildClaimContextBlock(claims, state)}

## Synthesis

Add source material, rerun ingest and compile, and then regenerate the report.

## Counter-Case

- The repo may simply be incomplete rather than the topic being unsupported.

## Open Questions

- Which primary sources would most quickly improve coverage?
`;
  }

  const synthesis = synthesisParagraphs(topic, results, { mode: "report" });
  const route = results.slice(0, 4).map((result) => result.title).join("; ");
  const topCluster = results.slice(0, 5).map((result) => `- ${result.title}: ${result.excerpt}`).join("\n");

  return `
# ${topic}

## Executive Summary

${synthesis.summary}

## Context

- Topic: ${topic}
- Primary evidence route: ${route}
- Corpus confidence: ${confidenceLabel(results)}

## Evidence

${evidenceBullets(results, 280)}

${buildWatchContextBlock(watch)}

${buildClaimContextBlock(claims, state)}

## Synthesis

${synthesis.summary}

Most directly:

${topCluster}

## Counter-Case

- The current repo may be over-representing one regime, one author cluster, or one style of evidence.
- Review unresolved extraction gaps and classification gaps before treating this report as settled.
- Treat the report as an internal working document, not as proof that the knowledge base is complete.

## Open Questions

- Which arguments are currently under-evidenced?
- Which opposing sources would most likely change the conclusion?
- What should be promoted into a dedicated thesis, concept, or surveillance page next?

## Source Map

${results.map((result) => `- ${renderResultReference(result)}`).join("\n")}
`;
}

function writeReport(root, topic, options = {}) {
  const watch = resolveWatchSubject(root, topic);
  const claims = searchClaims(root, watch.query, {
    limit: Number(options.claimLimit || 8),
    statuses: ["active", "contested", "stale"]
  });
  const state = refreshState(root, topic, {
    claimLimit: options.claimLimit,
    evidenceLimit: options.evidenceLimit
  });
  const results = selectEvidence(root, watch.query, {
    limit: Number(options.limit || 10),
    excerptLength: 300,
    excludePrefixes: GROUNDED_EXCLUDE_PREFIXES
  });

  const output = writeOutputDocument(root, {
    idPrefix: "REPORT",
    kind: "research-report",
    title: topic,
    outputDir: "outputs/reports",
    fileSlug: topic,
    body: buildReportBody(topic, results, watch, claims, state),
    sources: results.map((result) => result.relativePath),
    frontmatter: {
      report_topic: topic,
      generation_mode: "grounded_report",
      watch_profile: watch.profile ? watch.profile.relativePath : "",
      state_path: state.statePath,
      claim_count: claims.length
    }
  });

  let promotedPath = "";
  if (options.promote) {
    promotedPath = promoteOutputToSynthesis(root, output.outputPath, {
      title: topic,
      sources: results.map((result) => result.relativePath),
      reason: "Promoted from report workflow for durable reuse."
    });
  }

  return {
    outputPath: output.outputPath,
    results,
    promotedPath
  };
}

module.exports = {
  writeReport
};
