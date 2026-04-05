const fs = require("node:fs");
const path = require("node:path");
const { refreshClaims, searchClaims, writeWhyBelieve } = require("./claims");
const { writeDecisionNote, writeMeetingBrief, writeRedTeam, writeWhatChangedForMarkets } = require("./decisions");
const { parseFrontmatter, sectionContent, stripMarkdownFormatting } = require("./markdown");
const { ensureProjectStructure } = require("./project");
const { captureResearch } = require("./research-handoff");
const { searchCorpus } = require("./search");
const { defaultRegimeSubjects, refreshState, writeRegimeBrief, writeStateDiff } = require("./states");
const { resolveWatchSubject } = require("./watch");
const {
  appendJsonl,
  nowIso,
  readText,
  relativeToRoot,
  slugify,
  timestampStamp,
  truncate,
  uniquePath,
  writeJson,
  writeText
} = require("./utils");

const MODE_ALIASES = {
  claim: "belief",
  claims: "belief",
  belief: "belief",
  state: "state",
  regime: "state",
  decision: "decision",
  pm: "decision",
  meeting: "meeting"
};

const EVIDENCE_EXCLUDE_PREFIXES = [
  "outputs/",
  "wiki/claims/",
  "wiki/states/",
  "wiki/regimes/",
  "wiki/decisions/",
  "wiki/surveillance/",
  "wiki/watch-profiles/",
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

function normalizeMode(value) {
  return MODE_ALIASES[String(value || "decision").trim().toLowerCase()] || "decision";
}

function outputKindForMode(mode) {
  if (mode === "meeting") {
    return "meeting-brief";
  }
  if (mode === "belief" || mode === "state") {
    return "brief";
  }
  return "report";
}

function bundleTitle(topic, mode, explicitTitle = "") {
  if (explicitTitle) {
    return explicitTitle;
  }
  if (mode === "meeting") {
    return topic || "Frontier meeting brief";
  }
  if (mode === "belief") {
    return `${topic} frontier belief brief`;
  }
  if (mode === "state") {
    return `${topic} frontier state brief`;
  }
  return `${topic} frontier decision brief`;
}

function uniqueLocalSources(entries) {
  const seen = new Set();
  const output = [];
  for (const entry of entries) {
    if (!entry || !entry.path) {
      continue;
    }
    const key = String(entry.path).replace(/\\/g, "/");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push({
      path: key,
      title: entry.title || path.basename(key, path.extname(key)),
      role: entry.role || "context"
    });
  }
  return output;
}

function makeLocalSource(pathValue, title, role) {
  if (!pathValue) {
    return null;
  }
  return {
    path: String(pathValue).replace(/\\/g, "/"),
    title: title || path.basename(String(pathValue), path.extname(String(pathValue))),
    role
  };
}

function loadNoteSections(root, relativePath, headings) {
  if (!relativePath) {
    return {};
  }
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {};
  }
  const parsed = parseFrontmatter(readText(absolutePath));
  const sections = {};
  for (const heading of headings) {
    const content = sectionContent(parsed.body, heading);
    if (content) {
      sections[heading] = truncate(stripMarkdownFormatting(content).replace(/\s+/g, " ").trim(), 800);
    }
  }
  return sections;
}

function summarizeClaims(claims) {
  return claims.map((claim) => ({
    id: claim.id,
    claim_text: claim.claim_text,
    claim_type: claim.claim_type,
    status: claim.status,
    polarity: claim.polarity,
    origin_note_path: claim.origin_note_path,
    origin_title: claim.origin_title,
    concepts: claim.concepts,
    entities: claim.entities,
    date: claim.date || ""
  }));
}

function summarizeEvidence(results) {
  return results.map((result) => ({
    title: result.title,
    relative_path: result.relativePath,
    excerpt: truncate(result.excerpt, 280),
    score: result.score
  }));
}

function searchEvidence(root, query, limit = 10) {
  return searchCorpus(root, query, {
    limit,
    excludePrefixes: EVIDENCE_EXCLUDE_PREFIXES
  });
}

