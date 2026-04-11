const fs = require("node:fs");
const path = require("node:path");
const { STRUCTURE_DIRS } = require("./constants");
const { ensureDir, ensureFile, readJson } = require("./utils");

function loadSettings(root) {
  const settingsPath = path.join(root, "config", "settings.json");
  return readJson(settingsPath, {
    projectName: "Cato_WisdomEngine",
    search: { defaultLimit: 8, excerptLength: 280, defaultBudget: "L2", minGrounding: 3 },
    ask: { defaultTopDocs: 6, outputDirectory: "outputs/memos" },
    paths: {
      inbox: "inbox/drop_here",
      selfInbox: "inbox/self",
      sourceNotes: "wiki/source-notes",
      memoryRoot: "wiki/memory",
      memoryDaily: "wiki/memory/daily",
      memoryWeekly: "wiki/memory/weekly",
      memoryCurrent: "wiki/memory/current-context.md",
      drafts: "wiki/drafts",
      appendReview: "wiki/drafts/append-review",
      selfRoot: "wiki/self",
      claims: "wiki/claims",
      concepts: "wiki/concepts",
      entities: "wiki/entities",
      states: "wiki/states",
      regimes: "wiki/regimes",
      decisions: "wiki/decisions",
      reportsCanonical: "wiki/reports",
      memos: "outputs/memos",
      reports: "outputs/reports",
      meetingBriefs: "outputs/meeting-briefs",
      decks: "outputs/decks",
      surveillance: "wiki/surveillance",
      watchProfiles: "wiki/watch-profiles",
      synthesis: "wiki/synthesis",
      lint: "logs/lint"
    }
  });
}

