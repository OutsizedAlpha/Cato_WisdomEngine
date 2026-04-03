const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { buildConceptOntologyIndex, normalizeConceptLabel } = require("./concept-quality");
const { parseFrontmatter, renderMarkdown, sectionContent, stripMarkdownFormatting, toWikiLink } = require("./markdown");
const { ensureProjectStructure, listMarkdownNotes } = require("./project");
const { renderResultReference } = require("./research");
const { searchCorpus, tokenize } = require("./search");
const {
  appendJsonl,
  dateStamp,
  nowIso,
  readJson,
  readJsonl,
  readText,
  relativeToRoot,
  slugify,
  timestampStamp,
  truncate,
  writeJson,
  writeJsonl,
  writeText
} = require("./utils");

const CLAIM_SOURCE_DIRS = ["wiki/source-notes", "outputs/reports", "wiki/theses"];
const FACT_TERMS = ["reported", "printed", "rose", "fell", "held", "stayed", "slipped", "widened", "narrowed"];
const ESTIMATE_TERMS = ["forecast", "expected", "consensus", "estimate", "estimated"];
const INFERENCE_TERMS = ["suggests", "implies", "points to", "indicates", "appears", "likely", "could", "may", "signal"];
const JUDGEMENT_TERMS = ["should", "need to", "must", "matters most", "the right question", "makes more sense"];
const POSITIVE_TERMS = [
  "improved",
  "improve",
  "strong",
  "stronger",
  "resilient",
  "recovered",
  "recovery",
  "constructive",
  "supportive",
  "firm",
  "benefit",
  "upside",
  "expansion"
];
const NEGATIVE_TERMS = [
  "risk",
  "pressure",
  "fragile",
  "weak",
  "weaker",
  "sluggish",
  "contraction",
  "headwind",
  "underperform",
  "downside",
  "worsened",
  "softer",
  "vulnerable"
];
const CLAIM_BOILERPLATE_PATTERNS = [
  /^initial draft only/i,
  /^refine this note/i,
  /^review and refine/i,
  /^confidence is /i,
  /^recurring themes include/i,
  /^the current corpus supports /i,
  /^the evidence base currently spans /i,
  /^source type:/i,
  /^capture source:/i,
  /^ingested at:/i,
  /^captured at:/i,
  /^raw path:/i,
  /^source url:/i,
  /^metadata path:/i,
  /^figure note:/i,
  /^figure refs indexed:/i,
  /^extraction status:/i,
  /^extraction method:/i,
  /^preserve the raw source/i,
  /^output artifact:/i,
  /^promotion rationale:/i,
  /^see `?outputs\//i,
  /^review and refine this promoted note/i
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

function loadClaimInputNotes(root) {
  const notes = [];
  for (const relativeDir of CLAIM_SOURCE_DIRS) {
    for (const filePath of listMarkdownNotes(root, relativeDir)) {
      const relativePath = relativeToRoot(root, filePath);
      if (/\/(?:index|README)\.md$/i.test(relativePath)) {
        continue;
      }

      const parsed = parseFrontmatter(readText(filePath));
      if (["inactive", "retired", "obsolete"].includes(String(parsed.frontmatter.status || "").toLowerCase())) {
        continue;
      }

      notes.push({
        path: filePath,
        relativePath,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        title: parsed.frontmatter.title || path.basename(filePath, ".md"),
        sourceClass: relativeDir
      });
    }
  }
  return notes;
}

function claimSectionsForNote(note) {
  if (note.relativePath.startsWith("wiki/source-notes/")) {
    return ["What This Source Says", "Why It Matters"];
  }
  if (note.relativePath.startsWith("outputs/reports/")) {
    return [
      "Executive Summary",
      "What Matters Most",
      "Intermarket Discussion In The Spirit Of John Murphy",
      "Asset-Market Implications Right Now",
      "Bottom Line For Tomorrow's Meeting"
    ];
  }
  if (note.relativePath.startsWith("outputs/memos/")) {
    return ["Executive Summary", "Synthesis", "Counter-Case"];
  }
  if (note.relativePath.startsWith("wiki/theses/")) {
    return ["Thesis Statement", "What Must Be True", "Risks / Failure Modes", "Catalysts"];
  }
  return [];
}

function cleanClaimText(value) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitClaimUnits(block) {
  const units = [];
  for (const rawLine of String(block || "").split(/\r?\n/)) {
    const line = cleanClaimText(rawLine.replace(/^\s*[-*]\s+/, ""));
    if (!line || line.startsWith("|") || line.includes(" | ")) {
      continue;
    }
    const sentences = line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/g);
    for (const sentence of sentences) {
      const cleaned = cleanClaimText(sentence);
      if (cleaned) {
        units.push(cleaned);
      }
    }
  }
  return units;
}

function isClaimLike(text) {
  const cleaned = cleanClaimText(text);
  if (!cleaned || cleaned.length < 45 || cleaned.length > 360) {
    return false;
  }
  if (CLAIM_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return false;
  }
  if (/^generated:/i.test(cleaned) || /^source map/i.test(cleaned) || /^imported source capture/i.test(cleaned)) {
    return false;
  }
  if (!/[A-Za-z]/.test(cleaned)) {
    return false;
  }
  if ((cleaned.match(/[A-Za-z]/g) || []).length < 25) {
    return false;
  }
  if (/^\d+(\.\d+)?%?$/.test(cleaned)) {
    return false;
  }
  return true;
}

function sectionsToClaimUnits(note) {
  const sections = claimSectionsForNote(note);
  const units = [];

  for (const heading of sections) {
    const content = sectionContent(note.body, heading);
    for (const unit of splitClaimUnits(stripMarkdownFormatting(content))) {
      if (isClaimLike(unit)) {
        units.push({ text: unit, heading });
      }
    }
  }

  return units;
}

function classifyClaimType(text, note) {
  const lower = text.toLowerCase();
  if (JUDGEMENT_TERMS.some((term) => lower.includes(term))) {
    return "judgement";
  }
  if (ESTIMATE_TERMS.some((term) => lower.includes(term))) {
    return "estimate";
  }
  if (INFERENCE_TERMS.some((term) => lower.includes(term))) {
    return "inference";
  }
  if (note.relativePath.startsWith("wiki/source-notes/")) {
    return "fact";
  }
  if (FACT_TERMS.some((term) => lower.includes(term))) {
    return "fact";
  }
  return "inference";
}

function classifyPolarity(text) {
  const lower = text.toLowerCase();
  const positive = POSITIVE_TERMS.filter((term) => lower.includes(term)).length;
  const negative = NEGATIVE_TERMS.filter((term) => lower.includes(term)).length;
  if (positive > negative) {
    return "positive";
  }
  if (negative > positive) {
    return "negative";
  }
  return "neutral";
}

function noteDate(note) {
  return note.frontmatter.date || note.frontmatter.created_at || note.frontmatter.captured_at || note.frontmatter.ingested_at || "";
}

function normalizeClaimText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildClaimId(originPath, claimText) {
  const digest = crypto.createHash("sha1").update(`${originPath}\n${normalizeClaimText(claimText)}`).digest("hex").slice(0, 12);
  return `CLAIM-${new Date().getUTCFullYear()}-${digest.toUpperCase()}`;
}

function deriveConceptTerms(note, claimText, ontologyIndex) {
  const values = new Set();
  for (const concept of normalizeList(note.frontmatter.concepts)) {
    values.add(concept);
  }

  const normalizedClaim = ` ${normalizeClaimText(claimText)} `;
  for (const term of ontologyIndex.terms) {
    if (normalizedClaim.includes(` ${term} `)) {
      values.add(term);
    }
  }

  return [...values];
}

function deriveEntities(note) {
  return normalizeList(note.frontmatter.entities);
}

function claimSubjectKeys(record) {
  const keys = new Set();
  for (const value of [...record.concepts, ...record.entities]) {
    const normalized = normalizeConceptLabel(value);
    if (normalized) {
      keys.add(normalized);
    }
  }
  for (const token of tokenize(record.claim_text).slice(0, 10)) {
    keys.add(token);
  }
  return [...keys];
}

function claimSupportingSources(note) {
  const mappedSources = normalizeList(note.frontmatter.sources);
  if (mappedSources.length) {
    return [...new Set(mappedSources)];
  }
  return [note.relativePath];
}

function claimConfidence(record) {
  let score = 0;
  if (record.claim_type === "fact") {
    score += 3;
  } else if (record.claim_type === "inference") {
    score += 2;
  } else if (record.claim_type === "estimate") {
    score += 2;
  } else {
    score += 1;
  }
  score += Math.min(record.supporting_sources.length, 3);
  if (record.origin_note_kind === "source-note") {
    score += 1;
  }
  if (record.origin_note_kind === "research-report") {
    score += 1;
  }

  if (score >= 6) {
    return "high";
  }
  if (score >= 4) {
    return "medium-high";
  }
  if (score >= 3) {
    return "medium";
  }
  return "low";
}

function isStaleDate(dateValue) {
  if (!dateValue) {
    return false;
  }
  const parsed = Date.parse(dateValue);
  if (Number.isNaN(parsed)) {
    return false;
  }
  const ageMs = Date.now() - parsed;
  const days = ageMs / (1000 * 60 * 60 * 24);
  return days > 180;
}

function buildClaimRecords(root) {
  ensureProjectStructure(root);
  const ontology = readJson(path.join(root, "config", "ontology.json"), {});
  const ontologyIndex = buildConceptOntologyIndex(ontology);
  const notes = loadClaimInputNotes(root);
  const claims = [];

  for (const note of notes) {
    const units = sectionsToClaimUnits(note);
    for (const unit of units) {
      const claimText = unit.text;
      const id = buildClaimId(note.relativePath, claimText);
      const record = {
        id,
        claim_text: claimText,
        normalized_claim_text: normalizeClaimText(claimText),
        claim_type: classifyClaimType(claimText, note),
        polarity: classifyPolarity(claimText),
        status: isStaleDate(noteDate(note)) ? "stale" : "active",
        heading: unit.heading,
        claim_date: noteDate(note),
        origin_note_path: note.relativePath,
        origin_note_kind: note.frontmatter.kind || "",
        origin_title: note.title,
        supporting_sources: claimSupportingSources(note),
        contradicting_claim_ids: [],
        concepts: deriveConceptTerms(note, claimText, ontologyIndex),
        entities: deriveEntities(note),
        subject_keys: [],
        context_excerpt: truncate(claimText, 220)
      };
      record.subject_keys = claimSubjectKeys(record);
      record.confidence = claimConfidence(record);
      claims.push(record);
    }
  }

  const bySubject = new Map();
  for (const claim of claims) {
    for (const key of claim.subject_keys) {
      if (!bySubject.has(key)) {
        bySubject.set(key, []);
      }
      bySubject.get(key).push(claim);
    }
  }

  for (const claim of claims) {
    const contradictions = new Set();
    for (const key of claim.subject_keys) {
      for (const candidate of bySubject.get(key) || []) {
        if (candidate.id === claim.id) {
          continue;
        }
        if (
          candidate.polarity !== "neutral" &&
          claim.polarity !== "neutral" &&
          candidate.polarity !== claim.polarity
        ) {
          contradictions.add(candidate.id);
        }
      }
    }
    claim.contradicting_claim_ids = [...contradictions].sort();
    if (claim.status === "active" && claim.contradicting_claim_ids.length) {
      claim.status = "contested";
    }
  }

  return claims.sort((left, right) => left.origin_note_path.localeCompare(right.origin_note_path) || left.id.localeCompare(right.id));
}

function claimPagePath(root, claim) {
  return path.join(root, "wiki", "claims", `${claim.id.toLowerCase()}.md`);
}

function renderClaimSourceReference(source) {
  const normalized = String(source || "").replace(/\\/g, "/");
  const isNoteLikeMarkdown =
    normalized.toLowerCase().endsWith(".md") &&
    (normalized.startsWith("wiki/") || normalized.startsWith("outputs/"));
  return isNoteLikeMarkdown ? toWikiLink(normalized) : `\`${normalized}\``;
}

