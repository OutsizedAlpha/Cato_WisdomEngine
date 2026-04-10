const fs = require("node:fs");
const path = require("node:path");
const { appendJsonl, ensureDir, nowIso, readJson, writeJson } = require("./utils");

const PUBLIC_INCLUDE_PATHS = [
  ".gitignore",
  "AGENTS.md",
  "CLAUDE.md",
  "INVESTMENT_RESEARCH.md",
  "README.md",
  "cato.cmd",
  "package.json",
  "py.cmd",
  "python.cmd",
  "Use-CatoPython.cmd",
  "Use-CatoPython.ps1",
  "bin",
  "commands",
  "config",
  "docs",
  "hooks",
  "roles",
  "skills",
  "src",
  "tests",
  "tools",
  "wiki/_templates"
];

const PUBLIC_EXCLUDE_PATHS = [
  "docs/project_brief.md",
  "docs/project_map.md",
  "inbox",
  "raw",
  "extracted",
  "manifests",
  "wiki/_indices",
  "wiki/_maps",
  "wiki/claims",
  "wiki/concepts",
  "wiki/decisions",
  "wiki/drafts",
  "wiki/entities",
  "wiki/glossary",
  "wiki/macro",
  "wiki/market-structure",
  "wiki/memory",
  "wiki/regimes",
  "wiki/reports",
  "wiki/self",
  "wiki/source-notes",
  "wiki/states",
  "wiki/surveillance",
  "wiki/synthesis",
  "wiki/theses",
  "wiki/timelines",
  "wiki/unresolved",
  "wiki/watch-profiles",
  "outputs",
  "cache",
  "logs",
  "tmp",
  "tasks",
  "MEMORY.md",
  ".obsidian",
  ".codex"
];

const PUBLIC_SCAFFOLD_FILES = {
  "docs/project_brief.md": `# Project Brief

## Objective

- Publish a clean, reusable public engine for Cato without shipping any private corpus, personal doctrine, or operator-specific working memory.

## Scope

- Keep the markdown-first research runtime, CLI, prompts, policies, tests, and templates.
- Keep the repo ready for a new operator to initialize, ingest sources, compile knowledge, and run authored pack/capture workflows.

## Constraints

- Do not bundle private inbox material, raw evidence archives, extracted text, manifests, working memory, or captured outputs.
- Preserve the zero-API operating model: Cato stores memory and structure, while the active terminal model authors substantive output.
- Keep the public engine auditable, git-friendly, and ready to extend.

## Non-Goals

- This public line is not a copy of the private knowledge base.
- This public line does not ship seeded personal doctrine or user-specific operating rules.
`,
  "docs/project_map.md": `# Project Map

## Runtime

- Node-first CLI with no declared runtime or dev dependencies in \`package.json\`
- Python wrappers and PDF tooling remain optional environment helpers
- Browser automation is treated as an environment capability verified by \`doctor\`

## Entry Points

- \`bin/cato.js\` = CLI entry
- \`src/cli.js\` = argument parsing and dispatch
- \`src/command-registry.js\` = command contract registry

## Key Commands

- \`node .\\tests\\cato.test.js\`
- \`node .\\bin\\cato.js help\`
- \`node .\\bin\\cato.js lint\`
- \`node .\\bin\\cato.js public-release --to ..\\Cato_WisdomEngine_Public\`

## Architecture Notes

- Markdown-first, file-first, and auditable by default
- Keep repo agent-driven rather than embedding external LLM execution into the CLI
- Deterministic plumbing in the CLI, model-authored substantive output through pack/capture workflows
- Public releases should preserve engine behaviour while excluding private corpus and operator-specific memory
`,
  "tasks/todo.md": `# Task Tracker

## Objective

- Keep the public Cato engine current without bundling private knowledge or personal doctrine.

## Maintained Commitments

- [x] Add semantic source/document-class routing so ingest can branch by document class, not only file format.
- [x] Add explicit L0/L1/L2/L3 retrieval-budget rules and TLDR-first reading discipline to the prompts and operator workflow.
- [x] Add managed counter-arguments / data-gaps blocks to the core claim/state/decision surfaces.
- [x] Add a draft or append-and-review workspace distinct from canonical wiki surfaces.
- [x] Add structured query/backlink/tag surfaces as a file-first sidecar catalog without rewriting storage away from markdown.
- [x] Decide whether to embed external LLM execution into the CLI or keep the repo agent-driven.

## Public Release Discipline

- [x] Keep private corpus, manifests, inbox material, outputs, and working memory out of the public line.
- [x] Preserve the reusable engine scaffold so a new operator can initialize and use the repo immediately.
`,
  "tasks/lessons.md": `# Lessons

- Keep the public line engine-only: publish workflow and implementation improvements, not private corpus or operator-specific doctrine.
- When exporting to the public line, preserve the operating scaffold and templates instead of deleting required context files outright.
`
};

