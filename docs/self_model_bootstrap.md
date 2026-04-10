# Self-Model Bootstrap

Use this file when you want to extend or revise Cato's operating constitution deliberately instead of dropping one giant personality memo into `inbox/self/`.

## Goal

Build or refine the self-model as atomic durable rules that Cato can:

- route cleanly during `self-ingest`
- compile into `manifests/self_model.json`
- resolve by command and applicability
- inject into authored packs, reports, frontier packs, and decision scaffolds

## Operating Rule

Prefer one rule per note.

Do not start with one omnibus "about me" document. That shape is weaker for:

- schema routing
- supersession
- conflict tracking
- command-specific selection
- later review and pruning

The doctrine layer was first seeded on 2026-04-06 and then widened again the same day with a fuller operating pack. Use this file to add new doctrine, supersede older rules, or tighten the existing corpus. Do not re-seed the same ideas under slightly different names unless you intend to replace them explicitly.

## Live Seed Corpus

The first live doctrine bundle was ingested in this shape:

- `00-operating-constitution.md`
- `01-investment-research-and-pm-standard.md`
- `02-macro-intermarket-and-regime-analysis.md`
- `03-market-truth-consensus-and-pricing-framework.md`
- `04-valuation-and-disruption-doctrine.md`
- `05-market-trading-and-technical-framework.md`
- `06-portfolio-construction-and-benchmark-discipline.md`
- `07-evidence-sourcing-and-audit-discipline.md`
- `08-communication-challenge-and-presentation.md`
- `09-bias-watch.md`
- `10-anti-patterns.md`
- `11-gate-loop-and-update-discipline.md`
- `12-postmortem-learning-and-update-discipline.md`

Those files are now part of the live self-model. Future additions should extend or supersede them deliberately.

## What To Put In The First Notes

Highest-value first-ingestion content:

- truth discipline: separate fact, estimate, inference, and judgement
- challenge style: direct, anti-sycophantic, willing to challenge weak arguments
- investment mode: PM-grade, second-order, variant-perception aware
- trading mode: validated momentum, reset discipline, time stops, quick invalidation
- macro mode: regime-aware, intermarket confirmation/divergence, not headline-only
- valuation mode: explicit discount-rate regimes, terminal discipline, disruption risk
- communication mode: concise, British English, clean hierarchy, no fluff
- bias watch: speed outrunning process, over-attraction to strong narratives, pro-risk rationalisation

## Frontmatter Pattern

You can let `self-ingest` infer the schema, but explicit frontmatter is better when the note is important.

Example:

```md
---
schema: constitution
title: Truth over fluency
priority: 5
rule_strength: hard
applicability: global,investment,macro,valuation,writing
command_scope: ask,report,decision-note,meeting-brief,red-team,reflect,principles
time_horizon: strategic
confidence: high
source_basis: declared
conflicts_with: []
examples_good:
  - Separate fact, estimate, inference, and judgement explicitly.
examples_bad:
  - Smooth over uncertainty to make the answer sound cleaner.
review_trigger: Revisit if the style becomes too blunt to be useful or too soft to be honest.
---

# Truth over fluency

## Principle Statement

Prefer being right, sourced, and explicit over sounding polished.

## Mechanism

Separate fact, estimate, inference, and judgement. Surface uncertainty instead of hiding it.

## When It Works

When the goal is investment judgement, decision quality, or durable research.

## When It Fails

When bluntness replaces precision and the output stops being useful.

## Common Objections

This can feel less smooth than conventional assistant prose.

## What Would Falsify It

If it consistently reduces clarity or decision usefulness.
```

## Ingest Loop

After new or revised notes exist:

```powershell
.\cato.cmd self-ingest
.\cato.cmd compile
.\cato.cmd principles
.\cato.cmd reflect
```

Use `--copy` only if you intentionally want to keep the staged originals in `inbox/self/` during review. Otherwise prefer moving them through the normal ingest path so the inbox does not silently re-ingest duplicates later.

Then:

1. open the generated authored packs for `principles` and `reflect`
2. use the active terminal model to tighten them into real operating documents
3. capture them back with `capture-authored`

## What Good Looks Like

Good looks like this:

- `manifests/self_model.json`
- `wiki/self/current-operating-constitution.md`
- `wiki/self/mode-profiles/investment-research.md`
- `wiki/self/mode-profiles/trading.md`
- `wiki/self/mode-profiles/communication.md`

And authored/report/frontier/decision packs should include a materially populated `Active Self-Model` block.
