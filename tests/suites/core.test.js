Object.assign(global, require("../test-helpers"));

// Core repo, ingest, and output-policy tests.

runTest("init seeds the project structure and generated indices", () => {
  const root = makeTempRepo();
  try {
    const result = initProject(root);
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(path.join(root, "commands")));
    assert.ok(fs.existsSync(path.join(root, "manifests", "file_hashes.json")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "_indices", "sources.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "_maps", "home.md")));
    const scenarioProfiles = JSON.parse(fs.readFileSync(path.join(root, "config", "scenario_profiles.json"), "utf8"));
    assert.equal(scenarioProfiles.default_paths, 100000);
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
runTest("legacy timestamped memo outputs migrate into canonical current files and archives", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "outputs", "memos"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "outputs", "memos", "2026-04-06T15-14-34.011Z-principles-snapshot.md"),
      "# Principles Snapshot\n\nOlder principles snapshot.\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "outputs", "memos", "2026-04-06T15-16-11.568Z-principles-snapshot.md"),
      "# Principles Snapshot\n\nLatest principles snapshot.\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "outputs", "memos", "2026-04-06T14-39-47.121Z-what-is-the-real-variant-perception-in-this-setup.md"),
      "# Variant Perception\n\nCurrent memo.\n",
      "utf8"
    );

    const result = migrateLegacyRollingOutputs(root, "outputs/memos");
    assert.equal(result.promoted, 2);
    assert.equal(result.archived, 1);
    assert.ok(fs.existsSync(path.join(root, "outputs", "memos", "principles-snapshot.md")));
    assert.ok(fs.existsSync(path.join(root, "outputs", "memos", "what-is-the-real-variant-perception-in-this-setup.md")));
    assert.ok(
      fs.existsSync(
        path.join(root, "outputs", "memos", "archive", "principles-snapshot", "2026-04-06T15-14-34.011Z-principles-snapshot.md")
      )
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("markdown frontmatter preserves numeric-looking strings on render and parse", () => {
  const rendered = renderMarkdown(
    {
      title: "2",
      search_rank: "7",
      source_id: "00123"
    },
    "# Numeric String Roundtrip"
  );
  const parsed = parseFrontmatter(rendered);
  assert.equal(parsed.frontmatter.title, "2");
  assert.equal(parsed.frontmatter.search_rank, "7");
  assert.equal(parsed.frontmatter.source_id, "00123");
});
runTest("candidate concept extraction rejects disclosure and preprint footer noise", () => {
  const ontology = JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "ontology.json"), "utf8"));
  const candidates = extractCandidateConcepts(
    "Agentic Reasoning for Large Language Models",
    "Agentic reasoning for large language models improves coordination. This arXiv preprint should not turn footer noise into concepts. Please see additional disclosures page. Large language models and agentic reasoning remain the actual topic. Large language models need grounded evaluation.",
    ontology
  );
  assert.ok(candidates.includes("large language"));
  assert.ok(candidates.includes("agentic reasoning"));
  assert.ok(!candidates.includes("arxiv preprint"));
  assert.ok(!candidates.includes("additional disclosures"));
  assert.ok(!candidates.includes("disclosures page"));
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
runTest("candidate concept extraction rejects structural URL and menu noise", () => {
  const ontology = JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "ontology.json"), "utf8"));
  const candidates = extractCandidateConcepts(
    "Large Language Model Reasoning Failures",
    "Large language models fail in some reasoning settings. OpenReview URL https://openreview.net/forum?id=abc123 should not become a concept. Main menu and sub menu back are page chrome, not durable knowledge. User ID and final answer are interface artifacts. Large language models and agentic reasoning remain the real topic. Agentic reasoning can improve reliability, and agentic reasoning should stay grounded in explicit steps.",
    ontology
  );
  assert.ok(candidates.includes("large language"));
  assert.ok(candidates.includes("agentic reasoning"));
  assert.ok(!candidates.includes("url https"));
  assert.ok(!candidates.includes("https openreview"));
  assert.ok(!candidates.includes("main menu"));
  assert.ok(!candidates.includes("sub menu"));
  assert.ok(!candidates.includes("user id"));
  assert.ok(!candidates.includes("final answer"));
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
runTest("recurring memo, brief, deck, and meeting outputs keep one current file and archive prior versions", () => {
  const root = makeTempRepo();
  try {
    initProject(root);

    const principlesFirst = writePrinciplesSnapshot(root);
    const principlesSecond = writePrinciplesSnapshot(root);
    assert.equal(principlesFirst.outputPath, "outputs/memos/principles-snapshot.md");
    assert.equal(principlesSecond.outputPath, "outputs/memos/principles-snapshot.md");
    assert.ok(fs.existsSync(path.join(root, "outputs", "memos", "archive", "principles-snapshot")));

    const deckFirst = writeDeck(root, "Passive flows");
    const deckSecond = writeDeck(root, "Passive flows");
    assert.equal(deckFirst.outputPath, "outputs/decks/passive-flows.md");
    assert.equal(deckSecond.outputPath, "outputs/decks/passive-flows.md");
    assert.ok(fs.existsSync(path.join(root, "outputs", "decks", "archive", "passive-flows")));

    const whyBelieveFirst = writeWhyBelieve(root, "Global Macro");
    const whyBelieveSecond = writeWhyBelieve(root, "Global Macro");
    assert.equal(whyBelieveFirst.outputPath, "outputs/briefs/why-believe-global-macro.md");
    assert.equal(whyBelieveSecond.outputPath, "outputs/briefs/why-believe-global-macro.md");
    assert.ok(fs.existsSync(path.join(root, "outputs", "briefs", "archive", "why-believe-global-macro")));

    const meetingFirst = writeMeetingBrief(root, "Weekly investment meeting brief");
    const meetingSecond = writeMeetingBrief(root, "Weekly investment meeting brief");
    assert.equal(meetingFirst.outputPath, "outputs/meeting-briefs/weekly-investment-meeting-brief.md");
    assert.equal(meetingSecond.outputPath, "outputs/meeting-briefs/weekly-investment-meeting-brief.md");
    assert.ok(fs.existsSync(path.join(root, "outputs", "meeting-briefs", "archive", "weekly-investment-meeting-brief")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("ingest falls back to filename titles when PDF extraction yields a weak numeric title", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });

    const pdfPath = path.join(root, "inbox", "drop_here", "mi-guide-to-the-markets-uk.pdf");
    createSimplePdf(pdfPath, "2");

    const result = ingest(root);
    assert.equal(result.ingested, 1);

    const pdfRecord = result.results[0];
    assert.equal(pdfRecord.source_type, "paper");
    assert.notEqual(pdfRecord.title, "2");
    assert.match(pdfRecord.title, /guide to the markets/i);
    assert.match(pdfRecord.note_path, /guide-to-the-markets/i);
    assert.doesNotThrow(() => compileProject(root, { promoteCandidates: false }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("ingest falls back to the dropped filename when extracted PDF titles are copyright boilerplate", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });

    const pdfPath = path.join(root, "inbox", "drop_here", "2025 CFA Program Curriculum Level I-Vol 2. Economics 2024.pdf");
    createSimplePdf(pdfPath, "©2023 by C F A Institute");

    const result = ingest(root);
    assert.equal(result.ingested, 1);

    const pdfRecord = result.results[0];
    assert.equal(pdfRecord.source_type, "paper");
    assert.notEqual(pdfRecord.title, "©2023 by C F A Institute");
    assert.match(pdfRecord.title, /cfa program curriculum/i);
    assert.match(pdfRecord.title, /economics/i);
    assert.match(pdfRecord.note_path, /economics-2024/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("ingest prefers the filename when a PDF heading is too generic compared with the dropped filename", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });

    const pdfPath = path.join(root, "inbox", "drop_here", "2025 CFA Program Curriculum Level I-Vol 1. Quantitative Methods 2024.pdf");
    createSimplePdf(pdfPath, "QUANTITATIVE");

    const result = ingest(root);
    assert.equal(result.ingested, 1);

    const pdfRecord = result.results[0];
    assert.equal(pdfRecord.source_type, "paper");
    assert.notEqual(pdfRecord.title, "QUANTITATIVE");
    assert.match(pdfRecord.title, /quantitative methods/i);
    assert.match(pdfRecord.note_path, /quantitative-methods-2024/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("ingest prefers the filename when a PDF first line looks like table output", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });

    const pdfPath = path.join(root, "inbox", "drop_here", "2025 CFA Program Curriculum Level I-Vol 5. Equity Investments 2024.pdf");
    createSimplePdf(pdfPath, "accounts (millions) 36 22.5% 16.1%");

    const result = ingest(root);
    assert.equal(result.ingested, 1);

    const pdfRecord = result.results[0];
    assert.equal(pdfRecord.source_type, "paper");
    assert.notEqual(pdfRecord.title, "accounts (millions) 36 22.5% 16.1%");
    assert.match(pdfRecord.title, /equity investments/i);
    assert.match(pdfRecord.note_path, /equity-investments-2024/i);
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
runTest("public release export keeps engine files and excludes private corpus surfaces", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Agents\n", "utf8");
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Claude\n", "utf8");
    fs.writeFileSync(path.join(root, "README.md"), "# Public Repo\n", "utf8");
    fs.writeFileSync(path.join(root, "cato.cmd"), "@echo off\n", "utf8");
    fs.writeFileSync(path.join(root, "package.json"), "{\n  \"name\": \"cato-test\"\n}\n", "utf8");
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "operator_guide.md"), "# Operator Guide\n", "utf8");
    fs.writeFileSync(path.join(root, "docs", "project_brief.md"), "# Private Brief\n", "utf8");
    fs.mkdirSync(path.join(root, "wiki", "source-notes"), { recursive: true });
    fs.writeFileSync(path.join(root, "wiki", "source-notes", "private.md"), "# Private Corpus\n", "utf8");
    fs.writeFileSync(
      path.join(root, "wiki", "self", "current-operating-constitution.md"),
      "# Current Operating Constitution\n\nPrivate doctrine should not ship.\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(root, "wiki", "memory", "current-context.md"),
      "---\nid: PRIVATE-MEM\nkind: memory-context-page\ntitle: Current Context\nstatus: reviewed\nmemory_date: 2026-04-10\n---\n\n# Current Context\n\nPrivate operating context should not ship.\n",
      "utf8"
    );
    fs.writeFileSync(path.join(root, "MEMORY.md"), "# Memory\n\nPrivate memory mirror should not ship.\n", "utf8");
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.writeFileSync(path.join(root, "inbox", "drop_here", "private.txt"), "secret\n", "utf8");

    const target = path.join(root, "tmp", "public-export-check");
    fs.mkdirSync(path.join(target, ".git"), { recursive: true });
    fs.writeFileSync(path.join(target, ".git", "keep"), "gitdir\n", "utf8");

      const result = buildPublicRelease(root, { to: target });
      assert.equal(path.resolve(result.targetDir), path.resolve(target));
      assert.ok(fs.existsSync(path.join(target, ".git", "keep")));
      assert.ok(fs.existsSync(path.join(target, "README.md")));
      assert.ok(fs.existsSync(path.join(target, "docs", "operator_guide.md")));
      assert.ok(fs.existsSync(path.join(target, "docs", "project_brief.md")));
      assert.ok(fs.existsSync(path.join(target, "docs", "project_map.md")));
      assert.ok(fs.existsSync(path.join(target, "tasks", "todo.md")));
      assert.ok(fs.existsSync(path.join(target, "wiki", "_templates")));
      assert.ok(fs.existsSync(path.join(target, "wiki", "self", "current-operating-constitution.md")));
      assert.ok(fs.existsSync(path.join(target, "wiki", "memory", "current-context.md")));
      assert.ok(fs.existsSync(path.join(target, "MEMORY.md")));
      assert.ok(fs.existsSync(path.join(target, "inbox")));
      assert.ok(fs.existsSync(path.join(target, "inbox", "drop_here")));
      assert.ok(fs.existsSync(path.join(target, "inbox", "self")));
      assert.ok(fs.existsSync(path.join(target, "manifests", "claims.jsonl")));
      assert.ok(fs.existsSync(path.join(target, "manifests", "scenario_history.jsonl")));
      assert.ok(fs.existsSync(path.join(target, "manifests", "market_data_catalog.json")));
      assert.ok(fs.existsSync(path.join(target, "wiki", "_indices", "probabilities.md")));
      assert.ok(fs.existsSync(path.join(target, "wiki", "probabilities", "index.md")));
      assert.ok(!fs.existsSync(path.join(target, "public-release.manifest.json")));
      assert.ok(fs.existsSync(result.manifestPath));
      assert.ok(!fs.existsSync(path.join(target, "inbox", "drop_here", "private.txt")));
      assert.equal(JSON.parse(fs.readFileSync(path.join(target, "manifests", "market_data_catalog.json"), "utf8")).series.length, 0);
      assert.equal(fs.readFileSync(path.join(target, "manifests", "scenario_history.jsonl"), "utf8"), "");
      assert.equal(fs.readFileSync(path.join(target, "docs", "project_brief.md"), "utf8").includes("Private Brief"), false);
      assert.equal(
        fs.readFileSync(path.join(target, "wiki", "self", "current-operating-constitution.md"), "utf8").includes("Private doctrine should not ship"),
        false
      );
      assert.equal(
        fs.readFileSync(path.join(target, "wiki", "memory", "current-context.md"), "utf8").includes("Private operating context should not ship"),
        false
      );
      assert.equal(fs.readFileSync(path.join(target, "MEMORY.md"), "utf8").includes("Private memory mirror should not ship"), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
