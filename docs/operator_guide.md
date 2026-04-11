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

9. `wiki/memory/` and `MEMORY.md`
   Daily operating logs, compiled current context, weekly reviews, and a root working-memory mirror.

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

## Working Memory

The repo now has a dedicated working-memory layer:

- `wiki/memory/daily/YYYY-MM-DD.md` = raw daily operating log
- `wiki/memory/current-context.md` = current compiled orientation note
- `wiki/memory/weekly/weekly-review-YYYY-MM-DD.md` = weekly review / kaizen surface
- `MEMORY.md` = root mirror of the current context

Important operating rule:

- daily logs are deterministic and automatic
- current context and weekly review are model-authored via pack/capture

The trigger is not shell startup.

The live trigger is:

- first meaningful Cato use of the day if current context is due
- first meaningful Cato use of the ISO week if the weekly review is due

That keeps refresh low-friction without creating noise every time a terminal opens.

Old lint reports do not update themselves. Treat each file under `logs/lint/` as a point-in-time snapshot and rerun `lint` before reacting to a stale report count.

## Repository Split

This repo is no longer just one undifferentiated GitHub line.

- maintain a private working line for real doctrine, corpus, and captured outputs
- treat the public line as a deliberate engine-only release surface

If a change contains user-specific self-model doctrine, private corpus material, or captured working outputs, it belongs in the private line only. Publish to the public line deliberately, after confirming the change is engine-level and share-safe. See [repo_topology.md](repo_topology.md).

When you want to refresh the public line from the private working repo, use `.\cato.cmd public-release --to ..\Cato_WisdomEngine_Public` from the private worktree, then validate and commit from the public worktree separately.

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

Ingest also now enforces a sensitive-data gate:

- secret-like patterns quarantine the source by default instead of writing it into canonical storage
- `--allow-sensitive` is an explicit override, not the default operating path

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

## Self-Model And Operating Constitution

The self-model is no longer just a loose bucket of personal notes.

`self-ingest` now supports explicit schemas such as:

- `constitution`
- `mode`
- `preference`
- `bias`
- `anti-pattern`
- `heuristic`
- `decision-rule`
- `communication-style`
- `portfolio-philosophy`
- `postmortem`

Use explicit `--schema` when you know what the note is. Keep `--type auto` only as a backwards-compatible fallback.

The best operating shape is atomic notes, not one giant omnibus personality dump. One note per durable rule is easier to route, resolve, supersede, and review.

`compile` now turns the self notes into:

- `manifests/self_model.json`
- `wiki/self/current-operating-constitution.md`
- `wiki/self/mode-profiles/investment-research.md`
- `wiki/self/mode-profiles/trading.md`
- `wiki/self/mode-profiles/communication.md`
- `wiki/self/tension-register.md`

The compiled self-model resolves conflicts by:

- higher `priority`
- `hard` over `default` over `soft`
- exact `command_scope` over global
- exact `applicability` over generic

That compiled result is what now feeds authored packs, report packs, frontier packs, and decision scaffolds.

The repo now has an expanded doctrine corpus. Use [self_model_bootstrap.md](self_model_bootstrap.md) to extend or revise it without duplicating the same rules under new filenames.

## Daily Loop

The normal local loop is:

1. Drop evidence into `inbox/drop_here/`.
2. Drop rough self-notes into `inbox/self/` when relevant.
3. Run:
   - `ingest`
   - `self-ingest`
   - `compile`
4. Generate the surface you need:
   - `ask` then `capture-authored`
   - `report` then `capture-report` for final reports
   - `deck` then `capture-authored`
   - `claims-refresh`
   - `why-believe` then `capture-authored`
   - `state-refresh` then `capture-authored`
   - `regime-brief` then `capture-authored`
   - `decision-note` then `capture-authored`
   - `meeting-brief` then `capture-authored`
   - `red-team` then `capture-authored`
   - `what-changed-for-markets` then `capture-authored`
   - `watch` then `capture-authored`
   - `surveil` then `capture-authored`
   - `reflect` then `capture-authored`
   - `principles` then `capture-authored`
   - `postmortem` then `capture-authored`
5. If the finished artefact contains durable knowledge worth reusing, run:
   - `crystallize` then `capture-crystallize`
6. Run `lint` and `doctor` when you want confidence in structural health and environment readiness.

