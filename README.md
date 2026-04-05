# Cato_WisdomEngine

*Cato* (traditionally linked to the Latin *catus*): wise, shrewd, discerning, clear-sighted. The name points toward judgment sharpened by experience rather than ornament, which is the spirit this project is meant to carry into research, memory, and decision-making.

Cato is a local, markdown-first research operating system for turning evidence into durable knowledge, durable knowledge into beliefs, and beliefs into current-state and decision support.

It is not "chat with files" and it is not "just a notes vault". It is a structured external memory and operating layer that sits underneath Codex/GPT or Claude so serious work compounds instead of disappearing into chat history.

## What Cato Is

The shortest accurate description is:

- frontier model = reasoning, live research, authored synthesis
- Cato = evidence store, markdown knowledge system, audit trail, and operating memory

Cato preserves raw source material, writes source notes, refreshes a claim ledger, maintains state and regime views, produces decision-facing outputs, and keeps the repo healthy enough that future reasoning can start from structure instead of from scratch.

## What Exists Today

The current product is already more than an MVP scaffold. It now includes:

- evidence ingest for notes, web captures, PDFs, images, datasets, and repo snapshots
- semantic document-class routing on ingest, not just file-extension routing
- append-and-review draft workspace separate from canonical wiki notes
- extracted text, metadata, table previews, and figure notes
- source notes, concept pages, entity pages, thesis pages, synthesis notes, and self-model notes
- atomic claim pages plus claim snapshots, diffs, and "why believe" briefs
- state pages, state diffs, and regime briefs
- decision notes, meeting briefs, red-team briefs, and market-change briefs
- watch profiles and surveillance pages for persistent live topics
- zero-API PDF vision handoff for image-heavy or chart-heavy PDFs
- explicit source-note review states so reviewed text and visually reviewed chartpacks can be preferred over provisional capture
- GPT/Codex research handoff into the repo
- zero-API frontier handoff over the claim/state/decision stack
- zero-API report handoff that stores one canonical model-authored report per topic under `wiki/reports/`
- retrieval-budget discipline from maps to canonical notes to evidence notes to raw extracts
- a dedicated broad investment-summary report route that prepares curated report packs from reviewed evidence instead of generic lexical state hits
- tag, backlink, freshness, and open-thread maintenance surfaces
- repo health checks for lint, OCR readiness, repo-local Python, and browser automation availability

## Why It Matters

Frontier chat alone is excellent at one-off work and weak at durable accumulation unless you manually curate everything.

Typical failure modes without a system like this:

- good work stays trapped in chat history
- raw evidence and later interpretation get mixed together
- the same context-building work gets repeated over and over
- you cannot easily answer what changed in the belief set
- surveillance, meeting prep, and decision review stay manual
- outputs are hard to audit back to sources

Cato fixes that by making useful work land in a structured local system:

- evidence becomes source notes
- source notes and canonical model-authored reports can become claims
- claims become current-state views
- current-state views feed decision support
- outputs can be filed back into the knowledge layer

That is the difference between a file archive and a thinking instrument.

## Core Principles

- markdown-first
- file-first
- raw evidence remains separate from derived knowledge
- auditable and git-friendly
- deterministic plumbing in the CLI, not hidden magic
- frontier reasoning stays with the external model
- final intellectual outputs are authored through the active terminal model and captured back into Cato
- Cato stays agent-driven rather than embedding external LLM execution directly into the CLI

The last point is deliberate. Cato prepares context, captures outputs, and maintains memory. Codex/GPT remains the higher-order reasoning layer.

## How It Works

### 1. Ingest And Route

You drop material into `inbox/drop_here/`.

That inbox is a staging queue, not durable repo state. It is meant to stay uncommitted until the material has been intentionally ingested.

Cato:

- archives the original into `raw/`
- writes extracted artefacts into `extracted/`
- classifies the source by semantic document class
- writes a canonical source note into `wiki/source-notes/`
- writes a matching append-and-review draft note into `wiki/drafts/append-review/`

Document-class routing matters because a filing, meeting note, transcript, chart, macro release, and repo snapshot should not all be treated as the same kind of evidence.

### 2. Compile The Knowledge Layer

`compile` refreshes the maintained repo surfaces:

- indices and maps
- concept and entity pages
- claim pages
- timelines
- watch ontology
- unresolved registers
- tag and backlink indices
- open-thread register
- structured sidecar catalog in `manifests/wiki_index.json`

This is how the repo stays navigable and queryable without abandoning markdown as the source of truth.

### 3. Retrieve With Explicit Budgets

Grounded workflows now follow retrieval budgets:

