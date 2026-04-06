const fs = require("node:fs");
const path = require("node:path");
const { askQuestion } = require("./ask");
const { searchClaims, writeWhyBelieve } = require("./claims");
const { writeDecisionNote, writeMeetingBrief, writeRedTeam, writeWhatChangedForMarkets } = require("./decisions");
const { writeDeck } = require("./deck");
const { parseFrontmatter } = require("./markdown");
const { ensureProjectStructure } = require("./project");
const { loadSelfNotes } = require("./research");
const { captureResearch } = require("./research-handoff");
const { writeReflection } = require("./reflect");
const { writePrinciplesSnapshot } = require("./principles");
const { createPostmortem } = require("./postmortem");
const { refreshState, writeRegimeBrief } = require("./states");
const { writeSurveillance } = require("./surveil");
const { buildWatchProfileArtifacts, createWatchProfile, loadWatchProfiles, resolveWatchSubject } = require("./watch");
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

const PLACEHOLDER_MARKER = "<!-- MODEL_AUTHOR_REPLACE_THIS_SCAFFOLD -->";

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

function uniqueLocalSources(entries) {
  const seen = new Set();
  const output = [];
  for (const entry of entries) {
    if (!entry?.path) {
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
    role: role || "context"
  };
}

function parseScaffold(root, relativePath, titleFallback = "") {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      frontmatter: {},
      body: `# ${titleFallback || "Authored Output"}\n`,
      title: titleFallback || "Authored Output"
    };
  }
  const parsed = parseFrontmatter(readText(absolutePath));
  return {
    frontmatter: parsed.frontmatter,
    body: parsed.body || `# ${titleFallback || parsed.frontmatter.title || "Authored Output"}\n`,
    title: parsed.frontmatter.title || titleFallback || path.basename(relativePath, ".md")
  };
}

function scaffoldBody(body, fallbackTitle) {
  const trimmed = String(body || "").trim() || `# ${fallbackTitle}`;
  return `${PLACEHOLDER_MARKER}\n\n${trimmed}\n`;
}

function inferStatePath(subject) {
  return `wiki/states/${slugify(subject).slice(0, 80) || "state"}.md`;
}

function summarizeSources(localSources) {
  return localSources
    .slice(0, 18)
    .map((source) => `- \`${source.path}\`${source.role ? ` (${source.role})` : ""}`)
    .join("\n");
}

