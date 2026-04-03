const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { lintProject } = require("./lint");
const { STRUCTURE_DIRS } = require("./constants");
const { ensureProjectStructure, listMarkdownNotes, loadSettings } = require("./project");
const { nowIso, readJson, relativeToRoot, timestampStamp, writeText } = require("./utils");

function checkWindowsOcr() {
  if (process.platform !== "win32") {
    return { ok: false, message: "Windows OCR check skipped on non-Windows platform." };
  }

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$t = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]; if ($null -ne $t) { 'OK' }"
    ],
    { encoding: "utf8", windowsHide: true }
  );

  if (result.status === 0 && String(result.stdout || "").trim() === "OK") {
    return { ok: true, message: "Windows OCR runtime available." };
  }

  return {
    ok: false,
    message: (result.stderr || result.stdout || "Windows OCR runtime unavailable.").trim()
  };
}

function runDoctor(root) {
  ensureProjectStructure(root);
  const settings = loadSettings(root);
  const lintResult = lintProject(root);
  const requiredPaths = STRUCTURE_DIRS.map((relativeDir) => ({
    relativeDir,
    exists: fs.existsSync(path.join(root, relativeDir))
  }));
  const missingDirs = requiredPaths.filter((entry) => !entry.exists).map((entry) => entry.relativeDir);
  const fileHashes = readJson(path.join(root, "manifests", "file_hashes.json"), {});
  const sourceNotes = listMarkdownNotes(root, "wiki/source-notes").length;
  const outputs = listMarkdownNotes(root, "outputs").length;
  const selfNotes = listMarkdownNotes(root, "wiki/self").length;
  const ocrCheck = checkWindowsOcr();
  const issues = [];

  if (missingDirs.length) {
    issues.push(`Missing expected directories: ${missingDirs.join(", ")}`);
  }
  if (!fs.existsSync(path.join(root, "config", "ontology.json"))) {
    issues.push("Missing ontology.json.");
  }
  if (!fs.existsSync(path.join(root, ".git"))) {
    issues.push("Repository is not initialised as a git repo.");
  }
  if (!ocrCheck.ok && process.platform === "win32") {
    issues.push(`Windows OCR unavailable: ${ocrCheck.message}`);
  }

  const lines = [
    "# Doctor Report",
    "",
    `Generated: ${nowIso()}`,
    "",
    "## Runtime",
    "",
    `- Node: ${process.version}`,
    `- Platform: ${process.platform}`,
    `- Git repo present: ${fs.existsSync(path.join(root, ".git")) ? "yes" : "no"}`,
    `- OCR readiness: ${ocrCheck.message}`,
    "",
    "## Project Health",
    "",
    `- Missing directories: ${missingDirs.length}`,
    `- Source notes: ${sourceNotes}`,
    `- Self notes: ${selfNotes}`,
    `- Markdown outputs: ${outputs}`,
    `- Tracked file hashes: ${Object.keys(fileHashes).length}`,
    `- Default ask output: ${settings.ask?.outputDirectory || "outputs/memos"}`,
    "",
    "## Lint Snapshot",
    "",
    `- Report: \`${lintResult.reportPath}\``,
    `- Issues: ${lintResult.issues.length}`,
    "",
    "## Findings",
    ""
  ];

  if (!issues.length) {
    lines.push("- No blocking structural issues detected.");
  } else {
    for (const issue of issues) {
      lines.push(`- ${issue}`);
    }
  }

  lines.push("");
  lines.push("## Next Actions");
  lines.push("");
  lines.push("- Run `compile` after meaningful ingest or self-ingest changes.");
  lines.push("- Keep lint warnings near zero before trusting generated outputs.");
  lines.push("- Decide whether to embed API-backed model execution only when unattended workflows become important.");
  lines.push("");

  const reportPath = path.join(root, "logs", "report_runs", `doctor-${timestampStamp()}.md`);
  writeText(reportPath, `${lines.join("\n").trim()}\n`);

  return {
    reportPath: relativeToRoot(root, reportPath),
    issues,
    lintIssues: lintResult.issues.length
  };
}

module.exports = {
  runDoctor
};
