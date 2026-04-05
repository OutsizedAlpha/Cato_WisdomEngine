# Operator Guide

This file describes how to operate Cato as it exists now, not as an earlier scaffold.

## What Cato Is Doing

Cato maintains a layered research system:

1. `inbox/`
   New evidence and rough self-notes arrive here.

2. `raw/`
   Original evidence is preserved here as immutable source truth.

3. `extracted/`
   Text, metadata, table previews, and figure notes land here.

4. `wiki/source-notes/`
   Canonical one-note-per-source grounding.

5. `wiki/drafts/append-review/`
   Working draft space for review, counter-read, and unresolved questions.

6. `wiki/claims/`, `wiki/states/`, `wiki/regimes/`, `wiki/decisions/`
   The maintained belief, world-model, and decision layer.

7. `outputs/`
   Generated artefacts such as memos, reports, briefs, decks, and meeting notes.

8. `manifests/` and `logs/`
   Structured sidecars, history, and audit trail.

## Core Operating Rule

Keep the layers clean:

- raw evidence is truth
- source notes are grounded interpretation
- drafts are workspace
- claims are belief units
- states are current view
- decisions are mandate-facing judgement
- outputs are artefacts

Do not collapse those layers into one another.

## Document Routing And Drafts

Ingest is no longer just format-aware. It now assigns a semantic `document_class`.

Examples:

- `meeting_notes`
- `filing_or_company_update`
- `research_note`
- `macro_data_release`
- `transcript`
- `chartpack_or_visual`
- `repository_snapshot`

Every ingested source now creates two distinct surfaces:

- a canonical source note in `wiki/source-notes/`
- an append-and-review draft note in `wiki/drafts/append-review/`

Use the draft note for:

- counter-read
- unresolved questions
- review checklist
- promotion judgement

Do not treat the draft workspace as grounded evidence by default.

## Retrieval Budgets

Grounded workflows now follow explicit retrieval budgets.

- `L0` = maps, indices, glossary
- `L1` = canonical maintained notes such as concepts, claims, states, decisions
- `L2` = evidence notes and prior grounded outputs
- `L3` = raw extracted text

Operating rule:

- start TLDR-first
- escalate only when the shorter route is insufficient
- avoid jumping to raw extracts when maintained notes already answer the question

This is now part of the actual product behavior, not just an informal preference.

## Daily Loop

The normal local loop is:

1. Drop evidence into `inbox/drop_here/`.
2. Drop rough self-notes into `inbox/self/` when relevant.
3. Run:
   - `ingest`
   - `self-ingest`
   - `compile`
4. Generate the surface you need:
   - `ask`
   - `report`
   - `deck`
   - `claims-refresh`
   - `why-believe`
   - `state-refresh`
   - `regime-brief`
   - `decision-note`
   - `meeting-brief`
   - `red-team`
   - `what-changed-for-markets`
   - `watch`
   - `surveil`
   - `reflect`
5. Run `lint` and `doctor` when you want confidence in structural health and environment readiness.

## Staging And Commit Boundaries

Operate with a clean boundary between staging and canonical state:

- `inbox/drop_here/` and `inbox/self/` are staging queues
- `cache/` and `logs/` are operator/runtime artefacts
- canonical repo state starts after intentional ingest or capture into `raw/`, `extracted/`, `wiki/`, and `manifests/`

Do not treat inbox files or temporary handoff packs as durable knowledge just because they exist on disk.

## Four Working Loops

### Local Evidence Loop

Use this when evidence already exists locally.

1. ingest
2. compile
3. query or write outputs
4. refresh claims, states, and decisions when needed

### Research Handoff Loop

Use this when Codex/GPT has already done live web research.

1. let the external model research and write the final memo/report/deck
2. save the cited URLs and authored output into a bundle
3. run `capture-research`
4. let Cato download, ingest, compile, and store the result durably

### PDF Vision Handoff Loop

Use this when the PDF is image-heavy, chart-heavy, table-heavy, or otherwise too degraded for the built-in parser to be trusted.

1. run `pdf-pack`
2. let Codex/GPT inspect the rendered page images and, if useful, the original PDF path directly
3. replace the placeholder text in the generated `authored-extraction.md` files and update the generated capture bundle
4. run `capture-pdf`
5. let Cato ingest, compile, and store the result through the normal source-note path

This is the preferred route for scanned or visually dense PDFs. Do not force those documents through plain `ingest` if the baseline extract is visibly weak.

For larger mixed batches:

