const path = require("node:path");
const fs = require("node:fs");
const { searchClaims } = require("./claims");
const {
  confidenceLabel,
  renderResultReference,
  selectEvidence,
  synthesisParagraphs,
  updateManagedNote
} = require("./research");
const { parseFrontmatter } = require("./markdown");
const { ensureProjectStructure } = require("./project");
const { makeId, nowIso, readText, relativeToRoot, slugify } = require("./utils");
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

const SUPPORTIVE_TERMS = ["support", "strength", "upside", "improve", "gain", "outperform", "tailwind", "strong"];
const WEAKENING_TERMS = ["risk", "weak", "downside", "decline", "underperform", "pressure", "headwind", "fragile"];

function classifyEvidence(results) {
  const supportive = [];
  const weakening = [];

  for (const result of results) {
    const lower = `${result.title} ${result.excerpt}`.toLowerCase();
    const supportScore = SUPPORTIVE_TERMS.filter((term) => lower.includes(term)).length;
    const weakeningScore = WEAKENING_TERMS.filter((term) => lower.includes(term)).length;

    if (weakeningScore > supportScore) {
      weakening.push(result);
    } else {
      supportive.push(result);
    }
  }

  return { supportive, weakening };
}

function catalystLines(results) {
  const dated = results
    .filter((result) => result.relativePath.toLowerCase().endsWith(".md"))
    .slice(0, 5)
    .map((result) => `- Revisit ${renderResultReference(result)} for catalysts or regime updates.`);
  return dated.length ? dated.join("\n") : "- No explicit catalysts detected in the current local evidence.";
}

function writeSurveillance(root, subject, options = {}) {
  ensureProjectStructure(root);
  const watch = resolveWatchSubject(root, subject);
  const results = selectEvidence(root, watch.query, {
    limit: Number(options.limit || 10),
    excerptLength: 260,
    excludePrefixes: GROUNDED_EXCLUDE_PREFIXES
  });
  const claims = searchClaims(root, watch.query, {
    limit: Number(options.claimLimit || 8),
    statuses: ["active", "contested", "stale"]
  });
  const surveillancePath = path.join(root, "wiki", "surveillance", `${slugify(subject).slice(0, 80) || "surveillance"}.md`);
  const frontmatter = {
    id: makeId("SURVEIL", slugify(subject).padEnd(12, "s")),
    kind: "surveillance-page",
    title: subject,
    status: "active",
    confidence: confidenceLabel(results).toLowerCase(),
    last_checked_at: nowIso(),
    watch_profile_path: watch.profile ? watch.profile.relativePath : "",
    related: results.map((result) => result.relativePath)
  };
  const current = fs.existsSync(surveillancePath) ? readText(surveillancePath) : "";
  const existingFrontmatter = parseFrontmatter(current).frontmatter;
  const mergedFrontmatter = Object.keys(existingFrontmatter).length ? { ...existingFrontmatter, ...frontmatter } : frontmatter;
  const synthesis = synthesisParagraphs(subject, results, { mode: "surveillance" });
  const classified = classifyEvidence(results);

  updateManagedNote(surveillancePath, mergedFrontmatter, subject, {
    watch: `
## Managed Watch Profile

${watch.profile
  ? `- Profile: [[${watch.profile.relativePath.replace(/^wiki\//, "").replace(/\.md$/i, "")}|${watch.profile.title}]]
- Priority: ${watch.profile.frontmatter.priority || "medium"}
- Cadence: ${watch.profile.frontmatter.cadence || "ad-hoc"}
- Why it matters: ${watch.profile.frontmatter.watch_context || "No watch context recorded yet."}
- Aliases: ${Array.isArray(watch.profile.frontmatter.aliases) && watch.profile.frontmatter.aliases.length ? watch.profile.frontmatter.aliases.join(", ") : "None"}
- Entities: ${Array.isArray(watch.profile.frontmatter.entities) && watch.profile.frontmatter.entities.length ? watch.profile.frontmatter.entities.join(", ") : "None"}
- Concepts: ${Array.isArray(watch.profile.frontmatter.concepts) && watch.profile.frontmatter.concepts.length ? watch.profile.frontmatter.concepts.join(", ") : "None"}
- Risk triggers: ${Array.isArray(watch.profile.frontmatter.risk_triggers) && watch.profile.frontmatter.risk_triggers.length ? watch.profile.frontmatter.risk_triggers.join(", ") : "None"}`
  : "- No watch profile matched this subject. Cato is using the literal topic query only."}
`,
    snapshot: `
## Managed Snapshot

- Last refreshed: ${nowIso()}
- Corpus confidence: ${confidenceLabel(results)}
- Claim count: ${claims.length}
- Primary route: ${results.slice(0, 3).map((result) => result.title).join("; ") || "none"}
- Summary: ${synthesis.summary}
`,
    claims: `
## Managed Claim Ledger

${claims.length ? claims.slice(0, 6).map((claim) => `- [[claims/${String(claim.id).toLowerCase()}|${claim.claim_text.slice(0, 96)}]]`).join("\n") : "- No relevant claims surfaced yet."}
`,
    changed: `
## What Changed Since Last Checkpoint

${results.length ? results.slice(0, 5).map((result) => `- ${renderResultReference(result)}: ${result.excerpt}`).join("\n") : "- No new evidence surfaced from the current local corpus."}
`,
    supporting: `
## Evidence Supporting Thesis

${classified.supportive.length ? classified.supportive.slice(0, 5).map((result) => `- ${renderResultReference(result)}: ${result.excerpt}`).join("\n") : "- No clearly supportive evidence surfaced."}
`,
    weakening: `
## Evidence Weakening Thesis

${classified.weakening.length ? classified.weakening.slice(0, 5).map((result) => `- ${renderResultReference(result)}: ${result.excerpt}`).join("\n") : "- No clearly weakening evidence surfaced."}
`,
    catalysts: `
## Next Dates / Catalysts

${catalystLines(results)}
`,
    action: `
## Action Implications

- Reassess whether the current corpus is changing the thesis or merely reinforcing prior framing.
- Promote recurring surveillance outputs into thesis or synthesis pages if the topic remains live.
- Add opposing or fresher evidence if the current note is over-clustered around one source set.
`
  });

  return {
    notePath: relativeToRoot(root, surveillancePath),
    profilePath: watch.profile ? watch.profile.relativePath : "",
    results,
    claims
  };
}

module.exports = {
  writeSurveillance
};
