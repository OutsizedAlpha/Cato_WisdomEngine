const path = require("node:path");
const { parseFrontmatter, renderMarkdown, toWikiLink } = require("./markdown");
const { ensureProjectStructure } = require("./project");
const {
  loadSelfNotes,
  renderResultReference,
  renderRetrievalBudgetBlock,
  retrieveEvidence,
  updateManagedNote,
  writeOutputDocument
} = require("./research");
const { searchClaims } = require("./claims");
const { defaultRegimeSubjects, latestStateSnapshots, refreshState, writeRegimeBrief } = require("./states");
const { resolveWatchSubject } = require("./watch");
const { appendJsonl, makeId, nowIso, readText, relativeToRoot, slugify, timestampStamp, truncate } = require("./utils");

const EVIDENCE_EXCLUDE_PREFIXES = [
  "outputs/",
  "wiki/claims/",
  "wiki/states/",
  "wiki/regimes/",
  "wiki/decisions/",
  "wiki/surveillance/",
  "wiki/_indices/",
  "wiki/_maps/",
  "wiki/unresolved/",
  "wiki/drafts/",
  "wiki/self/"
];

function uniqueByKey(values, keyFn) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value);
  }
  return output;
}

function parseTensionRegister(root) {
  const filePath = path.join(root, "wiki", "self", "tension-register.md");
  try {
    return readText(filePath)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.replace(/^- /, ""));
  } catch (error) {
    return [];
  }
}

function collectSelfModelContext(root) {
  const notes = loadSelfNotes(root);
  const byCategory = new Map();
  for (const note of notes) {
    if (!byCategory.has(note.category)) {
      byCategory.set(note.category, []);
    }
    byCategory.get(note.category).push(note);
  }

  return {
    principles: (byCategory.get("principles") || []).concat(byCategory.get("portfolio-philosophy") || []).slice(0, 4),
    heuristics: (byCategory.get("heuristics") || []).concat(byCategory.get("decision-rules") || []).slice(0, 4),
    biases: (byCategory.get("bias-watch") || []).slice(0, 4),
    tensions: parseTensionRegister(root).slice(0, 4)
  };
}

function supportingClaimLines(claims, count = 5) {
  return claims.length ? claims.slice(0, count).map((claim) => `- ${claim.claim_text}`).join("\n") : "- None surfaced.";
}

function claimLinks(claims, count = 6) {
  return claims.length
    ? claims.slice(0, count).map((claim) => `- [[claims/${String(claim.id).toLowerCase()}|${truncate(claim.claim_text, 96)}]]`).join("\n")
    : "- None.";
}

function selfModelBlock(context) {
  const lines = [];
  if (context.principles.length) {
    lines.push("### Principles");
    lines.push(...context.principles.map((note) => `- ${note.title}`));
    lines.push("");
  }
  if (context.heuristics.length) {
    lines.push("### Heuristics");
    lines.push(...context.heuristics.map((note) => `- ${note.title}`));
    lines.push("");
  }
  if (context.biases.length || context.tensions.length) {
    lines.push("### Bias / Tension Checks");
    lines.push(...context.biases.map((note) => `- ${note.title}`));
    lines.push(...context.tensions.map((line) => `- ${line}`));
    lines.push("");
  }
  return lines.length ? lines.join("\n") : "- No self-model notes are available yet.";
}

function decisionImplications(states) {
  const fragile = states.filter((state) => ["fragile", "contested"].includes(String(state.stateLabel)));
  const constructive = states.filter((state) => state.stateLabel === "constructive");
  const lines = [];
  if (fragile.length) {
    lines.push(`- Fragile / contested states: ${fragile.map((state) => state.subject).join(", ")}.`);
  }
  if (constructive.length) {
    lines.push(`- Constructive states: ${constructive.map((state) => state.subject).join(", ")}.`);
  }
  lines.push("- Reweight attention toward the state labels that changed most recently, not just the longest-standing themes.");
  return lines.join("\n");
}

function deRiskTriggers(states, claims) {
  const negativeClaims = claims.filter((claim) => claim.status === "contested" || claim.polarity === "negative");
  const lines = [
    ...fragileSubjects(states).map((subject) => `- A fresh deterioration in ${subject} would justify immediate re-evaluation.`),
    ...negativeClaims.slice(0, 5).map((claim) => `- ${claim.claim_text}`)
  ];
  return lines.length ? lines.join("\n") : "- No explicit de-risk triggers surfaced beyond the normal monitoring process.";
}