function writeClaimPage(root, claim, claimIndex) {
  const pagePath = claimPagePath(root, claim);
  const contradictions = claim.contradicting_claim_ids
    .map((id) => claimIndex.get(id))
    .filter(Boolean)
    .map((other) => `- ${toWikiLink(relativeToRoot(root, claimPagePath(root, other)), truncate(other.claim_text, 96))}`)
    .join("\n");
  const support = claim.supporting_sources
    .map((source) => `- ${renderClaimSourceReference(source)}`)
    .join("\n");
  const concepts = claim.concepts.length ? claim.concepts.map((value) => `- ${value}`).join("\n") : "- None linked.";
  const entities = claim.entities.length ? claim.entities.map((value) => `- ${value}`).join("\n") : "- None linked.";

  writeText(
    pagePath,
    renderMarkdown(
      {
        id: claim.id,
        kind: "claim-page",
        title: truncate(claim.claim_text, 96),
        status: claim.status,
        claim_type: claim.claim_type,
        confidence: claim.confidence,
        claim_date: claim.claim_date,
        origin_note_path: claim.origin_note_path,
        origin_note_kind: claim.origin_note_kind,
        supporting_sources: claim.supporting_sources,
        contradicting_claims: claim.contradicting_claim_ids,
        concepts: claim.concepts,
        entities: claim.entities
      },
      `
# ${truncate(claim.claim_text, 96)}

## Claim

${claim.claim_text}

## Classification

- Type: ${claim.claim_type}
- Status: ${claim.status}
- Polarity: ${claim.polarity}
- Confidence: ${claim.confidence}
- Origin note: ${toWikiLink(claim.origin_note_path, claim.origin_title)}
- Claim date: ${claim.claim_date || "undated"}

## Supporting Sources

${support || "- None recorded."}

## Contradicting Claims

${contradictions || "- No direct contradiction cluster detected."}

## Related Concepts

${concepts}

## Related Entities

${entities}
`
    )
  );

  return relativeToRoot(root, pagePath);
}

