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

- Final reports use `report` plus `capture-report`
- Canonical current reports live under `wiki/reports/`
- Prior canonical versions are archived under `wiki/reports/archive/`
- Raw `outputs/reports/` history is legacy operational artefact, not active claim input
- Legacy deterministic report archives should preserve the original report filename so historical references remain auditable
- Frontier-authored belief/state/decision/meeting outputs use `frontier-pack` plus `capture-frontier`
- Research imports use `capture-research`
- PDF vision/OCR extraction uses `pdf-pack` plus `capture-pdf`

## What To Treat As Scaffolding

The following direct CLI outputs are useful, but should not be mistaken for final authored IP unless they are handed through a model-authored capture step:

- `ask`
- direct deterministic state or decision refreshes
- direct deterministic briefs and decks
- any timestamped operational output under `outputs/`

## Metadata Discipline

Every final captured artefact should record:

- `authoring_layer`
- `authoring_model`
- `authoring_session` when available
- `generation_mode`
- source provenance

If the repo cannot state which terminal model authored the result, the artefact is not documented well enough.