Working memory now happens inside that normal loop rather than as a separate ritual. If current memory is stale, Cato refreshes the due surfaces automatically after meaningful actions and writes them back into the repo.

## Staging And Commit Boundaries

Operate with a clean boundary between staging and canonical state:

- `inbox/drop_here/` and `inbox/self/` are staging queues
- `cache/` and `logs/` are operator/runtime artefacts
- canonical repo state starts after intentional ingest or capture into `raw/`, `extracted/`, `wiki/`, and `manifests/`

Do not treat inbox files or temporary handoff packs as durable knowledge just because they exist on disk.

## Working Loops

### Local Evidence Loop

Use this when evidence already exists locally.

1. ingest
2. compile
3. query or prepare authored output packs
4. capture the final model-authored result where the command is substantive

### Authored Output Loop

Use this for substantive local outputs that do not need the specialized report, frontier, research, or PDF workflows.

1. run the top-level command such as `ask`, `deck`, `surveil`, `watch`, `why-believe`, `state-refresh`, `regime-brief`, `meeting-brief`, `decision-note`, `red-team`, `what-changed-for-markets`, `reflect`, `principles`, or `postmortem`
2. open the generated files in `cache/authored-packs/`
3. review the injected `Active Self-Model` block as part of the command context
4. let Codex/GPT or Claude author the final markdown in the generated capture bundle
5. keep the final result consistent with the active hard rules, bias checks, challenge style, and writing constraints unless you are deliberately overriding them
6. fill `model` with the actual terminal session label used for authorship
7. run `capture-authored`

### Crystallization Loop

Use this after a finished artefact contains durable knowledge that should compound future work.

1. run `crystallize` against the finished artefact path or title
2. review the generated files in `cache/crystallize-packs/`
3. distill only durable validated takeaways, claim candidates, concept or entity updates, state or decision implications, and process lessons
4. fill `model` with the actual terminal session label used for authorship
5. run `capture-crystallize`

See [crystallization_guide.md](crystallization_guide.md) for the detailed contract.

### Working-Memory Loop

Use this when you want to inspect or override the automatic memory behaviour.

1. run `memory-status`
2. if needed, run `memory-refresh`
3. review the generated files in `cache/memory-packs/`
4. only if you want to replace the automatic note, let Codex/GPT or Claude author the final current-context or weekly-review note
5. fill `model` with the actual terminal session label used for authorship
6. run `capture-memory`

Most of the time steps 1 and 2 should be unnecessary because Cato now refreshes working memory automatically when due.

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
3. use the injected self-model block as part of the reasoning brief rather than ignoring it
4. save the final authored result into the generated capture bundle
5. fill `model` with the actual terminal session label used for authorship
6. run `capture-frontier`

This is the settled operating model. Cato remains agent-driven. It does not embed external LLM execution directly into the CLI.

### Report Handoff Loop

Use this when the output should be a final report rather than a deterministic scaffold.

1. run `report`
2. open the generated files in `cache/report-packs/`
3. let Codex/Claude author the final report in the generated capture bundle
4. fill `model` with the actual terminal session label used for authorship
5. run `capture-report`
6. let Cato update the canonical report under `wiki/reports/` and archive the previous canonical version

### Probability Loop

Use this when the work needs a forward-looking probability surface rather than only historical synthesis.

1. run `market-refresh --profile ...` when the cached market history needs a fresh pull
2. run `scenario-refresh "topic" --profile ...`
3. let Cato call the Python quant core and write the canonical surface under `wiki/probabilities/`
4. run `scenario-diff "topic" --profile ...` when you need the delta between the latest two runs
5. run `probability-brief "topic" --profile ...` when you want a model-authored interpretation pack
6. let Codex/GPT or Claude author the brief in the generated capture bundle
7. fill `model` with the actual terminal session label used for authorship
8. run `capture-authored`

Important operating rule:

- the canonical probability surface is deterministic, data-calibrated, and reusable
- the probability brief is authored judgement over that surface
- canonical scenario work defaults to `100,000` paths unless there is an explicit override
- the Python helper layer is part of the engine contract; keep `requirements-quant.txt` current and use `doctor` to confirm the pinned packages are actually present

