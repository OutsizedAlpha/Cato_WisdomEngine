const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { askQuestion } = require("../src/ask");
const { diffLatestClaimSnapshots, refreshClaims, writeWhyBelieve } = require("../src/claims");
const { extractCandidateConcepts } = require("../src/concept-quality");
const { compileProject } = require("../src/compile");
const { writeDecisionNote, writeMeetingBrief, writeRedTeam, writeWhatChangedForMarkets } = require("../src/decisions");
const { writeDeck } = require("../src/deck");
const { runDoctor } = require("../src/doctor");
const { captureFrontier, writeFrontierPack } = require("../src/frontier");
const { ingest } = require("../src/ingest");
const { initProject } = require("../src/init");
const { lintProject } = require("../src/lint");
const { createPostmortem } = require("../src/postmortem");
const { writePrinciplesSnapshot } = require("../src/principles");
const { writeReflection } = require("../src/reflect");
const { captureResearch } = require("../src/research-handoff");
const { writeReport } = require("../src/report");
const { retrieveEvidence } = require("../src/retrieval");
const { searchCorpus } = require("../src/search");
const { selfIngest } = require("../src/self-ingest");
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

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("init seeds the project structure and generated indices", () => {
  const root = makeTempRepo();
  try {
    const result = initProject(root);
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(path.join(root, "commands")));
    assert.ok(fs.existsSync(path.join(root, "manifests", "file_hashes.json")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "_indices", "sources.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "_maps", "home.md")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("markdown frontmatter preserves empty scalar values on render and parse", () => {
  const rendered = renderMarkdown(
    {
      title: "Frontmatter Roundtrip",
      search_query: "",
      author: "",
      search_rank: ""
    },
    "# Frontmatter Roundtrip"
  );
  const parsed = parseFrontmatter(rendered);
  assert.equal(parsed.frontmatter.search_query, "");
  assert.equal(parsed.frontmatter.author, "");
  assert.equal(parsed.frontmatter.search_rank, "");
});

runTest("candidate concept extraction rejects abbreviation-heavy table shorthand", () => {
  const ontology = JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "ontology.json"), "utf8"));
  const candidates = extractCandidateConcepts(
    "United States macro calendar",
    "UTC UTC PM US EIA AM US MBA YOY MAR actual previous forecast consensus inflation rate labor market crude oil jobless claims inflation rate labor market crude oil jobless claims",
    ontology
  );
  assert.ok(candidates.includes("inflation"));
  assert.ok(!candidates.includes("utc utc"));
  assert.ok(!candidates.includes("pm us eia"));
  assert.ok(!candidates.includes("am us mba"));
  assert.ok(!candidates.includes("yoy mar"));
});

