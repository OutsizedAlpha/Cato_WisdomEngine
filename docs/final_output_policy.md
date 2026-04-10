# Final Output Policy

This file records the explicit operating rule for authored intellectual work in Cato.

## Core Rule

Cato is the memory, retrieval, provenance, and storage layer.

The active terminal model is the author of final intellectual output.

That means:

- Cato may prepare packs, scaffolds, maintained notes, and deterministic context
- Codex or Claude must author the final report, brief, decision artefact, or research synthesis that is meant to count as real judgement or IP
- the authored result must be captured back into Cato with explicit model/session metadata

## What Is Enforced Now

- Common substantive authored outputs use their normal top-level command plus `capture-authored`
- Final reports use `report` plus `capture-report`
- Working memory refreshes automatically by default; `memory-refresh` plus `capture-memory` remain the explicit override path
- Canonical current reports live under `wiki/reports/`
- Prior canonical versions are archived under `wiki/reports/archive/`
- Canonical current-context memory lives under `wiki/memory/current-context.md`, weekly reviews live under `wiki/memory/weekly/`, and the root `MEMORY.md` file is only a mirror of the current context
- Recurring generated outputs under `outputs/memos/`, `outputs/briefs/`, `outputs/decks/`, and `outputs/meeting-briefs/` now keep one current file per slug and archive older runs under sibling `archive/<slug>/` folders
- The common pack/capture mechanics behind authored, report, and frontier flows are now centralised, so metadata and placeholder enforcement follow one shared rule path
- Raw `outputs/reports/` history is legacy operational artefact, not active claim input
- Legacy deterministic report archives should preserve the original report filename so historical references remain auditable
- Frontier-authored belief/state/decision/meeting outputs use `frontier-pack` plus `capture-frontier`
- Research imports use `capture-research`
- PDF vision/OCR extraction uses `pdf-pack` plus `capture-pdf`

## What Still Stays Deterministic

The following are maintenance, retrieval, or structural bookkeeping and may remain deterministic:

- `init`
- `ingest`
- `self-ingest`
- `compile`
- `search`
- `watch-list`
- `watch-refresh`
- `claims-refresh`
- `claim-diff`
- `state-diff`
- `doctor`
- `lint`

## What To Treat As Scaffolding

The following direct CLI outputs are useful, but should not be mistaken for final authored IP unless they are handed through a model-authored capture step:

- `ask`
- `deck`
- `surveil`
- `watch`
- `why-believe`
- direct deterministic state or decision scaffolds created while preparing pack context
- direct deterministic briefs created while preparing pack context
- `reflect`
- `principles`
- `postmortem`
- any scaffold or archived operational output under `outputs/`
- uncaptured current-context or weekly-review bundles under `cache/memory-packs/`

## Metadata Discipline

Every final captured artefact should record:

- `authoring_layer`
- `authoring_model`
- `authoring_session` when available
- `generation_mode`
- source provenance

If the repo cannot state which terminal model authored the result, the artefact is not documented well enough.