function fragileSubjects(states) {
  return states.filter((state) => ["fragile", "contested"].includes(String(state.stateLabel))).map((state) => state.subject);
}

function strongestCounterCase(states, claims, selfModel) {
  const contested = claims.filter((claim) => claim.status === "contested");
  const tensions = selfModel.tensions || [];
  const lines = [
    ...contested.slice(0, 4).map((claim) => `- ${claim.claim_text}`),
    ...tensions.slice(0, 3).map((line) => `- Self-model tension: ${line}`)
  ];
  if (!lines.length) {
    return "- The main risk is false confidence from sparse coverage rather than a clearly surfaced counter-case.";
  }
  return lines.join("\n");
}

function decisionDataGaps(pack) {
  const lines = [];
  if (pack.claims.length < 3) {
    lines.push("- The claim map is still thin relative to the decision surface.");
  }
  if (pack.evidence.length < 3) {
    lines.push("- Add more grounded evidence before treating this decision as well-covered.");
  }
  if (pack.evidencePack?.escalated) {
    lines.push("- Retrieval had to escalate beyond the requested budget, so short-route knowledge is sparse.");
  }
  if (pack.claims.some((claim) => claim.status === "stale")) {
    lines.push("- Some supporting claims are stale and should be refreshed before acting heavily on this note.");
  }
  if (!pack.watch.profile) {
    lines.push("- A dedicated watch profile would tighten monitoring and trigger discipline on this topic.");
  }
  return lines.length ? lines.join("\n") : "- No immediate data-gap pressure surfaced beyond normal monitoring cadence.";
}

function collectTopicPack(root, topic, options = {}) {
  const watch = resolveWatchSubject(root, topic);
  const state = refreshState(root, topic, {
    claimLimit: options.claimLimit,
    evidenceLimit: options.evidenceLimit
  });
  const claims = searchClaims(root, watch.query, {
    limit: Number(options.claimLimit || 10),
    statuses: ["active", "contested", "stale"]
  });
  const evidencePack = retrieveEvidence(root, watch.query, {
    budget: options.budget || "L2",
    mode: "brief",
    limit: Number(options.evidenceLimit || 8),
    excludePrefixes: EVIDENCE_EXCLUDE_PREFIXES
  });
  return { watch, state, claims, evidence: evidencePack.results, evidencePack };
}

function writeDecisionNote(root, topic, options = {}) {
  ensureProjectStructure(root);
  const pack = collectTopicPack(root, topic, options);
  const selfModel = collectSelfModelContext(root);
  const decisionPath = path.join(root, "wiki", "decisions", `${slugify(topic).slice(0, 80) || "decision"}.md`);

  updateManagedNote(
    decisionPath,
    {
      id: makeId("DECISION", slugify(topic).padEnd(12, "d")),
      kind: "decision-note",
      title: topic,
      status: "active",
      confidence: pack.state.confidence,
      last_updated_at: nowIso(),
      related: uniqueByKey(
        [pack.state.statePath, ...pack.claims.map((claim) => claim.origin_note_path), ...pack.evidence.map((result) => result.relativePath)],
        (value) => value
      )
    },
    topic,
    {
      frame: `
## Managed Decision Frame

- Topic: ${topic}
- State page: ${toWikiLink(pack.state.statePath, pack.state.subject)}
- State label: ${pack.state.stateLabel}
- Confidence: ${pack.state.confidence}
- Watch profile: ${pack.watch.profile ? toWikiLink(pack.watch.profile.relativePath, pack.watch.profile.title) : "No linked watch profile."}
`,
      implications: `
## Managed Portfolio Implications

${decisionImplications([pack.state])}
`,
      risks: `
## Managed Risk Flags

${supportingClaimLines(pack.claims.filter((claim) => claim.status === "contested" || claim.polarity === "negative"))}
`,
      triggers: `
## Managed De-Risk Triggers

${deRiskTriggers([pack.state], pack.claims)}
`,
      monitor: `
## Managed What To Monitor Next

${pack.evidence.length ? pack.evidence.slice(0, 6).map((result) => `- ${renderResultReference(result)}`).join("\n") : "- No grounded evidence surfaced."}
`,
      counter: `
## Managed Strongest Counter-Case

${strongestCounterCase([pack.state], pack.claims, selfModel)}
`,
      self: `
## Managed Self-Model Lens

${selfModelBlock(selfModel)}
`,
      gaps: `
## Managed Data Gaps

${decisionDataGaps(pack)}

${renderRetrievalBudgetBlock(pack.evidencePack).trim()}
`,
      claims: `
## Managed Claim Map

${claimLinks(pack.claims)}
`
    }
  );

  appendJsonl(path.join(root, "logs", "actions", "decision_runs.jsonl"), {
    event: "decision_note",
    at: nowIso(),
    topic,
    path: relativeToRoot(root, decisionPath),
    claim_count: pack.claims.length,
    evidence_count: pack.evidence.length
  });

  return {
    notePath: relativeToRoot(root, decisionPath),
    statePath: pack.state.statePath,
    claims: pack.claims.length
  };
}