function retireStaleClaimPages(root, activeIds) {
  let retired = 0;
  for (const filePath of listMarkdownNotes(root, "wiki/claims")) {
    const relativePath = relativeToRoot(root, filePath);
    if (/\/(?:index|contested)\.md$/i.test(relativePath)) {
      continue;
    }
    const parsed = parseFrontmatter(readText(filePath));
    if (parsed.frontmatter.kind !== "claim-page") {
      continue;
    }
    if (activeIds.has(parsed.frontmatter.id)) {
      continue;
    }
    writeText(
      filePath,
      renderMarkdown(
        {
          ...parsed.frontmatter,
          status: "superseded"
        },
        parsed.body
      )
    );
    retired += 1;
  }
  return retired;
}

function writeClaimIndexes(root, claims) {
  const active = claims.filter((claim) => claim.status === "active");
  const contested = claims.filter((claim) => claim.status === "contested");
  const stale = claims.filter((claim) => claim.status === "stale");
  const lines = ["# Claim Index", "", `Generated: ${dateStamp()}`, ""];

  const sections = [
    ["Active Claims", active],
    ["Contested Claims", contested],
    ["Stale Claims", stale]
  ];

  for (const [title, group] of sections) {
    lines.push(`## ${title}`);
    if (!group.length) {
      lines.push("- None.");
    } else {
      for (const claim of group.slice(0, 80)) {
        lines.push(
          `- ${toWikiLink(`wiki/claims/${claim.id.toLowerCase()}.md`, truncate(claim.claim_text, 96))} (${claim.claim_type}, ${claim.confidence})`
        );
      }
    }
    lines.push("");
  }

  writeText(path.join(root, "wiki", "_indices", "claims.md"), `${lines.join("\n").trim()}\n`);
  writeText(path.join(root, "wiki", "claims", "index.md"), `${lines.join("\n").trim()}\n`);

  const contestedLines = ["# Contested Claims", "", `Generated: ${dateStamp()}`, ""];
  if (!contested.length) {
    contestedLines.push("- No contested claims detected.");
  } else {
    for (const claim of contested) {
      contestedLines.push(`## ${truncate(claim.claim_text, 90)}`);
      contestedLines.push(`- Claim: ${toWikiLink(`wiki/claims/${claim.id.toLowerCase()}.md`, truncate(claim.claim_text, 90))}`);
      contestedLines.push(`- Origin: ${toWikiLink(claim.origin_note_path, claim.origin_title)}`);
      contestedLines.push(
        `- Contradictions: ${claim.contradicting_claim_ids.length ? claim.contradicting_claim_ids.map((id) => toWikiLink(`wiki/claims/${id.toLowerCase()}.md`, id)).join(", ") : "None"}`
      );
      contestedLines.push("");
    }
  }
  writeText(path.join(root, "wiki", "claims", "contested.md"), `${contestedLines.join("\n").trim()}\n`);
}

