const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { captureAuthored, writeAuthoredPack } = require("../src/authored");
const { askQuestion } = require("../src/ask");
const { diffLatestClaimSnapshots, refreshClaims, writeWhyBelieve } = require("../src/claims");
const { extractCandidateConcepts } = require("../src/concept-quality");
const { compileProject } = require("../src/compile");
const { captureCrystallize, writeCrystallizePack } = require("../src/crystallize");
const { writeDecisionNote, writeMeetingBrief, writeRedTeam, writeWhatChangedForMarkets } = require("../src/decisions");
const { writeDeck } = require("../src/deck");
const { runDoctor } = require("../src/doctor");
const { captureFrontier, writeFrontierPack } = require("../src/frontier");
const { ingest } = require("../src/ingest");
const { initProject } = require("../src/init");
const { lintProject } = require("../src/lint");
const { captureMemory, handleWorkingMemoryAfterCommand, loadMemoryEvents, writeMemoryRefreshPack, workingMemoryStatus } = require("../src/memory");
const { capturePdf, writePdfPack } = require("../src/pdf-handoff");
const { createPostmortem } = require("../src/postmortem");
const { buildPublicRelease } = require("../src/public-release");
const { writePrinciplesSnapshot } = require("../src/principles");
const { writeReflection } = require("../src/reflect");
const { migrateLegacyRollingOutputs, updateManagedNote } = require("../src/research");
const { captureResearch } = require("../src/research-handoff");
const { archiveLegacyReportRuns, captureReport, writeReport } = require("../src/report");
const { retrieveEvidence } = require("../src/retrieval");
const { searchCorpus } = require("../src/search");
const { selfIngest } = require("../src/self-ingest");
const { compileSelfModelArtifacts, resolveSelfModelContext } = require("../src/self-model");
const { refreshState, writeRegimeBrief, writeStateDiff } = require("../src/states");
const { writeSurveillance } = require("../src/surveil");
const { createWatchProfile, listActiveWatchProfiles } = require("../src/watch");
const { parseFrontmatter, renderMarkdown } = require("../src/markdown");

const repoRoot = path.resolve(__dirname, "..");

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cato-"));
  fs.cpSync(path.join(repoRoot, "config"), path.join(root, "config"), { recursive: true });
  fs.cpSync(path.join(repoRoot, "wiki", "_templates"), path.join(root, "wiki", "_templates"), { recursive: true });
  return root;
}

function fixturePath(name) {
  return path.join(repoRoot, "tests", "fixtures", name);
}

function escapePdfLiteral(value) {
  return String(value || "").replace(/([\\()])/g, "\\$1");
}

function createSimplePdf(filePath, text) {
  const contentStream = `BT\n/F1 18 Tf\n72 720 Td\n(${escapePdfLiteral(text)}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(contentStream, "latin1")} >>\nstream\n${contentStream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  fs.writeFileSync(filePath, pdf, "latin1");
}

function createPngFixture(filePath) {
  const onePixelPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==";
  fs.writeFileSync(filePath, Buffer.from(onePixelPngBase64, "base64"));
}

function writeSourceNoteFixture(root, fileName, frontmatter, body) {
  const sourceNotesDir = path.join(root, "wiki", "source-notes");
  fs.mkdirSync(sourceNotesDir, { recursive: true });
  const filePath = path.join(sourceNotesDir, fileName);
  fs.writeFileSync(filePath, renderMarkdown(frontmatter, body), "utf8");
  return filePath;
}

function writeSelfInboxNote(root, fileName, content) {
  const inboxDir = path.join(root, "inbox", "self");
  fs.mkdirSync(inboxDir, { recursive: true });
  const filePath = path.join(inboxDir, fileName);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function defaultReportBody(title) {
  return `# ${title}

## Executive Summary

Test-authored final report.

## What The Corpus Says

The corpus supports a grounded read on the topic.

## Judgement

The current evidence set is usable but still conditional.

## Counter-Case

Opposing evidence could still change the balance of risks.

## Data Gaps

More primary evidence would improve confidence.

## Source Map

- Local source map preserved through capture.
`;
}

function captureModelAuthoredReport(root, topic, options = {}) {
  const pack = writeReport(root, topic, options);
  const bundlePath = path.join(root, pack.capturePath);
  const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
  bundle.model = options.model || "codex test session";
  bundle.authoring_session = options.authoringSession || "test-suite";
  bundle.output.body = options.body || defaultReportBody(bundle.output.title);
  fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  const capture = captureReport(root, pack.capturePath);
  return {
    ...capture,
    pack
  };
}

function captureModelAuthoredOutput(root, pack, body) {
  const bundlePath = path.join(root, pack.capturePath);
  const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
  bundle.model = "gpt-5.4 xhigh via Codex";
  bundle.authoring_session = "test-suite";
  bundle.output.body = body;
  fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  return captureAuthored(root, pack.capturePath);
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

module.exports = {
  assert,
  fs,
  os,
  path,
  captureAuthored,
  writeAuthoredPack,
  askQuestion,
  diffLatestClaimSnapshots,
  refreshClaims,
  writeWhyBelieve,
  extractCandidateConcepts,
  compileProject,
  captureCrystallize,
  writeCrystallizePack,
  writeDecisionNote,
  writeMeetingBrief,
  writeRedTeam,
  writeWhatChangedForMarkets,
  writeDeck,
  runDoctor,
  captureFrontier,
  writeFrontierPack,
  ingest,
  initProject,
  lintProject,
  captureMemory,
  handleWorkingMemoryAfterCommand,
  loadMemoryEvents,
  writeMemoryRefreshPack,
  workingMemoryStatus,
  capturePdf,
  writePdfPack,
  buildPublicRelease,
  createPostmortem,
  writePrinciplesSnapshot,
  writeReflection,
  migrateLegacyRollingOutputs,
  updateManagedNote,
  captureResearch,
  archiveLegacyReportRuns,
  captureReport,
  writeReport,
  retrieveEvidence,
  searchCorpus,
  selfIngest,
  compileSelfModelArtifacts,
  resolveSelfModelContext,
  refreshState,
  writeRegimeBrief,
  writeStateDiff,
  writeSurveillance,
  createWatchProfile,
  listActiveWatchProfiles,
  parseFrontmatter,
  renderMarkdown,
  repoRoot,
  makeTempRepo,
  fixturePath,
  escapePdfLiteral,
  createSimplePdf,
  createPngFixture,
  writeSourceNoteFixture,
  writeSelfInboxNote,
  defaultReportBody,
  captureModelAuthoredReport,
  captureModelAuthoredOutput,
  runTest
};
