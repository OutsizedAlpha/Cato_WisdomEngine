const path = require("node:path");
const fs = require("node:fs");
const { compileProject } = require("./compile");
const { ingest } = require("./ingest");
const { parseFrontmatter, sectionContent } = require("./markdown");
const { ensureProjectStructure, loadSettings } = require("./project");
const { promoteOutputToSynthesis, writeCanonicalDocument, writeOutputDocument } = require("./research");
const { appendJsonl, ensureDir, readJson, relativeToRoot, slugify, timestampStamp } = require("./utils");
const { createWatchProfile } = require("./watch");
const { writeSurveillance } = require("./surveil");
const { downloadWebSource, normalizeKnownUrl } = require("./web-import");

const OUTPUT_KINDS = {
  memo: {
    idPrefix: "ASK",
    kind: "answer-memo",
    outputDir: "outputs/memos"
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
    frontmatter: {
      marp: true,
      paginate: true,
      theme: "default"
    }
  },
  brief: {
    idPrefix: "BRIEF",
    kind: "research-brief",
    outputDir: "outputs/briefs"
  },
  "meeting-brief": {
    idPrefix: "MEETING",
    kind: "meeting-brief",
    outputDir: "outputs/meeting-briefs"
  }
};

function resolveBundle(root, bundleInput) {
  if (typeof bundleInput === "string") {
    const bundlePath = path.isAbsolute(bundleInput) ? bundleInput : path.join(root, bundleInput);
    if (!fs.existsSync(bundlePath)) {
      throw new Error(`Research handoff bundle not found: ${bundlePath}`);
    }
    return readJson(bundlePath, {});
  }
  return bundleInput || {};
}

function normalizeList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueList(values) {
  return [...new Set(normalizeList(values))];
}