See [scenario_engine.md](scenario_engine.md) for the detailed model and file layout.

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
- `self-ingest` = convert rough personal notes into structured self-model notes, with explicit schema support and richer frontmatter for priority, rule strength, applicability, conflicts, examples, and review triggers
- `compile` = refresh indices, claims, structured catalog, unresolved registers, and other maintained surfaces
- `search` = lexical corpus lookup across maintained notes and extracts
- `ask` = prepare a model-authored memo pack
- `capture-authored` = capture the model-authored memo, deck, surveillance, belief/state/decision, self-model, or postmortem output back into the repo
- `memory-status` = show whether current context or weekly review is due or already pending
- `memory-refresh` = manually force or override the automatic current-context and/or weekly-review refresh path
- `capture-memory` = replace an automatically generated current-context or weekly-review note with a manually authored override and update `MEMORY.md`
- `report` = prepare a final-report pack for the active terminal model
- `capture-report` = capture the model-authored final report into canonical `wiki/reports/`
- `market-refresh` = pull and normalize cross-asset market history into Cato-managed local caches
- `scenario-refresh` = run the probabilistic scenario engine and write a canonical surface under `wiki/probabilities/`
- `scenario-diff` = compare the latest two scenario snapshots for the same profile
- `probability-brief` = prepare a model-authored interpretation pack over a canonical probability surface
- `deck` = prepare a model-authored Marp-friendly deck pack

Recurring generated outputs under `outputs/memos/`, `outputs/briefs/`, `outputs/decks/`, and `outputs/meeting-briefs/` now keep one current file per slug. Older runs move into sibling `archive/<slug>/` folders instead of piling up in the active folder.

## Internal Runtime Shape

The current internal shape is now more deliberate:

- command dispatch lives behind a registry
- pack/capture mechanics use one shared core
- output-family behaviour resolves through one registry
- generated-note safety is centralised
- `self-model` and `report` are now thin public façades over internal modules
- the custom Node test harness is split into focused suites behind the same top-level entrypoint

That changed the maintainability of the repo, not the operator contract. If you need the implementation map, read [internal_architecture.md](internal_architecture.md).

Belief and state:

- `claims-refresh` = rebuild atomic claim ledger
- `claim-diff` = compare latest claim snapshots
- `why-believe` = prepare a model-authored belief brief pack
- `state-refresh` = prepare a model-authored state-page pack while refreshing the deterministic state scaffold underneath
- `state-diff` = compare latest two state snapshots
- `regime-brief` = prepare a model-authored regime brief pack

Monitoring and decisions:

- `watch` = prepare a model-authored watch-profile pack
- `watch-refresh` = batch-refresh watch maintenance surfaces
- `watch-list` = list active watch profiles
- `surveil` = prepare a model-authored surveillance-page pack
- `decision-note` = prepare a model-authored durable decision-note pack
- `meeting-brief` = prepare a model-authored PM-facing meeting brief pack
- `red-team` = prepare a model-authored counter-case and invalidation brief pack
- `what-changed-for-markets` = prepare a model-authored market-change brief pack

Handoffs:

- `pdf-pack` = prepare rendered-page PDF review pack plus capture bundle for Codex/GPT vision work
- `capture-pdf` = ingest a Codex-authored PDF extraction bundle back through the normal source-note pipeline
- `capture-research` = import external research bundle
- `capture-authored` = import the model-authored result for the common authored-output pack workflow
- `frontier-pack` = prepare structured context for Codex/GPT
- `capture-frontier` = write Codex-authored frontier output back into the repo

Quant and probabilities:

- market data enters through Cato-managed web pulls and local caches, not directly through ad hoc Python fetches
- the quant core runs in Python, but Cato owns orchestration, config, manifests, and canonical markdown outputs
- probability surfaces are reusable knowledge objects, but they are intentionally excluded from claim/state/report grounding routes to avoid recursive self-reinforcement
- treat the last run under `wiki/probabilities/` as the current canonical surface, not an old log file or old authored brief

Self-model and health:

- `reflect` = prepare a model-authored self-reflection memo pack
- `principles` = prepare a model-authored principles snapshot pack
- `postmortem` = prepare a model-authored postmortem note pack
- `doctor` = check runtime, Python wrappers, browser tooling, OCR readiness, and repo health
- `doctor` now also checks the pinned Python package contract in `requirements-quant.txt`
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
