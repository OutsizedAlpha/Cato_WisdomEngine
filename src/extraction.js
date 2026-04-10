const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");
const { HTML_EXTENSIONS, IMAGE_EXTENSIONS, TEXT_EXTENSIONS } = require("./constants");
const { parseFrontmatter, stripHtml, stripMarkdownFormatting } = require("./markdown");
const { readText } = require("./utils");
const REPO_ARCHIVE_EXTENSIONS = new Set([".zip", ".tar", ".gz", ".tgz"]);

function repairCommonMojibake(value) {
  return String(value || "")
    .replace(/Â©/g, "©")
    .replace(/Â®/g, "®")
    .replace(/Â·/g, "·")
    .replace(/â€¢/g, "•")
    .replace(/â€“/g, "–")
    .replace(/â€”/g, "—")
    .replace(/â€˜/g, "‘")
    .replace(/â€™/g, "’")
    .replace(/â€œ/g, "“")
    .replace(/â€/g, "”")
    .replace(/â€¦/g, "…");
}

function normalizeExtractedText(value) {
  return repairCommonMojibake(String(value || ""))
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function pdfWeirdCharacterRatio(value) {
  const text = String(value || "");
  const visibleCharacters = [...text].filter((character) => !/\s/.test(character));
  if (!visibleCharacters.length) {
    return 1;
  }

  const weirdCharacters = visibleCharacters.filter((character) => {
    if (character === "�" || character === "Â" || character === "Ã") {
      return true;
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(character)) {
      return true;
    }
    return false;
  }).length;

  return weirdCharacters / visibleCharacters.length;
}

function pdfSpacedLetterSequenceCount(value) {
  return [...String(value || "").matchAll(/\b(?:[A-Za-z]\s+){5,}[A-Za-z]\b/g)].length;
}

function looksUnreadablePdfText(value) {
  const text = normalizeExtractedText(value);
  if (!text) {
    return false;
  }

  const words = text.split(/\s+/).filter(Boolean);
  const singleLetterWords = words.filter((word) => /^[A-Za-z]$/.test(word)).length;
  const splitWordStarts = [...text.matchAll(/\b[A-Za-z]\s+[a-z]{2,}\b/g)].length;
  const weirdRatio = pdfWeirdCharacterRatio(text);
  const spacedLetterRuns = pdfSpacedLetterSequenceCount(text);
  const singleLetterRatio = words.length ? singleLetterWords / words.length : 0;
  const splitWordStartRatio = words.length ? splitWordStarts / words.length : 0;

  if (weirdRatio >= 0.02) {
    return true;
  }
  if (spacedLetterRuns >= 8) {
    return true;
  }
  if (words.length >= 200 && singleLetterRatio >= 0.15) {
    return true;
  }
  if (splitWordStarts >= 100 && splitWordStartRatio >= 0.18) {
    return true;
  }
  return text.length >= 400 && spacedLetterRuns >= 2 && singleLetterRatio >= 0.22;
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function resultShape(overrides = {}) {
  return {
    extractedText: "",
    extractionStatus: "not_supported",
    extractionMethod: "none",
    extractionNotes: [],
    figureRefs: [],
    importedFrontmatter: {},
    ...overrides
  };
}

function parseAttribute(tag, name) {
  const match = String(tag || "").match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? decodeXmlEntities(match[1].trim()) : "";
}

function normalizeFigureRef(ref) {
  const src = String(ref?.src || "").trim();
  const alt = normalizeExtractedText(ref?.alt || "");
  const caption = normalizeExtractedText(ref?.caption || "");
  const title = normalizeExtractedText(ref?.title || "");
  if (!src && !alt && !caption && !title) {
    return null;
  }

  return {
    src,
    alt,
    caption,
    title,
    label: caption || alt || title || path.basename(src || "figure")
  };
}

function uniqueFigureRefs(refs) {
  const seen = new Set();
  const output = [];
  for (const ref of refs) {
    const normalized = normalizeFigureRef(ref);
    if (!normalized) {
      continue;
    }
    const key = `${normalized.src}|${normalized.alt}|${normalized.caption}|${normalized.title}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function extractMarkdownFigureRefs(rawContent) {
  const refs = [];
  const standardMatches = rawContent.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g);
  for (const match of standardMatches) {
    refs.push({
      src: match[2],
      alt: match[1],
      title: match[3] || ""
    });
  }

  const obsidianMatches = rawContent.matchAll(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g);
  for (const match of obsidianMatches) {
    refs.push({
      src: match[1],
      alt: match[2] || "",
      title: ""
    });
  }

  return uniqueFigureRefs(refs);
}

function extractHtmlFigureRefs(rawContent) {
  const refs = [];
  const figureMatches = rawContent.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi);
  for (const match of figureMatches) {
    const block = match[1];
    const imgTag = block.match(/<img\b[^>]*>/i)?.[0];
    if (!imgTag) {
      continue;
    }
    refs.push({
      src: parseAttribute(imgTag, "src"),
      alt: parseAttribute(imgTag, "alt"),
      title: parseAttribute(imgTag, "title"),
      caption: normalizeExtractedText(stripHtml(block.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || ""))
    });
  }

  const imgMatches = rawContent.matchAll(/<img\b[^>]*>/gi);
  for (const match of imgMatches) {
    refs.push({
      src: parseAttribute(match[0], "src"),
      alt: parseAttribute(match[0], "alt"),
      title: parseAttribute(match[0], "title")
    });
  }

  return uniqueFigureRefs(refs);
}

function extractTextFileContent(filePath, extension) {
  const rawContent = readText(filePath);
  if (HTML_EXTENSIONS.has(extension)) {
    const titleMatch = rawContent.match(/<title[^>]*>([^<]+)<\/title>/i);
    const figureRefs = extractHtmlFigureRefs(rawContent);
    return resultShape({
      extractedText: normalizeExtractedText(stripHtml(rawContent)),
      extractionStatus: "extracted",
      extractionMethod: "html_text",
      extractionNotes: [
        "Stripped HTML markup into plain text.",
        ...(figureRefs.length ? [`Indexed ${figureRefs.length} image or figure reference(s) from HTML markup.`] : [])
      ],
      figureRefs,
      importedFrontmatter: titleMatch ? { title: titleMatch[1].trim() } : {}
    });
  }

  if (extension === ".md" || extension === ".markdown") {
    const parsed = parseFrontmatter(rawContent);
    const figureRefs = extractMarkdownFigureRefs(parsed.body);
    return resultShape({
      extractedText: normalizeExtractedText(stripMarkdownFormatting(parsed.body)),
      extractionStatus: "extracted",
      extractionMethod: "markdown_text",
      extractionNotes: [
        "Parsed markdown body and preserved imported frontmatter.",
        ...(figureRefs.length ? [`Indexed ${figureRefs.length} markdown image reference(s).`] : [])
      ],
      figureRefs,
      importedFrontmatter: parsed.frontmatter
    });
  }

  return resultShape({
    extractedText: normalizeExtractedText(rawContent),
    extractionStatus: "extracted",
    extractionMethod: "plain_text",
    extractionNotes: ["Read source as text without a format-specific transform."]
  });
}

function decodePdfLiteralString(rawLiteral) {
  const literal = rawLiteral.slice(1, -1);
  let output = "";

  for (let index = 0; index < literal.length; index += 1) {
    const current = literal[index];
    if (current !== "\\") {
      output += current;
      continue;
    }

    index += 1;
    const escaped = literal[index];
    if (escaped === undefined) {
      break;
    }

    if (escaped === "n") {
      output += "\n";
      continue;
    }
    if (escaped === "r") {
      output += "\r";
      continue;
    }
    if (escaped === "t") {
      output += "\t";
      continue;
    }
    if (escaped === "b") {
      output += "\b";
      continue;
    }
    if (escaped === "f") {
      output += "\f";
      continue;
    }
    if (escaped === "\n" || escaped === "\r") {
      if (escaped === "\r" && literal[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }
    if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      while (octal.length < 3 && /[0-7]/.test(literal[index + 1] || "")) {
        index += 1;
        octal += literal[index];
      }
      output += String.fromCharCode(parseInt(octal, 8));
      continue;
    }

    output += escaped;
  }

  return output;
}

function decodeUtf16Be(buffer) {
  let output = "";
  for (let index = 0; index + 1 < buffer.length; index += 2) {
    output += String.fromCharCode(buffer.readUInt16BE(index));
  }
  return output;
}

function decodePdfHexString(rawHex) {
  const compact = rawHex.slice(1, -1).replace(/\s+/g, "");
  const cleaned = compact.padEnd(Math.ceil(compact.length / 2) * 2, "0");

  if (!cleaned) {
    return "";
  }

  const buffer = Buffer.from(cleaned, "hex");
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return decodeUtf16Be(buffer.subarray(2));
  }
  return buffer.toString("latin1");
}

function extractPdfStrings(segment) {
  const fragments = [];
  const arrayMatches = segment.matchAll(/\[(.*?)\]\s*TJ/gs);
  for (const match of arrayMatches) {
    const tokenMatches = match[1].matchAll(/(\((?:\\.|[^\\)])*\)|<[\da-fA-F\s]+>)/g);
    for (const tokenMatch of tokenMatches) {
      fragments.push(tokenMatch[1]);
    }
  }

  const directMatches = segment.matchAll(/(\((?:\\.|[^\\)])*\)|<[\da-fA-F\s]+>)\s*(?:Tj|'|")/g);
  for (const match of directMatches) {
    fragments.push(match[1]);
  }

  const decoded = [];
  for (const fragment of fragments) {
    const value = fragment.startsWith("(") ? decodePdfLiteralString(fragment) : decodePdfHexString(fragment);
    const normalized = normalizeExtractedText(value);
    if (!normalized) {
      continue;
    }
    if (decoded[decoded.length - 1] !== normalized) {
      decoded.push(normalized);
    }
  }

  return decoded;
}

function decodePdfStreamBuffer(dictionary, streamBuffer) {
  if (/\/Filter\s*\[\s*\/FlateDecode/i.test(dictionary) || /\/Filter\s*\/FlateDecode/i.test(dictionary)) {
    try {
      return zlib.inflateSync(streamBuffer);
    } catch (error) {
      return null;
    }
  }

  if (/\/Filter/i.test(dictionary)) {
    return null;
  }

  return streamBuffer;
}

function extractPdfStreamSegments(buffer) {
  const source = buffer.toString("latin1");
  const matches = source.matchAll(/<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/gi);
  const segments = [];

  for (const match of matches) {
    segments.push({
      dictionary: match[1],
      streamBuffer: Buffer.from(match[2], "latin1")
    });
  }

  return segments;
}

function runPythonPdfExtraction(filePath) {
  const script = [
    "import sys",
    "from pypdf import PdfReader",
    "if hasattr(sys.stdout, 'reconfigure'):",
    "    sys.stdout.reconfigure(encoding='utf-8')",
    "reader = PdfReader(sys.argv[1])",
    "parts = []",
    "for page in reader.pages:",
    "    try:",
    "        text = page.extract_text() or ''",
    "    except Exception:",
    "        text = ''",
    "    if text:",
    "        parts.append(text)",
    "sys.stdout.buffer.write('\\n'.join(parts).encode('utf-8', 'ignore'))"
  ].join("\n");

  const invocations =
    process.platform === "win32"
      ? [
          { command: "py", args: ["-3", "-c", script, filePath] },
          { command: "python", args: ["-c", script, filePath] }
        ]
      : [
          { command: "python3", args: ["-c", script, filePath] },
          { command: "python", args: ["-c", script, filePath] }
        ];

  for (const invocation of invocations) {
    const result = spawnSync(invocation.command, invocation.args, {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024
    });

    if (result.error) {
      continue;
    }
    if (result.status !== 0) {
      continue;
    }

    const extractedText = normalizeExtractedText(result.stdout);
    if (!extractedText) {
      continue;
    }

    return {
      ok: true,
      extractedText,
      runner: invocation.command
    };
  }

  return {
    ok: false,
    error: "Python PDF extraction was unavailable or did not recover readable text."
  };
}

function extractPdfContent(filePath) {
  const rawBuffer = fs.readFileSync(filePath);
  const lines = [];

  for (const segment of extractPdfStreamSegments(rawBuffer)) {
    const decodedStream = decodePdfStreamBuffer(segment.dictionary, segment.streamBuffer);
    if (!decodedStream) {
      continue;
    }

    const extracted = extractPdfStrings(decodedStream.toString("latin1"));
    if (extracted.length) {
      lines.push(...extracted);
    }
  }

  const extractedText = normalizeExtractedText(lines.join("\n"));
  if (!extractedText) {
    const pythonFallback = runPythonPdfExtraction(filePath);
    if (pythonFallback.ok) {
      return resultShape({
        extractedText: pythonFallback.extractedText,
        extractionStatus: "extracted",
        extractionMethod: "pdf_text_python",
        extractionNotes: [`Recovered text from PDF through Python pypdf via ${pythonFallback.runner}.`]
      });
    }
    return resultShape({
      extractionStatus: "extraction_failed",
      extractionMethod: "pdf_text",
      extractionNotes: [
        "Parsed PDF content streams but did not recover readable text.",
        "Python pypdf fallback was unavailable or also failed. Scanned PDFs still need OCR support."
      ]
    });
  }

  if (looksUnreadablePdfText(extractedText)) {
    const pythonFallback = runPythonPdfExtraction(filePath);
    if (pythonFallback.ok && !looksUnreadablePdfText(pythonFallback.extractedText)) {
      return resultShape({
        extractedText: pythonFallback.extractedText,
        extractionStatus: "extracted",
        extractionMethod: "pdf_text_python",
        extractionNotes: [
          "Built-in PDF stream parsing recovered text but it looked unreadable or heavily spaced.",
          `Fell back to Python pypdf via ${pythonFallback.runner} for a cleaner extraction.`
        ]
      });
    }
  }

  return resultShape({
    extractedText,
    extractionStatus: "extracted",
    extractionMethod: "pdf_text",
    extractionNotes: ["Recovered text from PDF content streams without a third-party dependency."]
  });
}

function extractSvgContent(filePath) {
  const rawContent = readText(filePath);
  const titleMatch = rawContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const fragments = [];
  const textMatches = rawContent.matchAll(/<(?:text|title|desc)\b[^>]*>([\s\S]*?)<\/(?:text|title|desc)>/gi);
  for (const match of textMatches) {
    const cleaned = normalizeExtractedText(decodeXmlEntities(stripHtml(match[1])));
    if (cleaned) {
      fragments.push(cleaned);
    }
  }

  return resultShape({
    extractedText: normalizeExtractedText(fragments.join("\n")),
    extractionStatus: fragments.length ? "extracted" : "extraction_failed",
    extractionMethod: "svg_text",
    extractionNotes: fragments.length
      ? ["Extracted visible text nodes directly from the SVG markup."]
      : ["SVG archived but no visible text nodes were found to extract."],
    importedFrontmatter: titleMatch ? { title: normalizeExtractedText(decodeXmlEntities(titleMatch[1])) } : {}
  });
}

function tarListArchive(filePath) {
  const result = spawnSync("tar", ["-tf", filePath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    return { ok: false, error: (result.stderr || result.stdout || "tar listing failed").trim() };
  }
  return {
    ok: true,
    entries: String(result.stdout || "")
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  };
}

function tarReadArchiveFile(filePath, archiveEntry) {
  const result = spawnSync("tar", ["-xOf", filePath, archiveEntry], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    return "";
  }
  return normalizeExtractedText(result.stdout);
}

function summarizeRepoEntries(entries) {
  const extCounts = new Map();
  const topLevel = new Map();

  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, "/");
    const top = normalized.split("/").filter(Boolean)[0] || normalized;
    topLevel.set(top, (topLevel.get(top) || 0) + 1);
    const extension = path.extname(normalized).toLowerCase() || "[no extension]";
    extCounts.set(extension, (extCounts.get(extension) || 0) + 1);
  }

  return {
    topLevel: [...topLevel.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 12)
      .map(([name, count]) => `- ${name} (${count})`),
    extensions: [...extCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 12)
      .map(([name, count]) => `- ${name}: ${count}`)
  };
}

function buildRepoSummary(repoLabel, entries, keyFiles) {
  const summary = summarizeRepoEntries(entries);
  const keySections = keyFiles.length
    ? keyFiles.map((file) => `## ${file.path}\n\n${truncateForRepo(file.content)}`).join("\n\n")
    : "## Key Files\n\n- No README, package manifest, or obvious project file was extracted.";

  return normalizeExtractedText(`
Repository snapshot: ${repoLabel}
Entries indexed: ${entries.length}

Top-level structure:
${summary.topLevel.join("\n") || "- None"}

Extension mix:
${summary.extensions.join("\n") || "- None"}

${keySections}
`);
}

function truncateForRepo(value, length = 1800) {
  const text = normalizeExtractedText(value);
  if (text.length <= length) {
    return text;
  }
  return `${text.slice(0, length).trimEnd()}...`;
}

function repoKeyFileCandidates(entries) {
  const wanted = ["readme.md", "readme.txt", "package.json", "pyproject.toml", "requirements.txt", "cargo.toml", "go.mod"];
  return entries.filter((entry) => wanted.includes(path.basename(entry).toLowerCase())).slice(0, 6);
}

function extractRepoArchiveContent(filePath) {
  const listing = tarListArchive(filePath);
  if (!listing.ok) {
    return resultShape({
      extractionStatus: "extraction_failed",
      extractionMethod: "repo_archive_manifest",
      extractionNotes: [`Could not inspect repo archive: ${listing.error}`]
    });
  }

  const keyFiles = repoKeyFileCandidates(listing.entries).map((entry) => ({
    path: entry,
    content: tarReadArchiveFile(filePath, entry)
  }));

  return resultShape({
    extractedText: buildRepoSummary(path.basename(filePath), listing.entries, keyFiles),
    extractionStatus: "extracted",
    extractionMethod: "repo_archive_manifest",
    extractionNotes: ["Indexed repo archive structure and extracted key text files where possible."]
  });
}

function listRepoDirectoryFiles(directoryPath) {
  const results = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".venv" || entry.name === "__pycache__") {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  };
  visit(directoryPath);
  return results;
}

function extractRepoDirectoryContent(directoryPath) {
  const files = listRepoDirectoryFiles(directoryPath);
  const relativeEntries = files.map((filePath) => path.relative(directoryPath, filePath).replace(/\\/g, "/"));
  const keyFiles = repoKeyFileCandidates(relativeEntries).map((relativePath) => ({
    path: relativePath,
    content: normalizeExtractedText(readText(path.join(directoryPath, relativePath)))
  }));

  return resultShape({
    extractedText: buildRepoSummary(path.basename(directoryPath), relativeEntries, keyFiles),
    extractionStatus: "extracted",
    extractionMethod: "repo_directory_manifest",
    extractionNotes: ["Indexed repo directory structure and extracted key text files where possible."]
  });
}

function runWindowsOcr(filePath) {
  const powershellPathLiteral = String(filePath).replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function AwaitWinRt($operation, [Type]$resultType) {
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait()
  return $task.Result
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]

$targetPath = '${powershellPathLiteral}'
$file = AwaitWinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($targetPath)) ([Windows.Storage.StorageFile])
$stream = AwaitWinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = AwaitWinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$softwareBitmap = AwaitWinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$result = AwaitWinRt ($ocrEngine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])
Write-Output $result.Text
`;
  const scriptPath = path.join(os.tmpdir(), `cato-ocr-${process.pid}-${Date.now()}.ps1`);
  fs.writeFileSync(scriptPath, script, "utf8");

  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  try {
    fs.unlinkSync(scriptPath);
  } catch (error) {
    // Best-effort cleanup only.
  }

  if (result.error) {
    return { ok: false, error: result.error.message };
  }
  if (result.status !== 0) {
    return { ok: false, error: (result.stderr || result.stdout || "Windows OCR failed").trim() };
  }

  return { ok: true, text: normalizeExtractedText(result.stdout) };
}

function extractImageContent(filePath, extension, options = {}) {
  if (extension === ".svg") {
    return extractSvgContent(filePath);
  }

  const ocrRunner = typeof options.ocrRunner === "function" ? options.ocrRunner : runWindowsOcr;
  const ocrResult = ocrRunner(filePath);
  if (!ocrResult.ok) {
    return resultShape({
      extractionStatus: "extraction_failed",
      extractionMethod: "windows_ocr",
      extractionNotes: [`Windows OCR failed: ${ocrResult.error}`]
    });
  }

  if (!ocrResult.text) {
    return resultShape({
      extractionStatus: "extraction_failed",
      extractionMethod: "windows_ocr",
      extractionNotes: ["Windows OCR ran but did not detect readable text in the image."]
    });
  }

  return resultShape({
    extractedText: ocrResult.text,
    extractionStatus: "ocr_extracted",
    extractionMethod: "windows_ocr",
    extractionNotes: ["Applied Windows OCR to the archived image."],
    figureRefs: [
      {
        src: path.basename(filePath),
        alt: "",
        caption: "Standalone image source archived by Cato.",
        title: ""
      }
    ]
  });
}

function extractContent(filePath, options = {}) {
  if (options.targetKind === "directory") {
    return extractRepoDirectoryContent(filePath);
  }

  const extension = path.extname(filePath).toLowerCase();

  if (TEXT_EXTENSIONS.has(extension)) {
    return extractTextFileContent(filePath, extension);
  }

  if (extension === ".pdf") {
    return extractPdfContent(filePath);
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return extractImageContent(filePath, extension, options);
  }

  if (REPO_ARCHIVE_EXTENSIONS.has(extension)) {
    return extractRepoArchiveContent(filePath);
  }

  return resultShape();
}

module.exports = {
  extractContent
};
