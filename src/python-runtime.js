const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const QUANT_REQUIREMENTS_FILE = "requirements-quant.txt";
const DEFAULT_QUANT_REQUIREMENTS_TEXT = `numpy==2.4.2
pandas==2.3.3
scipy==1.17.1
scikit-learn==1.8.0
PyMuPDF==1.27.2
pypdfium2==5.6.0
Pillow==12.1.1
`;

const PACKAGE_IMPORT_NAMES = {
  "scikit-learn": "sklearn",
  PyMuPDF: "fitz",
  Pillow: "PIL"
};

function pythonInvocations() {
  if (process.platform === "win32") {
    return [
      { command: "python", args: [] },
      { command: "py", args: ["-3"] },
      { command: "py", args: [] }
    ];
  }
  return [
    { command: "python3", args: [] },
    { command: "python", args: [] }
  ];
}

function runPython(root, args = [], options = {}) {
  let lastResult = null;
  for (const invocation of pythonInvocations()) {
    const result = spawnSync(invocation.command, [...invocation.args, ...args], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
      timeout: options.timeoutMs
    });
    const runner = [invocation.command, ...invocation.args].join(" ");
    if (result.status === 0) {
      return {
        ok: true,
        status: result.status,
        stdout: String(result.stdout || ""),
        stderr: String(result.stderr || ""),
        runner
      };
    }
    lastResult = {
      ok: false,
      status: result.status,
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
      runner,
      error: result.error
    };
  }

  return {
    ok: false,
    status: lastResult?.status ?? 1,
    stdout: lastResult?.stdout || "",
    stderr: lastResult?.stderr || "",
    runner: lastResult?.runner || "",
    error: lastResult?.error || null
  };
}

function runPythonInline(root, code, options = {}) {
  return runPython(root, ["-c", String(code || "")], options);
}

function runPythonScript(root, scriptPath, scriptArgs = [], options = {}) {
  return runPython(root, [scriptPath, ...scriptArgs], options);
}

function importNameForPackage(packageName) {
  return PACKAGE_IMPORT_NAMES[packageName] || packageName;
}

function readQuantRequirements(root) {
  const requirementsPath = path.join(root, QUANT_REQUIREMENTS_FILE);
  if (!fs.existsSync(requirementsPath)) {
    return [];
  }
  return fs
    .readFileSync(requirementsPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [packageName, requiredVersion = ""] = line.split("==").map((value) => value.trim());
      return {
        packageName,
        requiredVersion,
        importName: importNameForPackage(packageName)
      };
    });
}

function probePythonPackages(root, options = {}) {
  const requirements = options.requirements || readQuantRequirements(root);
  if (!requirements.length) {
    return {
      ok: true,
      message: "No Python package contract found.",
      packages: [],
      requirementsPath: QUANT_REQUIREMENTS_FILE,
      runner: ""
    };
  }

  const requirementsJson = JSON.stringify(requirements).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const code = `
import json
from importlib.metadata import PackageNotFoundError, version

requirements = json.loads('${requirementsJson}')
results = []
for item in requirements:
    package_name = item["packageName"]
    required_version = item["requiredVersion"]
    import_name = item["importName"]
    try:
        __import__(import_name)
        installed_version = version(package_name)
        ok = (not required_version) or installed_version == required_version
        results.append({
            "packageName": package_name,
            "importName": import_name,
            "requiredVersion": required_version,
            "installedVersion": installed_version,
            "ok": ok,
            "reason": "" if ok else f"expected {required_version}, found {installed_version}"
        })
    except PackageNotFoundError:
        results.append({
            "packageName": package_name,
            "importName": import_name,
            "requiredVersion": required_version,
            "installedVersion": "",
            "ok": False,
            "reason": "package not installed"
        })
    except Exception as exc:
        results.append({
            "packageName": package_name,
            "importName": import_name,
            "requiredVersion": required_version,
            "installedVersion": "",
            "ok": False,
            "reason": str(exc)
        })
print(json.dumps(results))
`.trim();

  const result = runPythonInline(root, code, {
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
    timeoutMs: options.timeoutMs || 120_000
  });
  if (!result.ok) {
    return {
      ok: false,
      message: (result.stderr || result.stdout || result.error?.message || "Python package probe failed.").trim(),
      packages: [],
      requirementsPath: QUANT_REQUIREMENTS_FILE,
      runner: result.runner || ""
    };
  }

  const packages = JSON.parse(String(result.stdout || "[]").trim() || "[]");
  const ok = packages.every((entry) => entry.ok);
  const satisfied = packages.filter((entry) => entry.ok).length;
  return {
    ok,
    message: ok
      ? `${satisfied}/${packages.length} pinned Python packages satisfied.`
      : `${satisfied}/${packages.length} pinned Python packages satisfied.`,
    packages,
    requirementsPath: QUANT_REQUIREMENTS_FILE,
    runner: result.runner || ""
  };
}

module.exports = {
  DEFAULT_QUANT_REQUIREMENTS_TEXT,
  QUANT_REQUIREMENTS_FILE,
  pythonInvocations,
  readQuantRequirements,
  runPython,
  runPythonInline,
  runPythonScript,
  probePythonPackages
};