runTest("ingest, compile, search, ask, and lint produce a working research loop", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));

    const ingestResult = ingest(root);
    assert.equal(ingestResult.ingested, 2);
    assert.ok(ingestResult.results.every((record) => record.document_class));
    assert.ok(ingestResult.results.every((record) => record.draft_workspace_path));
    assert.ok(fs.existsSync(path.join(root, ingestResult.results[0].draft_workspace_path)));
    const appendReview = fs.readFileSync(path.join(root, ingestResult.results[0].draft_workspace_path), "utf8");
    assert.match(appendReview, /# Append And Review:/);
    assert.match(appendReview, /## Review Checklist/);

    const compileResult = compileProject(root, { promoteCandidates: true });
    assert.equal(compileResult.sourceNotes, 2);
    assert.ok(fs.existsSync(path.join(root, "wiki", "concepts", "passive-flows.md")));
    assert.ok(fs.existsSync(path.join(root, "manifests", "wiki_index.json")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "_indices", "tags.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "_indices", "backlinks.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "unresolved", "open-threads.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "drafts", "index.md")));

    const searchResults = searchCorpus(root, "passive flows", { limit: 5 });
    assert.ok(searchResults.length >= 1);

    const askResult = askQuestion(root, "What does the corpus currently say about passive flows?", {
      saveQuestion: true
    });
    assert.ok(fs.existsSync(path.join(root, askResult.outputPath)));
    const memo = fs.readFileSync(path.join(root, askResult.outputPath), "utf8");
    assert.match(memo, /kind: answer-memo/);
    assert.match(memo, /## Executive Summary/);
    assert.match(memo, /## Evidence/);
    assert.match(memo, /## Retrieval Budget/);
    assert.match(memo, /retrieval_budget:/);
    assert.ok(fs.existsSync(path.join(root, "wiki", "questions")));

    const lintResult = lintProject(root);
    const errorCount = lintResult.issues.filter((issue) => issue.severity === "error").length;
    assert.equal(errorCount, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("ingest extracts readable text from PDFs and OCRs raster images", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });

    const pdfPath = path.join(root, "inbox", "drop_here", "passive-flows.pdf");
    const imagePath = path.join(root, "inbox", "drop_here", "market-structure.png");
    createSimplePdf(pdfPath, "Passive flows can crowd benchmarks and move liquidity.");
    createPngFixture(imagePath);

    const result = ingest(root, {
      ocrRunner: () => ({ ok: true, text: "PASSIVE FLOWS AND LIQUIDITY" })
    });
    assert.equal(result.ingested, 2);

    const pdfRecord = result.results.find((record) => record.source_type === "paper");
    const imageRecord = result.results.find((record) => record.source_type === "image");

    assert.ok(pdfRecord);
    assert.ok(imageRecord);
    assert.equal(pdfRecord.extraction_method, "pdf_text");
    assert.equal(imageRecord.extraction_method, "windows_ocr");
    assert.ok(pdfRecord.extracted_text_path);
    assert.ok(imageRecord.extracted_text_path);
    assert.ok(imageRecord.figure_note_path);

    const pdfText = fs.readFileSync(path.join(root, pdfRecord.extracted_text_path), "utf8");
    const imageText = fs.readFileSync(path.join(root, imageRecord.extracted_text_path), "utf8");
    const figureNote = fs.readFileSync(path.join(root, imageRecord.figure_note_path), "utf8");
    assert.match(pdfText, /passive flows/i);
    assert.match(imageText, /passive/i);
    assert.match(imageText, /liquidity/i);
    assert.match(figureNote, /OCR \/ Visible Text/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("ingest treats repo directories as first-class repo snapshots", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    const repoDir = path.join(root, "inbox", "drop_here", "flow-model");
    fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "README.md"), "# Flow Model\n\nRepo snapshot for market structure work.\n", "utf8");
    fs.writeFileSync(path.join(repoDir, "package.json"), '{ "name": "flow-model" }\n', "utf8");
    fs.writeFileSync(path.join(repoDir, "src", "index.js"), "export const flow = 'passive flows';\n", "utf8");

    const result = ingest(root);
    assert.equal(result.ingested, 1);

    const repoRecord = result.results[0];
    assert.equal(repoRecord.source_type, "repo");
    assert.equal(repoRecord.extraction_method, "repo_directory_manifest");
    assert.match(repoRecord.raw_path, /^raw\/repos\//);
    assert.ok(repoRecord.extracted_text_path);

    const repoText = fs.readFileSync(path.join(root, repoRecord.extracted_text_path), "utf8");
    assert.match(repoText, /Repository snapshot/i);
    assert.match(repoText, /package\.json/i);
    assert.match(repoText, /readme\.md/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("ingest writes figure notes for markdown image references", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "inbox", "drop_here", "figure-article.md"),
      `---
title: Figure Article
---

# Figure Article

![Dealer gamma chart](images/gamma-profile.png "Gamma positioning")

This note discusses dealer gamma and market plumbing.
`,
      "utf8"
    );

    const result = ingest(root);
    assert.equal(result.ingested, 1);

    const articleRecord = result.results[0];
    assert.equal(articleRecord.source_type, "article");
    assert.ok(articleRecord.figure_note_path);
    assert.equal(articleRecord.figure_count, 1);

    const figureNote = fs.readFileSync(path.join(root, articleRecord.figure_note_path), "utf8");
    assert.match(figureNote, /gamma-profile\.png/i);
    assert.match(figureNote, /Gamma positioning/);
    assert.match(figureNote, /Figure Inventory/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("ingest handles markdown frontmatter when the file has a UTF-8 BOM", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "inbox", "drop_here", "bom-article.md"),
      `\uFEFF---
title: BOM Article
---

# BOM Article

This note should preserve frontmatter parsing even with a BOM.
`,
      "utf8"
    );

    const result = ingest(root);
    assert.equal(result.ingested, 1);
    assert.equal(result.results[0].title, "BOM Article");
    assert.match(result.results[0].note_path, /bom-article\.md$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("self-ingest turns rough thinking into structured self-model notes", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "self"), { recursive: true });
    fs.copyFileSync(fixturePath("self-principle.txt"), path.join(root, "inbox", "self", "satellite-principle.txt"));

    const result = selfIngest(root);
    assert.equal(result.ingested, 1);

    compileProject(root);
    const selfIndex = fs.readFileSync(path.join(root, "wiki", "_indices", "self-model.md"), "utf8");
    assert.match(selfIndex, /portfolio-philosophy|principles/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("phase-2 workflows write reports, decks, surveillance, reflection, principles, postmortems, and doctor output", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.mkdirSync(path.join(root, "inbox", "self"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));
    fs.copyFileSync(fixturePath("self-principle.txt"), path.join(root, "inbox", "self", "satellite-principle.txt"));

    ingest(root);
    selfIngest(root);
    const compileResult = compileProject(root, { promoteCandidates: true });
    assert.ok(compileResult.timelines >= 1);
    assert.ok(fs.existsSync(path.join(root, "wiki", "timelines", "source-chronology.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "unresolved", "synthesis-candidates.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "unresolved", "potential-contradictions.md")));

    const report = writeReport(root, "passive flows and liquidity", { promote: true });
    const deck = writeDeck(root, "passive flows and liquidity", { promote: true });
    const surveillance = writeSurveillance(root, "passive flows");
    const reflection = writeReflection(root, { promote: true });
    const principles = writePrinciplesSnapshot(root);
    const postmortem = createPostmortem(root, "Q1 passive flows review", {
      notes: "The satellite thesis worked until crowding and regime shift began to matter."
    });
    const doctor = runDoctor(root, {
      ocrCheck: { ok: true, message: "Windows OCR runtime available." },
      pythonCheck: {
        ok: true,
        message: "Python 3.13.12 (repo-local wrapper active; python.cmd present, py.cmd present)",
        resolution: path.join(root, "python.cmd")
      },
      browserCheck: {
        ok: true,
        message: "Playwright and Puppeteer available.",
        playwrightCli: "Version 1.59.1",
        playwrightLaunch: "Headless Chromium launch ok (playwright-ok).",
        puppeteerCli: "24.40.0"
      }
    });

    assert.ok(fs.existsSync(path.join(root, report.outputPath)));
    assert.ok(fs.existsSync(path.join(root, deck.outputPath)));
    assert.ok(fs.existsSync(path.join(root, surveillance.notePath)));
    assert.ok(fs.existsSync(path.join(root, reflection.outputPath)));
    assert.ok(fs.existsSync(path.join(root, principles.outputPath)));
    assert.ok(fs.existsSync(path.join(root, postmortem.notePath)));
    assert.ok(fs.existsSync(path.join(root, doctor.reportPath)));
    assert.ok(fs.existsSync(path.join(root, report.promotedPath)));
    assert.ok(fs.existsSync(path.join(root, deck.promotedPath)));
    assert.ok(fs.existsSync(path.join(root, reflection.promotedPath)));

    const deckContent = fs.readFileSync(path.join(root, deck.outputPath), "utf8");
    const reflectionContent = fs.readFileSync(path.join(root, reflection.outputPath), "utf8");
    const surveillanceContent = fs.readFileSync(path.join(root, surveillance.notePath), "utf8");
    const doctorContent = fs.readFileSync(path.join(root, doctor.reportPath), "utf8");

    assert.match(deckContent, /marp: true/);
    assert.match(deckContent, /## Executive Summary/);
    assert.match(reflectionContent, /## Tension Register Summary/);
    assert.match(surveillanceContent, /Managed Snapshot/);
    assert.match(doctorContent, /## Project Health/);
    assert.match(doctorContent, /Python in repo shell:/);
    assert.match(doctorContent, /Playwright browser launch:/);
    assert.match(doctorContent, /Puppeteer CLI:/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("watch profiles expand topic retrieval into surveillance and reports", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "inbox", "drop_here", "red-sea-shipping.md"),
      `---
title: Red Sea shipping pressure
---

# Red Sea shipping pressure

Houthi attacks and shipping disruption are creating oil and freight sensitivity.
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "inbox", "drop_here", "gaza-escalation.txt"),
      "Netanyahu, Iran, and Gaza escalation risk remain central to current geopolitical stress.\n",
      "utf8"
    );

    ingest(root);
    compileProject(root);

    const watch = createWatchProfile(root, "Middle East", {
      context:
        "Track the conflict because it matters for the defensive fund, oil risk, shipping disruption, escalation, and de-risking decisions.",
      aliases: "Middle East conflict, Israel-Hamas war, Red Sea",
      entities: "Netanyahu, Iran, Houthis, Gaza, Israel",
      concepts: "shipping disruption, oil risk, escalation risk",
      triggers: "direct Iran-Israel strike, Red Sea closure",
      priority: "high",
      cadence: "daily"
    });

    compileProject(root);

    const profiles = listActiveWatchProfiles(root);
    assert.equal(profiles.length, 1);
    assert.ok(fs.existsSync(path.join(root, watch.profilePath)));
    assert.ok(fs.existsSync(path.join(root, "wiki", "glossary", "watch-ontology.md")));

    const surveillance = writeSurveillance(root, "Middle East");
    const report = writeReport(root, "Middle East");

    assert.ok(fs.existsSync(path.join(root, surveillance.notePath)));
    assert.ok(fs.existsSync(path.join(root, report.outputPath)));
    assert.ok(surveillance.results.length >= 2);
    assert.ok(report.results.length >= 2);
    assert.ok(report.results.every((result) => !result.relativePath.startsWith("wiki/surveillance/")));
    assert.ok(report.results.every((result) => !result.relativePath.startsWith("outputs/")));
    assert.ok(report.results.every((result) => !result.relativePath.startsWith("wiki/_indices/")));
    assert.ok(report.results.every((result) => !result.relativePath.startsWith("wiki/unresolved/")));

    const surveillanceContent = fs.readFileSync(path.join(root, surveillance.notePath), "utf8");
    const reportContent = fs.readFileSync(path.join(root, report.outputPath), "utf8");
    const ontologyContent = fs.readFileSync(path.join(root, "wiki", "glossary", "watch-ontology.md"), "utf8");

    assert.match(surveillanceContent, /Managed Watch Profile/);
    assert.match(surveillanceContent, /Red Sea/);
    assert.match(reportContent, /Watch Context/);
    assert.match(reportContent, /Netanyahu|Houthis|Gaza/);
    assert.match(ontologyContent, /Middle East/);
    assert.match(ontologyContent, /shipping disruption/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("research handoff imports GPT-supplied sources and output into the normal Cato pipeline", () => {
  const root = makeTempRepo();
  try {
    initProject(root);

    const result = captureResearch(
      root,
      {
        topic: "weekly investment meeting brief",
        watch_topic: "Global Macro",
        watch: {
          subject: "Global Macro",
          context: "Track this for the weekly investment meeting.",
          entities: ["Federal Reserve", "Middle East"],
          concepts: ["inflation", "oil risk"],
          triggers: ["major CPI surprise", "geopolitical escalation"],
          priority: "high",
          cadence: "weekly"
        },
        sources: [
          {
            title: "Fresh macro update",
            url: "https://example.com/fresh-macro",
            date: "2026-04-03",
            tags: ["macro", "llm-handoff"],
            concepts: ["inflation"],
            notes: "Latest macro print points to softer inflation and freight sensitivity."
          },
          {
            title: "Geopolitical shipping note",
            url: "https://example.com/shipping-risk",
            date: "2026-04-03",
            tags: ["geopolitics", "llm-handoff"],
            entities: ["Middle East"],
            concepts: ["oil risk"],
            notes: "Red Sea disruption remains relevant for freight and energy risk."
          }
        ],
        output: {
          kind: "report",
          title: "Weekly investment meeting brief",
          promote: true,
          body: `# Weekly investment meeting brief

## Executive Summary

This is the imported GPT-authored meeting brief.

## Action Implications

- Stay alert to freight, inflation, and geopolitical transmission.
`
        }
      },
      {
        downloadRunner: (downloadDir, url, options) => {
          fs.mkdirSync(downloadDir, { recursive: true });
          const filePath = path.join(downloadDir, `${String(options.rank).padStart(2, "0")}-${options.title.toLowerCase().replace(/\s+/g, "-")}.html`);
          fs.writeFileSync(
            filePath,
            `<html><head><title>${options.title}</title></head><body><h1>${options.title}</h1><p>${options.captureNotes}</p></body></html>`,
            "utf8"
          );
          return {
            filePath,
            finalUrl: url,
            contentType: "text/html"
          };
        }
      }
    );

    assert.equal(result.stagedSources.length, 2);
    assert.equal(result.ingested, 2);
    assert.ok(result.compileResult);
    assert.ok(result.outputResult);
    assert.ok(result.watch);
    assert.ok(fs.existsSync(path.join(root, result.ingestedResults[0].note_path)));
    assert.ok(fs.existsSync(path.join(root, result.outputResult.outputPath)));
    assert.ok(fs.existsSync(path.join(root, result.outputResult.promotedPath)));
    assert.ok(fs.existsSync(path.join(root, result.watch.surveillance.notePath)));

    const sourceNote = fs.readFileSync(path.join(root, result.ingestedResults[0].note_path), "utf8");
    const appendReview = fs.readFileSync(path.join(root, result.ingestedResults[0].draft_workspace_path), "utf8");
    const reportContent = fs.readFileSync(path.join(root, result.outputResult.outputPath), "utf8");
    const surveillanceContent = fs.readFileSync(path.join(root, result.watch.surveillance.notePath), "utf8");

    assert.match(sourceNote, /capture_source: llm_research_handoff/);
    assert.match(sourceNote, /document_class:/);
    assert.match(sourceNote, /draft_workspace_path:/);
    assert.match(appendReview, /## Working Counter-Read/);
    assert.match(sourceNote, /## Why It Matters/);
    assert.match(sourceNote, /Latest macro print points to softer inflation/i);
    assert.match(reportContent, /generation_mode: llm_handoff/);
    assert.match(reportContent, /## Imported Source Capture/);
    assert.match(surveillanceContent, /Managed Watch Profile/);

    const secondRun = captureResearch(
      root,
      {
        topic: "additional captured sources",
        sources: [
          {
            title: "Follow-up macro note",
            url: "https://example.com/follow-up-macro",
            notes: "Follow-up note."
          }
        ]
      }
      ,
      {
        noSurveil: true,
        downloadRunner: (downloadDir, url, options) => {
          fs.mkdirSync(downloadDir, { recursive: true });
          const filePath = path.join(downloadDir, `${String(options.rank).padStart(2, "0")}-follow-up-source.html`);
          fs.writeFileSync(
            filePath,
            `<html><head><title>${options.title}</title></head><body><h1>${options.title}</h1><p>${options.captureNotes}</p></body></html>`,
            "utf8"
          );
          return {
            filePath,
            finalUrl: url,
            contentType: "text/html"
          };
        }
      }
    );

    assert.equal(secondRun.ingested, 1);
    assert.equal(secondRun.watch, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("compile promotes domain concepts while retiring noisy generated concepts", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });

    fs.writeFileSync(
      path.join(root, "inbox", "drop_here", "macro-week-1.md"),
      `---
title: Labour market and energy prices week one
date: 2026-04-03
---

# Labour market and energy prices week one

The labor market remains firm and energy prices remain elevated.
The labor market and energy prices are the key macro transmission channels this week.
Actual previous forecast consensus points billion actual previous forecast consensus.
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(root, "inbox", "drop_here", "macro-week-2.md"),
      `---
title: Labour market and energy prices week two
date: 2026-04-04
---

# Labour market and energy prices week two

Energy prices remain sensitive while the labor market remains steady.
This note again focuses on the labor market and energy prices.
Actual previous forecast consensus points billion actual previous forecast consensus.
`,
      "utf8"
    );

    const staleConceptPath = path.join(root, "wiki", "concepts", "actual.md");
    fs.mkdirSync(path.dirname(staleConceptPath), { recursive: true });
    fs.writeFileSync(
      staleConceptPath,
      renderMarkdown(
        {
          id: "CONCEPT-2026-ACTUAL",
          kind: "concept-page",
          title: "actual",
          status: "active"
        },
        `# actual

## Definition
`
      ),
      "utf8"
    );

    ingest(root);
    compileProject(root, { promoteCandidates: true });

    assert.ok(fs.existsSync(path.join(root, "wiki", "concepts", "labor-market.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "concepts", "energy-prices.md")));
    assert.ok(!fs.existsSync(path.join(root, "wiki", "concepts", "forecast.md")));
    assert.ok(!fs.existsSync(path.join(root, "wiki", "concepts", "previous.md")));
    assert.ok(!fs.existsSync(path.join(root, "wiki", "concepts", "points.md")));
    assert.ok(!fs.existsSync(path.join(root, "wiki", "concepts", "billion.md")));

    const retiredConcept = parseFrontmatter(fs.readFileSync(staleConceptPath, "utf8"));
    assert.equal(retiredConcept.frontmatter.status, "retired");

    const conceptIndex = fs.readFileSync(path.join(root, "wiki", "_indices", "concepts.md"), "utf8");
    assert.match(conceptIndex, /labor market/i);
    assert.match(conceptIndex, /energy prices/i);
    assert.doesNotMatch(conceptIndex, /\[\[concepts\/actual\|actual\]\]/i);
    assert.doesNotMatch(conceptIndex, /\[\[concepts\/forecast\|forecast\]\]/i);

    const actualResults = searchCorpus(root, "actual", { limit: 20 });
    assert.ok(actualResults.every((result) => result.relativePath !== "wiki/concepts/actual.md"));

    const lintResult = lintProject(root);
    assert.ok(lintResult.issues.every((issue) => issue.file !== "wiki/concepts/actual.md"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("search excludes internal templates from retrieval results", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "inbox", "drop_here", "fed-note.md"),
      `# Federal Reserve issues FOMC statement

The Federal Reserve issued a fresh FOMC statement covering rates and inflation.`,
      "utf8"
    );
    ingest(root);
    compileProject(root);

    const results = searchCorpus(root, "Federal Reserve statement", { limit: 10 });
    assert.ok(results.some((result) => result.relativePath.startsWith("wiki/source-notes/")));
    assert.ok(results.every((result) => !result.relativePath.startsWith("wiki/_templates/")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("claim ledger refresh builds claim pages, snapshots, and why-believe output", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));

    ingest(root);
    compileProject(root, { promoteCandidates: true });
    writeReport(root, "passive flows and liquidity");
    const refresh = refreshClaims(root, { writeSnapshot: true });
    const whyBelieve = writeWhyBelieve(root, "passive flows");

    assert.ok(refresh.claims >= 1);
    assert.ok(fs.existsSync(path.join(root, "manifests", "claims.jsonl")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "claims", "index.md")));
    assert.ok(fs.existsSync(path.join(root, refresh.snapshotPath)));
    assert.ok(fs.existsSync(path.join(root, whyBelieve.outputPath)));

    const claimIndex = fs.readFileSync(path.join(root, "wiki", "claims", "index.md"), "utf8");
    const whyBelieveContent = fs.readFileSync(path.join(root, whyBelieve.outputPath), "utf8");
    const claimFiles = fs
      .readdirSync(path.join(root, "wiki", "claims"))
      .filter((name) => /^claim-.*\.md$/i.test(name) || /^claim-/.test(name.toLowerCase()));
    const claimPage = claimFiles.length ? fs.readFileSync(path.join(root, "wiki", "claims", claimFiles[0]), "utf8") : "";

    assert.match(claimIndex, /Claim Index/);
    assert.match(whyBelieveContent, /## Active Claims/);
    assert.match(whyBelieveContent, /## Why Believe This/);
    assert.match(whyBelieveContent, /## Retrieval Budget/);
    assert.match(claimPage, /## Counter-Arguments \/ Weakening Evidence/);
    assert.match(claimPage, /## Data Gaps \/ What Would Strengthen It/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("state engine refreshes state pages, diffs snapshots, and writes regime briefs", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.writeFileSync(
      path.join(root, "inbox", "drop_here", "market-structure-follow-up.md"),
      `# Dealer gamma and passive flows\n\nDealer gamma remained supportive but passive flows increased crowding risk.\n`,
      "utf8"
    );

    ingest(root);
    compileProject(root, { promoteCandidates: true });
    writeReport(root, "passive flows and liquidity");
    refreshClaims(root, { writeSnapshot: true });

    const firstState = refreshState(root, "Market Structure");
    fs.writeFileSync(
      path.join(root, "outputs", "reports", "manual-follow-up.md"),
      renderMarkdown(
        {
          id: "REPORT-2026-MANUALFOLLOW",
          kind: "research-report",
          title: "Market structure follow-up",
          created_at: new Date().toISOString(),
          sources: ["wiki/source-notes/sample-article.md"],
          generation_mode: "test"
        },
        `# Market structure follow-up

## Executive Summary

Passive flows remain supportive for index stability, but crowding risk has increased and dealer gamma may turn less helpful into expiry.
`
      ),
      "utf8"
    );
    refreshClaims(root, { writeSnapshot: true });
    const secondState = refreshState(root, "Market Structure");
    const diff = writeStateDiff(root, "Market Structure");
    const regime = writeRegimeBrief(root, {
      subjects: "Market Structure,Global Macro",
      set: "test-regime"
    });

    assert.ok(fs.existsSync(path.join(root, firstState.statePath)));
    assert.ok(fs.existsSync(path.join(root, secondState.statePath)));
    assert.ok(fs.existsSync(path.join(root, diff.outputPath)));
    assert.ok(fs.existsSync(path.join(root, regime.outputPath)));
    assert.ok(fs.existsSync(path.join(root, regime.regimePath)));

    const stateContent = fs.readFileSync(path.join(root, secondState.statePath), "utf8");
    const diffContent = fs.readFileSync(path.join(root, diff.outputPath), "utf8");

    assert.match(stateContent, /## Managed Snapshot/);
    assert.match(stateContent, /## Managed Strengthened/);
    assert.match(stateContent, /## Managed Counter-Arguments/);
    assert.match(stateContent, /## Managed Data Gaps/);
    assert.match(diffContent, /## Added Claims/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("decision layer writes meeting briefs, decision notes, red-team briefs, and market-change briefs", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.mkdirSync(path.join(root, "inbox", "self"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));
    fs.copyFileSync(fixturePath("self-principle.txt"), path.join(root, "inbox", "self", "satellite-principle.txt"));

    ingest(root);
    selfIngest(root);
    compileProject(root, { promoteCandidates: true });
    writeReport(root, "passive flows and liquidity");
    refreshClaims(root, { writeSnapshot: true });
    refreshState(root, "Market Structure");
    refreshState(root, "Global Macro");

    const meetingBrief = writeMeetingBrief(root, "Weekly investment meeting brief", {
      subjects: "Market Structure,Global Macro"
    });
    const decisionNote = writeDecisionNote(root, "passive flows");
    const redTeam = writeRedTeam(root, "passive flows");
    const changed = writeWhatChangedForMarkets(root, {
      subjects: "Market Structure,Global Macro"
    });

    assert.ok(fs.existsSync(path.join(root, meetingBrief.outputPath)));
    assert.ok(fs.existsSync(path.join(root, decisionNote.notePath)));
    assert.ok(fs.existsSync(path.join(root, redTeam.outputPath)));
    assert.ok(fs.existsSync(path.join(root, changed.outputPath)));

    const meetingContent = fs.readFileSync(path.join(root, meetingBrief.outputPath), "utf8");
    const decisionContent = fs.readFileSync(path.join(root, decisionNote.notePath), "utf8");
    const redTeamContent = fs.readFileSync(path.join(root, redTeam.outputPath), "utf8");

    assert.match(meetingContent, /## Portfolio Implications/);
    assert.match(meetingContent, /## Strongest Counter-Case/);
    assert.match(meetingContent, /## Data Gaps/);
    assert.match(decisionContent, /## Managed De-Risk Triggers/);
    assert.match(decisionContent, /## Managed Self-Model Lens/);
    assert.match(decisionContent, /## Managed Data Gaps/);
    assert.match(redTeamContent, /## Strongest Counter-Case/);
    assert.match(redTeamContent, /## Likely Blind Spots/);
    assert.match(redTeamContent, /## Retrieval Budget/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("lint surfaces stale operational notes and tag drift", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.writeFileSync(
      path.join(root, "wiki", "states", "stale-state.md"),
      renderMarkdown(
        {
          id: "STATE-2026-STALESTATE",
          kind: "state-page",
          title: "Stale State",
          status: "active",
          state_label: "mixed",
          confidence: "medium",
          last_refreshed_at: "2025-01-01T00:00:00.000Z",
          tags: ["Oil Risk", "oil-risk"]
        },
        `# Stale State

## Managed Snapshot

- Summary: stale on purpose.

## Managed Counter-Arguments

- Counter-case still open.

## Managed Data Gaps

- Need a fresh update.
`
      ),
      "utf8"
    );

    const lint = lintProject(root);
    const messages = lint.issues.map((issue) => issue.message).join("\n");
    assert.match(messages, /Stale state-page/);
    assert.match(messages, /Tag drift detected/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("architecture-ingestion commitments remain implemented and documented", () => {
  const root = makeTempRepo();
  try {
    const todo = fs.readFileSync(path.join(repoRoot, "tasks", "todo.md"), "utf8");
    const projectMap = fs.readFileSync(path.join(repoRoot, "docs", "project_map.md"), "utf8");
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

    assert.match(todo, /\[x\] Add semantic source\/document-class routing so ingest can branch by document class, not only file format\./);
    assert.match(todo, /\[x\] Add explicit L0\/L1\/L2\/L3 retrieval-budget rules and TLDR-first reading discipline to the prompts and operator workflow\./);
    assert.match(todo, /\[x\] Add managed counter-arguments \/ data-gaps blocks to the core claim\/state\/decision surfaces\./);
    assert.match(todo, /\[x\] Add a draft or append-and-review workspace distinct from canonical wiki surfaces\./);
    assert.match(todo, /\[x\] Add structured query\/backlink\/tag surfaces as a file-first sidecar catalog without rewriting storage away from markdown\./);
    assert.match(todo, /\[x\] Decide whether to embed external LLM execution into the CLI or keep the repo agent-driven\./);
    assert.match(projectMap, /keep repo agent-driven/i);
    assert.equal(Object.keys(packageJson.dependencies || {}).length, 0);
    assert.equal(Object.keys(packageJson.devDependencies || {}).length, 0);

    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "inbox", "drop_here", "risk-committee-meeting.md"),
      `---
title: Risk committee meeting notes
tags:
  - risk
  - committee
---

# Risk committee meeting notes

Agenda and action items for the portfolio risk committee meeting.
Discussion notes covered hedging, liquidity conditions, and follow-up actions.
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "inbox", "drop_here", "q1-quarterly-report.md"),
      `---
title: Q1 2026 quarterly report filing
tags:
  - filing
  - quarterly
---

# Q1 2026 quarterly report filing

This 10-Q shareholder update covered guidance, capital allocation, and disclosed risks.
`,
      "utf8"
    );
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));

    const ingestResult = ingest(root);
    const meetingRecord = ingestResult.results.find((record) => record.title === "Risk committee meeting notes");
    const filingRecord = ingestResult.results.find((record) => record.title === "Q1 2026 quarterly report filing");
    assert.ok(meetingRecord);
    assert.ok(filingRecord);
    assert.equal(meetingRecord.source_type, "article");
    assert.equal(filingRecord.source_type, "article");
    assert.equal(meetingRecord.document_class, "meeting_notes");
    assert.equal(filingRecord.document_class, "filing_or_company_update");
    assert.match(meetingRecord.draft_workspace_path, /^wiki\/drafts\/append-review\//);
    assert.ok(fs.existsSync(path.join(root, meetingRecord.draft_workspace_path)));

    const compileResult = compileProject(root, { promoteCandidates: true });
    assert.ok(compileResult.sourceRoutingBackfills >= 0);
    assert.ok(fs.existsSync(path.join(root, "manifests", "wiki_index.json")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "_indices", "tags.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "_indices", "backlinks.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "unresolved", "open-threads.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "drafts", "append-review", "index.md")));

    const askPrompt = fs.readFileSync(path.join(root, "config", "prompts", "ask.md"), "utf8");
    const reportPrompt = fs.readFileSync(path.join(root, "config", "prompts", "report.md"), "utf8");
    for (const tier of ["L0", "L1", "L2", "L3"]) {
      assert.match(askPrompt, new RegExp(tier));
      assert.match(reportPrompt, new RegExp(tier));
    }
    assert.match(askPrompt, /TL;DR-first/i);
    assert.match(reportPrompt, /TL;DR-first/i);

    const retrieval = retrieveEvidence(root, "liquidity mirage", {
      budget: "L0",
      limit: 6,
      minGrounding: 1
    });
    assert.equal(retrieval.requestedBudget, "L0");
    assert.notEqual(retrieval.activeBudget, "L0");
    assert.ok(retrieval.stages.some((stage) => stage.tier === "L0"));
    assert.ok(retrieval.stages.some((stage) => stage.tier === "L2"));
    assert.ok(retrieval.results.every((result) => !result.relativePath.startsWith("wiki/drafts/")));

    const askResult = askQuestion(root, "What does the corpus currently say about passive flows?");
    const reportResult = writeReport(root, "passive flows and liquidity");
    refreshClaims(root, { writeSnapshot: true });
    const stateResult = refreshState(root, "Market Structure");
    const decisionResult = writeDecisionNote(root, "passive flows");

    const askMemo = fs.readFileSync(path.join(root, askResult.outputPath), "utf8");
    const reportMemo = fs.readFileSync(path.join(root, reportResult.outputPath), "utf8");
    assert.match(askMemo, /## Retrieval Budget/);
    assert.match(reportMemo, /## Retrieval Budget/);
    assert.match(askMemo, /generation_mode: grounded_synthesis/);
    assert.match(reportMemo, /generation_mode: grounded_report/);

    const claimFiles = fs
      .readdirSync(path.join(root, "wiki", "claims"))
      .filter((name) => /^claim-.*\.md$/i.test(name));
    assert.ok(claimFiles.length >= 1);
    const claimContent = fs.readFileSync(path.join(root, "wiki", "claims", claimFiles[0]), "utf8");
    const stateContent = fs.readFileSync(path.join(root, stateResult.statePath), "utf8");
    const decisionContent = fs.readFileSync(path.join(root, decisionResult.notePath), "utf8");
    assert.match(claimContent, /## Counter-Arguments \/ Weakening Evidence/);
    assert.match(claimContent, /## Data Gaps \/ What Would Strengthen It/);
    assert.match(stateContent, /## Managed Counter-Arguments/);
    assert.match(stateContent, /## Managed Data Gaps/);
    assert.match(decisionContent, /## Managed Data Gaps/);

    const wikiIndex = JSON.parse(fs.readFileSync(path.join(root, "manifests", "wiki_index.json"), "utf8"));
    assert.ok(wikiIndex.notes.some((note) => note.relative_path === meetingRecord.note_path && note.document_class === "meeting_notes"));
    assert.ok(wikiIndex.notes.some((note) => note.relative_path === meetingRecord.note_path && note.backlinks.length >= 1));
    assert.ok(wikiIndex.tags.some((tag) => tag.labels.includes("risk")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("frontier pack prepares Codex-ready context and capture-frontier files the authored output back into Cato", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.mkdirSync(path.join(root, "inbox", "self"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));
    fs.copyFileSync(fixturePath("self-principle.txt"), path.join(root, "inbox", "self", "satellite-principle.txt"));

    ingest(root);
    selfIngest(root);
    compileProject(root, { promoteCandidates: true });

    const pack = writeFrontierPack(root, "passive flows", {
      mode: "decision",
      kind: "report"
    });

    assert.ok(fs.existsSync(path.join(root, pack.packPath)));
    assert.ok(fs.existsSync(path.join(root, pack.promptPath)));
    assert.ok(fs.existsSync(path.join(root, pack.capturePath)));

    const packPayload = JSON.parse(fs.readFileSync(path.join(root, pack.packPath), "utf8"));
    const prompt = fs.readFileSync(path.join(root, pack.promptPath), "utf8");
    assert.equal(packPayload.mode, "decision");
    assert.ok(packPayload.local_sources.some((source) => source.path.startsWith("wiki/states/")));
    assert.ok(packPayload.local_sources.some((source) => source.path.startsWith("wiki/decisions/")));
    assert.match(prompt, /capture-frontier/i);

    const capturePath = path.join(root, pack.capturePath);
    const captureBundle = JSON.parse(fs.readFileSync(capturePath, "utf8"));
    captureBundle.output.body = `# Passive flows frontier decision brief

## Executive Summary

Codex used the claim, state, and decision context pack to write this final brief.

## Portfolio Implications

- Keep an eye on crowding and liquidity transmission.
`;
    fs.writeFileSync(capturePath, `${JSON.stringify(captureBundle, null, 2)}\n`, "utf8");

    const capture = captureFrontier(root, pack.capturePath, { promote: true });
    assert.ok(capture.outputResult);
    assert.equal(capture.localSources.length >= 1, true);
    assert.ok(fs.existsSync(path.join(root, capture.outputResult.outputPath)));
    assert.ok(fs.existsSync(path.join(root, capture.outputResult.promotedPath)));

    const output = fs.readFileSync(path.join(root, capture.outputResult.outputPath), "utf8");
    assert.match(output, /generation_mode: frontier_handoff/);
    assert.match(output, /## Local Context Capture/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

console.log("All tests passed.");