function writeMeetingBrief(root, title, options = {}) {
  ensureProjectStructure(root);
  const subjects = uniqueByKey(
    (options.subjects ? String(options.subjects).split(",") : defaultRegimeSubjects(root, "weekly-investment-meeting")).map((value) => String(value).trim()),
    (value) => slugify(value)
  );
  const states = subjects.map((subject) =>
    refreshState(root, subject, {
      claimLimit: options.claimLimit,
      evidenceLimit: options.evidenceLimit
    })
  );
  const claims = uniqueByKey(states.flatMap((state) => state.claims), (claim) => claim.id);
  const evidence = uniqueByKey(states.flatMap((state) => state.evidence), (result) => result.relativePath);
  const selfModel = collectSelfModelContext(root);

  const output = writeOutputDocument(root, {
    idPrefix: "MEETING",
    kind: "meeting-brief",
    title,
    outputDir: "outputs/meeting-briefs",
    fileSlug: title,
    sources: [...new Set(evidence.map((result) => result.relativePath).concat(claims.flatMap((claim) => claim.supporting_sources)))],
    frontmatter: {
      subjects,
      state_count: states.length,
      claim_count: claims.length
    },
    body: `
# ${title}

## Current World State

${states.map((state) => `- ${state.subject}: ${state.stateLabel} (${state.confidence})`).join("\n")}

## Portfolio Implications

${decisionImplications(states)}

## Risk Flags

${supportingClaimLines(claims.filter((claim) => claim.status === "contested" || claim.polarity === "negative"), 8)}

## De-Risk Triggers

${deRiskTriggers(states, claims)}

## What To Monitor Next

${evidence.length ? evidence.slice(0, 8).map((result) => `- ${renderResultReference(result)}`).join("\n") : "- No grounded evidence surfaced."}

## Strongest Counter-Case

${strongestCounterCase(states, claims, selfModel)}

## Data Gaps

${decisionDataGaps({ claims, evidence, watch: { profile: null }, evidencePack: { escalated: false } })}

## Self-Model Lens

${selfModelBlock(selfModel)}

## State Map

${states.map((state) => `- ${toWikiLink(state.statePath, state.subject)} (${state.stateLabel}, ${state.confidence})`).join("\n")}
`
  });

  appendJsonl(path.join(root, "logs", "actions", "decision_runs.jsonl"), {
    event: "meeting_brief",
    at: nowIso(),
    title,
    output_path: output.outputPath,
    subjects,
    state_count: states.length,
    claim_count: claims.length
  });

  return {
    outputPath: output.outputPath,
    subjects,
    claims: claims.length
  };
}

