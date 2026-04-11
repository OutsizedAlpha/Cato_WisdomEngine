function joinedPositionals(parsed) {
  return parsed.positionals.join(" ").trim();
}

function requireValue(value, message) {
  if (!String(value || "").trim()) {
    throw new Error(message);
  }
  return String(value).trim();
}

function logAuthoredPack(result) {
  console.log(`Authored pack: ${result.packPath}`);
  console.log(`Prompt: ${result.promptPath}`);
  console.log(`Capture bundle: ${result.capturePath}`);
  console.log(`Final output path: ${result.outputPath}`);
}

function authoredPackCommand(writeAuthoredPack, kind, config = {}) {
  return {
    run(root, parsed) {
      const fallbackTitle = config.fallbackTitle || "";
      const seed = joinedPositionals(parsed) || fallbackTitle || "";
      const topic = config.errorMessage ? requireValue(seed, config.errorMessage) : seed;
      const result = writeAuthoredPack(root, kind, topic, parsed.options);
      logAuthoredPack(result);
      return result;
    }
  };
}

function captureCommand(handler, example, renderResult) {
  return {
    run(root, parsed) {
      const bundlePath = requireValue(joinedPositionals(parsed), example);
      const result = handler(root, bundlePath, parsed.options);
      renderResult(result, bundlePath);
      return result;
    }
  };
}

function applyCommandMiddleware(registry, middleware) {
  for (const [command, entry] of Object.entries(registry)) {
    if (!entry || typeof entry.run !== "function") {
      continue;
    }
    const originalRun = entry.run;
    entry.run = (root, parsed) => middleware({
      command,
      root,
      parsed,
      next: () => originalRun(root, parsed)
    });
  }
  return registry;
}

module.exports = {
  applyCommandMiddleware,
  authoredPackCommand,
  captureCommand,
  joinedPositionals,
  requireValue
};