function watchSummary(watch) {
  if (!watch.profile) {
    return {
      title: "",
      query: watch.query || "",
      context: "",
      aliases: [],
      entities: [],
      concepts: [],
      triggers: [],
      path: ""
    };
  }

  return {
    title: watch.profile.title,
    query: watch.query || "",
    context: watch.profile.frontmatter.context || "",
    aliases: normalizeList(watch.profile.frontmatter.aliases),
    entities: normalizeList(watch.profile.frontmatter.entities),
    concepts: normalizeList(watch.profile.frontmatter.concepts),
    triggers: normalizeList(watch.profile.frontmatter.risk_triggers),
    path: watch.profile.relativePath
  };
}

function sectionsLines(sections) {
  return Object.entries(sections)
    .map(([heading, content]) => `### ${heading}\n\n${content}`)
    .join("\n\n");
}

function collectBeliefPack(root, topic, options = {}) {
  const claimsRefresh = refreshClaims(root, { writeSnapshot: true });
  const belief = writeWhyBelieve(root, topic, { limit: options.claimLimit || 10 });
  const claims = searchClaims(root, topic, {
    limit: Number(options.claimLimit || 10),
    statuses: ["active", "contested", "stale"]
  });
  const evidence = searchEvidence(root, topic, Number(options.evidenceLimit || 8));
  const watch = resolveWatchSubject(root, topic);

  const artifacts = {
    belief_brief: belief.outputPath,
    claim_snapshot: claimsRefresh.snapshotPath || "",
    claim_diff: claimsRefresh.diffReportPath || ""
  };

  const localSources = uniqueLocalSources([
    makeLocalSource(artifacts.belief_brief, "Belief Brief", "belief-brief"),
    makeLocalSource(artifacts.claim_snapshot, "Claim Snapshot", "claim-snapshot"),
    makeLocalSource(artifacts.claim_diff, "Claim Diff", "claim-diff"),
    makeLocalSource(watch.profile?.relativePath, watch.profile?.title, "watch-profile"),
    ...claims.flatMap((claim) => [
      makeLocalSource(`wiki/claims/${String(claim.id || "").toLowerCase()}.md`, truncate(claim.claim_text, 96), "claim"),
      makeLocalSource(claim.origin_note_path, claim.origin_title, "origin-note")
    ]),
    ...evidence.map((result) => makeLocalSource(result.relativePath, result.title, "evidence"))
  ]);

  return {
    topic,
    watch,
    artifacts,
    claims,
    evidence,
    localSources,
    summaries: {
      belief_brief: loadNoteSections(root, artifacts.belief_brief, [
        "Current View",
        "Active Claims",
        "Contested Or Weakening Claims",
        "Why Believe This",
        "What Would Change The View"
      ])
    }
  };
}

function collectStatePack(root, topic, options = {}) {
  const claimsRefresh = refreshClaims(root, { writeSnapshot: true });
  const state = refreshState(root, topic, {
    claimLimit: options.claimLimit,
    evidenceLimit: options.evidenceLimit
  });
  const diff = writeStateDiff(root, state.subject);
  const watch = resolveWatchSubject(root, topic);

  const artifacts = {
    state_page: state.statePath,
    state_diff: diff.outputPath,
    claim_snapshot: claimsRefresh.snapshotPath || "",
    claim_diff: claimsRefresh.diffReportPath || ""
  };

  const localSources = uniqueLocalSources([
    makeLocalSource(artifacts.state_page, state.subject, "state-page"),
    makeLocalSource(artifacts.state_diff, `State Diff: ${state.subject}`, "state-diff"),
    makeLocalSource(artifacts.claim_snapshot, "Claim Snapshot", "claim-snapshot"),
    makeLocalSource(artifacts.claim_diff, "Claim Diff", "claim-diff"),
    makeLocalSource(watch.profile?.relativePath, watch.profile?.title, "watch-profile"),
    ...state.claims.flatMap((claim) => [
      makeLocalSource(`wiki/claims/${String(claim.id || "").toLowerCase()}.md`, truncate(claim.claim_text, 96), "claim"),
      makeLocalSource(claim.origin_note_path, claim.origin_title, "origin-note")
    ]),
    ...state.evidence.map((result) => makeLocalSource(result.relativePath, result.title, "evidence"))
  ]);

  return {
    topic: state.subject,
    watch,
    artifacts,
    claims: state.claims,
    evidence: state.evidence,
    states: [
      {
        subject: state.subject,
        statePath: state.statePath,
        stateLabel: state.stateLabel,
        confidence: state.confidence
      }
    ],
    localSources,
    summaries: {
      state_page: loadNoteSections(root, artifacts.state_page, [
        "Managed Snapshot",
        "Managed Strengthened",
        "Managed Weakened",
        "Managed Catalysts",
        "Managed What Would Flip It",
        "Managed Market Relevance"
      ]),
      state_diff: loadNoteSections(root, artifacts.state_diff, ["Headline", "Added Claims", "Removed Claims", "Market Read-Through"])
    }
  };
}