function resolveTargetDir(root, targetOption = "") {
  const trimmed = String(targetOption || "").trim();
  if (!trimmed) {
    return path.resolve(root, "tmp", "public-release");
  }
  return path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(root, trimmed);
}

function clearTargetDirectory(targetDir) {
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (entry.name === ".git") {
      continue;
    }
    fs.rmSync(path.join(targetDir, entry.name), { recursive: true, force: true });
  }
}

function copyIncludedPaths(root, targetDir) {
  const copied = [];
  for (const relativePath of PUBLIC_INCLUDE_PATHS) {
    const sourcePath = path.join(root, relativePath);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    const destinationPath = path.join(targetDir, relativePath);
    ensureDir(path.dirname(destinationPath));
    fs.cpSync(sourcePath, destinationPath, { recursive: true });
    copied.push(relativePath);
  }
  return copied;
}

function removeExcludedPaths(targetDir) {
  const removed = [];
  for (const relativePath of PUBLIC_EXCLUDE_PATHS) {
    const targetPath = path.join(targetDir, relativePath);
    if (!fs.existsSync(targetPath)) {
      continue;
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
    removed.push(relativePath);
  }
  return removed;
}

function writePublicScaffolds(targetDir) {
  for (const [relativePath, contents] of Object.entries(PUBLIC_SCAFFOLD_FILES)) {
    const targetPath = path.join(targetDir, relativePath);
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, contents, "utf8");
  }
}

function buildPublicRelease(root, options = {}) {
  const targetDir = resolveTargetDir(root, options.to || options.target);
  const normalizedRoot = path.resolve(root);
  if (targetDir === normalizedRoot) {
    throw new Error("Public release target cannot be the active private repo root.");
  }

  clearTargetDirectory(targetDir);
  const copiedPaths = copyIncludedPaths(root, targetDir);
  const removedPaths = removeExcludedPaths(targetDir);
  writePublicScaffolds(targetDir);

  const exportedAt = nowIso();
  const manifest = {
    exported_at: exportedAt,
    source_root: normalizedRoot,
    target_dir: targetDir,
    copied_paths: copiedPaths,
    removed_paths: removedPaths,
    include_policy: PUBLIC_INCLUDE_PATHS,
    exclude_policy: PUBLIC_EXCLUDE_PATHS,
    note: "This export intentionally excludes private corpus, working memory, inbox material, manifests, wiki state, outputs, and project-memory files."
  };
  const manifestPath = path.join(root, "logs", "public-release", `${exportedAt.replace(/[:.]/g, "-")}.manifest.json`);
  writeJson(manifestPath, manifest);

  appendJsonl(path.join(root, "logs", "actions", "public_release.jsonl"), {
    event: "public_release",
    at: manifest.exported_at,
    target_dir: targetDir,
    copied_paths: copiedPaths.length,
    removed_paths: removedPaths.length
  });

  return {
    targetDir,
    manifestPath,
    copiedPaths,
    removedPaths,
    hasGitTarget: fs.existsSync(path.join(targetDir, ".git")),
    targetGitignore: readJson(path.join(targetDir, "package.json"), null) ? "package_present" : "package_missing"
  };
}

module.exports = {
  PUBLIC_EXCLUDE_PATHS,
  PUBLIC_INCLUDE_PATHS,
  buildPublicRelease
};