function writeRedTeam(root, topic, options = {}) {
  ensureProjectStructure(root);
  const pack = collectTopicPack(root, topic, options);
  const selfModel = collectSelfModelContext(root);
  const contested = pack.claims.filter((claim) => claim.status === "contested");
  const negative = pack.claims.filter((claim) => claim.polarity === "negative");

  const output = writeOutputDocument(root, {
    idPrefix: "REDTEAM",
    kind: "red-team-brief",
    title: `Red Team: ${topic}`,
    outputDir: "outputs/briefs",
    fileSlug: `red-team-${topic}`,
    sources: [...new Set(pack.evidence.map((result) => result.relativePath).concat(pack.claims.flatMap((claim) => claim.supporting_sources)))],
    frontmatter: {
      topic,
      state_path: pack.state.statePath
    },
    body: `
# Red Team: ${topic}

## Base View Under Review

- State label: ${pack.state.stateLabel}
- Confidence: ${pack.state.confidence}
- Current state page: ${toWikiLink(pack.state.statePath, pack.state.subject)}

## Strongest Counter-Case

${strongestCounterCase([pack.state], pack.claims, selfModel)}

## Fragilities In The Evidence Base

${supportingClaimLines(contested.concat(negative), 8)}

## Likely Blind Spots

${selfModel.tensions.length || selfModel.biases.length ? selfModelBlock(selfModel) : "- No explicit blind spots are documented in the self-model yet."}

## What Would Invalidate The Current Stance

${deRiskTriggers([pack.state], pack.claims)}

## Missing Evidence

${pack.evidence.length ? pack.evidence.slice(0, 6).map((result) => `- Need fresh or opposing follow-up to ${renderResultReference(result)}`).join("\n") : "- Add primary-source evidence on this topic."}

## Retrieval Budget

- Active budget: ${pack.evidencePack.activeBudget}
- Escalated: ${pack.evidencePack.escalated ? "yes" : "no"}
- Route: TL;DR surfaces first, raw extracts only if needed.
`
  });

  appendJsonl(path.join(root, "logs", "actions", "decision_runs.jsonl"), {
    event: "red_team",
    at: nowIso(),
    topic,
    output_path: output.outputPath,
    contested_claims: contested.length
  });

  return {
    outputPath: output.outputPath,
    contestedClaims: contested.length
  };
}

function writeWhatChangedForMarkets(root, options = {}) {
  ensureProjectStructure(root);
  const subjects = uniqueByKey(
    (options.subjects ? String(options.subjects).split(",") : defaultRegimeSubjects(root, "weekly-investment-meeting")).map((value) => String(value).trim()),
    (value) => slugify(value)
  );
  const states = subjects.map((subject) =>
    refreshState(root, subject, {
      claimLimit: options.claimLimit,
      evidenceLimit: options.evidenceLimit
    })
  );

  const lines = [];
  for (const state of states) {
    const snapshots = latestStateSnapshots(root, state.subject);
    const previous = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
    const current = snapshots.length ? snapshots[snapshots.length - 1] : null;
    if (!current) {
      continue;
    }
    const added = previous ? current.claim_ids.filter((id) => !previous.claim_ids.includes(id)).length : current.claim_ids.length;
    const removed = previous ? previous.claim_ids.filter((id) => !current.claim_ids.includes(id)).length : 0;
    lines.push(`- ${state.subject}: ${state.stateLabel} (${state.confidence}); added claims ${added}, removed claims ${removed}.`);
  }

  const output = writeOutputDocument(root, {
    idPrefix: "MARKETCHG",
    kind: "market-change-brief",
    title: options.title || "What changed for markets",
    outputDir: "outputs/briefs",
    fileSlug: "what-changed-for-markets",
    sources: states.flatMap((state) => state.evidence.map((result) => result.relativePath)),
    frontmatter: {
      subjects
    },
    body: `
# ${options.title || "What changed for markets"}

## Top Changes

${lines.length ? lines.join("\n") : "- No state changes were available."}

## Why It Matters

- This view is state-led rather than note-led, so it emphasises changes in the current world model rather than only new documents.
- Re-run meeting briefs or decision notes if the states that matter to your mandate have changed materially.

## Regime Surface

${states.map((state) => `- ${toWikiLink(state.statePath, state.subject)} (${state.stateLabel}, ${state.confidence})`).join("\n")}
`
  });

  appendJsonl(path.join(root, "logs", "actions", "decision_runs.jsonl"), {
    event: "what_changed_for_markets",
    at: nowIso(),
    output_path: output.outputPath,
    subjects
  });

  return {
    outputPath: output.outputPath,
    subjects
  };
}

module.exports = {
  writeDecisionNote,
  writeMeetingBrief,
  writeRedTeam,
  writeWhatChangedForMarkets,
  writeRegimeBrief
};