function collectDecisionPack(root, topic, options = {}) {
  const claimsRefresh = refreshClaims(root, { writeSnapshot: true });
  const belief = writeWhyBelieve(root, topic, { limit: options.claimLimit || 10 });
  const state = refreshState(root, topic, {
    claimLimit: options.claimLimit,
    evidenceLimit: options.evidenceLimit
  });
  const decision = writeDecisionNote(root, topic, {
    claimLimit: options.claimLimit,
    evidenceLimit: options.evidenceLimit
  });
  const redTeam = writeRedTeam(root, topic, {
    claimLimit: options.claimLimit,
    evidenceLimit: options.evidenceLimit
  });
  const watch = resolveWatchSubject(root, topic);

  const artifacts = {
    belief_brief: belief.outputPath,
    state_page: state.statePath,
    decision_note: decision.notePath,
    red_team_brief: redTeam.outputPath,
    claim_snapshot: claimsRefresh.snapshotPath || "",
    claim_diff: claimsRefresh.diffReportPath || ""
  };

  const claims = searchClaims(root, watch.query || topic, {
    limit: Number(options.claimLimit || 10),
    statuses: ["active", "contested", "stale"]
  });
  const evidence = searchEvidence(root, watch.query || topic, Number(options.evidenceLimit || 8));

  const localSources = uniqueLocalSources([
    makeLocalSource(artifacts.belief_brief, "Belief Brief", "belief-brief"),
    makeLocalSource(artifacts.state_page, state.subject, "state-page"),
    makeLocalSource(artifacts.decision_note, topic, "decision-note"),
    makeLocalSource(artifacts.red_team_brief, `Red Team: ${topic}`, "red-team-brief"),
    makeLocalSource(artifacts.claim_snapshot, "Claim Snapshot", "claim-snapshot"),
    makeLocalSource(artifacts.claim_diff, "Claim Diff", "claim-diff"),
    makeLocalSource(watch.profile?.relativePath, watch.profile?.title, "watch-profile"),
    ...claims.flatMap((claim) => [
      makeLocalSource(`wiki/claims/${String(claim.id || "").toLowerCase()}.md`, truncate(claim.claim_text, 96), "claim"),
      makeLocalSource(claim.origin_note_path, claim.origin_title, "origin-note")
    ]),
    ...evidence.map((result) => makeLocalSource(result.relativePath, result.title, "evidence"))
  ]);

  return {
    topic,
    watch,
    artifacts,
    claims,
    evidence,
    states: [
      {
        subject: state.subject,
        statePath: state.statePath,
        stateLabel: state.stateLabel,
        confidence: state.confidence
      }
    ],
    localSources,
    summaries: {
      belief_brief: loadNoteSections(root, artifacts.belief_brief, [
        "Current View",
        "Active Claims",
        "Contested Or Weakening Claims",
        "Why Believe This",
        "What Would Change The View"
      ]),
      state_page: loadNoteSections(root, artifacts.state_page, [
        "Managed Snapshot",
        "Managed Strengthened",
        "Managed Weakened",
        "Managed Catalysts",
        "Managed What Would Flip It",
        "Managed Market Relevance"
      ]),
      decision_note: loadNoteSections(root, artifacts.decision_note, [
        "Managed Portfolio Implications",
        "Managed Risk Flags",
        "Managed De-Risk Triggers",
        "Managed What To Monitor Next",
        "Managed Strongest Counter-Case",
        "Managed Self-Model Lens"
      ]),
      red_team_brief: loadNoteSections(root, artifacts.red_team_brief, [
        "Base View Under Review",
        "Strongest Counter-Case",
        "Fragilities In The Evidence Base",
        "Likely Blind Spots",
        "What Would Invalidate The Current Stance"
      ])
    }
  };
}

