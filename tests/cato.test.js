const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { askQuestion } = require("../src/ask");
const { compileProject } = require("../src/compile");
const { writeDeck } = require("../src/deck");
const { runDoctor } = require("../src/doctor");
const { ingest } = require("../src/ingest");
const { initProject } = require("../src/init");
const { lintProject } = require("../src/lint");
const { createPostmortem } = require("../src/postmortem");
const { writePrinciplesSnapshot } = require("../src/principles");
const { writeReflection } = require("../src/reflect");
const { captureResearch } = require("../src/research-handoff");
const { writeReport } = require("../src/report");
const { searchCorpus } = require("../src/search");
const { selfIngest } = require("../src/self-ingest");
const { writeSurveillance } = require("../src/surveil");
const { createWatchProfile, listActiveWatchProfiles } = require("../src/watch");

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

runTest("ingest, compile, search, ask, and lint produce a working research loop", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));

    const ingestResult = ingest(root);
    assert.equal(ingestResult.ingested, 2);

    const compileResult = compileProject(root, { promoteCandidates: true });
    assert.equal(compileResult.sourceNotes, 2);
    assert.ok(fs.existsSync(path.join(root, "wiki", "concepts", "passive-flows.md")));

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
    const doctor = runDoctor(root);

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
    const reportContent = fs.readFileSync(path.join(root, result.outputResult.outputPath), "utf8");
    const surveillanceContent = fs.readFileSync(path.join(root, result.watch.surveillance.notePath), "utf8");

    assert.match(sourceNote, /capture_source: llm_research_handoff/);
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

console.log("All tests passed.");
