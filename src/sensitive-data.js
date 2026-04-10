const fs = require("node:fs");
const path = require("node:path");

const SENSITIVE_PATTERNS = [
  {
    label: "private_key",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/gi
  },
  {
    label: "aws_access_key",
    pattern: /AKIA[0-9A-Z]{16}/g
  },
  {
    label: "github_token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g
  },
  {
    label: "github_pat",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g
  },
  {
    label: "openai_style_key",
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/g
  },
  {
    label: "bearer_token",
    pattern: /\bBearer\s+[A-Za-z0-9._=-]{20,}\b/gi
  },
  {
    label: "keyword_secret_value",
    pattern: /\b(?:api[_-]?key|access[_-]?key|secret|token|password)\b[^\r\n:=]{0,24}[:=]\s*["']?[A-Za-z0-9/_+=.-]{16,}["']?/gi
  }
];

const TEXT_SCAN_EXTENSIONS = new Set([
  ".env",
  ".cfg",
  ".conf",
  ".config",
  ".cs",
  ".env.local",
  ".env.production",
  ".env.development",
  ".go",
  ".html",
  ".htm",
  ".ini",
  ".java",
  ".js",
  ".jsx",
  ".json",
  ".jsonl",
  ".mjs",
  ".md",
  ".markdown",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".toml",
  ".txt",
  ".ts",
  ".tsx",
  ".csv",
  ".tsv",
  ".xml",
  ".yaml",
  ".yml",
  ".rtf"
]);

const TEXT_SCAN_BASENAMES = new Set([
  ".env",
  ".git-credentials",
  ".npmrc",
  ".pypirc",
  "dockerfile",
  "makefile"
]);

function maskMatch(match) {
  const value = String(match || "");
  if (!value) {
    return "";
  }
  if (/PRIVATE KEY/i.test(value)) {
    return value.replace(/PRIVATE KEY/gi, "PRIVATE KEY (masked)");
  }
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 12) {
    return "*".repeat(trimmed.length);
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function maskLine(line, pattern) {
  return String(line || "").replace(pattern, (match) => maskMatch(match));
}

function pushHit(hits, label, lineNumber, lineText) {
  const masked = String(lineText || "").trim();
  if (!masked) {
    return;
  }
  const key = `${label}:${lineNumber}:${masked}`;
  if (hits.some((hit) => hit.key === key)) {
    return;
  }
  hits.push({
    key,
    label,
    line: lineNumber,
    preview: masked
  });
}

function scanTextForSensitiveData(text, options = {}) {
  const maxHits = Number(options.maxHits || 20);
  const sourceLabel = String(options.sourceLabel || "");
  const hits = [];
  const lines = String(text || "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    for (const entry of SENSITIVE_PATTERNS) {
      entry.pattern.lastIndex = 0;
      if (!entry.pattern.test(line)) {
        continue;
      }
      pushHit(hits, entry.label, index + 1, maskLine(line, entry.pattern));
      if (hits.length >= maxHits) {
        return {
          flagged: true,
          sourceLabel,
          hits: hits.map(({ key, ...hit }) => hit)
        };
      }
    }
  }

  return {
    flagged: hits.length > 0,
    sourceLabel,
    hits: hits.map(({ key, ...hit }) => hit)
  };
}

function summarizeSensitiveHits(hits) {
  const counts = new Map();
  for (const hit of Array.isArray(hits) ? hits : []) {
    counts.set(hit.label, (counts.get(hit.label) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, count]) => `${label}:${count}`)
    .join(", ");
}

function mergeSensitiveScanResults(results = []) {
  const hits = [];
  for (const result of results) {
    if (!result?.flagged) {
      continue;
    }
    for (const hit of result.hits || []) {
      const key = `${result.sourceLabel || ""}:${hit.label}:${hit.line}:${hit.preview}`;
      if (hits.some((entry) => entry.key === key)) {
        continue;
      }
      hits.push({
        key,
        source: result.sourceLabel || "",
        label: hit.label,
        line: hit.line,
        preview: hit.preview
      });
    }
  }
  return {
    flagged: hits.length > 0,
    hits: hits.map(({ key, ...hit }) => hit),
    summary: summarizeSensitiveHits(hits)
  };
}

function canScanFileAsText(filePath) {
  const normalized = String(filePath || "");
  const extension = path.extname(normalized).toLowerCase();
  const baseName = path.basename(normalized).toLowerCase();
  return TEXT_SCAN_EXTENSIONS.has(extension) || TEXT_SCAN_BASENAMES.has(baseName);
}

function scanFileForSensitiveData(filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath) || !canScanFileAsText(filePath)) {
    return {
      flagged: false,
      sourceLabel: options.sourceLabel || path.basename(String(filePath || "")),
      hits: []
    };
  }
  return scanTextForSensitiveData(fs.readFileSync(filePath, "utf8"), {
    sourceLabel: options.sourceLabel || path.basename(filePath),
    maxHits: options.maxHits
  });
}

function scanDirectoryForSensitiveData(directoryPath, options = {}) {
  const maxFiles = Number(options.maxFiles || 200);
  const maxHits = Number(options.maxHits || 20);
  const rootLabel = String(options.sourceLabel || path.basename(String(directoryPath || "")));
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    return {
      flagged: false,
      sourceLabel: rootLabel,
      hits: []
    };
  }

  const queue = [directoryPath];
  const scans = [];
  let scannedFiles = 0;

  while (queue.length && scannedFiles < maxFiles) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (scannedFiles >= maxFiles) {
        break;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if ([".git", "node_modules", ".venv", "__pycache__"].includes(entry.name.toLowerCase())) {
          continue;
        }
        queue.push(fullPath);
        continue;
      }
      if (!canScanFileAsText(fullPath)) {
        continue;
      }
      scannedFiles += 1;
      scans.push(
        scanFileForSensitiveData(fullPath, {
          sourceLabel: `${rootLabel}:${path.relative(directoryPath, fullPath).replace(/\\/g, "/")}`,
          maxHits
        })
      );
    }
  }

  return mergeSensitiveScanResults(scans);
}

module.exports = {
  SENSITIVE_PATTERNS,
  canScanFileAsText,
  mergeSensitiveScanResults,
  scanDirectoryForSensitiveData,
  scanFileForSensitiveData,
  scanTextForSensitiveData,
  summarizeSensitiveHits
};
