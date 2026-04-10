# Working Memory

This file describes the working-memory layer as it exists now.

## Purpose

The repo already had:

- project memory in `docs/` and `tasks/`
- self memory in `wiki/self/` and `manifests/self_model.json`
- knowledge memory in source notes, claims, states, decisions, and reports

The missing layer was operating memory:

- what happened recently
- what matters now
- what changed this week

That gap is now filled with a dedicated working-memory subsystem.

## Layers

Working memory now has four surfaces:

1. `wiki/memory/daily/YYYY-MM-DD.md`
   Raw daily operating log built automatically from meaningful Cato actions.

2. `wiki/memory/current-context.md`
   The current compiled orientation note for the active day.

3. `wiki/memory/weekly/weekly-review-YYYY-MM-DD.md`
   The current ISO-week review and kaizen surface.

4. `MEMORY.md`
   A root mirror of the latest current-context note for fast human orientation.

The canonical navigation page is `wiki/memory/index.md`.

## Refresh Logic

The refresh model is deliberate:

- raw daily memory updates automatically after meaningful Cato actions
- current context refreshes when due on the first meaningful Cato use of the day
- weekly review refreshes when due on the first meaningful Cato use of the ISO week

The trigger is not shell startup.

That was rejected because it is noisy and imprecise. Opening a terminal is not the same thing as doing meaningful Cato work.

The current trigger is better:

- do real Cato work
- let Cato log the event
- if the current memory period is stale, queue the refresh pack automatically

## Model Boundary

Daily memory logs are deterministic and automatic.

Current-context and weekly-review notes are treated as substantive authored outputs:

- Cato prepares the grounded refresh pack
- the active terminal model authors the final note
- `capture-memory` writes the result back into the repo

This keeps the repo consistent with the wider project rule:

- deterministic CLI for plumbing
- active terminal model for final intellectual synthesis

## Automatic vs Manual

Most of the time you should not need to think about the memory layer.

It now auto-queues itself when due.

Manual commands still exist for control and recovery:

- `.\cato.cmd memory-status`
- `.\cato.cmd memory-refresh`
- `.\cato.cmd memory-refresh --scope current`
- `.\cato.cmd memory-refresh --scope weekly`
- `.\cato.cmd memory-refresh --force`
- `.\cato.cmd capture-memory .\cache\memory-packs\...\...-capture.json`

## What Counts As A Meaningful Event

The working-memory event log is driven by successful Cato actions such as:

- ingest and self-ingest
- compile
- pack preparation for authored, report, frontier, and PDF workflows
- capture of authored, report, frontier, research, and PDF bundles
- claim refresh and watch refresh

Low-value maintenance commands such as `help`, `search`, `lint`, `doctor`, `watch-list`, `claim-diff`, and `state-diff` do not drive working-memory refresh.

## Integration With Other Packs

Once current working memory exists, authored/report/frontier packs now include it in their local context.

That means future outputs can see:

- the current operating context
- the latest weekly review when available

without treating working memory as claim input or evidence.

## Guardrails

- Working memory is not claim input.
- Working memory is not a primary evidence layer.
- Daily logs should stay raw and factual.
- Current context should stay concise and decision-useful.
- Weekly review should stay reflective and process-aware, not bloated.
- Refresh should be due-based, not spammy.

## Compression Discipline

Working memory now follows explicit write-time compression discipline.

- Daily logs can stay raw because they are event traces, not retrieval products.
- Current context should compress into compact bullets, explicit entities, active tensions, and next actions.
- Weekly review should compress into reusable lessons, recurring errors, changes, and concrete operating adjustments.
- The goal is that later retrieval can consume working memory directly without having to re-summarise a long narrative first.

## Expected Files

After the first full refresh cycle, expect:

- `wiki/memory/current-context.md`
- `wiki/memory/index.md`
- `wiki/memory/daily/<today>.md`
- `wiki/memory/weekly/<current-week>.md`
- `MEMORY.md`

If the memory layer feels stale, check `memory-status` first before forcing new packs.
