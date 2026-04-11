const path = require("node:path");
const { workingMemoryLocalSources } = require("./memory");
const { resolveSelfModelContext } = require("./self-model");

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

function selfModelLocalSources(context) {
  const sources = [
    makeLocalSource("wiki/self/current-operating-constitution.md", "Current Operating Constitution", "self-model"),
    ...context.sourceNotes.slice(0, 8).map((note) => makeLocalSource(note.relative_path, note.title, "self-note"))
  ];

  if (context.applicability.includes("investment") || context.applicability.includes("macro") || context.applicability.includes("valuation")) {
    sources.push(makeLocalSource("wiki/self/mode-profiles/investment-research.md", "Investment Research", "mode-profile"));
  }
  if (context.applicability.includes("trading")) {
    sources.push(makeLocalSource("wiki/self/mode-profiles/trading.md", "Trading", "mode-profile"));
  }
  if (context.applicability.includes("writing")) {
    sources.push(makeLocalSource("wiki/self/mode-profiles/communication.md", "Communication", "mode-profile"));
  }

  return uniqueLocalSources(sources);
}

function resolvePackContext(root, options = {}) {
  const context = resolveSelfModelContext(root, {
    command: options.command || "",
    topic: options.topic || "",
    applicability: options.applicability
  });
  const localSources = uniqueLocalSources([
    ...(options.baseSources || []),
    ...(options.includeWorkingMemory === false ? [] : workingMemoryLocalSources(root)),
    ...selfModelLocalSources(context)
  ]);
  return {
    selfModel: context,
    localSources
  };
}

function summarizeLocalSources(localSources, limit = 18) {
  return localSources
    .slice(0, limit)
    .map((source) => `- \`${source.path}\`${source.role ? ` (${source.role})` : ""}`)
    .join("\n");
}

module.exports = {
  makeLocalSource,
  resolvePackContext,
  selfModelLocalSources,
  summarizeLocalSources,
  uniqueLocalSources
};