- `L0` = maps, indices, glossary surfaces
- `L1` = canonical knowledge pages such as concepts, claims, states, decisions
- `L2` = evidence notes and prior grounded outputs
- `L3` = raw extracted text

The rule is TLDR-first:

- start with the shortest maintained route
- escalate only when the shorter route is insufficient
- keep workspace drafts out of grounded retrieval by default

### 4. Work Through Belief, State, And Decision

Cato now has a proper stack:

- claims = atomic belief units
- states = current view on a monitored subject
- regimes = multi-state world-model surfaces
- decisions = PM-facing implications, risks, triggers, and counter-cases

Those pages now explicitly include:

- counter-arguments
- data gaps
- what would flip the view
- current evidence route

### 5. Use The Right Loop

There are five main loops.

Local evidence loop:

1. add files
2. run `ingest`
3. run `compile`
4. run `ask`, `claims-refresh`, `state-refresh`, or `decision-note`

Report handoff loop:

1. run `report "topic"`
2. open the generated files in `cache/report-packs/`
3. let Codex/Claude author the final report into the generated capture bundle
4. fill `model` with the actual terminal session label used for authorship
5. run `capture-report`
6. let Cato write or update the canonical report under `wiki/reports/` and archive the previous canonical version

Research handoff loop:

1. let Codex/GPT do live web research
2. save the researched sources and final authored output into a bundle
3. run `capture-research`
4. let Cato ingest, compile, refresh watches, and store the output durably

PDF vision handoff loop:

1. run `pdf-pack`
2. let Codex/GPT inspect the rendered page images and, if useful, the raw PDF paths directly
3. replace the generated `authored-extraction.md` placeholders and update the capture bundle
4. run `capture-pdf`
5. let Cato ingest and compile the PDF through the normal source-note pipeline

For larger mixed batches, start in chunks of roughly 6-12 PDFs and isolate outlier chart decks instead of forcing one oversized pack.

Broad investment-summary loop:

1. review the source notes that actually matter to the current investment surface
2. use explicit review states so draft PDF-handoff notes do not silently dominate retrieval
3. run `report "Current investment summary across all ingested research"`
4. let the curated investment route prepare the pack from reviewed source notes first, then supporting canonical pages if needed
5. let Codex/Claude author the final report and capture it back with `capture-report`

Frontier handoff loop:

1. run `frontier-pack`
2. let Codex/GPT reason over the generated context
3. save the final authored output into the generated capture bundle
4. fill `model` with the actual terminal session label used for authorship
5. run `capture-frontier`

## Repository Layout

- `config/` = settings, prompts, policies, ontology, schemas
- `inbox/` = staging area for new evidence and self-notes
- `raw/` = immutable evidence archive
- `extracted/` = text, metadata, figures, tables
- `manifests/` = structured sidecars and change-tracking files
- `wiki/source-notes/` = one-note-per-source grounding layer
- `wiki/drafts/append-review/` = working draft queue distinct from canonical notes
- `wiki/reports/` = canonical model-authored reports, one current file per topic
- `wiki/claims/` = atomic belief ledger
- `wiki/states/` = current-state pages
- `wiki/regimes/` = regime-level world-model surfaces
- `wiki/decisions/` = durable decision-support notes
- `wiki/watch-profiles/` = persistent watch instructions
- `wiki/surveillance/` = refreshed live watch pages
- `wiki/self/` = principles, heuristics, postmortems, biases, tensions
- `outputs/` = generated memos, briefs, decks, meeting briefs, and legacy archived report runs
- `logs/` = lint, doctor, and workflow reports
- `cache/` = frontier packs, claim snapshots, and disposable runtime files
- `src/` = Node implementation
- `tests/` = verification

## Version-Control Hygiene

Some folders are intentionally operational rather than canonical:

- `inbox/drop_here/` and `inbox/self/` are staging queues and should remain uncommitted
- `cache/` contains disposable handoff packs, snapshots, and runtime artefacts
- `logs/` contains operator reports and health traces
- `tmp/` is scratch space for manual review artefacts and should remain uncommitted

The durable knowledge system begins after intentional ingest. That is when evidence moves into `raw/`, `extracted/`, `wiki/`, and `manifests/`.

## Quick Start

