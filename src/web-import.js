const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_WEB_USER_AGENT, invokeWebRequest } = require("./http-runtime");
const { ensureDir, nowIso, slugify, uniquePath, writeJson } = require("./utils");

const IMPORT_USER_AGENT = DEFAULT_WEB_USER_AGENT;

function normalizeKnownUrl(value) {
  const input = String(value || "").trim();
  if (!input) {
    return "";
  }

  try {
    const parsed = new URL(input);
    parsed.hash = "";
    return parsed.toString();
  } catch (error) {
    return "";
  }
}

function preferredExtension(url, contentType = "") {
  const lowerType = String(contentType || "").toLowerCase();
  const pathName = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch (error) {
      return "";
    }
  })();
  const urlExtension = path.extname(pathName);

  if (urlExtension) {
    return urlExtension;
  }
  if (lowerType.includes("pdf")) {
    return ".pdf";
  }
  if (lowerType.includes("html")) {
    return ".html";
  }
  if (lowerType.includes("json")) {
    return ".json";
  }
  if (lowerType.includes("xml")) {
    return ".xml";
  }
  if (lowerType.includes("plain")) {
    return ".txt";
  }
  if (lowerType.includes("jpeg")) {
    return ".jpg";
  }
  if (lowerType.includes("png")) {
    return ".png";
  }
  if (lowerType.includes("webp")) {
    return ".webp";
  }
  if (lowerType.includes("gif")) {
    return ".gif";
  }
  if (lowerType.includes("svg")) {
    return ".svg";
  }
  return ".html";
}

function buildDownloadStem(url, title = "", rank = 0) {
  const preferred = slugify(title).slice(0, 80);
  if (preferred) {
    return rank ? `${String(rank).padStart(2, "0")}-${preferred}` : preferred;
  }

  try {
    const parsed = new URL(url);
    const host = slugify(parsed.hostname.replace(/^www\./i, ""));
    const tail = slugify(path.basename(parsed.pathname, path.extname(parsed.pathname)) || "source");
    const stem = [host, tail].filter(Boolean).join("-");
    return rank ? `${String(rank).padStart(2, "0")}-${stem || "source"}` : stem || "source";
  } catch (error) {
    return rank ? `${String(rank).padStart(2, "0")}-source` : "source";
  }
}

function defaultDownloadRunner(downloadDir, url, options = {}) {
  ensureDir(downloadDir);
  const tempPath = uniquePath(path.join(downloadDir, `${buildDownloadStem(url, options.title, options.rank)}.download`));

  try {
    const metadata = invokeWebRequest({
      url,
      outFile: tempPath,
      headers: {
        "User-Agent": IMPORT_USER_AGENT
      },
      maxBuffer: 32 * 1024 * 1024
    });
    return {
      tempPath,
      finalUrl: normalizeKnownUrl(metadata.final_url) || normalizeKnownUrl(url),
      contentType: metadata.content_type || ""
    };
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
    throw error;
  }
}

function writeSourceSidecar(filePath, metadata = {}) {
  const sidecarPath = `${filePath}.cato-meta.json`;
  writeJson(sidecarPath, metadata);
  return sidecarPath;
}

function downloadWebSource(downloadDir, url, options = {}) {
  const runner = options.downloadRunner || defaultDownloadRunner;
  const download = runner(downloadDir, url, options);
  const finalUrl = normalizeKnownUrl(download.finalUrl) || normalizeKnownUrl(url) || url;
  const extension = preferredExtension(finalUrl, download.contentType);
  const filePath = download.filePath
    ? download.filePath
    : (() => {
        const stem = buildDownloadStem(finalUrl, options.title, options.rank);
        const destination = uniquePath(path.join(downloadDir, `${stem}${extension}`));
        fs.renameSync(download.tempPath, destination);
        return destination;
      })();

  const sidecarPath = writeSourceSidecar(filePath, {
    title: options.title || "",
    source_url: finalUrl,
    origin_url: normalizeKnownUrl(url) || url,
    capture_source: options.captureSource || "web_import",
    fetched_at: options.fetchedAt || nowIso(),
    author: options.author || "",
    date: options.date || options.published || "",
    tags: Array.isArray(options.tags) ? options.tags : [],
    entities: Array.isArray(options.entities) ? options.entities : [],
    concepts: Array.isArray(options.concepts) ? options.concepts : [],
    capture_notes: options.captureNotes || "",
    publisher: options.publisher || ""
  });

  return {
    filePath,
    sidecarPath,
    finalUrl,
    contentType: download.contentType || ""
  };
}

module.exports = {
  downloadWebSource,
  normalizeKnownUrl
};
