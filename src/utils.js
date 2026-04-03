const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureFile(filePath, defaultContent = "") {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultContent, "utf8");
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, data) {
  writeText(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function appendJsonl(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`, "utf8");
}

function listFilesRecursive(targetDir) {
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  const results = [];
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const fullPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function computeHash(filePath) {
  const contents = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function relativeToRoot(root, fullPath) {
  return toPosixPath(path.relative(root, fullPath));
}

function nowIso() {
  return new Date().toISOString();
}

function dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function timestampStamp(date = new Date()) {
  return date.toISOString().replace(/[:]/g, "-");
}

function titleFromFilename(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function uniquePath(filePath) {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }
  const directory = path.dirname(filePath);
  const extension = path.extname(filePath);
  const stem = path.basename(filePath, extension);
  let counter = 2;
  while (true) {
    const candidate = path.join(directory, `${stem}-${counter}${extension}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

function makeId(prefix, seed) {
  return `${prefix}-${new Date().getUTCFullYear()}-${String(seed).slice(0, 12).toUpperCase()}`;
}

function truncate(value, length = 240) {
  const text = String(value || "").trim();
  if (text.length <= length) {
    return text;
  }
  return `${text.slice(0, length - 1).trimEnd()}…`;
}

function moveFile(sourcePath, destinationPath) {
  ensureDir(path.dirname(destinationPath));
  fs.renameSync(sourcePath, destinationPath);
}

function copyFile(sourcePath, destinationPath) {
  ensureDir(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
}

module.exports = {
  appendJsonl,
  computeHash,
  copyFile,
  dateStamp,
  ensureDir,
  ensureFile,
  listFilesRecursive,
  makeId,
  moveFile,
  nowIso,
  readJson,
  readText,
  relativeToRoot,
  slugify,
  timestampStamp,
  titleFromFilename,
  toPosixPath,
  truncate,
  uniquePath,
  writeJson,
  writeText
};