function collectMeetingPack(root, title, options = {}) {
  const claimsRefresh = refreshClaims(root, { writeSnapshot: true });
  const subjects = normalizeList(options.subjects).length
    ? normalizeList(options.subjects)
    : defaultRegimeSubjects(root, options.set || "weekly-investment-meeting");
  const refreshedStates = subjects.map((subject) =>
    refreshState(root, subject, {
      claimLimit: options.claimLimit,
      evidenceLimit: options.evidenceLimit
    })
  );
  const regime = writeRegimeBrief(root, {
    set: options.set || "weekly-investment-meeting",
    subjects: subjects.join(","),
    title: options.regimeTitle,
    noRefresh: true
  });
  const meetingBrief = writeMeetingBrief(root, title, {
    subjects: subjects.join(","),
    claimLimit: options.claimLimit,
    evidenceLimit: options.evidenceLimit
  });
  const marketChanges = writeWhatChangedForMarkets(root, {
    title: options.marketChangesTitle,
    subjects: subjects.join(","),
    claimLimit: options.claimLimit,
    evidenceLimit: options.evidenceLimit
  });

  const allClaims = refreshedStates.flatMap((state) => state.claims);
  const allEvidence = refreshedStates.flatMap((state) => state.evidence);

  const artifacts = {
    regime_brief: regime.outputPath,
    regime_page: regime.regimePath,
    meeting_brief: meetingBrief.outputPath,
    market_changes_brief: marketChanges.outputPath,
    claim_snapshot: claimsRefresh.snapshotPath || "",
    claim_diff: claimsRefresh.diffReportPath || ""
  };

  const localSources = uniqueLocalSources([
    makeLocalSource(artifacts.regime_brief, "Regime Brief", "regime-brief"),
    makeLocalSource(artifacts.regime_page, "Regime Page", "regime-page"),
    makeLocalSource(artifacts.meeting_brief, "Meeting Brief", "meeting-brief"),
    makeLocalSource(artifacts.market_changes_brief, "Market Changes Brief", "market-change-brief"),
    makeLocalSource(artifacts.claim_snapshot, "Claim Snapshot", "claim-snapshot"),
    makeLocalSource(artifacts.claim_diff, "Claim Diff", "claim-diff"),
    ...refreshedStates.map((state) => makeLocalSource(state.statePath, state.subject, "state-page")),
    ...allClaims.flatMap((claim) => [
      makeLocalSource(`wiki/claims/${String(claim.id || "").toLowerCase()}.md`, truncate(claim.claim_text, 96), "claim"),
      makeLocalSource(claim.origin_note_path, claim.origin_title, "origin-note")
    ]),
    ...allEvidence.map((result) => makeLocalSource(result.relativePath, result.title, "evidence"))
  ]);

  return {
    topic: title,
    subjects,
    watch: { profile: null, query: subjects.join(" ") },
    artifacts,
    claims: allClaims,
    evidence: allEvidence,
    states: refreshedStates.map((state) => ({
      subject: state.subject,
      statePath: state.statePath,
      stateLabel: state.stateLabel,
      confidence: state.confidence
    })),
    localSources,
    summaries: {
      regime_brief: loadNoteSections(root, artifacts.regime_brief, [
        "Regime Grid",
        "Cross-Asset Read-Through",
        "What Changed Matters Most"
      ]),
      meeting_brief: loadNoteSections(root, artifacts.meeting_brief, [
        "Current World State",
        "Portfolio Implications",
        "Risk Flags",
        "De-Risk Triggers",
        "Strongest Counter-Case",
        "Self-Model Lens"
      ]),
      market_changes_brief: loadNoteSections(root, artifacts.market_changes_brief, ["Top Changes", "Why It Matters", "Regime Surface"])
    }
  };
}

