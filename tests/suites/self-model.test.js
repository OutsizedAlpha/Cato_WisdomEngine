Object.assign(global, require("../test-helpers"));

// Self-model ingest, compile, and authored-command boundary tests.

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
runTest("self-ingest supports structured schemas and compile writes self-model constitution artifacts", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    writeSelfInboxNote(
      root,
      "truth-over-fluency.md",
      `---
title: Truth over fluency
schema: constitution
priority: 5
rule_strength: hard
applicability:
  - global
  - writing
command_scope:
  - ask
  - report
confidence: high
review_trigger: Outputs become too agreeable or vague.
source_basis: declared
examples_good:
  - Separate fact, estimate, inference, and judgement.
examples_bad:
  - Smooth over uncertainty to sound coherent.
---

# Truth over fluency

## Principle Statement

Separate fact, estimate, inference, and judgement explicitly.

## Mechanism

This keeps outputs decision-useful instead of merely fluent.

## What Would Falsify It

If explicit separation consistently worsens decision quality, review the rule.
`
    );
    writeSelfInboxNote(
      root,
      "direct-challenge.md",
      `---
title: Direct challenge style
schema: communication-style
priority: 4
rule_strength: soft
applicability:
  - writing
command_scope:
  - ask
  - report
confidence: high
source_basis: declared
---

# Direct challenge style

## Preferred Output Style

Be direct, anti-sycophantic, and willing to challenge weak reasoning.

## What To Avoid

Do not cushion weak arguments into polite blur.

## Good Challenge Style

Push on assumptions, price, and falsifiers instead of performing agreement.
`
    );
    fs.copyFileSync(fixturePath("self-principle.txt"), path.join(root, "inbox", "self", "satellite-principle.txt"));

    const ingestResult = selfIngest(root);
    assert.equal(ingestResult.ingested, 3);

    const compileResult = compileProject(root);
    assert.ok(compileResult.selfNotes >= 3);
    assert.ok(fs.existsSync(path.join(root, "manifests", "self_model.json")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "self", "current-operating-constitution.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "self", "mode-profiles", "investment-research.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "self", "mode-profiles", "trading.md")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "self", "mode-profiles", "communication.md")));

    const selfModel = JSON.parse(fs.readFileSync(path.join(root, "manifests", "self_model.json"), "utf8"));
    assert.ok(selfModel.notes.some((note) => note.title === "Truth over fluency" && note.schema === "constitution"));
    assert.ok(selfModel.notes.some((note) => note.title === "Direct challenge style" && note.schema === "communication-style"));
    assert.equal(selfModel.note_count || selfModel.notes.length, 3);

    const constitution = fs.readFileSync(path.join(root, "wiki", "self", "current-operating-constitution.md"), "utf8");
    assert.match(constitution, /Truth over fluency/);
    assert.match(constitution, /Separate fact, estimate, inference, and judgement explicitly/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("compiled self-model resolves conflicts and injects command-specific guidance into authored and report packs", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));
    ingest(root);

    writeSelfInboxNote(
      root,
      "truth-over-fluency.md",
      `---
title: Truth over fluency
schema: constitution
priority: 5
rule_strength: hard
applicability:
  - global
  - writing
command_scope:
  - ask
  - report
confidence: high
review_trigger: Outputs become too agreeable or vague.
source_basis: declared
---

# Truth over fluency

## Principle Statement

Separate fact, estimate, inference, and judgement explicitly.

## What Would Falsify It

If explicit separation consistently worsens decision quality, review the rule.
`
    );
    writeSelfInboxNote(
      root,
      "smooth-the-edges.md",
      `---
title: Smooth the edges
schema: preference
priority: 2
rule_strength: soft
applicability:
  - writing
command_scope:
  - report
conflicts_with:
  - Truth over fluency
source_basis: declared
---

# Smooth the edges

## Preference

Soften disagreements and avoid direct challenge when the answer may feel uncomfortable.

## What To Avoid

Sharp disagreement.
`
    );
    writeSelfInboxNote(
      root,
      "narrative-drift.md",
      `---
title: Narrative drift
schema: bias
priority: 5
rule_strength: hard
applicability:
  - global
command_scope:
  - ask
  - report
source_basis: learned-from-history
---

# Narrative drift

## Observed Bias / Tendency

Strong narratives can outrun what is already priced.

## Mitigation

Ask what the market already knows, what price already embeds, and what would falsify the view.
`
    );
    writeSelfInboxNote(
      root,
      "direct-challenge.md",
      `---
title: Direct challenge style
schema: communication-style
priority: 4
rule_strength: soft
applicability:
  - writing
command_scope:
  - ask
  - report
source_basis: declared
---

# Direct challenge style

## Preferred Output Style

Be direct, anti-sycophantic, and willing to challenge weak reasoning.

## What To Avoid

Do not cushion weak arguments into polite blur.
`
    );

    selfIngest(root);
    compileProject(root, { promoteCandidates: true });

    const reportContext = resolveSelfModelContext(root, {
      command: "report",
      topic: "passive flows and liquidity"
    });
    assert.ok(reportContext.activeHardRules.some((rule) => rule.title === "Truth over fluency"));
    assert.ok(reportContext.biasChecks.some((rule) => rule.title === "Narrative drift"));
    assert.ok(!reportContext.activeSoftPreferences.some((rule) => rule.title === "Smooth the edges"));
    assert.ok(reportContext.conflicts.some((conflict) => /Smooth the edges/.test(conflict.loser_title || "")));

    const askPack = writeAuthoredPack(root, "ask", "What does the corpus currently say about passive flows?");
    const askPackPayload = JSON.parse(fs.readFileSync(path.join(root, askPack.packPath), "utf8"));
    const askPrompt = fs.readFileSync(path.join(root, askPack.promptPath), "utf8");
    assert.ok(askPackPayload.self_model);
    assert.ok(askPackPayload.self_model.active_hard_rules.some((rule) => rule.title === "Truth over fluency"));
    assert.ok(askPackPayload.self_model.bias_checks.some((rule) => rule.title === "Narrative drift"));
    assert.match(askPrompt, /Active Self-Model/i);
    assert.match(askPrompt, /Truth over fluency/);

    const reportPack = writeReport(root, "passive flows and liquidity");
    const reportPackPayload = JSON.parse(fs.readFileSync(path.join(root, reportPack.packPath), "utf8"));
    const reportPrompt = fs.readFileSync(path.join(root, reportPack.promptPath), "utf8");
    assert.ok(reportPackPayload.self_model);
    assert.ok(reportPackPayload.self_model.active_hard_rules.some((rule) => rule.title === "Truth over fluency"));
    assert.ok(reportPackPayload.self_model.bias_checks.some((rule) => rule.title === "Narrative drift"));
    assert.match(reportPrompt, /Active Self-Model/i);
    assert.match(reportPrompt, /Do not cushion weak arguments into polite blur/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("decision scaffolds and self-model summaries use compiled rules, conflicts, and review pressure", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "inbox", "drop_here"), { recursive: true });
    fs.copyFileSync(fixturePath("sample-article.md"), path.join(root, "inbox", "drop_here", "sample-article.md"));
    fs.copyFileSync(fixturePath("sample-note.txt"), path.join(root, "inbox", "drop_here", "sample-note.txt"));
    ingest(root);

    writeSelfInboxNote(
      root,
      "truth-over-fluency.md",
      `---
title: Truth over fluency
schema: constitution
priority: 5
rule_strength: hard
applicability:
  - global
  - writing
command_scope:
  - decision-note
  - reflect
  - principles
confidence: high
review_trigger: Outputs become too agreeable or vague.
reviewed_at: 2025-01-01T00:00:00.000Z
source_basis: declared
---

# Truth over fluency

## Principle Statement

Separate fact, estimate, inference, and judgement explicitly.

## What Would Falsify It

If explicit separation consistently worsens decision quality, review the rule.
`
    );
    writeSelfInboxNote(
      root,
      "speed-postmortem.md",
      `---
title: Speed outran process
schema: postmortem
priority: 4
rule_strength: hard
applicability:
  - investment
command_scope:
  - decision-note
  - reflect
source_basis: learned-from-postmortem
---

# Speed outran process

## Decision

Moved too quickly because the narrative felt obvious.

## What Was Wrong

Speed outran evidence quality and the priced view was not checked hard enough.

## Lessons

Slow down when conviction rises faster than the evidence base.
`
    );
    writeSelfInboxNote(
      root,
      "smooth-the-edges.md",
      `---
title: Smooth the edges
schema: preference
priority: 2
rule_strength: soft
applicability:
  - writing
command_scope:
  - reflect
  - principles
conflicts_with:
  - Truth over fluency
source_basis: declared
---

# Smooth the edges

## Preference

Soften disagreement so the answer feels easier to receive.
`
    );

    selfIngest(root);
    compileProject(root, { promoteCandidates: true });
    refreshClaims(root, { writeSnapshot: true });
    refreshState(root, "Market Structure");

    const decision = writeDecisionNote(root, "passive flows");
    const reflection = writeReflection(root);
    const principles = writePrinciplesSnapshot(root);

    const decisionContent = fs.readFileSync(path.join(root, decision.notePath), "utf8");
    const reflectionContent = fs.readFileSync(path.join(root, reflection.outputPath), "utf8");
    const principlesContent = fs.readFileSync(path.join(root, principles.outputPath), "utf8");

    assert.match(decisionContent, /Active Hard Rules/i);
    assert.match(decisionContent, /Separate fact, estimate, inference, and judgement explicitly/i);
    assert.match(decisionContent, /Slow down when conviction rises faster than the evidence base/i);

    assert.match(reflectionContent, /Active Rules Most In Play/i);
    assert.match(reflectionContent, /learned from postmortem/i);
    assert.match(reflectionContent, /Review Queue/i);

    assert.match(principlesContent, /Current Operating Constitution/i);
    assert.match(principlesContent, /Conflict Register/i);
    assert.match(principlesContent, /Stale Review Candidates/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
runTest("claim refresh ignores raw outputs reports and only uses canonical wiki reports", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    fs.mkdirSync(path.join(root, "wiki", "reports"), { recursive: true });
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

This legacy draft should never reach the claim layer.
`
      ),
      "utf8"
    );

    fs.writeFileSync(
      path.join(root, "wiki", "reports", "final-report.md"),
      renderMarkdown(
        {
          id: "REPORT-2026-FINALREPORT",
          kind: "research-report",
          title: "Final report",
          created_at: new Date().toISOString(),
          sources: ["wiki/source-notes/example.md"],
          generation_mode: "terminal_model_report",
          canonical_report: true,
          report_status: "final"
        },
        `# Final report

## Executive Summary

This final report should reach the claim layer because it is canonical, model-authored, and explicit that passive flows are still distorting index liquidity and crowding market structure risk.

## Source Map
`
      ),
      "utf8"
    );

    const refresh = refreshClaims(root);
    const claims = fs.readFileSync(path.join(root, "manifests", "claims.jsonl"), "utf8");

    assert.ok(refresh.claims >= 1);
    assert.match(claims, /canonical, model-authored, and explicit that passive flows are still distorting index liquidity/i);
    assert.doesNotMatch(claims, /legacy draft should never reach the claim layer/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
