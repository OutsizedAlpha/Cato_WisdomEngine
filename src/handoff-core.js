const fs = require("node:fs");
const path = require("node:path");
const { captureResearch } = require("./research-handoff");
const { appendJsonl, nowIso, readText, relativeToRoot, timestampStamp, uniquePath, writeJson, writeText } = require("./utils");

const PLACEHOLDER_MARKER = "<!-- MODEL_AUTHOR_REPLACE_THIS_SCAFFOLD -->";

function scaffoldBody(body, fallbackTitle) {
  const trimmed = String(body || "").trim() || `# ${fallbackTitle}`;
  return `${PLACEHOLDER_MARKER}\n\n${trimmed}\n`;
}

function createPackFileSet(root, cacheDir, slugSeed) {
  const basePath = uniquePath(path.join(root, cacheDir, `${timestampStamp()}-${slugSeed}`));
  return {
    packPath: `${basePath}-pack.json`,
    promptPath: `${basePath}-prompt.md`,
    capturePath: `${basePath}-capture.json`
  };
}

function writePackArtifacts(root, options) {
  const paths = createPackFileSet(root, options.cacheDir, options.slugSeed);
  const relativePaths = {
    packPath: relativeToRoot(root, paths.packPath),
    promptPath: relativeToRoot(root, paths.promptPath),
    capturePath: relativeToRoot(root, paths.capturePath)
  };
  const pack = typeof options.pack === "function" ? options.pack(relativePaths) : options.pack;
  const captureBundle =
    typeof options.captureBundle === "function" ? options.captureBundle(relativePaths) : options.captureBundle;
  const promptMarkdown =
    typeof options.promptMarkdown === "function" ? options.promptMarkdown(relativePaths) : options.promptMarkdown;

  writeJson(paths.packPath, pack);
  writeJson(paths.capturePath, captureBundle);
  writeText(paths.promptPath, promptMarkdown);

  if (options.logFile && options.logEntry) {
    appendJsonl(path.join(root, options.logFile), {
      at: nowIso(),
      ...options.logEntry(relativePaths)
    });
  }

  return relativePaths;
}

function resolveBundlePath(root, bundleInput, label = "Capture") {
  const bundlePath = path.isAbsolute(bundleInput) ? bundleInput : path.join(root, bundleInput);
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`${label} bundle not found: ${bundlePath}`);
  }
  return bundlePath;
}

function assertCaptureBundleReady(bundle, options = {}) {
  const label = options.label || "Capture";
  const body = String(bundle.output?.body || "").trim();
  if (!body) {
    throw new Error(`${label} bundle does not contain any authored body.`);
  }
  for (const check of options.placeholderChecks || []) {
    if (check.test(body)) {
      throw new Error(check.message);
    }
  }
  if (!String(bundle.model || "").trim()) {
    throw new Error(`${label} bundle must record the active terminal model/session label in \`model\` before capture.`);
  }
  return body;
}

function captureTerminalModelBundle(root, bundleInput, options = {}) {
  const bundlePath = resolveBundlePath(root, bundleInput, options.label);
  const bundle = JSON.parse(readText(bundlePath));
  assertCaptureBundleReady(bundle, {
    label: options.label,
    placeholderChecks: options.placeholderChecks || []
  });

  const result = captureResearch(root, bundlePath, {
    ...(options.captureOptions || {}),
    generationMode: typeof options.generationMode === "function" ? options.generationMode(bundle) : options.generationMode
  });

  if (typeof options.afterCapture === "function") {
    options.afterCapture(bundle, result, bundlePath);
  }

  if (options.logFile && options.logEvent) {
    appendJsonl(path.join(root, options.logFile), {
      event: options.logEvent,
      at: nowIso(),
      bundle_path: relativeToRoot(root, bundlePath),
      model: bundle.model || "",
      authoring_session: bundle.authoring_session || "",
      output_path: result.outputResult?.outputPath || "",
      archived_previous_path: result.outputResult?.archivedPath || "",
      local_context_sources: result.localSources.length,
      imported_sources: result.ingested,
      ...(typeof options.logFields === "function" ? options.logFields(bundle, result) : {})
    });
  }

  return result;
}

module.exports = {
  PLACEHOLDER_MARKER,
  assertCaptureBundleReady,
  captureTerminalModelBundle,
  createPackFileSet,
  resolveBundlePath,
  scaffoldBody,
  writePackArtifacts
};