function latestClaimSnapshots(root) {
  const snapshotDir = path.join(root, "cache", "claim-snapshots");
  if (!fs.existsSync(snapshotDir)) {
    return [];
  }
  return fs
    .readdirSync(snapshotDir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort()
    .map((name) => path.join(snapshotDir, name));
}

function writeClaimArtifacts(root, claims, options = {}) {
  ensureProjectStructure(root);
  writeJsonl(path.join(root, "manifests", "claims.jsonl"), claims);
  const claimIndex = new Map(claims.map((claim) => [claim.id, claim]));
  const activeIds = new Set(claims.map((claim) => claim.id));
  for (const claim of claims) {
    writeClaimPage(root, claim, claimIndex);
  }
  const retired = retireStaleClaimPages(root, activeIds);
  writeClaimIndexes(root, claims);

  let snapshotPath = "";
  if (options.writeSnapshot) {
    const filePath = path.join(root, "cache", "claim-snapshots", `claims-${timestampStamp()}.json`);
    writeJson(filePath, {
      generated_at: nowIso(),
      claims
    });
    snapshotPath = relativeToRoot(root, filePath);
  }

  appendJsonl(path.join(root, "logs", "actions", "claims_refresh.jsonl"), {
    event: "claims_refresh",
    at: nowIso(),
    claims: claims.length,
    contested: claims.filter((claim) => claim.status === "contested").length,
    stale: claims.filter((claim) => claim.status === "stale").length,
    retired,
    snapshot_path: snapshotPath
  });

  return {
    claims: claims.length,
    contested: claims.filter((claim) => claim.status === "contested").length,
    stale: claims.filter((claim) => claim.status === "stale").length,
    retired,
    snapshotPath
  };
}

function refreshClaims(root, options = {}) {
  const claims = buildClaimRecords(root);
  const summary = writeClaimArtifacts(root, claims, options);
  let diffReportPath = "";
  if (options.writeSnapshot) {
    const diff = diffLatestClaimSnapshots(root);
    diffReportPath = diff.reportPath || "";
  }
  return {
    ...summary,
    diffReportPath
  };
}

function loadClaims(root) {
  return readJsonl(path.join(root, "manifests", "claims.jsonl"), []);
}

function scoreClaim(claim, queryTokens, query) {
  const titleTokens = tokenize(`${claim.claim_text} ${claim.concepts.join(" ")} ${claim.entities.join(" ")}`);
  let score = 0;
  for (const token of queryTokens) {
    score += titleTokens.filter((candidate) => candidate === token).length;
    if (claim.origin_title.toLowerCase().includes(token)) {
      score += 2;
    }
  }
  if (claim.claim_text.toLowerCase().includes(String(query).toLowerCase())) {
    score += 8;
  }
  if (claim.status === "contested") {
    score += 1;
  }
  return score;
}

function searchClaims(root, query, options = {}) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) {
    return [];
  }
  const allowedStatuses = new Set(
    (Array.isArray(options.statuses) && options.statuses.length ? options.statuses : ["active", "contested", "stale"]).map((value) =>
      String(value)
    )
  );
  return loadClaims(root)
    .filter((claim) => allowedStatuses.has(String(claim.status)))
    .map((claim) => ({
      ...claim,
      score: scoreClaim(claim, queryTokens, query)
    }))
    .filter((claim) => claim.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, Number(options.limit || 8));
}

