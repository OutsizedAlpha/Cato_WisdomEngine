const fs = require("node:fs");
const path = require("node:path");
const { PLACEHOLDER_MARKER, captureTerminalModelBundle, scaffoldBody, writePackArtifacts } = require("./handoff-core");
const { parseFrontmatter } = require("./markdown");
const { ensureProjectStructure, listMarkdownNotes } = require("./project");
const { readText, relativeToRoot, slugify, truncate } = require("./utils");

const CANDIDATE_DIRS = [
  "outputs",
  "wiki/reports",
  "wiki/decisions",
  "wiki/states",
  "wiki/regimes",
  "wiki/surveillance",
  "wiki/memory",
  "wiki/synthesis"
];

function isExcludedCrystallizePath(relativePath) {
  return (
    /\/archive\//i.test(relativePath) ||
    /\/(?:index|README)\.md$/i.test(relativePath) ||
    relativePath.startsWith("wiki/source-notes/") ||
    relativePath.startsWith("wiki/drafts/") ||
    relativePath.startsWith("wiki/claims/")
  );
}

function normalizeLookup(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/");
}

function loadCrystallizeCandidates(root) {
  const candidates = [];
  const seen = new Set();

  for (const relativeDir of CANDIDATE_DIRS) {
    for (const filePath of listMarkdownNotes(root, relativeDir)) {
      const relativePath = relativeToRoot(root, filePath);
      if (seen.has(relativePath) || isExcludedCrystallizePath(relativePath)) {
        continue;
      }
      seen.add(relativePath);
      const parsed = parseFrontmatter(readText(filePath));
      candidates.push({
        path: filePath,
        relativePath,
        title: parsed.frontmatter.title || path.basename(filePath, ".md"),
        frontmatter: parsed.frontmatter,
        body: parsed.body
      });
    }
  }

  return candidates;
}

function scoreCandidateMatch(candidate, input) {
  const normalizedInput = normalizeLookup(input);
  const relativePath = normalizeLookup(candidate.relativePath);
  const baseName = normalizeLookup(path.basename(candidate.relativePath, ".md"));
  const title = normalizeLookup(candidate.title);
  const titleSlug = slugify(candidate.title);

  if (relativePath === normalizedInput || relativePath === `${normalizedInput}.md`) {
    return 100;
  }
  if (baseName === normalizedInput || title === normalizedInput || titleSlug === normalizedInput) {
    return 90;
  }
  if (relativePath.endsWith(`/${normalizedInput}`) || relativePath.endsWith(`/${normalizedInput}.md`)) {
    return 80;
  }
  if (relativePath.includes(normalizedInput) || title.includes(normalizedInput)) {
    return 60;
  }
  return 0;
}

function resolveCrystallizeTarget(root, input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error('Crystallize requires a target artifact path or title. Example: .\\cato.cmd crystallize .\\outputs\\reports\\my-report.md');
  }

  const explicitPath = path.isAbsolute(trimmed) ? trimmed : path.join(root, trimmed);
  if (fs.existsSync(explicitPath) && fs.statSync(explicitPath).isFile()) {
    const parsed = parseFrontmatter(readText(explicitPath));
    return {
      path: explicitPath,
      relativePath: relativeToRoot(root, explicitPath),
      title: parsed.frontmatter.title || path.basename(explicitPath, ".md"),
      frontmatter: parsed.frontmatter,
      body: parsed.body
    };
  }

  const ranked = loadCrystallizeCandidates(root)
    .map((candidate) => ({
      candidate,
      score: scoreCandidateMatch(candidate, trimmed)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.relativePath.localeCompare(right.candidate.relativePath));

  if (!ranked.length) {
    throw new Error(`No crystallize candidate matched: ${trimmed}`);
  }

  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    const options = ranked.slice(0, 5).map((entry) => entry.candidate.relativePath).join(", ");
    throw new Error(`Crystallize target is ambiguous for "${trimmed}". Matches: ${options}`);
  }

  return ranked[0].candidate;
}

function buildLocalSources(root, target) {
  const sources = new Map();
  const push = (relativePath, title, role) => {
    if (!relativePath) {
      return;
    }
    const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      return;
    }
    const normalizedPath = relativeToRoot(root, absolutePath);
    if (sources.has(normalizedPath)) {
      return;
    }
    sources.set(normalizedPath, {
      path: normalizedPath,
      title: title || path.basename(normalizedPath, path.extname(normalizedPath)),
      role: role || "context"
    });
  };

  push(target.relativePath, target.title, "crystallize-target");
  for (const source of Array.isArray(target.frontmatter.sources) ? target.frontmatter.sources : []) {
    push(source, path.basename(String(source), path.extname(String(source))), "evidence");
  }
  if (target.frontmatter.promoted_from) {
    push(target.frontmatter.promoted_from, "Promoted Source Artifact", "promoted-source");
  }

  return [...sources.values()];
}

