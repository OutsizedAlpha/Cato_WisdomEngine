Object.assign(global, require("../test-helpers"));

runTest("working-memory automation records daily events and queues due refresh packs", () => {
  const root = makeTempRepo();
  try {
    initProject(root);

    const automation = handleWorkingMemoryAfterCommand(root, {
      command: "ingest",
      parsed: { positionals: [], options: {} },
      result: {
        ingested: 2,
        results: [{ note_path: "wiki/source-notes/test-a.md" }, { note_path: "wiki/source-notes/test-b.md" }]
      },
      options: { now: new Date("2026-04-07T09:15:00Z") }
    });

    const events = loadMemoryEvents(root);
    assert.equal(events.length, 1);
    assert.equal(events[0].command, "ingest");
    assert.ok(fs.existsSync(path.join(root, "wiki", "memory", "daily", "2026-04-07.md")));
    assert.equal(automation.generated.length, 2);
    assert.deepEqual(
      automation.generated.map((entry) => entry.scope).sort(),
      ["current_context", "weekly_review"]
    );

    const status = workingMemoryStatus(root, { now: new Date("2026-04-07T09:15:00Z") });
    assert.equal(status.currentContext.pending, true);
    assert.equal(status.weeklyReview.pending, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("current-context capture writes the canonical memory files and clears the daily pending state", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    const refresh = writeMemoryRefreshPack(root, {
      force: true,
      scope: "current",
      now: new Date("2026-04-07T10:00:00Z")
    });
    assert.equal(refresh.generated.length, 1);

    const capturePath = path.join(root, refresh.generated[0].capturePath);
    const bundle = JSON.parse(fs.readFileSync(capturePath, "utf8"));
    bundle.model = "gpt-5.4 xhigh via Codex";
    bundle.authoring_session = "test-suite";
    bundle.output.body = `# Current Context

## Executive Orientation

The repo has moved into a working-memory phase and needs daily context discipline.

## What Changed Recently

- Added a daily memory log and current-context refresh loop.

## Active Priorities

- Keep the memory layer automatic and non-noisy.

## Active Corpora / Themes

- Private repo hardening

## Open Loops

- Weekly review still needs capture.

## Watchpoints

- Do not let working memory leak into the claim layer.

## Memory Hygiene / Next Refresh

- Refresh again on the next meaningful Cato use tomorrow.
`;
    fs.writeFileSync(capturePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

    const captured = captureMemory(root, refresh.generated[0].capturePath);
    assert.equal(captured.outputResult.outputPath, "wiki/memory/current-context.md");
    assert.ok(fs.existsSync(path.join(root, "MEMORY.md")));

    const memoryMirror = fs.readFileSync(path.join(root, "MEMORY.md"), "utf8");
    assert.match(memoryMirror, /working-memory phase/i);

    const status = workingMemoryStatus(root, { now: new Date("2026-04-07T10:05:00Z") });
    assert.equal(status.currentContext.pending, false);
    assert.equal(status.currentContext.due, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("weekly review capture writes the weekly review to the current ISO week path", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    const refresh = writeMemoryRefreshPack(root, {
      force: true,
      scope: "weekly",
      now: new Date("2026-04-07T11:00:00Z")
    });
    assert.equal(refresh.generated.length, 1);

    const capturePath = path.join(root, refresh.generated[0].capturePath);
    const bundle = JSON.parse(fs.readFileSync(capturePath, "utf8"));
    bundle.model = "gpt-5.4 xhigh via Codex";
    bundle.authoring_session = "test-suite";
    bundle.output.body = `# Weekly Review - 2026-W15

## Weekly View

The repo moved from static knowledge storage towards a more live operating-memory system.

## What Compounded

- Better internal context continuity.

## What Friction Recurred

- Output sprawl needed to be tamed.

## What Changed In The Corpus

- Memory refresh is now a first-class workflow.

## Process Adjustments / Kaizen

- Keep current context daily and weekly review weekly.

## Open Questions Next Week

- How much of working memory should feed report scaffolding?

## Next Refresh

- Refresh next ISO week.
`;
    fs.writeFileSync(capturePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

    const captured = captureMemory(root, refresh.generated[0].capturePath);
    assert.equal(captured.outputResult.outputPath, "wiki/memory/weekly/weekly-review-2026-04-06.md");

    const status = workingMemoryStatus(root, { now: new Date("2026-04-07T11:05:00Z") });
    assert.equal(status.weeklyReview.pending, false);
    assert.equal(status.weeklyReview.due, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("authored packs include current working-memory context once it exists", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.writeFileSync(
      path.join(root, "wiki", "memory", "current-context.md"),
      `---
id: MEMORY-2026-CONTEXT
kind: memory-context-page
title: Current Context
status: active
memory_date: 2026-04-07
refresh_basis: first_meaningful_cato_use_when_due
---

# Current Context

## Executive Orientation

Current context is available.
`,
      "utf8"
    );

    const pack = writeAuthoredPack(root, "ask", "What matters now?", {});
    const payload = JSON.parse(fs.readFileSync(path.join(root, pack.packPath), "utf8"));
    assert.ok(payload.local_sources.some((source) => source.path === "wiki/memory/current-context.md"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
