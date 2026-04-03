const { loadSelfNotes, noteSummary, writeOutputDocument } = require("./research");

function groupedSelfNotes(selfNotes) {
  const groups = new Map();
  for (const note of selfNotes) {
    if (!groups.has(note.category)) {
      groups.set(note.category, []);
    }
    groups.get(note.category).push(note);
  }
  return groups;
}

function buildPrinciplesBody(selfNotes) {
  const groups = groupedSelfNotes(
    selfNotes.filter((note) =>
      ["principles", "portfolio-philosophy", "heuristics", "decision-rules", "communication-style"].includes(note.category)
    )
  );
  const lines = ["# Principles Snapshot", "", "## Current Active Self-Model Surfaces", ""];

  if (!groups.size) {
    lines.push("- No active principles or heuristics recorded yet.");
    return `${lines.join("\n").trim()}\n`;
  }

  for (const category of [...groups.keys()].sort()) {
    lines.push(`## ${category}`);
    for (const note of groups.get(category).sort((left, right) => left.title.localeCompare(right.title))) {
      lines.push(`- ${note.title}: ${noteSummary(note, 180)}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function writePrinciplesSnapshot(root) {
  const selfNotes = loadSelfNotes(root);
  const output = writeOutputDocument(root, {
    idPrefix: "PRINCIPLES",
    kind: "principles-snapshot",
    title: "Principles Snapshot",
    outputDir: "outputs/memos",
    fileSlug: "principles-snapshot",
    body: buildPrinciplesBody(selfNotes),
    sources: selfNotes.map((note) => note.relativePath)
  });

  return {
    outputPath: output.outputPath,
    selfNotes: selfNotes.length
  };
}

module.exports = {
  writePrinciplesSnapshot
};
