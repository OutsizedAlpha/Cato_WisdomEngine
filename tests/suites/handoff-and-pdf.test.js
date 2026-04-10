Object.assign(global, require("../test-helpers"));

// Handoff, report capture, and PDF bridge tests.

runTest("pdf vision handoff packs PDFs and captures authored extraction back into Cato", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });

    const pdfPath = path.join(root, "inbox", "drop_here", "mi-guide-to-the-markets-uk.pdf");
    createSimplePdf(pdfPath, "2");

    const pack = writePdfPack(root, {
      from: "inbox/drop_here",
      limit: 1,
      maxPages: 1,
      renderRunner: (_root, _pdfPath, outputDir) => {
        fs.mkdirSync(outputDir, { recursive: true });
        createPngFixture(path.join(outputDir, "page-001.png"));
        return {
          ok: true,
          renderer: "stub-renderer",
          page_count: 1,
          metadata: {
            title: "MI Guide to the Markets UK",
            author: "J.P. Morgan Asset Management"
          },
          rendered_pages: [{ page: 1, path: "page-001.png", width: 1, height: 1 }]
        };
      }
    });

    assert.ok(fs.existsSync(path.join(root, pack.packPath)));
    assert.ok(fs.existsSync(path.join(root, pack.promptPath)));
    assert.ok(fs.existsSync(path.join(root, pack.capturePath)));

    const bundlePath = path.join(root, pack.capturePath);
    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
    const authoredPath = path.join(root, bundle.documents[0].extracted_text_path);
    fs.writeFileSync(
      authoredPath,
      "# MI Guide to the Markets UK\n\n## Clean Extracted Text\n\nThis chart pack summarises asset-class performance and macro context for UK allocators.\n",
      "utf8"
    );
    bundle.model = "gpt-5.4 xhigh via Codex";
    bundle.documents[0].title = "MI Guide to the Markets UK";
    bundle.documents[0].document_class = "research_note";
    bundle.documents[0].entities = ["United Kingdom"];
    bundle.documents[0].concepts = ["asset allocation"];
    fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

    const result = capturePdf(root, bundlePath);
    assert.equal(result.ingested, 1);
    assert.equal(result.failures.length, 0);
    assert.equal(result.results[0].title, "MI Guide to the Markets UK");
    assert.equal(result.results[0].extraction_method, "llm_vision_handoff");
    assert.match(result.results[0].note_path, /mi-guide-to-the-markets-uk\.md$/);

    const notePath = path.join(root, result.results[0].note_path);
    const metadataPath = path.join(root, result.results[0].metadata_path);
    const note = fs.readFileSync(notePath, "utf8");
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    assert.match(note, /MI Guide to the Markets UK/);
    assert.equal(metadata.extraction_method, "llm_vision_handoff");
    assert.deepEqual(metadata.entities, ["United Kingdom"]);
    assert.equal(metadata.review_status, "text_reviewed");
    assert.equal(metadata.note_status, "reviewed");
    assert.match(note, /review_status: text_reviewed/);

    const lintResult = lintProject(root);
    const errorCount = lintResult.issues.filter((issue) => issue.severity === "error").length;
    assert.equal(errorCount, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("ingest skips native extraction when a source sidecar already provides extracted_text", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });

    const pdfPath = path.join(root, "inbox", "drop_here", "markets-interactive-chart-pack.pdf");
    createSimplePdf(pdfPath, "Power BI Desktop");
    fs.writeFileSync(
      `${pdfPath}.cato-meta.json`,
      `${JSON.stringify(
        {
          title: "Global Markets Chart Pack (Apr 2026 snapshot)",
          document_class: "chartpack_or_visual",
          capture_source: "codex_pdf_vision_handoff",
          extracted_text:
            "Global Markets Chart Pack\nThis chart pack is a snapshot of a live interactive cross-asset chart pack updated on 1st April 2026.",
          extraction_method: "llm_vision_handoff",
          extraction_notes: [
            "Supplied from a Codex-authored handoff bundle.",
            "Built-in PDF extraction should be skipped for this source."
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = ingest(root, {
      extractor: () => {
        throw new Error("native extractor should not be called");
      }
    });

    assert.equal(result.ingested, 1);
    assert.equal(result.results[0].title, "Global Markets Chart Pack (Apr 2026 snapshot)");
    assert.equal(result.results[0].extraction_method, "llm_vision_handoff");

    const extractedText = fs.readFileSync(path.join(root, result.results[0].extracted_text_path), "utf8");
    assert.match(extractedText, /Global Markets Chart Pack/);
    assert.match(extractedText, /cross-asset chart pack/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("capture-pdf deduplicates capture notes when retrying a source with a stale sidecar", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });

    const pdfPath = path.join(root, "inbox", "drop_here", "markets-chart-pack.pdf");
    createSimplePdf(pdfPath, "Power BI Desktop");

    const authoredPath = path.join(root, "cache", "manual-chart-pack-authored.md");
    fs.mkdirSync(path.dirname(authoredPath), { recursive: true });
    fs.writeFileSync(
      authoredPath,
      "Global Markets Chart Pack\nThis chart pack is a snapshot of a live interactive cross-asset chart pack.\n",
      "utf8"
    );

    const sharedBundleNote =
      "Direct capture created because the generic pack builder overflowed on this chart pack.";
    const sharedDocumentNote =
      "Treat numeric chart readings as reviewable until they are checked visually page by page.";
    const bundlePath = path.join(root, "cache", "manual-chart-pack-capture.json");
    fs.writeFileSync(
      bundlePath,
      `${JSON.stringify(
        {
          capture_source: "codex_pdf_vision_handoff",
          model: "codex-cli direct capture",
          notes: sharedBundleNote,
          documents: [
            {
              source_path: path.relative(root, pdfPath).replace(/\\/g, "/"),
              title: "Global Markets Chart Pack (Apr 2026 snapshot)",
              document_class: "chartpack_or_visual",
              capture_notes: sharedDocumentNote,
              extracted_text_path: path.relative(root, authoredPath).replace(/\\/g, "/"),
              extraction_method: "llm_vision_handoff",
              extraction_notes: ["Direct capture retry path."]
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    fs.writeFileSync(
      `${pdfPath}.cato-meta.json`,
      `${JSON.stringify(
        {
          capture_notes: `${sharedBundleNote}\n\n${sharedDocumentNote}`
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const result = capturePdf(root, bundlePath, { copy: true });
    const metadata = JSON.parse(fs.readFileSync(path.join(root, result.results[0].metadata_path), "utf8"));
    assert.equal(
      metadata.capture_notes,
      `${sharedBundleNote}\n\n${sharedDocumentNote}`
    );
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
runTest("report workflow writes a pack, captures a canonical final report, and archives prior canonical versions", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));

    ingest(root);
    compileProject(root, { promoteCandidates: true });

    const first = captureModelAuthoredReport(root, "passive flows and liquidity", {
      body: `# passive flows and liquidity

## Executive Summary

First final report.

## What The Corpus Says

Passive flows still matter.

## Judgement

Stay alert.

## Counter-Case

The flow impulse could fade.

## Data Gaps

Need fresher evidence.

## Source Map
`
    });

    assert.ok(fs.existsSync(path.join(root, first.pack.packPath)));
    assert.ok(fs.existsSync(path.join(root, first.pack.promptPath)));
    assert.ok(fs.existsSync(path.join(root, first.outputResult.outputPath)));
    assert.equal(first.outputResult.outputPath, "wiki/reports/passive-flows-and-liquidity.md");

    const secondPack = writeReport(root, "passive flows and liquidity");
    const secondBundlePath = path.join(root, secondPack.capturePath);
    const secondBundle = JSON.parse(fs.readFileSync(secondBundlePath, "utf8"));
    secondBundle.model = "codex test session";
    secondBundle.authoring_session = "test-suite";
    secondBundle.output.body = `# passive flows and liquidity

## Executive Summary

Second final report.

## What The Corpus Says

The corpus moved on.

## Judgement

Stay selective.

## Counter-Case

Opposing evidence still matters.

## Data Gaps

Need more primary evidence.

## Source Map
`;
    fs.writeFileSync(secondBundlePath, `${JSON.stringify(secondBundle, null, 2)}\n`, "utf8");

    const second = captureReport(root, secondPack.capturePath);
    assert.ok(fs.existsSync(path.join(root, second.outputResult.outputPath)));
    assert.ok(second.outputResult.archivedPath);
    assert.ok(fs.existsSync(path.join(root, second.outputResult.archivedPath)));

    const canonical = fs.readFileSync(path.join(root, second.outputResult.outputPath), "utf8");
    assert.match(canonical, /Second final report/);
    assert.match(canonical, /authoring_model: codex test session/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("substantive authored commands now prepare model packs and capture-authored overwrites the scaffold path", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));
    ingest(root);
    compileProject(root, { promoteCandidates: true });
    refreshClaims(root, { writeSnapshot: true });

    const askPack = writeAuthoredPack(root, "ask", "What does the corpus currently say about passive flows?", {
      limit: 6
    });
    assert.ok(fs.existsSync(path.join(root, askPack.packPath)));
    assert.ok(fs.existsSync(path.join(root, askPack.promptPath)));
    assert.ok(fs.existsSync(path.join(root, askPack.capturePath)));

    const askBundle = JSON.parse(fs.readFileSync(path.join(root, askPack.capturePath), "utf8"));
    assert.equal(askBundle.output.output_path, askPack.outputPath);
    assert.match(askBundle.output.body, /MODEL_AUTHOR_REPLACE_THIS_SCAFFOLD/);

    const askCapture = captureModelAuthoredOutput(
      root,
      askPack,
      `# What does the corpus currently say about passive flows?

## Executive Summary

Passive flows still matter for market structure, liquidity concentration, and benchmark behaviour.

## Judgement

The corpus still points to passive concentration as a real plumbing issue rather than a cosmetic flow narrative.
`
    );
    const askOutput = fs.readFileSync(path.join(root, askCapture.outputResult.outputPath), "utf8");
    assert.match(askOutput, /Passive flows still matter/);
    assert.doesNotMatch(askOutput, /MODEL_AUTHOR_REPLACE_THIS_SCAFFOLD/);
    assert.equal(askCapture.outputResult.outputPath, askPack.outputPath);

    const statePack = writeAuthoredPack(root, "state-refresh", "Market Structure", {
      "claim-limit": 8,
      "evidence-limit": 6
    });
    assert.ok(fs.existsSync(path.join(root, statePack.capturePath)));

    const stateCapture = captureModelAuthoredOutput(
      root,
      statePack,
      `# Market Structure

## Executive Summary

Market structure remains fragile because passive concentration and benchmark plumbing still dominate the route of risk transmission.

## Current State

The active evidence set still points to crowding, benchmark effects, and liquidity asymmetry as the critical state variables.

## Counter-Case

Fresh opposing evidence could weaken this view if active price discovery broadens materially.
`
    );
    const stateOutput = fs.readFileSync(path.join(root, stateCapture.outputResult.outputPath), "utf8");
    assert.match(stateOutput, /market structure remains fragile/i);
    assert.doesNotMatch(stateOutput, /MODEL_AUTHOR_REPLACE_THIS_SCAFFOLD/);
    assert.equal(stateCapture.outputResult.outputPath, statePack.outputPath);
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
    assert.ok(packPayload.self_model);
    assert.match(prompt, /capture-frontier/i);
    assert.match(prompt, /Active Self-Model/i);

    const capturePath = path.join(root, pack.capturePath);
    const captureBundle = JSON.parse(fs.readFileSync(capturePath, "utf8"));
    captureBundle.model = "codex test session";
    captureBundle.authoring_session = "test-suite";
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
