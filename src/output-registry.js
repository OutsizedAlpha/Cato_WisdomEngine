const OUTPUT_FAMILIES = {
  memo: {
    idPrefix: "ASK",
    kind: "answer-memo",
    outputDir: "outputs/memos",
    rolling: true
  },
  report: {
    idPrefix: "REPORT",
    kind: "research-report",
    outputDir: "outputs/reports"
  },
  "final-report": {
    idPrefix: "REPORT",
    kind: "research-report",
    outputDir: "wiki/reports",
    canonical: true
  },
  deck: {
    idPrefix: "DECK",
    kind: "research-deck",
    outputDir: "outputs/decks",
    rolling: true,
    frontmatter: {
      marp: true,
      paginate: true,
      theme: "default"
    }
  },
  brief: {
    idPrefix: "BRIEF",
    kind: "research-brief",
    outputDir: "outputs/briefs",
    rolling: true
  },
  "meeting-brief": {
    idPrefix: "MEETING",
    kind: "meeting-brief",
    outputDir: "outputs/meeting-briefs",
    rolling: true
  },
  "belief-brief": {
    idPrefix: "WHYBELIEVE",
    kind: "belief-brief",
    outputDir: "outputs/briefs",
    rolling: true
  },
  "red-team-brief": {
    idPrefix: "REDTEAM",
    kind: "red-team-brief",
    outputDir: "outputs/briefs",
    rolling: true
  },
  "market-change-brief": {
    idPrefix: "MARKETCHG",
    kind: "market-change-brief",
    outputDir: "outputs/briefs",
    rolling: true
  },
  "surveillance-page": {
    idPrefix: "SURVEIL",
    kind: "surveillance-page",
    outputDir: "wiki/surveillance"
  },
  "synthesis-note": {
    idPrefix: "SYNTH",
    kind: "synthesis-note",
    outputDir: "wiki/synthesis"
  },
  "state-page": {
    idPrefix: "STATE",
    kind: "state-page",
    outputDir: "wiki/states"
  },
  "decision-note": {
    idPrefix: "DECISION",
    kind: "decision-note",
    outputDir: "wiki/decisions"
  },
  "probability-page": {
    idPrefix: "PROB",
    kind: "probability-page",
    outputDir: "wiki/probabilities"
  },
  "watch-profile": {
    idPrefix: "WATCH",
    kind: "watch-profile",
    outputDir: "wiki/watch-profiles"
  },
  "self-reflection": {
    idPrefix: "REFLECT",
    kind: "self-reflection",
    outputDir: "outputs/memos",
    rolling: true
  },
  "principles-snapshot": {
    idPrefix: "PRINCIPLES",
    kind: "principles-snapshot",
    outputDir: "outputs/memos",
    rolling: true
  },
  "daily-memory-log": {
    idPrefix: "MEMDAY",
    kind: "daily-memory-log",
    outputDir: "wiki/memory/daily"
  },
  "memory-context": {
    idPrefix: "MEMORY",
    kind: "memory-context-page",
    outputDir: "wiki/memory",
    rolling: true
  },
  "weekly-review": {
    idPrefix: "WEEKLY",
    kind: "weekly-review-page",
    outputDir: "wiki/memory/weekly"
  },
  "postmortem-note": {
    idPrefix: "POSTMORTEM",
    kind: "postmortem-note",
    outputDir: "wiki/self/postmortems"
  },
  "probability-brief": {
    idPrefix: "PROBBRIEF",
    kind: "probability-brief",
    outputDir: "outputs/briefs",
    rolling: true
  }
};

function getOutputFamily(name, fallback = "report") {
  const normalized = String(name || "").trim().toLowerCase();
  return OUTPUT_FAMILIES[normalized] || OUTPUT_FAMILIES[fallback];
}

function hasOutputFamily(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return Boolean(OUTPUT_FAMILIES[normalized]);
}

function listOutputFamilies() {
  return { ...OUTPUT_FAMILIES };
}

module.exports = {
  OUTPUT_FAMILIES,
  getOutputFamily,
  hasOutputFamily,
  listOutputFamilies
};
