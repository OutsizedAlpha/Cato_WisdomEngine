const path = require("node:path");
const { parseFrontmatter, renderMarkdown, toWikiLink } = require("./markdown");
const { ensureProjectStructure, listMarkdownNotes } = require("./project");
const {
  confidenceLabel,
  renderResultReference,
  renderRetrievalBudgetBlock,
  retrieveEvidence,
  updateManagedNote,
  writeOutputDocument
} = require("./research");
const { searchClaims } = require("./claims");
const { resolveWatchSubject } = require("./watch");
const {
  appendJsonl,
  dateStamp,
  makeId,
  nowIso,
  readJson,
  readJsonl,
  readText,
  relativeToRoot,
  slugify,
  timestampStamp,
  truncate,
  writeText
} = require("./utils");

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

function normalizeList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  return String(value)
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueList(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.flatMap((entry) => normalizeList(entry))) {
    const key = slugify(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value);
  }
  return output;
}

function loadStateProfiles(root) {
  const config = readJson(path.join(root, "config", "state_profiles.json"), { states: [], regime_sets: {} });
  return {
    states: Array.isArray(config.states) ? config.states : [],
    regimeSets: config.regime_sets || {}
  };
}

function phraseScore(subject, phrase) {
  const subjectKey = slugify(subject);
  const phraseKey = slugify(phrase);
  if (!subjectKey || !phraseKey) {
    return 0;
  }
  if (subjectKey === phraseKey) {
    return 1000 + phraseKey.length;
  }
  if (subjectKey.includes(phraseKey)) {
    return 600 + phraseKey.length;
  }
  if (phraseKey.includes(subjectKey)) {
    return 400 + subjectKey.length;
  }
  return 0;
}