1. Open a terminal in the repo root.
2. Run `.\cato.cmd init`.
3. Drop evidence into `inbox/drop_here/`.
4. Treat `inbox/` as a staging queue, not as committed repo state.
5. For text-first evidence, run `.\cato.cmd ingest`.
6. For image-heavy PDFs, run `.\cato.cmd pdf-pack`, complete the authored extraction bundle, then run `.\cato.cmd capture-pdf`.
7. Run `.\cato.cmd compile` when you used plain `ingest`.
8. Run `.\cato.cmd search "your topic"`.
9. Run `.\cato.cmd ask "your question"` for a grounded local memo.
10. Run `.\cato.cmd report "your topic"` to prepare a final-report pack, then let the active terminal model author the capture bundle and run `.\cato.cmd capture-report .\cache\report-packs\...\...-capture.json`.
11. For the all-corpus investment route, use `.\cato.cmd report "Current investment summary across all ingested research"` and capture the authored result back through `capture-report`.
12. Run `.\cato.cmd claims-refresh --snapshot` when you want the belief ledger rebuilt.
13. Run `.\cato.cmd state-refresh "Global Macro"` or `.\cato.cmd regime-brief --set weekly-investment-meeting` when you want a current world-model surface.
14. Run `.\cato.cmd decision-note "topic"` or `.\cato.cmd meeting-brief "Weekly investment meeting brief"` for deterministic decision scaffolds, and use `frontier-pack` / `capture-frontier` when you want the final authored model output.
15. Run `.\cato.cmd lint` and `.\cato.cmd doctor`.

## Core Commands

Foundation:

- `.\cato.cmd init`
- `.\cato.cmd ingest`
- `.\cato.cmd pdf-pack`
- `.\cato.cmd capture-pdf`
- `.\cato.cmd self-ingest`
- `.\cato.cmd compile`
- `.\cato.cmd search`
- `.\cato.cmd ask`
- `.\cato.cmd report`
- `.\cato.cmd capture-report`
- `.\cato.cmd deck`
- `.\cato.cmd lint`
- `.\cato.cmd doctor`

Belief and state:

- `.\cato.cmd claims-refresh --snapshot`
- `.\cato.cmd claim-diff --topic "..."`
- `.\cato.cmd why-believe "..."`
- `.\cato.cmd state-refresh "..."`
- `.\cato.cmd state-diff "..."`
- `.\cato.cmd regime-brief --set weekly-investment-meeting`

Decision and monitoring:

- `.\cato.cmd watch "..."`
- `.\cato.cmd watch-refresh`
- `.\cato.cmd watch-list`
- `.\cato.cmd surveil "..."`
- `.\cato.cmd meeting-brief "..."`
- `.\cato.cmd decision-note "..."`
- `.\cato.cmd red-team "..."`
- `.\cato.cmd what-changed-for-markets`

Handoffs:

- `.\cato.cmd pdf-pack --from inbox/drop_here --limit 8 --dpi 144 --max-pages 0`
- `.\cato.cmd capture-pdf .\path\to\bundle.json`
- `.\cato.cmd capture-research .\path\to\bundle.json`
- `.\cato.cmd report "topic"`
- `.\cato.cmd capture-report .\path\to\bundle.json`
- `.\cato.cmd frontier-pack "topic" --mode decision`
- `.\cato.cmd capture-frontier .\path\to\bundle.json --promote`

Self-model:

- `.\cato.cmd reflect`
- `.\cato.cmd principles`
- `.\cato.cmd postmortem "title"`

Run `.\cato.cmd help` for arguments and options.

## Obsidian, Python, And Browser Tooling

Obsidian is optional. It is the reading and navigation layer, not the control surface.

The runtime is Node-first. Repo-local Python wrappers exist so Python-dependent utilities can still be reached from the repo shell, and the PDF vision handoff uses the machine's real Python launcher plus available PDF-rendering libraries to generate page images for Codex/GPT review. Browser automation is treated as an environment capability, not as an in-repo dependency, and `doctor` verifies Playwright/Puppeteer readiness when needed.

## What Cato Is Not

- not a replacement for Codex/GPT/Claude
- not a vector-database product
- not a hidden long-context trick
- not an always-on daemon
- not a storage rewrite away from markdown
- not a fake embedded model runtime
- not just a markdown vault
- not just a RAG layer

It is the structured local system those tools can think through and write into.

## Recommended Mental Model

Use this mental model:

- raw evidence is truth
- source notes are grounded interpretation
- claims are belief units
- states are the current world model
- decisions are mandate-facing judgement
- canonical reports are model-authored durable judgement
- drafts are workspace
- outputs are artefacts
- Cato keeps the whole chain inspectable

If you need the deeper operating detail, read:

- [docs/operator_guide.md](docs/operator_guide.md)
- [docs/report_handoff.md](docs/report_handoff.md)
- [docs/pdf_handoff.md](docs/pdf_handoff.md)
- [docs/research_handoff.md](docs/research_handoff.md)
- [docs/frontier_handoff.md](docs/frontier_handoff.md)
- [docs/final_output_policy.md](docs/final_output_policy.md)
- [docs/project_map.md](docs/project_map.md)