function resolveLocalSources(root, bundle) {
  const rawSources = Array.isArray(bundle.local_sources) ? bundle.local_sources : [];
  const seen = new Set();
  const localSources = [];

  for (const source of rawSources) {
    const candidatePath =
      typeof source === "string"
        ? source
        : source?.path || source?.relative_path || source?.note_path || source?.file_path || "";
    if (!candidatePath) {
      continue;
    }
    const absolutePath = path.isAbsolute(candidatePath) ? candidatePath : path.join(root, candidatePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    const relativePath = relativeToRoot(root, absolutePath);
    if (seen.has(relativePath)) {
      continue;
    }
    seen.add(relativePath);
    localSources.push({
      path: relativePath,
      title:
        (typeof source === "object" && (source.title || source.label)) ||
        path.basename(absolutePath, path.extname(absolutePath)),
      role: typeof source === "object" ? source.role || "local-context" : "local-context"
    });
  }

  return localSources;
}

function stageResearchSources(root, bundle, options = {}) {
  const settings = loadSettings(root);
  const inboxRoot = settings.paths?.inbox || "inbox/drop_here";
  const subject = bundle.topic || bundle.title || bundle.output?.title || "research-handoff";
  const handoffDir = path.join(root, inboxRoot, `_handoff-${timestampStamp().slice(0, 19)}-${slugify(subject).slice(0, 48) || "research"}`);
  ensureDir(handoffDir);

  const staged = [];
  const failures = [];
  const sources = Array.isArray(bundle.sources) ? bundle.sources : [];

  for (const [index, source] of sources.entries()) {
    const url = normalizeKnownUrl(source.url || source.source_url);
    if (!url) {
      failures.push({
        title: source.title || `source-${index + 1}`,
        error: "Missing or invalid source URL."
      });
      continue;
    }

    try {
      const download = downloadWebSource(handoffDir, url, {
        downloadRunner: options.downloadRunner,
        title: source.title,
        rank: index + 1,
        author: source.author,
        date: source.date || source.published,
        tags: uniqueList([...normalizeList(source.tags), "llm-handoff"]),
        entities: uniqueList(source.entities),
        concepts: uniqueList(source.concepts),
        captureNotes: source.notes || source.capture_notes || "",
        captureSource: source.capture_source || "llm_research_handoff",
        publisher: source.publisher
      });
      staged.push({
        title: source.title || url,
        url: download.finalUrl,
        filePath: relativeToRoot(root, download.filePath),
        sidecarPath: relativeToRoot(root, download.sidecarPath)
      });
    } catch (error) {
      failures.push({
        title: source.title || url,
        url,
        error: error.message || String(error)
      });
    }
  }

  return {
    handoffDir,
    staged,
    failures
  };
}

function inferOutputTitle(bundle) {
  return bundle.output?.title || bundle.topic || bundle.title || bundle.question || "Research Handoff";
}

function inferOutputKind(bundle) {
  const requested = String(bundle.output?.kind || bundle.kind || "report").toLowerCase();
  return OUTPUT_KINDS[requested] ? requested : "report";
}

function normalizeOutputPayload(bundle, captureSummary = "") {
  const body = String(bundle.output?.body || "").trim();
  if (!body) {
    return {
      body: `# ${inferOutputTitle(bundle)}\n\nNo output body was provided in the research handoff bundle.\n${captureSummary}`,
      frontmatter: {}
    };
  }

  const parsed = parseFrontmatter(body);
  const cleanedBody = parsed.frontmatter && Object.keys(parsed.frontmatter).length ? parsed.body.trim() : body;
  const frontmatter = parsed.frontmatter && Object.keys(parsed.frontmatter).length ? parsed.frontmatter : {};
  if (!captureSummary) {
    return {
      body: cleanedBody,
      frontmatter
    };
  }
  if (sectionContent(cleanedBody, "Imported Source Capture") || sectionContent(cleanedBody, "Local Context Capture")) {
    return {
      body: cleanedBody,
      frontmatter
    };
  }
  return {
    body: `${cleanedBody}\n\n${captureSummary}`.trim(),
    frontmatter
  };
}

function renderImportedSourceSection(ingestedResults) {
  if (!ingestedResults.length) {
    return "";
  }

  return `
## Imported Source Capture

${ingestedResults
  .map((record) => `- ${record.title} (\`${record.note_path}\`)${record.source_url ? ` - ${record.source_url}` : ""}`)
  .join("\n")}
`;
}

function renderLocalSourceSection(localSources) {
  if (!localSources.length) {
    return "";
  }

  return `
## Local Context Capture

${localSources
  .map((source) => `- \`${source.path}\`${source.title ? ` (${source.title})` : ""}${source.role ? ` - ${source.role}` : ""}`)
  .join("\n")}
`;
}

function createOrUpdateWatch(root, bundle, options = {}) {
  const subject = bundle.watch?.subject || bundle.watch_topic || "";
  if (!subject) {
    return null;
  }

  const watch = bundle.watch || {};
  const watchResult = createWatchProfile(root, subject, {
    context: watch.context || bundle.watch_context || bundle.output?.why || bundle.topic || "",
    aliases: normalizeList(watch.aliases).join(", "),
    entities: normalizeList(watch.entities).join(", "),
    concepts: normalizeList(watch.concepts).join(", "),
    triggers: normalizeList(watch.triggers || watch.risk_triggers).join(", "),
    priority: watch.priority || "medium",
    cadence: watch.cadence || "ad-hoc",
    status: watch.status || "active"
  });

  const surveillance = options.noSurveil ? null : writeSurveillance(root, subject);
  return {
    subject,
    watchResult,
    surveillance
  };
}

function captureResearch(root, bundleInput, options = {}) {
  ensureProjectStructure(root);
  const bundle = resolveBundle(root, bundleInput);
  const staged = stageResearchSources(root, bundle, options);
  const localSources = resolveLocalSources(root, bundle);
  const ingestResult = staged.staged.length
    ? ingest(root, {
        from: relativeToRoot(root, staged.handoffDir),
        ocrRunner: options.ocrRunner
      })
    : { ingested: 0, results: [] };
  const compileResult = compileProject(root, { promoteCandidates: true });
  const watch = createOrUpdateWatch(root, bundle, options);

  let outputResult = null;
  if (bundle.output) {
    const outputKind = inferOutputKind(bundle);
    const config = OUTPUT_KINDS[outputKind];
    const captureSummary = [renderImportedSourceSection(ingestResult.results), renderLocalSourceSection(localSources)].filter(Boolean).join("\n\n");
    const outputPayload = normalizeOutputPayload(bundle, captureSummary);
    const outputSources = [...new Set(localSources.map((source) => source.path).concat(ingestResult.results.map((record) => record.note_path)))];
    const sharedOutputOptions = {
      idPrefix: config.idPrefix,
      kind: config.kind,
      title: inferOutputTitle(bundle),
      fileSlug: inferOutputTitle(bundle),
      body: outputPayload.body,
      sources: outputSources,
      frontmatter: {
        ...outputPayload.frontmatter,
        ...(bundle.output?.frontmatter || {}),
        ...config.frontmatter,
        generation_mode: bundle.output?.generation_mode || bundle.generation_mode || options.generationMode || "llm_handoff",
        authoring_layer: bundle.authoring_layer || "",
        authoring_model: bundle.model || "",
        authoring_session: bundle.authoring_session || "",
        handoff_topic: bundle.topic || "",
        handoff_question: bundle.question || "",
        handoff_pack_path: bundle.pack_path || "",
        watch_profile: watch?.watchResult?.profilePath || "",
        local_context_sources: localSources.length,
        imported_sources: ingestResult.results.length,
        imported_failures: staged.failures.length
      }
    };
    const output =
      config.canonical || bundle.output?.canonical_path
        ? writeCanonicalDocument(root, {
            ...sharedOutputOptions,
            outputPath: String(bundle.output?.canonical_path || "").trim() || path.join(config.outputDir, `${slugify(inferOutputTitle(bundle)).slice(0, 80) || "report"}.md`),
            archiveDir:
              String(bundle.output?.archive_dir || "").trim() ||
              path.join(config.outputDir, "archive", slugify(inferOutputTitle(bundle)).slice(0, 80) || "report")
          })
        : writeOutputDocument(root, {
            ...sharedOutputOptions,
            outputDir: config.outputDir
          });

    let promotedPath = "";
    if (!(config.canonical || bundle.output?.canonical_path) && (options.promote || bundle.output.promote)) {
      promotedPath = promoteOutputToSynthesis(root, output.outputPath, {
        title: inferOutputTitle(bundle),
        sources: outputSources,
        reason: "Promoted from LLM handoff workflow for durable reuse."
      });
    }

    outputResult = {
      outputPath: output.outputPath,
      archivedPath: output.archivedPath || "",
      promotedPath
    };
  }

  appendJsonl(path.join(root, "logs", "actions", "research_handoff.jsonl"), {
    event: "research_handoff",
    at: new Date().toISOString(),
    topic: bundle.topic || "",
    question: bundle.question || "",
    requested_sources: Array.isArray(bundle.sources) ? bundle.sources.length : 0,
    staged_sources: staged.staged.length,
    ingested_sources: ingestResult.ingested,
    local_context_sources: localSources.length,
    failures: staged.failures.length,
    output_path: outputResult?.outputPath || "",
    watch_subject: watch?.subject || ""
  });

  return {
    stagedSources: staged.staged,
    localSources,
    failures: staged.failures,
    ingested: ingestResult.ingested,
    ingestedResults: ingestResult.results,
    compileResult,
    outputResult,
    watch,
    handoffDir: relativeToRoot(root, staged.handoffDir)
  };
}

module.exports = {
  captureResearch
};
