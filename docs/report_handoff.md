# Report Handoff

This file is the operator reference for final-report authorship in Cato.

## Core Rule

Cato prepares the memory, retrieval route, and capture contract.

The active terminal model writes the final report.

That means `report` is a pack-preparation step, not the final authoring step.

## Commands

Prepare a report pack:

```powershell
.\cato.cmd report "your topic"
```

Capture the authored report:

```powershell
.\cato.cmd capture-report .\cache\report-packs\...\...-capture.json
```

## What `report` Creates

Each run creates three operator files under `cache/report-packs/`:

- `...-pack.json` = structured context for the terminal model
- `...-prompt.md` = operator instructions for the handoff
- `...-capture.json` = the file that must be completed before capture

## Required Capture Discipline

Before running `capture-report`:

1. read the pack and the listed local sources
2. replace the placeholder markdown in `output.body`
3. fill `model` with the actual session label used for authorship
4. fill `authoring_session` when that context is useful
5. keep source provenance intact

If `output.body` is still placeholder text or `model` is blank, capture should fail.

In a live terminal session, the agent can also complete that loop directly. The real requirement is still model authorship plus honest capture metadata, not manual operator keystrokes for their own sake.

## Canonical Storage

Final reports are written to:

- `wiki/reports/<topic-slug>.md`

That file is the current canonical report for the topic.

If a canonical report already exists, the previous version is archived under:

- `wiki/reports/archive/<topic-slug>/`

Legacy deterministic report runs are not active knowledge objects anymore. They are archived under:

- `outputs/reports/archive/legacy-deterministic/`

Those legacy archive filenames preserve the original report filenames so older internal references remain auditable.

## Claim-Layer Rule

The claim layer may read:

- `wiki/source-notes/`
- `wiki/reports/`
- `wiki/theses/`

It must not read raw `outputs/reports/`.

## Broad Investment Summary

For the main all-corpus investment route:

```powershell
.\cato.cmd report "Current investment summary across all ingested research"
```

That pack is curated from reviewed investment evidence first. The final report still has to be authored through the terminal model and then captured back with `capture-report`.