function latestSnapshotsForDiff(root) {
  return latestClaimSnapshots(root)
    .slice(-2)
    .map((filePath) => ({
      path: filePath,
      payload: readJson(filePath, { claims: [] })
    }));
}

function buildClaimDiff(currentClaims, previousClaims, topic) {
  const current = new Map(currentClaims.map((claim) => [claim.id, claim]));
  const previous = new Map(previousClaims.map((claim) => [claim.id, claim]));
  const relevant = (claim) => {
    if (!topic) {
      return true;
    }
    return searchClaimsFromArray([claim], topic).length > 0;
  };

  const added = [...current.values()].filter((claim) => !previous.has(claim.id) && relevant(claim));
  const removed = [...previous.values()].filter((claim) => !current.has(claim.id) && relevant(claim));
  const contested = [...current.values()].filter((claim) => claim.status === "contested" && relevant(claim));

  return { added, removed, contested };
}

function searchClaimsFromArray(claims, query) {
  const queryTokens = tokenize(query);
  return claims.filter((claim) => scoreClaim(claim, queryTokens, query) > 0);
}

function diffLatestClaimSnapshots(root, options = {}) {
  ensureProjectStructure(root);
  const snapshots = latestSnapshotsForDiff(root);
  if (snapshots.length < 2) {
    return { reportPath: "", added: 0, removed: 0, contested: 0 };
  }

  const [previous, current] = snapshots;
  const diff = buildClaimDiff(current.payload.claims || [], previous.payload.claims || [], options.topic || "");
  const lines = ["# Claim Diff", "", `Generated: ${nowIso()}`, ""];
  if (options.topic) {
    lines.push(`- Topic filter: ${options.topic}`);
    lines.push("");
  }
  lines.push(`- Previous snapshot: \`${path.basename(previous.path)}\``);
  lines.push(`- Current snapshot: \`${path.basename(current.path)}\``);
  lines.push(`- Added claims: ${diff.added.length}`);
  lines.push(`- Removed claims: ${diff.removed.length}`);
  lines.push(`- Contested claims: ${diff.contested.length}`);
  lines.push("");

  const sections = [
    ["Added Claims", diff.added],
    ["Removed Claims", diff.removed],
    ["Contested Claims", diff.contested]
  ];

  for (const [title, group] of sections) {
    lines.push(`## ${title}`);
    if (!group.length) {
      lines.push("- None.");
    } else {
      for (const claim of group.slice(0, 20)) {
        lines.push(`- ${truncate(claim.claim_text, 140)} (${claim.claim_type}, ${claim.status})`);
      }
    }
    lines.push("");
  }

  const reportPath = path.join(root, "logs", "report_runs", `claim-diff-${timestampStamp()}.md`);
  writeText(reportPath, `${lines.join("\n").trim()}\n`);
  return {
    reportPath: relativeToRoot(root, reportPath),
    added: diff.added.length,
    removed: diff.removed.length,
    contested: diff.contested.length
  };
}