function writePackFiles(root, prepared) {
  const packSlug = slugify(`${prepared.command}-${prepared.title || prepared.topic || "authored-output"}`).slice(0, 80) || "authored-output";
  const basePath = uniquePath(path.join(root, "cache", "authored-packs", `${timestampStamp()}-${packSlug}`));
  const packPath = `${basePath}-pack.json`;
  const promptPath = `${basePath}-prompt.md`;
  const capturePath = `${basePath}-capture.json`;

  const pack = {
    generated_at: nowIso(),
    command: prepared.command,
    topic: prepared.topic,
    title: prepared.title,
    output_kind: prepared.output.kind,
    output_path: prepared.output.output_path || "",
    promote: Boolean(prepared.output.promote),
    artifacts: prepared.artifacts || {},
    notes: prepared.notes || [],
    local_sources: prepared.localSources
  };
  pack.pack_path = relativeToRoot(root, packPath);

  const captureBundle = {
    mode: "authored_output",
    command: prepared.command,
    topic: prepared.topic,
    title: prepared.title,
    pack_path: pack.pack_path,
    authoring_layer: "terminal_model",
    model: "",
    authoring_session: "",
    local_sources: prepared.localSources,
    sources: [],
    output: {
      kind: prepared.output.kind,
      title: prepared.title,
      output_path: prepared.output.output_path || "",
      canonical_path: prepared.output.canonical_path || "",
      archive_dir: prepared.output.archive_dir || "",
      promote: Boolean(prepared.output.promote),
      generation_mode: prepared.output.generation_mode || `terminal_model_${prepared.command}`,
      frontmatter: prepared.output.frontmatter || {},
      body: scaffoldBody(prepared.output.body, prepared.title)
    }
  };

  writeJson(packPath, pack);
  writeJson(capturePath, captureBundle);
  writeText(
    promptPath,
    `# Authored Output Pack Prompt

Cato is the memory and scaffolding layer. The active terminal model must author the final output.

## Objective

- Command: ${prepared.command}
- Topic: ${prepared.topic}
- Title: ${prepared.title}
- Output kind: ${prepared.output.kind}
- Output path: \`${prepared.output.output_path || prepared.output.canonical_path || "(generated on capture)"}\`
- Capture bundle: \`${relativeToRoot(root, capturePath)}\`

## Required Operating Rules

1. Read the pack JSON at \`${relativeToRoot(root, packPath)}\`.
2. Review the local scaffold and context files listed below.
3. Treat the scaffold as a starting structure only, not as final authored text.
4. Replace the placeholder marker \`${PLACEHOLDER_MARKER}\` in \`output.body\`.
5. Fill \`model\` with the actual active Codex/Claude session label used for authorship.
6. Add fresh URLs under \`sources\` only if you actually did live external research.
7. Finalise the authored output with:
   \`.\cato.cmd capture-authored "${relativeToRoot(root, capturePath)}"\`

## Local Context Sources

${summarizeSources(prepared.localSources) || "- None."}

${prepared.notes?.length ? `## Notes\n\n${prepared.notes.map((line) => `- ${line}`).join("\n")}\n` : ""}
`
  );

  appendJsonl(path.join(root, "logs", "actions", "authored_runs.jsonl"), {
    event: "authored_pack",
    at: nowIso(),
    command: prepared.command,
    topic: prepared.topic,
    title: prepared.title,
    output_kind: prepared.output.kind,
    output_path: prepared.output.output_path || prepared.output.canonical_path || "",
    pack_path: relativeToRoot(root, packPath),
    prompt_path: relativeToRoot(root, promptPath),
    capture_path: relativeToRoot(root, capturePath),
    local_sources: prepared.localSources.length
  });

  return {
    command: prepared.command,
    topic: prepared.topic,
    title: prepared.title,
    outputKind: prepared.output.kind,
    outputPath: prepared.output.output_path || prepared.output.canonical_path || "",
    packPath: relativeToRoot(root, packPath),
    promptPath: relativeToRoot(root, promptPath),
    capturePath: relativeToRoot(root, capturePath),
    localSources: prepared.localSources.length
  };
}

function prepareAsk(root, topic, options = {}) {
  const result = askQuestion(root, topic, {
    limit: options.limit,
    saveQuestion: Boolean(options["save-question"]),
    promote: false
  });
  const scaffold = parseScaffold(root, result.outputPath, topic);
  return {
    command: "ask",
    topic,
    title: scaffold.title,
    artifacts: {
      memo_scaffold: result.outputPath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.outputPath, scaffold.title, "memo-scaffold"),
      ...result.results.map((entry) => makeLocalSource(entry.relativePath, entry.title, "evidence"))
    ]),
    notes: ["This command now prepares a model-authored memo capture instead of treating deterministic memo prose as final."],
    output: {
      kind: "memo",
      output_path: result.outputPath,
      promote: Boolean(options.promote),
      generation_mode: "terminal_model_ask",
      frontmatter: {
        ...scaffold.frontmatter,
        question: topic
      },
      body: scaffold.body
    }
  };
}

function prepareDeck(root, topic, options = {}) {
  const result = writeDeck(root, topic, {
    limit: options.limit,
    promote: false
  });
  const scaffold = parseScaffold(root, result.outputPath, topic);
  const watch = resolveWatchSubject(root, topic);
  return {
    command: "deck",
    topic,
    title: scaffold.title,
    artifacts: {
      deck_scaffold: result.outputPath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.outputPath, scaffold.title, "deck-scaffold"),
      makeLocalSource(watch.profile?.relativePath, watch.profile?.title, "watch-profile"),
      ...result.results.map((entry) => makeLocalSource(entry.relativePath, entry.title, "evidence"))
    ]),
    notes: ["The scaffold deck is only a structural starting point. The final deck should be authored by the active terminal model."],
    output: {
      kind: "deck",
      output_path: result.outputPath,
      promote: Boolean(options.promote),
      generation_mode: "terminal_model_deck",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function prepareSurveil(root, topic, options = {}) {
  const result = writeSurveillance(root, topic, {
    limit: options.limit,
    claimLimit: options["claim-limit"]
  });
  const scaffold = parseScaffold(root, result.notePath, topic);
  return {
    command: "surveil",
    topic,
    title: scaffold.title,
    artifacts: {
      surveillance_scaffold: result.notePath,
      watch_profile: result.profilePath || ""
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.notePath, scaffold.title, "surveillance-scaffold"),
      makeLocalSource(result.profilePath, topic, "watch-profile"),
      ...result.results.map((entry) => makeLocalSource(entry.relativePath, entry.title, "evidence")),
      ...result.claims.map((claim) => makeLocalSource(`wiki/claims/${String(claim.id).toLowerCase()}.md`, truncate(claim.claim_text, 96), "claim"))
    ]),
    notes: ["Surveillance is now expected to be finalized through the active terminal model, not left as deterministic prose."],
    output: {
      kind: "surveillance-page",
      output_path: result.notePath,
      promote: false,
      generation_mode: "terminal_model_surveillance",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function prepareWatch(root, topic, options = {}) {
  const watchResult = createWatchProfile(root, topic, {
    context: options.context,
    aliases: options.aliases,
    entities: options.entities,
    concepts: options.concepts,
    triggers: options.triggers,
    instructions: options.instructions,
    priority: options.priority,
    cadence: options.cadence,
    status: options.status
  });
  const scaffold = parseScaffold(root, watchResult.profilePath, topic);
  const surveillance = options["no-refresh"] ? null : writeSurveillance(root, topic, { limit: options.limit });
  return {
    command: "watch",
    topic,
    title: scaffold.title,
    artifacts: {
      watch_profile_scaffold: watchResult.profilePath,
      watch_ontology: watchResult.ontologyPath,
      surveillance_scaffold: surveillance?.notePath || ""
    },
    localSources: uniqueLocalSources([
      makeLocalSource(watchResult.profilePath, topic, "watch-profile-scaffold"),
      makeLocalSource(watchResult.ontologyPath, "Watch Ontology", "watch-ontology"),
      makeLocalSource(surveillance?.notePath, topic, "surveillance-scaffold")
    ]),
    notes: [
      "The watch profile itself is now model-authored through capture.",
      options["no-refresh"]
        ? "Surveillance refresh was skipped while preparing this pack."
        : "A deterministic surveillance scaffold was refreshed only as context; if you want the final surveillance page re-authored, run `surveil` after capturing this watch profile."
    ],
    output: {
      kind: "watch-profile",
      output_path: watchResult.profilePath,
      promote: false,
      generation_mode: "terminal_model_watch_profile",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function prepareWhyBelieve(root, topic, options = {}) {
  const result = writeWhyBelieve(root, topic, {
    limit: options.limit
  });
  const scaffold = parseScaffold(root, result.outputPath, `Why Believe: ${topic}`);
  return {
    command: "why-believe",
    topic,
    title: scaffold.title,
    artifacts: {
      belief_brief_scaffold: result.outputPath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.outputPath, scaffold.title, "belief-brief-scaffold")
    ]),
    notes: ["Belief briefs should now be finalized through model authorship even though the claim ledger remains deterministic."],
    output: {
      kind: "belief-brief",
      output_path: result.outputPath,
      promote: false,
      generation_mode: "terminal_model_belief_brief",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function prepareStateRefresh(root, topic, options = {}) {
  const result = refreshState(root, topic, {
    claimLimit: options["claim-limit"],
    evidenceLimit: options["evidence-limit"]
  });
  const scaffold = parseScaffold(root, result.statePath, result.subject);
  return {
    command: "state-refresh",
    topic,
    title: scaffold.title,
    artifacts: {
      state_scaffold: result.statePath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.statePath, result.subject, "state-scaffold"),
      ...result.claims.map((claim) => makeLocalSource(`wiki/claims/${String(claim.id).toLowerCase()}.md`, truncate(claim.claim_text, 96), "claim")),
      ...result.evidence.map((entry) => makeLocalSource(entry.relativePath, entry.title, "evidence"))
    ]),
    notes: ["The state page remains structurally maintained by Cato, but the substantive authored text should now be finalized through model capture."],
    output: {
      kind: "state-page",
      output_path: result.statePath,
      promote: false,
      generation_mode: "terminal_model_state_page",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function prepareRegimeBrief(root, seed, options = {}) {
  const result = writeRegimeBrief(root, {
    set: options.set,
    title: options.title,
    subjects: options.subjects,
    noRefresh: Boolean(options["no-refresh"]),
    claimLimit: options["claim-limit"],
    evidenceLimit: options["evidence-limit"]
  });
  const scaffold = parseScaffold(root, result.outputPath, options.title || `${options.set || "regime"} regime brief`);
  return {
    command: "regime-brief",
    topic: options.set || seed || "regime-brief",
    title: scaffold.title,
    artifacts: {
      regime_brief_scaffold: result.outputPath,
      regime_page: result.regimePath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.outputPath, scaffold.title, "regime-brief-scaffold"),
      makeLocalSource(result.regimePath, scaffold.title, "regime-page"),
      ...result.subjects.map((subject) => makeLocalSource(inferStatePath(subject), subject, "state-page"))
    ]),
    notes: ["The command name stays the same, but the brief is now intended to be finalized through model capture."],
    output: {
      kind: "regime-brief",
      output_path: result.outputPath,
      promote: false,
      generation_mode: "terminal_model_regime_brief",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function prepareMeetingBrief(root, topic, options = {}) {
  const result = writeMeetingBrief(root, topic, {
    subjects: options.subjects,
    claimLimit: options["claim-limit"],
    evidenceLimit: options["evidence-limit"]
  });
  const scaffold = parseScaffold(root, result.outputPath, topic);
  return {
    command: "meeting-brief",
    topic,
    title: scaffold.title,
    artifacts: {
      meeting_brief_scaffold: result.outputPath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.outputPath, scaffold.title, "meeting-brief-scaffold"),
      ...result.subjects.map((subject) => makeLocalSource(inferStatePath(subject), subject, "state-page"))
    ]),
    notes: ["Meeting briefs should now be finalized by the active terminal model, even if Cato precomputes the state scaffolding."],
    output: {
      kind: "meeting-brief",
      output_path: result.outputPath,
      promote: false,
      generation_mode: "terminal_model_meeting_brief",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function prepareDecisionNote(root, topic, options = {}) {
  const result = writeDecisionNote(root, topic, {
    claimLimit: options["claim-limit"],
    evidenceLimit: options["evidence-limit"]
  });
  const scaffold = parseScaffold(root, result.notePath, topic);
  return {
    command: "decision-note",
    topic,
    title: scaffold.title,
    artifacts: {
      decision_note_scaffold: result.notePath,
      state_page: result.statePath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.notePath, topic, "decision-note-scaffold"),
      makeLocalSource(result.statePath, topic, "state-page")
    ]),
    notes: ["Decision notes are now expected to be finalized through model capture before being treated as durable judgement."],
    output: {
      kind: "decision-note",
      output_path: result.notePath,
      promote: false,
      generation_mode: "terminal_model_decision_note",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function prepareRedTeam(root, topic, options = {}) {
  const result = writeRedTeam(root, topic, {
    claimLimit: options["claim-limit"],
    evidenceLimit: options["evidence-limit"]
  });
  const scaffold = parseScaffold(root, result.outputPath, `Red Team: ${topic}`);
  return {
    command: "red-team",
    topic,
    title: scaffold.title,
    artifacts: {
      red_team_scaffold: result.outputPath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.outputPath, scaffold.title, "red-team-scaffold"),
      makeLocalSource(inferStatePath(topic), topic, "state-page")
    ]),
    notes: ["Red-team output should be authored by the terminal model so the counter-case is not reduced to deterministic template prose."],
    output: {
      kind: "red-team-brief",
      output_path: result.outputPath,
      promote: false,
      generation_mode: "terminal_model_red_team",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function prepareWhatChangedForMarkets(root, topic, options = {}) {
  const result = writeWhatChangedForMarkets(root, {
    title: options.title || topic || "What changed for markets",
    subjects: options.subjects,
    claimLimit: options["claim-limit"],
    evidenceLimit: options["evidence-limit"]
  });
  const scaffold = parseScaffold(root, result.outputPath, options.title || topic || "What changed for markets");
  return {
    command: "what-changed-for-markets",
    topic: options.title || topic || "What changed for markets",
    title: scaffold.title,
    artifacts: {
      market_change_scaffold: result.outputPath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.outputPath, scaffold.title, "market-change-scaffold"),
      ...result.subjects.map((subject) => makeLocalSource(inferStatePath(subject), subject, "state-page"))
    ]),
    notes: ["This market-change brief is now treated as model-authored analytical output rather than a final deterministic summary."],
    output: {
      kind: "market-change-brief",
      output_path: result.outputPath,
      promote: false,
      generation_mode: "terminal_model_market_change",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function prepareReflect(root, topic, options = {}) {
  const result = writeReflection(root, {
    promote: false
  });
  const scaffold = parseScaffold(root, result.outputPath, "Self Reflection");
  return {
    command: "reflect",
    topic: topic || "self-reflection",
    title: scaffold.title,
    artifacts: {
      reflection_scaffold: result.outputPath,
      tension_register: result.tensionRegisterPath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.outputPath, scaffold.title, "reflection-scaffold"),
      makeLocalSource(result.tensionRegisterPath, "Tension Register", "self-model"),
      ...loadSelfNotes(root).slice(0, 12).map((note) => makeLocalSource(note.relativePath, note.title, "self-note"))
    ]),
    notes: ["The self-reflection memo is now finalized through model capture; the tension register remains a maintained support surface."],
    output: {
      kind: "self-reflection",
      output_path: result.outputPath,
      promote: Boolean(options.promote),
      generation_mode: "terminal_model_reflection",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function preparePrinciples(root, topic, options = {}) {
  const result = writePrinciplesSnapshot(root);
  const scaffold = parseScaffold(root, result.outputPath, "Principles Snapshot");
  return {
    command: "principles",
    topic: topic || "principles-snapshot",
    title: scaffold.title,
    artifacts: {
      principles_scaffold: result.outputPath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.outputPath, scaffold.title, "principles-scaffold"),
      ...loadSelfNotes(root).slice(0, 12).map((note) => makeLocalSource(note.relativePath, note.title, "self-note"))
    ]),
    notes: ["Principles snapshots should now be finalized through model capture rather than left as deterministic digest prose."],
    output: {
      kind: "principles-snapshot",
      output_path: result.outputPath,
      promote: false,
      generation_mode: "terminal_model_principles",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function preparePostmortem(root, topic, options = {}) {
  const result = createPostmortem(root, topic, {
    notes: options.notes,
    from: options.from,
    confidence: options.confidence
  });
  const scaffold = parseScaffold(root, result.notePath, topic);
  return {
    command: "postmortem",
    topic,
    title: scaffold.title,
    artifacts: {
      postmortem_scaffold: result.notePath
    },
    localSources: uniqueLocalSources([
      makeLocalSource(result.notePath, scaffold.title, "postmortem-scaffold")
    ]),
    notes: ["Postmortems are durable judgement artefacts and should now be finalized through model capture."],
    output: {
      kind: "postmortem-note",
      output_path: result.notePath,
      promote: false,
      generation_mode: "terminal_model_postmortem",
      frontmatter: scaffold.frontmatter,
      body: scaffold.body
    }
  };
}

function prepareAuthoredCommand(root, command, seed, options = {}) {
  ensureProjectStructure(root);
  const normalizedSeed = String(seed || "").trim();
  switch (command) {
    case "ask":
      return prepareAsk(root, normalizedSeed, options);
    case "deck":
      return prepareDeck(root, normalizedSeed, options);
    case "surveil":
      return prepareSurveil(root, normalizedSeed, options);
    case "watch":
      return prepareWatch(root, normalizedSeed, options);
    case "why-believe":
      return prepareWhyBelieve(root, normalizedSeed, options);
    case "state-refresh":
      return prepareStateRefresh(root, normalizedSeed, options);
    case "regime-brief":
      return prepareRegimeBrief(root, normalizedSeed, options);
    case "meeting-brief":
      return prepareMeetingBrief(root, normalizedSeed || "Weekly investment meeting brief", options);
    case "decision-note":
      return prepareDecisionNote(root, normalizedSeed, options);
    case "red-team":
      return prepareRedTeam(root, normalizedSeed, options);
    case "what-changed-for-markets":
      return prepareWhatChangedForMarkets(root, normalizedSeed, options);
    case "reflect":
      return prepareReflect(root, normalizedSeed, options);
    case "principles":
      return preparePrinciples(root, normalizedSeed, options);
    case "postmortem":
      return preparePostmortem(root, normalizedSeed, options);
    default:
      throw new Error(`Unsupported authored command: ${command}`);
  }
}

function writeAuthoredPack(root, command, seed, options = {}) {
  const prepared = prepareAuthoredCommand(root, command, seed, options);
  return writePackFiles(root, prepared);
}

function captureAuthored(root, bundleInput, options = {}) {
  const bundlePath = path.isAbsolute(bundleInput) ? bundleInput : path.join(root, bundleInput);
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Authored capture bundle not found: ${bundlePath}`);
  }

  const bundle = JSON.parse(readText(bundlePath));
  const body = String(bundle.output?.body || "").trim();
  if (!body || body.includes(PLACEHOLDER_MARKER)) {
    throw new Error("Authored capture bundle still contains the scaffold placeholder marker. Replace it with the real model-authored output first.");
  }
  if (!String(bundle.model || "").trim()) {
    throw new Error("Authored capture bundle must record the active terminal model/session label in `model` before capture.");
  }

  const result = captureResearch(root, bundlePath, {
    ...options,
    generationMode: bundle.output?.generation_mode || `terminal_model_${bundle.command || "authored"}`
  });

  if (bundle.output?.kind === "watch-profile") {
    buildWatchProfileArtifacts(root, loadWatchProfiles(root));
  }

  appendJsonl(path.join(root, "logs", "actions", "authored_runs.jsonl"), {
    event: "authored_capture",
    at: nowIso(),
    command: bundle.command || "",
    topic: bundle.topic || "",
    title: bundle.title || "",
    bundle_path: relativeToRoot(root, bundlePath),
    model: bundle.model || "",
    authoring_session: bundle.authoring_session || "",
    output_path: result.outputResult?.outputPath || "",
    imported_sources: result.ingested,
    local_context_sources: result.localSources.length
  });

  return result;
}

module.exports = {
  captureAuthored,
  writeAuthoredPack
};
