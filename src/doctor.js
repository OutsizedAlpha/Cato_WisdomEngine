const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { lintProject } = require("./lint");
const { STRUCTURE_DIRS } = require("./constants");
const { probePythonPackages, QUANT_REQUIREMENTS_FILE } = require("./python-runtime");
const { ensureProjectStructure, listMarkdownNotes, loadSettings } = require("./project");
const { nowIso, readJson, relativeToRoot, timestampStamp, writeText } = require("./utils");

function quoteCmdArg(value) {
  const stringValue = String(value);
  if (!/[\s"]/u.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function runCommand(command, args, options = {}) {
  const baseOptions = {
    encoding: "utf8",
    windowsHide: true,
    ...options
  };
  const isCmdShim = process.platform === "win32" && ["npm", "npx"].includes(String(command).toLowerCase());
  const result = isCmdShim
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", [command, ...args].map(quoteCmdArg).join(" ")], baseOptions)
    : spawnSync(command, args, baseOptions);
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  const message = stdout || stderr || result.error?.message || `Exited with status ${result.status}.`;
  return {
    ok: result.status === 0,
    status: result.status,
    stdout,
    stderr,
    message
  };
}

function firstNonEmptyLine(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

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

function checkPythonReadiness(root) {
  const wrapperPath = path.join(root, "python.cmd");
  const pyWrapperPath = path.join(root, "py.cmd");
  const pythonVersion = runCommand("python", ["--version"], { cwd: root });
  const pyVersion = runCommand("py", ["--version"], { cwd: root });
  const packageCheck = probePythonPackages(root);

  if (process.platform !== "win32") {
    return {
      ok: pythonVersion.ok && packageCheck.ok,
      runtimeOk: pythonVersion.ok,
      packageCheck,
      message: pythonVersion.ok ? pythonVersion.message : "Python unavailable in this shell.",
      resolution: "non-windows",
      pythonVersion: pythonVersion.message,
      pyVersion: pyVersion.message
    };
  }

  const wherePython = runCommand("where.exe", ["python"], { cwd: root });
  const resolvedPython = firstNonEmptyLine(wherePython.stdout);
  const repoWrapperActive =
    Boolean(resolvedPython) &&
    path.resolve(resolvedPython).toLowerCase() === path.resolve(wrapperPath).toLowerCase();

  const wrapperNotes = [];
  if (fs.existsSync(wrapperPath)) {
    wrapperNotes.push("python.cmd present");
  }
  if (fs.existsSync(pyWrapperPath)) {
    wrapperNotes.push("py.cmd present");
  }

  if (!pythonVersion.ok) {
    return {
      ok: false,
      runtimeOk: false,
      packageCheck,
      message: "Python unavailable in the repo shell.",
      resolution: resolvedPython || "unresolved",
      pythonVersion: pythonVersion.message,
      pyVersion: pyVersion.message,
      repoWrapperActive
    };
  }

  const versionLabel = pythonVersion.message.replace(/^Python\s+/i, "Python ");
  const viaLabel = repoWrapperActive ? "repo-local wrapper active" : "shell-resolved";
  const wrapperLabel = wrapperNotes.length ? `; ${wrapperNotes.join(", ")}` : "";
  const packageLabel = packageCheck.packages.length ? `; ${packageCheck.message}` : "";

  return {
    ok: packageCheck.ok,
    runtimeOk: true,
    packageCheck,
    message: `${versionLabel} (${viaLabel}${wrapperLabel}${packageLabel})`,
    resolution: resolvedPython || "resolved without where.exe output",
    pythonVersion: pythonVersion.message,
    pyVersion: pyVersion.message,
    repoWrapperActive
  };
}

function checkPlaywrightLaunch(root) {
  const npmRoot = runCommand("npm", ["root", "-g"], { cwd: root });
  if (!npmRoot.ok) {
    return {
      ok: false,
      message: `npm root -g failed: ${npmRoot.message}`
    };
  }

  const globalRoot = firstNonEmptyLine(npmRoot.stdout);
  const playwrightEntry = path.join(globalRoot, "playwright");
  if (!globalRoot || !fs.existsSync(playwrightEntry)) {
    return {
      ok: false,
      message: "Global Playwright package was not found under npm root -g."
    };
  }

  const smokeScript = `
const path = require("node:path");
const { chromium } = require(path.resolve(process.argv[1]));
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("data:text/html,<title>playwright-ok</title><h1>ready</h1>");
  process.stdout.write(await page.title());
  await browser.close();
})().catch((error) => {
  process.stderr.write(String(error && error.message ? error.message : error));
  process.exit(1);
});
`.trim();
  const launch = runCommand("node", ["-e", smokeScript, playwrightEntry], { cwd: root });
  return {
    ok: launch.ok,
    message: launch.ok ? `Headless Chromium launch ok (${launch.message}).` : `Headless Chromium launch failed: ${launch.message}`
  };
}

function checkBrowserAutomation(root) {
  const playwrightVersion = runCommand("npx", ["playwright", "--version"], { cwd: root });
  const playwrightLaunch = playwrightVersion.ok
    ? checkPlaywrightLaunch(root)
    : {
        ok: false,
        message: "Skipped because Playwright CLI is unavailable."
      };
  const puppeteerVersion = runCommand("npx", ["puppeteer", "--version"], { cwd: root });
  const ok = playwrightVersion.ok && playwrightLaunch.ok && puppeteerVersion.ok;
  const failures = [];

  if (!playwrightVersion.ok) {
    failures.push(`Playwright CLI unavailable: ${playwrightVersion.message}`);
  }
  if (playwrightVersion.ok && !playwrightLaunch.ok) {
    failures.push(playwrightLaunch.message);
  }
  if (!puppeteerVersion.ok) {
    failures.push(`Puppeteer CLI unavailable: ${puppeteerVersion.message}`);
  }

  return {
    ok,
    message: failures.length ? failures.join(" | ") : "Playwright and Puppeteer available.",
    playwrightCli: playwrightVersion.message,
    playwrightLaunch: playwrightLaunch.message,
    puppeteerCli: puppeteerVersion.message
  };
}

function runDoctor(root, options = {}) {
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
  const ocrCheck = options.ocrCheck || checkWindowsOcr();
  const pythonCheck = options.pythonCheck || checkPythonReadiness(root);
  const browserCheck = options.browserCheck || checkBrowserAutomation(root);
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
  if (pythonCheck.runtimeOk === false) {
    issues.push(`Python unavailable: ${pythonCheck.message}`);
  }
  if (pythonCheck.runtimeOk !== false && pythonCheck.packageCheck && !pythonCheck.packageCheck.ok) {
    issues.push(`Python package contract unavailable: ${pythonCheck.packageCheck.message}`);
  }
  if (!browserCheck.ok) {
    issues.push(`Browser automation unavailable: ${browserCheck.message}`);
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
    `- Python in repo shell: ${pythonCheck.message}`,
    `- Python resolution: ${pythonCheck.resolution || "n/a"}`,
    `- Python package contract: ${pythonCheck.packageCheck?.message || `Not checked against ${QUANT_REQUIREMENTS_FILE}.`}`,
    `- Python package contract file: ${pythonCheck.packageCheck?.requirementsPath || QUANT_REQUIREMENTS_FILE}`,
    `- Playwright CLI: ${browserCheck.playwrightCli}`,
    `- Playwright browser launch: ${browserCheck.playwrightLaunch}`,
    `- Puppeteer CLI: ${browserCheck.puppeteerCli}`,
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
    "## Python Package Snapshot",
    "",
    ...(pythonCheck.packageCheck?.packages?.length
      ? pythonCheck.packageCheck.packages.map(
          (pkg) =>
            `- ${pkg.packageName}: required ${pkg.requiredVersion || "any"}, installed ${pkg.installedVersion || "missing"}${
              pkg.ok ? "" : ` (${pkg.reason || "mismatch"})`
            }`
        )
      : ["- No pinned Python package snapshot available."]),
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
    lintIssues: lintResult.issues.length,
    pythonCheck,
    browserCheck
  };
}

module.exports = {
  runDoctor
};