function buildPackData(root, seed, mode, options = {}) {
  if (mode === "belief") {
    return collectBeliefPack(root, seed, options);
  }
  if (mode === "state") {
    return collectStatePack(root, seed, options);
  }
  if (mode === "meeting") {
    return collectMeetingPack(root, seed, options);
  }
  return collectDecisionPack(root, seed, options);
}

function packSummaryMarkdown(pack) {
  const summaryLines = [
    `- Mode: ${pack.mode}`,
    `- Topic: ${pack.topic}`,
    `- Generated: ${pack.generated_at}`,
    `- Desired output kind: ${pack.desired_output_kind}`,
    `- Local context sources: ${pack.local_sources.length}`,
    `- External web sources to add later if needed: yes, through \`sources\` in the capture bundle`
  ];
  if (pack.subjects?.length) {
    summaryLines.push(`- Subjects: ${pack.subjects.join(", ")}`);
  }
  if (pack.watch?.title) {
    summaryLines.push(`- Watch profile: ${pack.watch.title}`);
  }

  return summaryLines.join("\n");
}

function buildPromptMarkdown(pack, capturePath) {
  const artifactLines = Object.entries(pack.artifacts)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key.replace(/_/g, " ")}: \`${value}\``)
    .join("\n");

  const localLines = pack.local_sources.slice(0, 20).map((source) => `- \`${source.path}\` (${source.role})`).join("\n");

  const summaryBlocks = Object.entries(pack.summaries || {})
    .filter(([, sections]) => Object.keys(sections || {}).length)
    .map(([key, sections]) => `## ${key.replace(/_/g, " ")}\n\n${sectionsLines(sections)}`)
    .join("\n\n");

  return `# Frontier Pack Prompt

You are the frontier reasoning layer for Cato. Use this pack as structured scaffolding, not as the final answer.

## Objective

- Topic: ${pack.topic}
- Mode: ${pack.mode}
- Desired output kind: ${pack.desired_output_kind}
- Capture bundle: \`${capturePath}\`

## Required Operating Rules

1. Read the pack JSON at \`${pack.pack_path}\`.
2. Review the deterministic Cato artefacts listed below before drafting the final output.
3. Treat claim, state, regime, and decision surfaces as current structured context, but check the underlying local evidence when nuance matters.
4. If the user explicitly wants freshness beyond the local corpus, do live web research in Codex and add the cited URLs under \`sources\` in the capture bundle.
5. Write the final authored markdown into \`output.body\` in the capture bundle.
6. Fill \`model\` with the actual Codex/Claude session label used for authorship.
7. Keep the bundle's \`local_sources\` intact so Cato preserves the local reasoning trail.
8. After the bundle is ready, run:
   \`.\cato.cmd capture-frontier "${capturePath}" --promote\`

## Deterministic Artefacts

${artifactLines || "- None."}

## Local Context Sources

${localLines || "- None."}

## Pack Summary

${packSummaryMarkdown(pack)}

${summaryBlocks ? `\n## Deterministic Context Highlights\n\n${summaryBlocks}\n` : ""}
`;
}

function writeFrontierPack(root, seed, options = {}) {
  ensureProjectStructure(root);
  const mode = normalizeMode(options.mode);
  const topic = String(seed || "").trim() || "Frontier Topic";
  const packData = buildPackData(root, topic, mode, options);
  const packSlug = slugify(`${mode}-${packData.topic}`).slice(0, 80) || mode;
  const basePath = uniquePath(path.join(root, "cache", "frontier-packs", `${timestampStamp()}-${packSlug}`));
  const packPath = `${basePath}-pack.json`;
  const promptPath = `${basePath}-prompt.md`;
  const capturePath = `${basePath}-capture.json`;
  const desiredOutputKind = String(options.kind || outputKindForMode(mode)).toLowerCase();

  const pack = {
    generated_at: nowIso(),
    mode,
    topic: packData.topic,
    title: bundleTitle(packData.topic, mode, options.title),
    desired_output_kind: desiredOutputKind,
    question: options.question || "",
    subjects: packData.subjects || [],
    watch: watchSummary(packData.watch || { profile: null, query: packData.topic }),
    artifacts: packData.artifacts,
    claims: summarizeClaims(packData.claims || []),
    states: packData.states || [],
    evidence: summarizeEvidence(packData.evidence || []),
    summaries: packData.summaries || {},
    local_sources: uniqueLocalSources(packData.localSources || [])
  };
  pack.pack_path = relativeToRoot(root, packPath);

  const captureBundle = {
    mode,
    topic: pack.topic,
    question: pack.question,
    pack_path: pack.pack_path,
    authoring_layer: "terminal_model",
    model: "",
    authoring_session: "",
    watch_topic: pack.watch.title || "",
    watch: pack.watch.title
      ? {
          subject: pack.watch.title,
          context: pack.watch.context,
          aliases: pack.watch.aliases,
          entities: pack.watch.entities,
          concepts: pack.watch.concepts,
          triggers: pack.watch.triggers
        }
      : undefined,
    local_sources: pack.local_sources,
    sources: [],
    output: {
      kind: desiredOutputKind,
      title: pack.title,
      promote: true,
      body: `# ${pack.title}\n\nReplace this placeholder with the GPT/Codex-authored output.\n`
    }
  };

  writeJson(packPath, pack);
  writeJson(capturePath, captureBundle);
  writeText(promptPath, buildPromptMarkdown(pack, relativeToRoot(root, capturePath)));

  appendJsonl(path.join(root, "logs", "actions", "frontier_runs.jsonl"), {
    event: "frontier_pack",
    at: nowIso(),
    mode,
    topic: pack.topic,
    pack_path: relativeToRoot(root, packPath),
    prompt_path: relativeToRoot(root, promptPath),
    capture_path: relativeToRoot(root, capturePath),
    local_sources: pack.local_sources.length,
    claims: pack.claims.length,
    evidence: pack.evidence.length
  });

  return {
    mode,
    topic: pack.topic,
    packPath: relativeToRoot(root, packPath),
    promptPath: relativeToRoot(root, promptPath),
    capturePath: relativeToRoot(root, capturePath),
    localSources: pack.local_sources.length,
    claims: pack.claims.length,
    evidence: pack.evidence.length
  };
}

