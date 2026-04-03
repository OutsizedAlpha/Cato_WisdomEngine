const fs = require("node:fs");
const path = require("node:path");
const { STRUCTURE_DIRS } = require("./constants");
const { ensureDir, ensureFile, readJson } = require("./utils");

function loadSettings(root) {
  const settingsPath = path.join(root, "config", "settings.json");
  return readJson(settingsPath, {
    projectName: "Cato_WisdomEngine",
    search: { defaultLimit: 8, excerptLength: 280 },
    ask: { defaultTopDocs: 6, outputDirectory: "outputs/memos" },
    paths: {
      inbox: "inbox/drop_here",
      selfInbox: "inbox/self",
      sourceNotes: "wiki/source-notes",
      selfRoot: "wiki/self",
      claims: "wiki/claims",
      concepts: "wiki/concepts",
      entities: "wiki/entities",
      states: "wiki/states",
      regimes: "wiki/regimes",
      decisions: "wiki/decisions",
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
  ensureFile(path.join(root, "wiki", "_indices", "sources.md"), "# Source Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "claims.md"), "# Claim Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "concepts.md"), "# Concept Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "entities.md"), "# Entity Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "self-model.md"), "# Self-Model Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "watch-profiles.md"), "# Watch Profile Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "states.md"), "# State Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "regimes.md"), "# Regime Index\n");
  ensureFile(path.join(root, "wiki", "_indices", "decisions.md"), "# Decision Index\n");
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
    path.join(root, "wiki", "self", "tension-register.md"),
    "# Tension Register\n\nTrack tensions between stated principles and observed behaviour here.\n"
  );
  ensureFile(path.join(root, "wiki", "macro", "index.md"), "# Macro\n");
  ensureFile(path.join(root, "wiki", "market-structure", "index.md"), "# Market Structure\n");
  ensureFile(path.join(root, "wiki", "derivatives", "index.md"), "# Derivatives\n");
  ensureFile(path.join(root, "wiki", "claims", "index.md"), "# Claim Index\n");
  ensureFile(path.join(root, "wiki", "claims", "contested.md"), "# Contested Claims\n");
  ensureFile(path.join(root, "wiki", "states", "index.md"), "# State Index\n");
  ensureFile(path.join(root, "wiki", "regimes", "index.md"), "# Regime Index\n");
  ensureFile(path.join(root, "wiki", "decisions", "index.md"), "# Decision Index\n");
  ensureFile(path.join(root, "wiki", "watch-profiles", "index.md"), "# Watch Profile Index\n");
  ensureFile(path.join(root, "wiki", "theses", "index.md"), "# Thesis Index\n");
  ensureFile(path.join(root, "wiki", "surveillance", "index.md"), "# Surveillance Index\n");
  ensureFile(
    path.join(root, "wiki", "glossary", "watch-ontology.md"),
    "# Watch Ontology\n\nThis page is derived from active watch profiles. Edit the profiles, not this generated summary.\n"
  );
  ensureFile(path.join(root, "wiki", "self", "index.md"), "# Self Index\n");
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
