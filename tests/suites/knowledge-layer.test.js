Object.assign(global, require("../test-helpers"));

// Claim, state, decision, and architecture-commitment tests.

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
runTest("claim ledger refresh builds claim pages, snapshots, and why-believe output", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));

    ingest(root);
    compileProject(root, { promoteCandidates: true });
    captureModelAuthoredReport(root, "passive flows and liquidity");
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
runTest("ingest quarantines sensitive sources by default and keeps explicit overrides flagged", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    const quarantinedPath = path.join(root, "inbox", "drop_here", "secret-note.txt");
    fs.writeFileSync(
      quarantinedPath,
      "api_key = sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456\nPortfolio note that should never enter canonical storage by accident.\n",
      "utf8"
    );

    const first = ingest(root);
    assert.equal(first.ingested, 0);
    assert.equal(first.quarantined, 1);
    assert.ok(first.quarantinedResults[0].quarantined_path.startsWith("tmp/sensitive-quarantine/"));
    assert.ok(fs.existsSync(path.join(root, first.quarantinedResults[0].quarantined_path)));
    assert.equal(fs.existsSync(quarantinedPath), false);

    const allowedPath = path.join(root, "inbox", "drop_here", "allowed-secret-note.txt");
    fs.writeFileSync(
      allowedPath,
      "token = sk-ZYXWVUTSRQPONMLKJIHGFEDCBA654321\nOperator deliberately allowed this for a bounded review case.\n",
      "utf8"
    );

    const second = ingest(root, { "allow-sensitive": true });
    assert.equal(second.ingested, 1);
    const record = second.results[0];
    assert.equal(record.sensitive_data_flagged, true);
    assert.equal(record.note_status, "draft");

    const sourceNote = fs.readFileSync(path.join(root, record.note_path), "utf8");
    assert.match(sourceNote, /Sensitive data flagged: `true`/);
    assert.match(sourceNote, /Sensitive data was detected during ingest/i);

    const lint = lintProject(root);
    assert.ok(
      lint.issues.some(
        (issue) => issue.file === record.note_path && /sensitive_data_flagged|Sensitive-data pattern/i.test(issue.message)
      )
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("claim lifecycle adds numeric confidence plus weakening and supersession links", () => {
  const root = makeTempRepo();
  try {
    initProject(root);

    writeSourceNoteFixture(
      root,
      "inflation-positive-older.md",
      {
        id: "SRC-CLAIM-01",
        kind: "source-note",
        title: "Older inflation cooling note",
        source_type: "paper",
        document_class: "research_note",
        ingested_at: "2026-01-10T12:00:00.000Z",
        date: "2026-01-10",
        raw_path: "raw/pdfs/inflation-positive-older.pdf",
        metadata_path: "extracted/metadata/inflation-positive-older.json",
        status: "reviewed",
        review_status: "text_reviewed",
        review_method: "manual review",
        review_scope: "Full note review.",
        tags: ["inflation"],
        entities: [],
        concepts: ["us inflation"]
      },
      `# Older inflation cooling note

## Summary

Older positive inflation read.

## What This Source Says

- US inflation improved as wage growth softened and the disinflation trend became more supportive across the index.

## Why It Matters

- The inflation backdrop improved enough to reduce immediate policy pressure.
`
    );

    writeSourceNoteFixture(
      root,
      "inflation-positive-newer.md",
      {
        id: "SRC-CLAIM-02",
        kind: "source-note",
        title: "Newer inflation cooling note",
        source_type: "paper",
        document_class: "research_note",
        ingested_at: "2026-03-15T12:00:00.000Z",
        date: "2026-03-15",
        raw_path: "raw/pdfs/inflation-positive-newer.pdf",
        metadata_path: "extracted/metadata/inflation-positive-newer.json",
        status: "reviewed",
        review_status: "text_reviewed",
        review_method: "manual review",
        review_scope: "Full note review.",
        tags: ["inflation"],
        entities: [],
        concepts: ["us inflation"]
      },
      `# Newer inflation cooling note

## Summary

Newer positive inflation read.

## What This Source Says

- US inflation improved as wage growth softened and the disinflation trend became more supportive across the index in a broader way.

## Why It Matters

- The inflation backdrop improved enough to reduce immediate policy pressure further.
`
    );

    writeSourceNoteFixture(
      root,
      "inflation-negative-newest.md",
      {
        id: "SRC-CLAIM-03",
        kind: "source-note",
        title: "Newest inflation reacceleration note",
        source_type: "paper",
        document_class: "research_note",
        ingested_at: "2026-04-01T12:00:00.000Z",
        date: "2026-04-01",
        raw_path: "raw/pdfs/inflation-negative-newest.pdf",
        metadata_path: "extracted/metadata/inflation-negative-newest.json",
        status: "reviewed",
        review_status: "text_reviewed",
        review_method: "manual review",
        review_scope: "Full note review.",
        tags: ["inflation"],
        entities: [],
        concepts: ["us inflation"]
      },
      `# Newest inflation reacceleration note

## Summary

Newest negative inflation read.

## What This Source Says

- US inflation risk worsened as wage growth stayed strong and services inflation remained a headwind across the index.

## Why It Matters

- The inflation backdrop worsened enough to keep policy pressure high.
`
    );

    refreshClaims(root, { writeSnapshot: true });

    const claims = fs
      .readFileSync(path.join(root, "manifests", "claims.jsonl"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    const superseded = claims.find((claim) => claim.status === "superseded");
    const contested = claims.find((claim) => claim.status === "contested");
    assert.ok(superseded);
    assert.ok(contested);
    assert.equal(typeof superseded.confidence_score, "number");
    assert.ok(superseded.superseded_by_claim_ids.length >= 1);
    assert.ok(contested.contradicting_claim_ids.length >= 1);

    const supersededPage = fs.readFileSync(path.join(root, "wiki", "claims", `${superseded.id.toLowerCase()}.md`), "utf8");
    assert.match(supersededPage, /## Lifecycle Links/);
    assert.match(supersededPage, /Confidence score:/);
    assert.match(supersededPage, /Superseded By/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("unreviewed visual source notes do not promote OCR routing text into the claim ledger", () => {
  const root = makeTempRepo();
  try {
    initProject(root);

    writeSourceNoteFixture(
      root,
      "visual-capture.md",
      {
        id: "SRC-VISUAL-01",
        kind: "source-note",
        title: "AI Partnerships and the Path to $75B in Revenue",
        source_type: "image",
        document_class: "chartpack_or_visual",
        ingested_at: "2026-04-10T21:35:31.918Z",
        date: "2026-04-10",
        raw_path: "raw/images/visual-capture.jpg",
        metadata_path: "extracted/metadata/visual-capture.json",
        status: "draft",
        review_status: "unreviewed",
        review_method: "",
        review_scope: "",
        tags: ["aws", "openai"],
        entities: ["Amazon Web Services", "OpenAI"],
        concepts: []
      },
      `# AI Partnerships and the Path to $75B in Revenue

## Summary

Draft OCR capture from a standalone image.

## What This Source Says

- Initial draft only. Refine this note after review or a frontier-model synthesis pass.

## Why It Matters

- Treat OCR as a routing aid and revisit the image directly before promoting chart-specific claims.
`
    );

    const refresh = refreshClaims(root, { writeSnapshot: false });
    assert.equal(refresh.claims, 0);

    const claimFiles = fs
      .readdirSync(path.join(root, "wiki", "claims"))
      .filter((name) => /^claim-.*\.md$/i.test(name));
    assert.equal(claimFiles.length, 0);
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
    captureModelAuthoredReport(root, "passive flows and liquidity");
    refreshClaims(root, { writeSnapshot: true });

    const firstState = refreshState(root, "Market Structure");
    fs.writeFileSync(
      path.join(root, "wiki", "reports", "manual-follow-up.md"),
      renderMarkdown(
        {
          id: "REPORT-2026-MANUALFOLLOW",
          kind: "research-report",
          title: "Market structure follow-up",
          created_at: new Date().toISOString(),
          sources: ["wiki/source-notes/sample-article.md"],
          generation_mode: "terminal_model_report",
          canonical_report: true,
          report_status: "final"
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
    captureModelAuthoredReport(root, "passive flows and liquidity");
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
runTest("lint warns on low-confidence claim pages", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.writeFileSync(
      path.join(root, "wiki", "claims", "claim-low-confidence.md"),
      renderMarkdown(
        {
          id: "CLAIM-LOW-01",
          kind: "claim-page",
          title: "Low confidence claim",
          status: "active",
          claim_type: "inference",
          origin_note_path: "wiki/source-notes/example.md",
          confidence: "low",
          confidence_score: 0.2
        },
        `# Low confidence claim

## Counter-Arguments / Weakening Evidence

- Thin support.

## Data Gaps / What Would Strengthen It

- More evidence needed.
`
      ),
      "utf8"
    );

    const lint = lintProject(root);
    assert.ok(
      lint.issues.some(
        (issue) => issue.file === "wiki/claims/claim-low-confidence.md" && /low confidence/i.test(issue.message)
      )
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("crystallize prepares and captures a durable synthesis note from a finished artefact", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));

    ingest(root);
    compileProject(root, { promoteCandidates: true });
    const report = captureModelAuthoredReport(root, "passive flows and liquidity");
    const pack = writeCrystallizePack(root, report.outputResult.outputPath);

    const bundlePath = path.join(root, pack.capturePath);
    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
    bundle.model = "gpt-5.4 xhigh via Codex";
    bundle.authoring_session = "test-suite";
    bundle.output.body = `# ${bundle.output.title}

## Crystallized From

- Source artifact: \`${report.outputResult.outputPath}\`

## Durable Takeaways

- Passive flows remain a real market-structure amplifier rather than a one-off talking point.

## Candidate Claims To Promote

- Claim: Passive flows can suppress short-term volatility until crowding breaks.
  - Basis: Canonical report synthesis and source-note evidence.
  - Confidence cue: grounded but still conditional.

## Concepts / Entities To Create Or Update

- Market structure:
  - Why it matters: This remains a recurring explanatory frame.
  - Best target page: [[market-structure]]

## State / Decision Implications

- Revisit the Market Structure state page after the next claim refresh.

## Self-Model / Process Lessons

- Promote only durable operator lessons, not report-specific wording.

## Open Threads

- Need fresher evidence on when passive support fails abruptly.

## Source Map

- \`${report.outputResult.outputPath}\`
`;
    fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

    const capture = captureCrystallize(root, pack.capturePath);
    assert.ok(fs.existsSync(path.join(root, capture.outputResult.outputPath)));

    const crystallized = fs.readFileSync(path.join(root, capture.outputResult.outputPath), "utf8");
    const parsed = parseFrontmatter(crystallized);
    assert.equal(parsed.frontmatter.kind, "synthesis-note");
    assert.equal(parsed.frontmatter.source_basis, "crystallized");
    assert.equal(parsed.frontmatter.crystallized_from, report.outputResult.outputPath);
    assert.ok((parsed.frontmatter.sources || []).includes(report.outputResult.outputPath));
    assert.match(crystallized, /## Durable Takeaways/);
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
    const reportResult = captureModelAuthoredReport(root, "passive flows and liquidity");
    refreshClaims(root, { writeSnapshot: true });
    const stateResult = refreshState(root, "Market Structure");
    const decisionResult = writeDecisionNote(root, "passive flows");

    const askMemo = fs.readFileSync(path.join(root, askResult.outputPath), "utf8");
    const reportMemo = fs.readFileSync(path.join(root, reportResult.outputResult.outputPath), "utf8");
    assert.match(askMemo, /## Retrieval Budget/);
    assert.match(reportMemo, /generation_mode: terminal_model_report/);
    assert.match(askMemo, /generation_mode: grounded_synthesis/);
    assert.match(reportMemo, /canonical_report: true/);

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