function captureFrontier(root, bundleInput, options = {}) {
  if (typeof bundleInput === "string") {
    const bundlePath = path.isAbsolute(bundleInput) ? bundleInput : path.join(root, bundleInput);
    if (fs.existsSync(bundlePath)) {
      const rawBundle = JSON.parse(readText(bundlePath));
      const body = String(rawBundle.output?.body || "").trim();
      if (!body || /Replace this placeholder with the GPT\/Codex-authored output\./i.test(body)) {
        throw new Error("Frontier capture bundle still contains the placeholder output body. Replace it with the real Codex-authored output first.");
      }
      if (!String(rawBundle.model || "").trim()) {
        throw new Error("Frontier capture bundle must record the active terminal model/session label in `model` before capture.");
      }
    }
  }
  const result = captureResearch(root, bundleInput, {
    ...options,
    generationMode: "frontier_handoff"
  });

  const bundlePath = typeof bundleInput === "string" ? bundleInput : "";
  appendJsonl(path.join(root, "logs", "actions", "frontier_runs.jsonl"), {
    event: "frontier_capture",
    at: nowIso(),
    bundle_path: bundlePath ? bundlePath.replace(/\\/g, "/") : "",
    output_path: result.outputResult?.outputPath || "",
    ingested_sources: result.ingested,
    watch_subject: result.watch?.subject || ""
  });

  return result;
}

module.exports = {
  captureFrontier,
  writeFrontierPack
};
