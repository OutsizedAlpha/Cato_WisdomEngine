const { searchCorpus } = require("./search");

const RETRIEVAL_TIERS = {
  L0: {
    label: "L0",
    name: "Maps And Indices",
    includePrefixes: ["wiki/_indices/", "wiki/_maps/", "wiki/glossary/"],
    stageLimit: 4,
    purpose: "Start with the shortest route to the repo's current structure and vocabulary."
  },
  L1: {
    label: "L1",
    name: "Canonical Knowledge",
    includePrefixes: [
      "wiki/concepts/",
      "wiki/entities/",
      "wiki/claims/",
      "wiki/states/",
      "wiki/regimes/",
      "wiki/decisions/",
      "wiki/theses/",
      "wiki/watch-profiles/",
      "wiki/surveillance/",
      "wiki/synthesis/",
      "wiki/questions/"
    ],
    stageLimit: 6,
    purpose: "Prefer maintained knowledge notes before rereading raw evidence."
  },
  L2: {
    label: "L2",
    name: "Evidence Notes",
    includePrefixes: [
      "wiki/source-notes/",
      "outputs/reports/",
      "outputs/memos/",
      "outputs/meeting-briefs/",
      "outputs/briefs/",
      "wiki/timelines/"
    ],
    stageLimit: 8,
    purpose: "Pull summarized evidence notes and prior grounded outputs when L1 is not enough."
  },
  L3: {
    label: "L3",
    name: "Raw Extracts",
    includePrefixes: ["extracted/text/"],
    stageLimit: 5,
    purpose: "Escalate to raw extracted text only when the shorter path is insufficient or contested."
  }
};

const RETRIEVAL_BUDGETS = {
  L0: { label: "L0", tiers: ["L0"] },
  L1: { label: "L1", tiers: ["L0", "L1"] },
  L2: { label: "L2", tiers: ["L0", "L1", "L2"] },
  L3: { label: "L3", tiers: ["L0", "L1", "L2", "L3"] }
};

function normalizeBudget(value, fallback = "L2") {
  const normalized = String(value || fallback).trim().toUpperCase();
  return RETRIEVAL_BUDGETS[normalized] ? normalized : fallback;
}

function defaultBudgetForMode(mode = "") {
  const normalized = String(mode || "").trim().toLowerCase();
  if (normalized === "index") {
    return "L0";
  }
  if (normalized === "map" || normalized === "brief") {
    return "L1";
  }
  if (normalized === "deep" || normalized === "red_team") {
    return "L3";
  }
  return "L2";
}

function uniqueResults(results) {
  const seen = new Set();
  return results.filter((result) => {
    const key = String(result.relativePath || "");
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function retrieveEvidence(root, query, options = {}) {
  const requestedBudget = normalizeBudget(options.budget, defaultBudgetForMode(options.mode));
  const minGrounding = Number(options.minGrounding || 3);
  const maxBudget = normalizeBudget(options.maxBudget, "L3");
  const baseExcludePrefixes = Array.isArray(options.excludePrefixes) ? options.excludePrefixes : [];
  const limit = Number(options.limit || 8);
  const excerptLength = Number(options.excerptLength || 280);
  const stages = [];
  const combined = [];

  let activeBudget = requestedBudget;
  let stagePlan = RETRIEVAL_BUDGETS[activeBudget].tiers;

  const runStage = (tierName) => {
    const tier = RETRIEVAL_TIERS[tierName];
    const stageResults = searchCorpus(root, query, {
      limit: Number(options.stageLimit || tier.stageLimit),
      excerptLength,
      includePrefixes: tier.includePrefixes,
      excludePrefixes: baseExcludePrefixes
    });
    stages.push({
      tier: tier.label,
      name: tier.name,
      purpose: tier.purpose,
      results: stageResults.map((result) => ({
        relativePath: result.relativePath,
        title: result.title,
        score: result.score
      }))
    });
    combined.push(...stageResults.map((result) => ({ ...result, retrievalTier: tier.label })));
  };

  for (const tierName of stagePlan) {
    runStage(tierName);
  }

  while (
    uniqueResults(combined).length < minGrounding &&
    activeBudget !== maxBudget &&
    activeBudget !== "L3" &&
    !options.noEscalate
  ) {
    activeBudget = activeBudget === "L0" ? "L1" : activeBudget === "L1" ? "L2" : "L3";
    const nextTier = RETRIEVAL_BUDGETS[activeBudget].tiers.slice(-1)[0];
    runStage(nextTier);
  }

  const results = uniqueResults(combined).slice(0, limit);
  return {
    query,
    requestedBudget,
    activeBudget,
    escalated: activeBudget !== requestedBudget,
    guidance: RETRIEVAL_BUDGETS[activeBudget].tiers.map((tierName) => RETRIEVAL_TIERS[tierName]),
    stages,
    results
  };
}

function renderRetrievalBudgetBlock(pack) {
  const route = pack.guidance.map((tier) => `${tier.label} ${tier.name}`).join(" -> ");
  const escalated = pack.escalated ? "Yes" : "No";
  return `
## Retrieval Budget

- Requested budget: ${pack.requestedBudget}
- Active budget: ${pack.activeBudget}
- Escalated beyond initial budget: ${escalated}
- Retrieval route: ${route}
- Discipline: Start with TL;DR surfaces and only escalate to raw extracts when the shorter route is not enough.
`;
}

module.exports = {
  RETRIEVAL_BUDGETS,
  RETRIEVAL_TIERS,
  defaultBudgetForMode,
  normalizeBudget,
  renderRetrievalBudgetBlock,
  retrieveEvidence
};
