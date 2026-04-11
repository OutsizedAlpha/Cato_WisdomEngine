const { spawnSync } = require("node:child_process");

const DEFAULT_WEB_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function toPowerShellLiteral(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function runPowerShell(script, options = {}) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
    timeout: options.timeoutMs,
    cwd: options.cwd
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "PowerShell command failed.").trim());
  }

  return result.stdout || "";
}

function buildHeaderScript(headers = {}) {
  const normalized = {
    "User-Agent": DEFAULT_WEB_USER_AGENT,
    ...headers
  };
  const lines = ["$headers = @{}"];
  for (const [key, value] of Object.entries(normalized)) {
    lines.push(`$headers[${toPowerShellLiteral(key)}] = ${toPowerShellLiteral(value)}`);
  }
  return lines.join("\n");
}

function invokeWebRequest(options = {}) {
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
${buildHeaderScript(options.headers)}
$response = Invoke-WebRequest -UseBasicParsing -Uri ${toPowerShellLiteral(options.url)} ${options.outFile ? `-OutFile ${toPowerShellLiteral(options.outFile)}` : ""} -Headers $headers -TimeoutSec ${Number(options.timeoutSec || 30)}
$contentType = ''
if ($response.Headers -and $response.Headers['Content-Type']) {
  $contentType = [string]$response.Headers['Content-Type']
}
$finalUrl = ''
if ($response.BaseResponse -and $response.BaseResponse.ResponseUri) {
  $finalUrl = $response.BaseResponse.ResponseUri.AbsoluteUri
}
[pscustomobject]@{
  content = ${options.outFile ? "''" : "[string]$response.Content"}
  final_url = $finalUrl
  content_type = $contentType
} | ConvertTo-Json -Depth 5
`.trim();

  return JSON.parse(
    runPowerShell(script, {
      maxBuffer: options.maxBuffer,
      timeoutMs: options.timeoutMs,
      cwd: options.cwd
    }).trim() || "{}"
  );
}

module.exports = {
  DEFAULT_WEB_USER_AGENT,
  invokeWebRequest,
  runPowerShell,
  toPowerShellLiteral
};
