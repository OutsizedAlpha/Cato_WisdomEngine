Object.assign(global, require("../test-helpers"));

// Reporting, search, watch, and canonical report workflow tests.

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

    const report = captureModelAuthoredReport(root, "passive flows and liquidity");
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
        resolution: path.join(root, "python.cmd"),
        packageCheck: {
          ok: true,
          message: "7/7 pinned Python packages satisfied.",
          requirementsPath: "requirements-quant.txt",
          packages: [
            { packageName: "numpy", requiredVersion: "2.4.2", installedVersion: "2.4.2", ok: true },
            { packageName: "pandas", requiredVersion: "2.3.3", installedVersion: "2.3.3", ok: true }
          ]
        }
      },
      browserCheck: {
        ok: true,
        message: "Playwright and Puppeteer available.",
        playwrightCli: "Version 1.59.1",
        playwrightLaunch: "Headless Chromium launch ok (playwright-ok).",
        puppeteerCli: "24.40.0"
      }
    });

    assert.ok(fs.existsSync(path.join(root, report.outputResult.outputPath)));
    assert.ok(fs.existsSync(path.join(root, deck.outputPath)));
    assert.ok(fs.existsSync(path.join(root, surveillance.notePath)));
    assert.ok(fs.existsSync(path.join(root, reflection.outputPath)));
    assert.ok(fs.existsSync(path.join(root, principles.outputPath)));
    assert.ok(fs.existsSync(path.join(root, postmortem.notePath)));
    assert.ok(fs.existsSync(path.join(root, doctor.reportPath)));
    assert.ok(fs.existsSync(path.join(root, deck.promotedPath)));
    assert.ok(fs.existsSync(path.join(root, reflection.promotedPath)));

    const deckContent = fs.readFileSync(path.join(root, deck.outputPath), "utf8");
    const reflectionContent = fs.readFileSync(path.join(root, reflection.outputPath), "utf8");
    const surveillanceContent = fs.readFileSync(path.join(root, surveillance.notePath), "utf8");
    const doctorContent = fs.readFileSync(path.join(root, doctor.reportPath), "utf8");

    assert.match(deckContent, /marp: true/);
    assert.match(deckContent, /## Executive Summary/);
    assert.match(reflectionContent, /## Active Rules Most In Play/);
    assert.match(reflectionContent, /## Conflict Register/);
    assert.match(surveillanceContent, /Managed Snapshot/);
    assert.match(doctorContent, /## Project Health/);
    assert.match(doctorContent, /Python in repo shell:/);
    assert.match(doctorContent, /Python package contract:/);
    assert.match(doctorContent, /## Python Package Snapshot/);
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
    const report = captureModelAuthoredReport(root, "Middle East", {
      body: `# Middle East

## Executive Summary

Codex-authored final report on the Middle East watch topic.

## Watch Context

Netanyahu, Houthis, and Gaza remain central to the current route.

## What The Corpus Says

Shipping disruption and oil sensitivity remain central to the current geopolitical stress.

## Judgement

Escalation and shipping disruption are the key portfolio transmission channels.

## Counter-Case

The conflict could de-escalate faster than the corpus expects.

## Data Gaps

Fresh evidence could still change the oil and freight read-through.

## Source Map

- Local source map preserved through capture.
`
    });

    assert.ok(fs.existsSync(path.join(root, surveillance.notePath)));
    assert.ok(fs.existsSync(path.join(root, report.outputResult.outputPath)));
    assert.ok(surveillance.results.length >= 2);
    assert.ok(report.pack.results.length >= 2);
    assert.ok(report.pack.results.every((result) => !result.relativePath.startsWith("wiki/surveillance/")));
    assert.ok(report.pack.results.every((result) => !result.relativePath.startsWith("outputs/")));
    assert.ok(report.pack.results.every((result) => !result.relativePath.startsWith("wiki/_indices/")));
    assert.ok(report.pack.results.every((result) => !result.relativePath.startsWith("wiki/unresolved/")));

    const surveillanceContent = fs.readFileSync(path.join(root, surveillance.notePath), "utf8");
    const reportContent = fs.readFileSync(path.join(root, report.outputResult.outputPath), "utf8");
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
runTest("search prefers reviewed source notes over provisional chartpack handoff notes", () => {
  const root = makeTempRepo();
  try {
    initProject(root);

    writeSourceNoteFixture(
      root,
      "reviewed-rates-note.md",
      {
        id: "SRC-REVIEWED-01",
        kind: "source-note",
        title: "Reviewed rates and dollar note",
        source_type: "paper",
        document_class: "research_note",
        capture_source: "codex_pdf_vision_handoff",
        ingested_at: "2026-04-05T12:00:00.000Z",
        raw_path: "raw/pdfs/reviewed-rates.pdf",
        extracted_text_path: "extracted/text/reviewed-rates.txt",
        metadata_path: "extracted/metadata/reviewed-rates.json",
        status: "reviewed",
        review_status: "text_reviewed",
        review_method: "codex_corpus_review",
        review_scope: "Full qualitative text review.",
        tags: ["rates", "dollar"],
        entities: [],
        concepts: ["duration", "us dollar"]
      },
      `# Reviewed rates and dollar note

## Summary

Reviewed evidence says bond supply keeps long duration under pressure while the dollar stays firm and AI leadership supports selective equities.
`
    );

    writeSourceNoteFixture(
      root,
      "draft-chartpack-note.md",
      {
        id: "SRC-DRAFT-01",
        kind: "source-note",
        title: "Draft global markets chart pack",
        source_type: "paper",
        document_class: "chartpack_or_visual",
        capture_source: "codex_pdf_vision_handoff",
        ingested_at: "2026-04-05T12:00:00.000Z",
        raw_path: "raw/pdfs/draft-chartpack.pdf",
        extracted_text_path: "extracted/text/draft-chartpack.txt",
        metadata_path: "extracted/metadata/draft-chartpack.json",
        status: "draft",
        review_status: "unreviewed",
        review_method: "",
        review_scope: "",
        tags: ["markets", "chartpack"],
        entities: [],
        concepts: ["duration", "us dollar"]
      },
      `# Draft global markets chart pack

## Summary

This fallback chart deck mentions bonds, the dollar, and equities, but it has not been visually reviewed.
`
    );

    const results = searchCorpus(root, "global markets bonds dollar equities", { limit: 2 });
    assert.equal(results[0].title, "Reviewed rates and dollar note");
    assert.equal(results[0].frontmatter.review_status, "text_reviewed");
    assert.ok(
      !results.some(
        (result, index) => index === 0 && result.title === "Draft global markets chart pack"
      )
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("search can retrieve notes from concept metadata even when the phrase is not repeated in the body", () => {
  const root = makeTempRepo();
  try {
    initProject(root);

    writeSourceNoteFixture(
      root,
      "dealer-positioning.md",
      {
        id: "SRC-META-01",
        kind: "source-note",
        title: "Dealer positioning into expiry",
        source_type: "paper",
        document_class: "research_note",
        capture_source: "manual_drop",
        ingested_at: "2026-04-09T12:00:00.000Z",
        raw_path: "raw/pdfs/dealer-positioning.pdf",
        extracted_text_path: "extracted/text/dealer-positioning.txt",
        metadata_path: "extracted/metadata/dealer-positioning.json",
        status: "reviewed",
        review_status: "text_reviewed",
        review_method: "codex_corpus_review",
        review_scope: "Full qualitative text review.",
        tags: ["dealers", "expiry"],
        entities: ["S&P 500"],
        concepts: ["market structure"]
      },
      `# Dealer positioning into expiry

## Summary

Gamma and positioning still matter into expiry windows, even when the note avoids the usual label.
`
    );

    const results = searchCorpus(root, "market structure", { limit: 3 });
    assert.ok(results.some((result) => result.title === "Dealer positioning into expiry"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("lint flags codex chartpacks that have not been visually reviewed", () => {
  const root = makeTempRepo();
  try {
    initProject(root);

    writeSourceNoteFixture(
      root,
      "draft-chartpack-note.md",
      {
        id: "SRC-DRAFT-02",
        kind: "source-note",
        title: "Draft global markets chart pack",
        source_type: "paper",
        document_class: "chartpack_or_visual",
        capture_source: "codex_pdf_vision_handoff",
        ingested_at: "2026-04-05T12:00:00.000Z",
        raw_path: "raw/pdfs/draft-chartpack.pdf",
        extracted_text_path: "extracted/text/draft-chartpack.txt",
        metadata_path: "extracted/metadata/draft-chartpack.json",
        status: "draft",
        review_status: "unreviewed",
        review_method: "",
        review_scope: "",
        tags: ["markets", "chartpack"],
        entities: [],
        concepts: ["global markets"]
      },
      `# Draft global markets chart pack

## Summary

Fallback capture only.
`
    );

    const lint = lintProject(root);
    assert.ok(
      lint.issues.some(
        (issue) =>
          issue.file === "wiki/source-notes/draft-chartpack-note.md" &&
          issue.severity === "warning" &&
          /visual review/i.test(issue.message)
      )
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("broad investment reports use curated multi-section routing instead of the generic lexical path", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "extracted", "text"), { recursive: true });

    writeSourceNoteFixture(
      root,
      "macro-regime.md",
      {
        id: "SRC-INVEST-01",
        kind: "source-note",
        title: "Macro regime and energy shock note",
        source_type: "paper",
        document_class: "research_note",
        capture_source: "codex_pdf_vision_handoff",
        ingested_at: "2026-04-05T12:00:00.000Z",
        raw_path: "raw/pdfs/macro-regime.pdf",
        extracted_text_path: "extracted/text/macro-regime.txt",
        metadata_path: "extracted/metadata/macro-regime.json",
        status: "reviewed",
        review_status: "text_reviewed",
        review_method: "codex_corpus_review",
        review_scope: "Full qualitative text review.",
        tags: ["macro", "energy"],
        entities: [],
        concepts: ["stagflation", "oil", "inflation"]
      },
      `# Macro regime and energy shock note

## Summary

Energy-price pressure is the current regime shock, but de-escalation would reopen the AI and duration recovery path.
`
    );
    fs.writeFileSync(
      path.join(root, "extracted", "text", "macro-regime.txt"),
      `Global macro regime note
- The central regime question is whether the oil shock fades quickly or extends a second inflation wave.
- Growth is not yet breaking, but inflation risk has clearly widened again.
- De-escalation would reopen the path for AI leadership and a cleaner duration recovery.
`,
      "utf8"
    );

    writeSourceNoteFixture(
      root,
      "rates-duration.md",
      {
        id: "SRC-INVEST-02",
        kind: "source-note",
        title: "Rates and duration note",
        source_type: "paper",
        document_class: "research_note",
        capture_source: "codex_pdf_vision_handoff",
        ingested_at: "2026-04-05T12:00:00.000Z",
        raw_path: "raw/pdfs/rates-duration.pdf",
        extracted_text_path: "extracted/text/rates-duration.txt",
        metadata_path: "extracted/metadata/rates-duration.json",
        status: "reviewed",
        review_status: "text_reviewed",
        review_method: "codex_corpus_review",
        review_scope: "Full qualitative text review.",
        tags: ["rates", "bonds"],
        entities: [],
        concepts: ["duration", "bond supply"]
      },
      `# Rates and duration note

## Summary

Long duration is capped by supply and term-premia pressure, even if policy-hike fears fade.
`
    );
    fs.writeFileSync(
      path.join(root, "extracted", "text", "rates-duration.txt"),
      `Rates and duration note
- Long-dated sovereign bonds remain vulnerable because supply is heavy and traditional buyers are waning.
- A relief rally can happen, but duration is not a clean all-clear trade in this regime.
`,
      "utf8"
    );

    writeSourceNoteFixture(
      root,
      "equities-ai.md",
      {
        id: "SRC-INVEST-03",
        kind: "source-note",
        title: "Equities and AI leadership note",
        source_type: "paper",
        document_class: "research_note",
        capture_source: "codex_pdf_vision_handoff",
        ingested_at: "2026-04-05T12:00:00.000Z",
        raw_path: "raw/pdfs/equities-ai.pdf",
        extracted_text_path: "extracted/text/equities-ai.txt",
        metadata_path: "extracted/metadata/equities-ai.json",
        status: "reviewed",
        review_status: "text_reviewed",
        review_method: "codex_corpus_review",
        review_scope: "Full qualitative text review.",
        tags: ["equities", "ai"],
        entities: [],
        concepts: ["ai", "equities"]
      },
      `# Equities and AI leadership note

## Summary

US and Asia tech-heavy indices regain leadership if the conflict de-escalates and the AI capex story resumes.
`
    );
    fs.writeFileSync(
      path.join(root, "extracted", "text", "equities-ai.txt"),
      `Equities and AI leadership note
- The AI trade is damaged but not broken.
- Leadership remains concentrated in US and Asia tech-heavy markets rather than broad global beta.
- Software is more contested than AI infrastructure.
`,
      "utf8"
    );

    writeSourceNoteFixture(
      root,
      "sector-defensives.md",
      {
        id: "SRC-INVEST-03B",
        kind: "source-note",
        title: "Defensive rotation and healthcare note",
        source_type: "paper",
        document_class: "research_note",
        capture_source: "codex_pdf_vision_handoff",
        ingested_at: "2026-04-05T12:00:00.000Z",
        raw_path: "raw/pdfs/sector-defensives.pdf",
        extracted_text_path: "extracted/text/sector-defensives.txt",
        metadata_path: "extracted/metadata/sector-defensives.json",
        status: "reviewed",
        review_status: "text_reviewed",
        review_method: "codex_corpus_review",
        review_scope: "Full qualitative text review.",
        tags: ["health-care", "defensives"],
        entities: [],
        concepts: ["health care", "defensives"]
      },
      `# Defensive rotation and healthcare note

## Summary

Healthcare and other quality defensives hold up better if energy-price pressure persists and cyclical confidence weakens.
`
    );
    fs.writeFileSync(
      path.join(root, "extracted", "text", "sector-defensives.txt"),
      `Defensive rotation and healthcare note
- Health care remains one of the cleanest defensive shelters in a volatile energy regime.
- Quality balance sheets and inelastic demand matter more than deep cyclical beta here.
`,
      "utf8"
    );

    writeSourceNoteFixture(
      root,
      "private-credit.md",
      {
        id: "SRC-INVEST-04",
        kind: "source-note",
        title: "Private credit concentration note",
        source_type: "paper",
        document_class: "research_note",
        capture_source: "codex_pdf_vision_handoff",
        ingested_at: "2026-04-05T12:00:00.000Z",
        raw_path: "raw/pdfs/private-credit.pdf",
        extracted_text_path: "extracted/text/private-credit.txt",
        metadata_path: "extracted/metadata/private-credit.json",
        status: "reviewed",
        review_status: "text_reviewed",
        review_method: "codex_corpus_review",
        review_scope: "Full qualitative text review.",
        tags: ["credit", "private-credit"],
        entities: [],
        concepts: ["private credit", "concentration risk"]
      },
      `# Private credit concentration note

## Summary

Private credit remains investable, but hyperscaler and software concentration create real downside if AI spending or equity sentiment rolls over.
`
    );
    fs.writeFileSync(
      path.join(root, "extracted", "text", "private-credit.txt"),
      `Private credit concentration note
- Private credit is still an opportunity set, but 2026 looks like a real underwriting test.
- Concentrated software and hyperscaler exposure creates asymmetric downside if cashflows or sentiment deteriorate.
`,
      "utf8"
    );

    writeSourceNoteFixture(
      root,
      "em-flows.md",
      {
        id: "SRC-INVEST-05",
        kind: "source-note",
        title: "EM capital flows and dollar note",
        source_type: "paper",
        document_class: "research_note",
        capture_source: "codex_pdf_vision_handoff",
        ingested_at: "2026-04-05T12:00:00.000Z",
        raw_path: "raw/pdfs/em-flows.pdf",
        extracted_text_path: "extracted/text/em-flows.txt",
        metadata_path: "extracted/metadata/em-flows.json",
        status: "reviewed",
        review_status: "text_reviewed",
        review_method: "codex_corpus_review",
        review_scope: "Full qualitative text review.",
        tags: ["em", "fx"],
        entities: [],
        concepts: ["em", "capital flows", "dollar"]
      },
      `# EM capital flows and dollar note

## Summary

EM outflows and dollar strength are the first places where cross-asset pressure reappears when the geopolitical shock intensifies.
`
    );
    fs.writeFileSync(
      path.join(root, "extracted", "text", "em-flows.txt"),
      `EM capital flows and dollar note
- Emerging-market outflows have already intensified through both bonds and equities.
- The dollar and oil complex are the first pressure points to watch if the shock persists.
`,
      "utf8"
    );

    const report = captureModelAuthoredReport(root, "Current investment summary across all ingested research", {
      limit: 24,
      body: `# Current investment summary across all ingested research

## Executive Summary

The corpus supports a selective-risk stance rather than a broad risk-on view.

## What The Corpus Says

### 1. Macro / Regime

Long-dated sovereign bonds remain vulnerable while the inflation path is still fragile.

### 2. Rates / Duration

Duration still looks tactical rather than automatically defensive.

### 3. Equities / AI

The AI trade is damaged but not broken, and quality leadership still matters.

### 4. Sector / Defensive Rotation

Defensives deserve more respect than deep cyclical beta.

### 5. Credit / Liquidity

Private credit still offers opportunity, but underwriting quality matters more than reach-for-yield behaviour.

### 6. FX / Commodities / EM

Oil, the dollar, and EM flows remain the first cross-asset pressure points to watch.

## Investment Implications

## Judgement

### Prefer

- selective risk

### Be Careful With

- complacent duration and weak software beta

### What Looks Most Important Right Now

- oil, the dollar, and private-credit concentration

## Counter-Case

The corpus could still be underweight a cleaner de-escalation path.

## Data Gaps

Fresh opposing evidence could still change the rates and AI read-through.

## Bottom Line

Stay selective.

## Source Map

- Local source map preserved through capture.
`
    });
    const content = fs.readFileSync(path.join(root, report.outputResult.outputPath), "utf8");

    assert.match(content, /generation_mode: terminal_model_report/);
    assert.match(content, /## What The Corpus Says/);
    assert.match(content, /## Investment Implications/);
    assert.match(content, /### Prefer/);
    assert.match(content, /### Be Careful With/);
    assert.match(content, /## Bottom Line/);
    assert.match(content, /Long-dated sovereign bonds remain vulnerable/i);
    assert.match(content, /The AI trade is damaged but not broken/i);
    assert.doesNotMatch(content, /The current corpus supports a report-level synthesis route/i);
    assert.doesNotMatch(content, /Why it matters:/i);
    assert.doesNotMatch(content, /### Working Synthesis/i);
    assert.ok(report.pack.results.length >= 6);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("broad investment report packs include probability surfaces and forward-path scaffolding", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "wiki", "probabilities"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "wiki", "probabilities", "global-risk-regime.md"),
      renderMarkdown(
        {
          id: "PROB-TEST-01",
          kind: "probability-page",
          title: "Global Risk Regime Probability Surface",
          status: "active",
          confidence: "medium",
          profile_id: "global-risk-regime",
          as_of_date: "2026-04-11"
        },
        `# Global Risk Regime Probability Surface

## Managed Current Regime

- Active regime: selective risk with inflation pressure.

## Managed Scenario Archetypes

- Defensive carry path.

## Managed Transmission Map

- Oil and rates remain the main transmission chain.

## Managed Data Gaps

- Macro feature panel is still partial.
`
      ),
      "utf8"
    );

    const report = writeReport(root, "Current investment summary across all ingested research");
    const pack = JSON.parse(fs.readFileSync(path.join(root, report.packPath), "utf8"));
    const bundle = JSON.parse(fs.readFileSync(path.join(root, report.capturePath), "utf8"));
    const prompt = fs.readFileSync(path.join(root, report.promptPath), "utf8");

    assert.equal(pack.probabilities.length, 1);
    assert.equal(pack.probabilities[0].profile_id, "global-risk-regime");
    assert.ok(pack.local_sources.some((source) => source.path === "wiki/probabilities/global-risk-regime.md"));
    assert.match(prompt, /Probability Surfaces/);
    assert.match(prompt, /Use the probability surfaces as forward-looking distribution context/);
    assert.match(bundle.output.body, /## Forward Probability Surface/);
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
runTest("legacy report archive preserves original filenames for stable internal references", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "outputs", "reports"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "outputs", "reports", "legacy-draft.md"),
      renderMarkdown(
        {
          id: "REPORT-2026-LEGACYDRAFT",
          kind: "research-report",
          title: "Legacy draft report",
          created_at: new Date().toISOString(),
          sources: []
        },
        `# Legacy draft report

## Executive Summary

Stable archive naming matters because older markdown surfaces may still reference this artefact.
`
      ),
      "utf8"
    );

    const archive = archiveLegacyReportRuns(root);
    assert.equal(archive.archived, 1);
    assert.deepEqual(archive.archivedPaths, ["outputs/reports/archive/legacy-deterministic/legacy-draft.md"]);
    assert.ok(fs.existsSync(path.join(root, "outputs", "reports", "archive", "legacy-deterministic", "legacy-draft.md")));
    assert.ok(!fs.existsSync(path.join(root, "outputs", "reports", "legacy-draft.md")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("updateManagedNote refreshes frontmatter as well as managed blocks", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    const filePath = path.join(root, "wiki", "states", "managed-note-test.md");

    updateManagedNote(
      filePath,
      {
        id: "STATE-2026-MANAGEDTEST",
        kind: "state-page",
        title: "Managed Note Test",
        last_refreshed_at: "2026-04-05T20:00:00.000Z"
      },
      "Managed Note Test",
      {
        snapshot: `
## Managed Snapshot

- First pass.
`
      }
    );

    updateManagedNote(
      filePath,
      {
        id: "STATE-2026-MANAGEDTEST",
        kind: "state-page",
        title: "Managed Note Test",
        last_refreshed_at: "2026-04-05T21:00:00.000Z"
      },
      "Managed Note Test",
      {
        snapshot: `
## Managed Snapshot

- Second pass.
`
      }
    );

    const parsed = parseFrontmatter(fs.readFileSync(filePath, "utf8"));
    assert.equal(parsed.frontmatter.last_refreshed_at, "2026-04-05T21:00:00.000Z");
    assert.match(parsed.body, /Second pass/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
