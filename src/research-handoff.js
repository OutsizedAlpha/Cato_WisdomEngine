const path = require("node:path");
const fs = require("node:fs");
const { compileProject } = require("./compile");
const { ingest } = require("./ingest");
const { parseFrontmatter, sectionContent } = require("./markdown");
const { ensureProjectStructure, loadSettings } = require("./project");
const { promoteOutputToSynthesis, writeOutputDocument } = require("./research");
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

function normalizeOutputPayload(bundle, stagedSummary = "") {
  const body = String(bundle.output?.body || "").trim();
  if (!body) {
    return {
      body: `# ${inferOutputTitle(bundle)}\n\nNo output body was provided in the research handoff bundle.\n${stagedSummary}`,
      frontmatter: {}
    };
  }

  const parsed = parseFrontmatter(body);
  const cleanedBody = parsed.frontmatter && Object.keys(parsed.frontmatter).length ? parsed.body.trim() : body;
  const frontmatter = parsed.frontmatter && Object.keys(parsed.frontmatter).length ? parsed.frontmatter : {};
  if (!stagedSummary) {
    return {
      body: cleanedBody,
      frontmatter
    };
  }
  if (sectionContent(cleanedBody, "Imported Source Capture")) {
    return {
      body: cleanedBody,
      frontmatter
    };
  }
  return {
    body: `${cleanedBody}\n\n${stagedSummary}`.trim(),
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
    const outputPayload = normalizeOutputPayload(bundle, renderImportedSourceSection(ingestResult.results));
    const output = writeOutputDocument(root, {
      idPrefix: config.idPrefix,
      kind: config.kind,
      title: inferOutputTitle(bundle),
      outputDir: config.outputDir,
      fileSlug: inferOutputTitle(bundle),
      body: outputPayload.body,
      sources: ingestResult.results.map((record) => record.note_path),
      frontmatter: {
        ...outputPayload.frontmatter,
        ...config.frontmatter,
        generation_mode: "llm_handoff",
        handoff_topic: bundle.topic || "",
        handoff_question: bundle.question || "",
        watch_profile: watch?.watchResult?.profilePath || "",
        imported_sources: ingestResult.results.length,
        imported_failures: staged.failures.length
      }
    });

    let promotedPath = "";
    if (options.promote || bundle.output.promote) {
      promotedPath = promoteOutputToSynthesis(root, output.outputPath, {
        title: inferOutputTitle(bundle),
        sources: ingestResult.results.map((record) => record.note_path),
        reason: "Promoted from LLM handoff workflow for durable reuse."
      });
    }

    outputResult = {
      outputPath: output.outputPath,
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
    failures: staged.failures.length,
    output_path: outputResult?.outputPath || "",
    watch_subject: watch?.subject || ""
  });

  return {
    stagedSources: staged.staged,
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