function ensureProjectStructure(root) {
  for (const relativeDir of STRUCTURE_DIRS) {
    ensureDir(path.join(root, relativeDir));
  }

  ensureFile(path.join(root, "manifests", "sources.jsonl"), "");
  ensureFile(path.join(root, "manifests", "self_notes.jsonl"), "");
  ensureFile(path.join(root, "manifests", "claims.jsonl"), "");
  ensureFile(path.join(root, "manifests", "state_history.jsonl"), "");
  ensureFile(path.join(root, "manifests", "scenario_history.jsonl"), "");
  ensureFile(path.join(root, "manifests", "memory_events.jsonl"), "");
  ensureFile(
    path.join(root, "manifests", "market_data_catalog.json"),
    JSON.stringify(
      {
        version: 1,
        updated_at: "",
        series: []
      },
      null,
      2
    ) + "\n"
  );
  ensureFile(
    path.join(root, "manifests", "memory_state.json"),
    JSON.stringify(
      {
        version: 1,
        current_context: {
          last_captured_date: "",
          last_capture_at: "",
          pending_date: "",
          pending_pack_path: "",
          pending_prompt_path: "",
          pending_capture_path: ""
        },
        weekly_review: {
          last_captured_week: "",
          last_capture_at: "",
          pending_week: "",
          pending_pack_path: "",
          pending_prompt_path: "",
          pending_capture_path: ""
        }
      },
      null,
      2
    ) + "\n"
  );
  ensureFile(path.join(root, "manifests", "file_hashes.json"), "{}\n");
  ensureFile(
    path.join(root, "commands", "README.md"),
    "# Commands\n\nStore reusable invocation patterns or standard operating procedures here.\n"
  );
  ensureFile(path.join(root, "logs", "actions", "ingest.jsonl"), "");
  ensureFile(path.join(root, "logs", "actions", "self_ingest.jsonl"), "");
  ensureFile(path.join(root, "logs", "actions", "claims_refresh.jsonl"), "");
  ensureFile(path.join(root, "logs", "actions", "state_refresh.jsonl"), "");
  ensureFile(path.join(root, "logs", "actions", "decision_runs.jsonl"), "");
  ensureFile(path.join(root, "logs", "actions", "frontier_runs.jsonl"), "");
  ensureFile(path.join(root, "logs", "actions", "market_refresh.jsonl"), "");
  ensureFile(path.join(root, "logs", "actions", "scenario_runs.jsonl"), "");
  ensureFile(path.join(root, "wiki", "_indices", "sources.md"), "# Source Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "claims.md"), "# Claim Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "concepts.md"), "# Concept Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "entities.md"), "# Entity Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "probabilities.md"), "# Probability Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "self-model.md"), "# Self-Model Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "watch-profiles.md"), "# Watch Profile Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "states.md"), "# State Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "regimes.md"), "# Regime Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "decisions.md"), "# Decision Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "tags.md"), "# Tag Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "backlinks.md"), "# Backlink Index\n");
  ensureFile(path.join(root, "wiki", "synthesis", "index.md"), "# Synthesis Index\n");
  ensureFile(path.join(root, "wiki", "timelines", "source-chronology.md"), "# Source Chronology\n");
  ensureFile(
    path.join(root, "wiki", "_maps", "home.md"),
    "# Cato Map Of Content\n\nThis page is the top-level navigation surface for the knowledge base.\n"
  );
  ensureFile(
    path.join(root, "wiki", "unresolved", "README.md"),
    "# Unresolved Register\n\nUse this area for contradictions, missing metadata, extraction gaps, and open questions.\n"
  );
  ensureFile(
    path.join(root, "wiki", "self", "README.md"),
    "# Self-Model\n\nUse this area for principles, heuristics, anti-patterns, and other structured self-notes.\n"
  );
  ensureFile(
    path.join(root, "wiki", "self", "current-operating-constitution.md"),
    "# Current Operating Constitution\n\nCompiled self-model summary will appear here after compile.\n"
  );
  ensureFile(
    path.join(root, "wiki", "self", "tension-register.md"),
    "# Tension Register\n\nTrack tensions between stated principles and observed behaviour here.\n"
  );
  ensureFile(path.join(root, "wiki", "self", "mode-profiles", "investment-research.md"), "# Investment Research\n");
  ensureFile(path.join(root, "wiki", "self", "mode-profiles", "trading.md"), "# Trading\n");
  ensureFile(path.join(root, "wiki", "self", "mode-profiles", "communication.md"), "# Communication\n");
  ensureFile(path.join(root, "wiki", "macro", "index.md"), "# Macro\n");
  ensureFile(path.join(root, "wiki", "market-structure", "index.md"), "# Market Structure\n");
  ensureFile(path.join(root, "wiki", "derivatives", "index.md"), "# Derivatives\n");
  ensureFile(path.join(root, "wiki", "claims", "index.md"), "# Claim Index\n");
  ensureFile(path.join(root, "wiki", "claims", "contested.md"), "# Contested Claims\n");
  ensureFile(path.join(root, "wiki", "states", "index.md"), "# State Index\n");
  ensureFile(path.join(root, "wiki", "regimes", "index.md"), "# Regime Index\n");
  ensureFile(path.join(root, "wiki", "decisions", "index.md"), "# Decision Index\n");
  ensureFile(path.join(root, "wiki", "probabilities", "index.md"), "# Probability Index\n");
  ensureFile(path.join(root, "wiki", "reports", "index.md"), "# Report Index\n");
  ensureFile(path.join(root, "wiki", "memory", "index.md"), "# Working Memory Index\n");
  ensureFile(
    path.join(root, "wiki", "memory", "current-context.md"),
    `---
id: MEMORY-SEED-CONTX
kind: memory-context-page
title: Current Context
status: provisional
memory_date: unrefreshed
refresh_basis: first_meaningful_cato_use_when_due
---

# Current Context

Compiled working-memory context will appear here after the first refresh capture.
`
  );
  ensureFile(path.join(root, "wiki", "memory", "daily", "README.md"), "# Daily Memory Logs\n");
  ensureFile(path.join(root, "wiki", "memory", "weekly", "README.md"), "# Weekly Reviews\n");
  ensureFile(path.join(root, "wiki", "watch-profiles", "index.md"), "# Watch Profile Index\n");
  ensureFile(path.join(root, "wiki", "theses", "index.md"), "# Thesis Index\n");
  ensureFile(path.join(root, "wiki", "surveillance", "index.md"), "# Surveillance Index\n");
  ensureFile(path.join(root, "wiki", "drafts", "index.md"), "# Draft Workspace Index\n");
  ensureFile(path.join(root, "wiki", "drafts", "append-review", "index.md"), "# Append And Review Queue\n");
  ensureFile(
    path.join(root, "wiki", "glossary", "watch-ontology.md"),
    "# Watch Ontology\n\nThis page is derived from active watch profiles. Edit the profiles, not this generated summary.\n"
  );
  ensureFile(path.join(root, "wiki", "self", "index.md"), "# Self Index\n");
  ensureFile(
    path.join(root, "MEMORY.md"),
    "# Memory\n\nThis file mirrors the latest compiled working-memory snapshot after memory refresh capture.\n"
  );
  ensureFile(
    path.join(root, "config", "market_series.json"),
    JSON.stringify(
      {
        version: 1,
        series: []
      },
      null,
      2
    ) + "\n"
  );
  ensureFile(
    path.join(root, "config", "scenario_profiles.json"),
    JSON.stringify(
      {
        version: 1,
        default_paths: 100000,
        default_horizons: [5, 21, 63, 126],
        profiles: []
      },
      null,
      2
    ) + "\n"
  );
}

function listMarkdownNotes(root, relativeDir) {
  const targetDir = path.join(root, relativeDir);
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  const results = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.name.toLowerCase().endsWith(".md")) {
        results.push(fullPath);
      }
    }
  };
  visit(targetDir);
  return results;
}

module.exports = {
  ensureProjectStructure,
  listMarkdownNotes,
  loadSettings
};