- start in chunks of roughly 6-12 PDFs
- split further if `pdf-pack` overflows
- isolate a problematic chart deck rather than blocking the entire run
- use `capture-pdf --copy` while debugging an outlier so retries stay reversible

If a bundle already contains `extracted_text`, ingest now treats that as authoritative enough to bypass the native PDF parser.

### Frontier Handoff Loop

Use this when you want deeper reasoning over Cato's claim/state/decision stack.

1. run `frontier-pack`
2. let Codex/GPT reason over the generated pack
3. save the final authored result into the generated capture bundle
4. run `capture-frontier`

This is the settled operating model. Cato remains agent-driven. It does not embed external LLM execution directly into the CLI.

## Belief -> State -> Decision Stack

The main analytical chain is now:

1. source notes and grounded outputs provide evidence
2. `claims-refresh` decomposes that into atomic claims
3. `state-refresh` turns claims plus grounded evidence into a current-state page
4. `regime-brief` aggregates state pages into a world-model surface
5. `decision-note`, `meeting-brief`, `red-team`, and `what-changed-for-markets` turn that into mandate-facing output

These surfaces now explicitly include:

- counter-arguments
- data gaps
- monitoring triggers
- what would flip the view
- current evidence route

## Maintenance Surfaces

Compile and lint now maintain more than simple indices.

Important generated surfaces:

- `wiki/_indices/tags.md`
- `wiki/_indices/backlinks.md`
- `wiki/unresolved/open-threads.md`
- `manifests/wiki_index.json`

These exist so the repo can answer questions like:

- what notes are drifting stale
- what tags are inconsistent
- what pages have no inbound references
- what unresolved threads are still open
- what the current structured note graph looks like

## What Each Command Means

Foundation:

- `ingest` = archive evidence, extract artefacts, classify document type, create source note and append-review draft
- `self-ingest` = convert rough personal notes into structured self-model notes
- `compile` = refresh indices, claims, structured catalog, unresolved registers, and other maintained surfaces
- `search` = lexical corpus lookup across maintained notes and extracts
- `ask` = grounded memo
- `report` = stronger report-style output
- `deck` = Marp-friendly deck

Belief and state:

- `claims-refresh` = rebuild atomic claim ledger
- `claim-diff` = compare latest claim snapshots
- `why-believe` = explain why the repo currently holds a view
- `state-refresh` = refresh canonical state page for a subject
- `state-diff` = compare latest two state snapshots
- `regime-brief` = aggregate states into a regime surface

Monitoring and decisions:

- `watch` = create or update persistent watch profile
- `watch-refresh` = refresh one or all active watches
- `watch-list` = list active watch profiles
- `surveil` = update surveillance page
- `decision-note` = refresh durable decision-support note
- `meeting-brief` = write PM-facing multi-subject brief
- `red-team` = write counter-case and invalidation brief
- `what-changed-for-markets` = write a state-led market-change brief

Handoffs:

- `pdf-pack` = prepare rendered-page PDF review pack plus capture bundle for Codex/GPT vision work
- `capture-pdf` = ingest a Codex-authored PDF extraction bundle back through the normal source-note pipeline
- `capture-research` = import external research bundle
- `frontier-pack` = prepare structured context for Codex/GPT
- `capture-frontier` = write Codex-authored frontier output back into the repo

Self-model and health:

- `reflect` = review self-model and tension register
- `principles` = write principles snapshot
- `postmortem` = create structured postmortem note
- `doctor` = check runtime, Python wrappers, browser tooling, OCR readiness, and repo health
- `lint` = check metadata, drift, backlinks, tags, stale notes, and required managed sections

## Watch Profiles, Surveillance, And Ontology

These are distinct:

- watch profile = durable instruction object in `wiki/watch-profiles/`
- surveillance page = refreshed readable page in `wiki/surveillance/`
- watch ontology = derived summary in `wiki/glossary/watch-ontology.md`

The intended pattern is:

1. define the watch once
2. refresh it repeatedly
3. let reports, states, and decisions inherit that standing context

## Terminal vs Obsidian

The terminal is the control surface.

- PowerShell / Codex = where you operate Cato
- Obsidian = where you browse and read the markdown comfortably

Obsidian is optional. It is not the source of truth.

## Launcher Layer

The launchers in `commands/` are convenience wrappers over the CLI.

Use them for high-frequency actions such as:

- refresh
- ask
- report
- surveillance
- watch creation
- claim refresh
- state refresh
- regime brief
- decision note
- meeting brief
- red-team
- doctor

They are not a second runtime and they should only exist for repeatable operator motions.