function buildWhyBelieveBody(topic, claims, evidence) {
  if (!claims.length) {
    return `
# Why Believe: ${topic}

## Current View

The claim ledger does not yet contain enough relevant claims to answer this topic confidently.

## What To Do Next

- Refresh claims after new ingest or reports.
- Add directly relevant source notes or reports.
- Create or refresh a state page if this is a live monitoring topic.
`;
  }

  const active = claims.filter((claim) => claim.status === "active");
  const contested = claims.filter((claim) => claim.status === "contested");

  return `
# Why Believe: ${topic}

## Current View

The current belief set on this topic is ${active.length >= contested.length ? "net constructive" : "more contested than constructive"}, with ${claims.length} relevant claim${claims.length === 1 ? "" : "s"} in the ledger.

## Active Claims

${active.length ? active.map((claim) => `- ${claim.claim_text}`).join("\n") : "- No clearly active claims surfaced."}

## Contested Or Weakening Claims

${contested.length ? contested.map((claim) => `- ${claim.claim_text}`).join("\n") : "- No direct contested claims surfaced."}

## Why Believe This

${claims
  .slice(0, 6)
  .map((claim) => `- ${claim.claim_text}\n  - Support: ${claim.supporting_sources.map((source) => renderClaimSourceReference(source)).join(", ")}`)
  .join("\n")}

## What Would Change The View

- Fresh contradictory claims from new source notes or reports.
- A state refresh that shifts the current label or confidence.
- New primary evidence that weakens the current support map.

## Source Map

${evidence.length ? evidence.map((result) => `- ${renderResultReference(result)}`).join("\n") : "- No direct evidence notes matched in the current corpus."}
`;
}

function writeWhyBelieve(root, topic, options = {}) {
  ensureProjectStructure(root);
  const claims = searchClaims(root, topic, { limit: Number(options.limit || 10) });
  const evidence = searchCorpus(root, topic, {
    limit: Number(options.limit || 8),
    excludePrefixes: options.excludePrefixes || [
      "outputs/",
      "wiki/claims/",
      "wiki/states/",
      "wiki/regimes/",
      "wiki/decisions/",
      "wiki/surveillance/",
      "wiki/_indices/",
      "wiki/_maps/",
      "wiki/unresolved/",
      "wiki/self/"
    ]
  });

  const outputPath = path.join(
    root,
    "outputs",
    "briefs",
    `${timestampStamp()}-why-believe-${slugify(topic).slice(0, 80) || "topic"}.md`
  );
  writeText(
    outputPath,
    renderMarkdown(
      {
        id: `WHYBELIEVE-${new Date().getUTCFullYear()}-${slugify(topic).slice(0, 12).toUpperCase() || "TOPIC"}`,
        kind: "belief-brief",
        title: `Why Believe: ${topic}`,
        created_at: nowIso(),
        topic,
        sources: [...new Set(claims.flatMap((claim) => claim.supporting_sources).concat(evidence.map((result) => result.relativePath)))]
      },
      buildWhyBelieveBody(topic, claims, evidence)
    )
  );

  return {
    outputPath: relativeToRoot(root, outputPath),
    claims: claims.length,
    evidence: evidence.length
  };
}

module.exports = {
  buildClaimRecords,
  diffLatestClaimSnapshots,
  loadClaims,
  refreshClaims,
  searchClaims,
  writeClaimArtifacts,
  writeWhyBelieve
};