function resolveStateSubject(root, subject) {
  const { states } = loadStateProfiles(root);
  const scored = states
    .map((profile) => {
      const phrases = [profile.title, ...(profile.aliases || [])];
      const score = Math.max(...phrases.map((phrase) => phraseScore(subject, phrase)), 0);
      return { profile, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.profile.title.localeCompare(right.profile.title));

  const watch = resolveWatchSubject(root, subject);
  if (!scored.length) {
    const dynamicProfile = {
      title: subject,
      aliases: [],
      concepts: [],
      entities: [],
      focus: "",
      market_lens: "",
      watch_profile: watch.profile ? watch.profile.title : ""
    };
    return {
      profile: dynamicProfile,
      watch,
      query: watch.query
    };
  }

  const profile = scored[0].profile;
  const queryTerms = uniqueList([
    subject,
    profile.title,
    profile.aliases,
    profile.concepts,
    profile.entities,
    watch.profile ? watch.profile.frontmatter.aliases : [],
    watch.profile ? watch.profile.frontmatter.entities : [],
    watch.profile ? watch.profile.frontmatter.concepts : []
  ]);

  return {
    profile,
    watch,
    query: queryTerms.join(" ")
  };
}

function claimLink(claim) {
  return toWikiLink(`wiki/claims/${String(claim.id || "").toLowerCase()}.md`, truncate(claim.claim_text, 110));
}

function classifyStateLabel(claims) {
  const positive = claims.filter((claim) => claim.polarity === "positive" && claim.status !== "contested").length;
  const negative = claims.filter((claim) => claim.polarity === "negative" && claim.status !== "contested").length;
  const contested = claims.filter((claim) => claim.status === "contested").length;

  if (contested >= Math.max(2, positive, negative)) {
    return "contested";
  }
  if (positive >= negative + 2) {
    return "constructive";
  }
  if (negative >= positive + 2) {
    return "fragile";
  }
  return "mixed";
}

function stateConfidence(claims, evidence) {
  return confidenceLabel(new Array(Math.min(claims.length + evidence.length, 10)).fill(1)).toLowerCase();
}

function stateSummary(profile, claims, evidence, label) {
  const leadClaims = claims.slice(0, 3).map((claim) => claim.claim_text).join(" ");
  const focus = profile.focus ? `${profile.focus} ` : "";
  const evidenceRoute = evidence.slice(0, 3).map((result) => result.title).join("; ");
  return `${focus}The current state is ${label}. ${claims.length} relevant claim${claims.length === 1 ? "" : "s"} and ${evidence.length} grounded evidence note${
    evidence.length === 1 ? "" : "s"
  } currently support the view. ${leadClaims}${evidenceRoute ? ` Primary evidence route: ${evidenceRoute}.` : ""}`;
}

function latestStateSnapshots(root, subject) {
  return readJsonl(path.join(root, "manifests", "state_history.jsonl"), [])
    .filter((entry) => slugify(entry.subject) === slugify(subject))
    .sort((left, right) => String(left.at).localeCompare(String(right.at)));
}

function diffStateClaims(previousIds, currentClaims) {
  const currentIds = new Set(currentClaims.map((claim) => claim.id));
  const previousSet = new Set(previousIds);
  return {
    strengthened: currentClaims.filter((claim) => !previousSet.has(claim.id) && claim.polarity !== "negative"),
    weakened: currentClaims.filter((claim) => claim.status === "contested" || claim.polarity === "negative"),
    unchanged: currentClaims.filter((claim) => previousSet.has(claim.id))
  };
}

function catalystLines(profile, watch, evidence) {
  const triggerLines = uniqueList([
    profile.risk_triggers || [],
    watch.profile ? watch.profile.frontmatter.risk_triggers : []
  ]).map((value) => `- ${value}`);
  const evidenceLines = evidence
    .slice(0, 4)
    .map((result) => `- Revisit ${renderResultReference(result)} for catalyst or regime change.`);
  const combined = [...triggerLines, ...evidenceLines];
  return combined.length ? combined.join("\n") : "- No explicit catalysts recorded yet.";
}

function flipLines(profile, claims) {
  const negativeClaims = claims.filter((claim) => claim.status === "contested" || claim.polarity === "negative");
  const lines = [
    ...negativeClaims.slice(0, 4).map((claim) => `- ${claim.claim_text}`),
    ...uniqueList(profile.risk_triggers || []).map((trigger) => `- ${trigger}`)
  ];
  return lines.length ? lines.join("\n") : "- No explicit flip conditions recorded yet.";
}

function marketRelevance(profile, label, claims) {
  const negative = claims.filter((claim) => claim.polarity === "negative").length;
  const positive = claims.filter((claim) => claim.polarity === "positive").length;
  const lens = profile.market_lens || "rates, FX, equities, credit";
  if (label === "constructive") {
    return `- Current balance is constructive. Focus on whether strength broadens through ${lens} without reigniting inflation or geopolitical stress.`;
  }
  if (label === "fragile") {
    return `- Current balance is fragile. Focus on de-risking thresholds and whether weakness begins transmitting through ${lens}.`;
  }
  if (label === "contested") {
    return `- Current balance is contested. The market lens is ${lens}, but the stronger task is separating regime change from noisy cross-currents.`;
  }
  return `- Current balance is mixed. Positive claim count: ${positive}. Negative claim count: ${negative}. The market lens is ${lens}.`;
}

function stateCounterArguments(claims) {
  const contested = claims.filter((claim) => claim.status === "contested");
  const negative = claims.filter((claim) => claim.polarity === "negative");
  const lines = contested.concat(negative).slice(0, 6).map((claim) => `- ${claim.claim_text}`);
  return lines.length ? [...new Set(lines)].join("\n") : "- No explicit counter-argument cluster surfaced beyond routine review risk.";
}

function stateDataGaps(resolved, claims, evidence, evidencePack) {
  const lines = [];
  if (claims.length < 3) {
    lines.push("- Add more directly relevant claims before treating this state as well-covered.");
  }
  if (evidence.length < 3) {
    lines.push("- Add more grounded evidence notes or source notes on this subject.");
  }
  if (evidencePack.escalated) {
    lines.push("- Retrieval had to escalate beyond the requested budget, which signals thin short-route coverage.");
  }
  if (!resolved.watch.profile) {
    lines.push("- Create or link a watch profile so this state has explicit monitoring context.");
  }
  if (claims.some((claim) => claim.status === "stale")) {
    lines.push("- Refresh stale claims with newer evidence before relying on this state operationally.");
  }
  return lines.length ? lines.join("\n") : "- No immediate data-gap pressure surfaced beyond normal monitoring cadence.";
}

function refreshState(root, subject, options = {}) {
  ensureProjectStructure(root);
  const resolved = resolveStateSubject(root, subject);
  const claims = searchClaims(root, resolved.query, {
    limit: Number(options.claimLimit || 12),
    statuses: ["active", "contested", "stale"]
  });
  const evidencePack = retrieveEvidence(root, resolved.query, {
    budget: options.budget || "L2",
    mode: "brief",
    limit: Number(options.evidenceLimit || 8),
    excludePrefixes: EVIDENCE_EXCLUDE_PREFIXES
  });
  const evidence = evidencePack.results;
  const statePath = path.join(root, "wiki", "states", `${slugify(resolved.profile.title).slice(0, 80) || "state"}.md`);
  const priorSnapshots = latestStateSnapshots(root, resolved.profile.title);
  const previous = priorSnapshots.length ? priorSnapshots[priorSnapshots.length - 1] : null;
  const diff = diffStateClaims(previous?.claim_ids || [], claims);
  const label = classifyStateLabel(claims);
  const confidence = stateConfidence(claims, evidence);
  const summary = stateSummary(resolved.profile, claims, evidence, label);

  updateManagedNote(
    statePath,
    {
      id: makeId("STATE", slugify(resolved.profile.title).padEnd(12, "s")),
      kind: "state-page",
      title: resolved.profile.title,
      status: "active",
      state_label: label,
      confidence,
      last_refreshed_at: nowIso(),
      query: resolved.query,
      watch_profile_path: resolved.watch.profile ? resolved.watch.profile.relativePath : "",
      related: [...new Set(claims.map((claim) => claim.origin_note_path).concat(evidence.map((result) => result.relativePath)))]
    },
    resolved.profile.title,
    {
      profile: `
## Managed Profile

- Focus: ${resolved.profile.focus || "Ad-hoc state subject."}
- Market lens: ${resolved.profile.market_lens || "Not explicitly set."}
- Watch profile: ${
        resolved.watch.profile ? toWikiLink(resolved.watch.profile.relativePath, resolved.watch.profile.title) : "No linked watch profile."
      }
- Query route: ${resolved.query || subject}
- Retrieval budget: ${evidencePack.activeBudget}
`,
      snapshot: `
## Managed Snapshot

- Last refreshed: ${nowIso()}
- State label: ${label}
- Confidence: ${confidence}
- Claim count: ${claims.length}
- Evidence count: ${evidence.length}
- Summary: ${summary}
`,
      strengthened: `
## Managed Strengthened

${diff.strengthened.length ? diff.strengthened.slice(0, 6).map((claim) => `- ${claimLink(claim)}`).join("\n") : "- No newly strengthened claims relative to the previous snapshot."}
`,
      weakened: `
## Managed Weakened

${diff.weakened.length ? diff.weakened.slice(0, 6).map((claim) => `- ${claimLink(claim)}`).join("\n") : "- No clear weakening or contested claims surfaced."}
`,
      unchanged: `
## Managed Unchanged

${diff.unchanged.length ? diff.unchanged.slice(0, 6).map((claim) => `- ${claimLink(claim)}`).join("\n") : "- No carry-over claims from the previous snapshot yet."}
`,
      catalysts: `
## Managed Catalysts

${catalystLines(resolved.profile, resolved.watch, evidence)}
`,
      flip: `
## Managed What Would Flip It

${flipLines(resolved.profile, claims)}
`,
      markets: `
## Managed Market Relevance

${marketRelevance(resolved.profile, label, claims)}
`,
      counter: `
## Managed Counter-Arguments

${stateCounterArguments(claims)}
`,
      gaps: `
## Managed Data Gaps

${stateDataGaps(resolved, claims, evidence, evidencePack)}

${renderRetrievalBudgetBlock(evidencePack).trim()}
`
    }
  );

  const snapshot = {
    subject: resolved.profile.title,
    at: nowIso(),
    state_label: label,
    confidence,
    query: resolved.query,
    claim_ids: claims.map((claim) => claim.id),
    evidence_paths: evidence.map((result) => result.relativePath),
    strengthened_ids: diff.strengthened.map((claim) => claim.id),
    weakened_ids: diff.weakened.map((claim) => claim.id),
    unchanged_ids: diff.unchanged.map((claim) => claim.id)
  };
  appendJsonl(path.join(root, "manifests", "state_history.jsonl"), snapshot);
  appendJsonl(path.join(root, "logs", "actions", "state_refresh.jsonl"), {
    event: "state_refresh",
    at: snapshot.at,
    subject: resolved.profile.title,
    state_label: label,
    confidence,
    claims: claims.length,
    evidence: evidence.length
  });

  return {
    statePath: relativeToRoot(root, statePath),
    subject: resolved.profile.title,
    stateLabel: label,
    confidence,
    claims,
    evidence,
    snapshot
  };
}

function writeStateDiff(root, subject) {
  ensureProjectStructure(root);
  const snapshots = latestStateSnapshots(root, subject);
  if (snapshots.length < 2) {
    const emptyPath = path.join(root, "outputs", "briefs", `${timestampStamp()}-state-diff-${slugify(subject).slice(0, 80) || "state"}.md`);
    writeText(
      emptyPath,
      renderMarkdown(
        {
          id: makeId("STATEDIFF", slugify(subject).padEnd(12, "d")),
          kind: "state-diff",
          title: `State Diff: ${subject}`,
          created_at: nowIso(),
          subject
        },
        `
# State Diff: ${subject}

## Status

There are not yet two state snapshots for this subject, so no meaningful diff is available.
`
      )
    );
    return { outputPath: relativeToRoot(root, emptyPath), subject, changed: 0 };
  }

  const previous = snapshots[snapshots.length - 2];
  const current = snapshots[snapshots.length - 1];
  const added = current.claim_ids.filter((id) => !previous.claim_ids.includes(id));
  const removed = previous.claim_ids.filter((id) => !current.claim_ids.includes(id));
  const carried = current.claim_ids.filter((id) => previous.claim_ids.includes(id));

  const output = writeOutputDocument(root, {
    idPrefix: "STATEDIFF",
    kind: "state-diff",
    title: `State Diff: ${subject}`,
    outputDir: "outputs/briefs",
    fileSlug: `state-diff-${subject}`,
    sources: [...new Set(current.evidence_paths.concat(previous.evidence_paths))],
    frontmatter: {
      subject,
      previous_at: previous.at,
      current_at: current.at
    },
    body: `
# State Diff: ${subject}

## Headline

State label moved from ${previous.state_label} to ${current.state_label}. Confidence moved from ${previous.confidence} to ${current.confidence}.

## Added Claims

${added.length ? added.map((id) => `- [[claims/${id.toLowerCase()}|${id}]]`).join("\n") : "- None."}

## Removed Claims

${removed.length ? removed.map((id) => `- [[claims/${id.toLowerCase()}|${id}]]`).join("\n") : "- None."}

## Unchanged Claims

${carried.length ? carried.slice(0, 10).map((id) => `- [[claims/${id.toLowerCase()}|${id}]]`).join("\n") : "- None."}

## Market Read-Through

- Review the newly added claims first. Those are the fastest route to understanding why the state shifted.
- If the state label changed materially, rerun any decision notes or meeting briefs that depend on this subject.
`
  });

  return {
    outputPath: output.outputPath,
    subject,
    changed: added.length + removed.length
  };
}

function loadStatePages(root) {
  return listMarkdownNotes(root, "wiki/states")
    .filter((filePath) => !/\/index\.md$/i.test(relativeToRoot(root, filePath)))
    .map((filePath) => {
      const parsed = parseFrontmatter(readText(filePath));
      return {
        path: filePath,
        relativePath: relativeToRoot(root, filePath),
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        title: parsed.frontmatter.title || path.basename(filePath, ".md")
      };
    });
}

function defaultRegimeSubjects(root, setName = "global-risk-regime") {
  const { regimeSets } = loadStateProfiles(root);
  return Array.isArray(regimeSets[setName]) ? regimeSets[setName] : ["Global Macro", "Geopolitical Risk", "Market Structure"];
}

function writeRegimeBrief(root, options = {}) {
  ensureProjectStructure(root);
  const subjects = uniqueList(options.subjects ? String(options.subjects).split(",") : defaultRegimeSubjects(root, options.set || "global-risk-regime"));
  const refreshed = options.noRefresh ? loadStatePages(root).filter((page) => subjects.includes(page.title)).map((page) => ({
    subject: page.title,
    statePath: page.relativePath,
    stateLabel: page.frontmatter.state_label || "unknown",
    confidence: page.frontmatter.confidence || "low",
    claims: [],
    evidence: []
  })) : subjects.map((subject) => refreshState(root, subject, { claimLimit: options.claimLimit, evidenceLimit: options.evidenceLimit }));

  const output = writeOutputDocument(root, {
    idPrefix: "REGIME",
    kind: "regime-brief",
    title: options.title || `${options.set || "global-risk-regime"} regime brief`,
    outputDir: "outputs/briefs",
    fileSlug: `${options.set || "global-risk-regime"}-regime-brief`,
    sources: [...new Set(refreshed.flatMap((entry) => (entry.evidence || []).map((result) => result.relativePath)))],
    frontmatter: {
      regime_set: options.set || "global-risk-regime",
      subjects
    },
    body: `
# ${(options.title || `${options.set || "global-risk-regime"} regime brief`).replace(/^\w/, (value) => value.toUpperCase())}

## Regime Grid

${refreshed
  .map(
    (entry) =>
      `- ${entry.subject}: ${entry.stateLabel} (${entry.confidence})${entry.statePath ? ` - ${toWikiLink(entry.statePath, entry.subject)}` : ""}`
  )
  .join("\n")}

## Cross-Asset Read-Through

- This regime brief pulls from the current state pages rather than only raw note search, so it reflects current belief updates as well as source coverage.
- Focus first on the subjects with the weakest confidence or the most contested state labels.

## What Changed Matters Most

${refreshed
  .map((entry) => `- ${entry.subject}: ${entry.stateLabel} state with ${entry.claims?.length || 0} linked claims and ${entry.evidence?.length || 0} supporting evidence notes.`)
  .join("\n")}
`
  });

  const regimePath = path.join(root, "wiki", "regimes", `${slugify(options.set || "global-risk-regime").slice(0, 80) || "regime"}.md`);
  writeText(
    regimePath,
    renderMarkdown(
      {
        id: makeId("REGIME", slugify(options.set || "global-risk-regime").padEnd(12, "r")),
        kind: "regime-page",
        title: options.title || `${options.set || "global-risk-regime"} regime brief`,
        status: "active",
        confidence: confidenceLabel(refreshed).toLowerCase(),
        subjects
      },
      `
# ${options.title || `${options.set || "global-risk-regime"} regime brief`}

## Summary

${refreshed.map((entry) => `- ${entry.subject}: ${entry.stateLabel} (${entry.confidence})`).join("\n")}

## Output Reference

- Latest generated brief: \`${output.outputPath}\`
`
    )
  );

  return {
    outputPath: output.outputPath,
    regimePath: relativeToRoot(root, regimePath),
    subjects
  };
}

module.exports = {
  defaultRegimeSubjects,
  latestStateSnapshots,
  loadStateProfiles,
  refreshState,
  resolveStateSubject,
  writeRegimeBrief,
  writeStateDiff
};