function buildCrystallizeBody(target, localSources) {
  const sourceList = localSources.length
    ? localSources.map((source) => `- \`${source.path}\`${source.role ? ` (${source.role})` : ""}`).join("\n")
    : "- No local source map was resolved.";

  return `# Crystallized: ${target.title}

## Crystallized From

- Source artifact: \`${target.relativePath}\`
- Original title: ${target.title}
- Original kind: \`${target.frontmatter.kind || "unknown"}\`
- Original generation mode: \`${target.frontmatter.generation_mode || "unknown"}\`

## Durable Takeaways

- Replace this section with the smallest durable statements that should compound future work.

## Candidate Claims To Promote

- Claim:
  - Basis:
  - Confidence cue:

## Concepts / Entities To Create Or Update

- Concept or entity:
  - Why it matters:
  - Best target page:

## State / Decision Implications

- What current state pages, decision notes, or watch surfaces should change?

## Self-Model / Process Lessons

- Capture only durable operating lessons, not transient session chatter.

## Open Threads

- What still needs primary evidence, reconciliation, or follow-up work?

## Source Map

${sourceList}
`;
}

function writeCrystallizePack(root, input, options = {}) {
  ensureProjectStructure(root);
  const target = resolveCrystallizeTarget(root, input);
  const title = options.title || `Crystallized: ${target.title}`;
  const slugSeed = slugify(`${path.basename(target.relativePath, ".md")}-crystallized`).slice(0, 80) || "crystallized";
  const outputPath = path.join("wiki", "synthesis", `${slugSeed}.md`);
  const localSources = buildLocalSources(root, target);
  const scaffold = buildCrystallizeBody(target, localSources);

  const paths = writePackArtifacts(root, {
    cacheDir: path.join("cache", "crystallize-packs"),
    slugSeed,
    pack(relativePaths) {
      return {
        generated_at: require("./utils").nowIso(),
        command: "crystallize",
        title,
        source_target: {
          path: target.relativePath,
          title: target.title,
          kind: target.frontmatter.kind || "",
          generation_mode: target.frontmatter.generation_mode || ""
        },
        local_sources: localSources,
        output_path: outputPath,
        pack_path: relativePaths.packPath
      };
    },
    captureBundle(relativePaths) {
      return {
        mode: "crystallize",
        command: "crystallize",
        title,
        topic: target.title,
        pack_path: relativePaths.packPath,
        authoring_layer: "terminal_model",
        model: "",
        authoring_session: "",
        local_sources: localSources,
        sources: [],
        output: {
          kind: "synthesis-note",
          title,
          output_path: outputPath,
          promote: false,
          generation_mode: "terminal_model_crystallize",
          frontmatter: {
            status: "active",
            source_basis: "crystallized",
            crystallization_status: "crystallized",
            crystallized_from: target.relativePath,
            source_artifact_title: target.title
          },
          body: scaffoldBody(scaffold, title)
        }
      };
    },
    promptMarkdown(relativePaths) {
      return `# Crystallization Pack Prompt

Use this pack to distill a completed authored artifact into durable reusable knowledge.

## Objective

- Source artifact: \`${target.relativePath}\`
- Source title: ${target.title}
- Output path: \`${outputPath}\`
- Pack JSON: \`${relativePaths.packPath}\`
- Capture bundle: \`${relativePaths.capturePath}\`

## Required Operating Rules

1. Read the pack JSON and the source artifact.
2. Keep only validated, durable knowledge that should compound future work.
3. Split output across takeaways, claim candidates, concept/entity updates, state/decision implications, and process lessons.
4. Do not restate the entire original memo or report.
5. Preserve provenance through the source map and explicit references.
6. Replace the placeholder marker \`${PLACEHOLDER_MARKER}\`.
7. Fill \`model\` with the actual active terminal session label.
8. Finalise with:
   \`.\cato.cmd capture-crystallize "${relativePaths.capturePath}"\`
`;
    },
    logFile: path.join("logs", "actions", "crystallize_runs.jsonl"),
    logEntry(relativePaths) {
      return {
        event: "crystallize_pack",
        source_path: target.relativePath,
        source_title: target.title,
        output_path: outputPath,
        pack_path: relativePaths.packPath,
        prompt_path: relativePaths.promptPath,
        capture_path: relativePaths.capturePath,
        local_sources: localSources.length
      };
    }
  });

  return {
    title,
    sourcePath: target.relativePath,
    outputPath,
    packPath: paths.packPath,
    promptPath: paths.promptPath,
    capturePath: paths.capturePath,
    localSources: localSources.length
  };
}

function captureCrystallize(root, bundleInput) {
  return captureTerminalModelBundle(root, bundleInput, {
    label: "Crystallize",
    placeholderChecks: [
      {
        test: (body) => body.includes(PLACEHOLDER_MARKER),
        message: "Crystallize bundle still contains the scaffold placeholder marker."
      }
    ],
    generationMode: "terminal_model_crystallize",
    logFile: path.join("logs", "actions", "crystallize_runs.jsonl"),
    logEvent: "crystallize_capture",
    logFields(bundle) {
      return {
        source_path: bundle.output?.frontmatter?.crystallized_from || "",
        output_kind: bundle.output?.kind || "synthesis-note"
      };
    }
  });
}

module.exports = {
  captureCrystallize,
  resolveCrystallizeTarget,
  writeCrystallizePack
};
