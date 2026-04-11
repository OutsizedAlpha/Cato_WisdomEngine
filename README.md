# Cato_WisdomEngine

*Cato* (traditionally linked to the Latin *catus*): wise, shrewd, discerning, clear-sighted. The name points toward judgment sharpened by experience rather than ornament, which is the spirit this project is meant to carry into research, memory, and decision-making.

Cato is a local, markdown-first research operating system for turning evidence into durable knowledge, durable knowledge into beliefs, and beliefs into current-state and decision support.

It is not "chat with files" and it is not "just a notes vault". It is a structured external memory and operating layer that sits underneath Codex/GPT or Claude so serious work compounds instead of disappearing into chat history.

## What Cato Is

The shortest accurate description is:

- frontier model = reasoning, live research, authored synthesis
- Cato = evidence store, markdown knowledge system, audit trail, and operating memory

Cato preserves raw source material, writes source notes, refreshes a claim ledger, maintains state and regime views, produces decision-facing outputs, and keeps the repo healthy enough that future reasoning can start from structure instead of from scratch.

## Repository Lines

The project now has two intended repository lines:

- a public line for the open reference version of Cato
- a private line for the personalised working system with seeded self-model doctrine, private corpus material, and captured authored outputs

In the maintainer workflow, day-to-day work happens in the private line and the public repo is a deliberate engine-only release surface. The public line should preserve the same underlying engine architecture and operator-facing workflows as the private line, including the scenario engine, while stripping private corpus, personal doctrine, operator-specific memory payloads, and private generated market views. See [docs/repo_topology.md](docs/repo_topology.md), [docs/public_release_policy.md](docs/public_release_policy.md), and [docs/release_runbook.md](docs/release_runbook.md).
Use `.\cato.cmd public-release --to ..\Cato_WisdomEngine_Public` when you want to project the current engine into a separate public-safe worktree without shipping the private corpus.

## What Exists Today

The current product is already more than an MVP scaffold. It now includes:

- evidence ingest for notes, web captures, PDFs, images, datasets, and repo snapshots
- semantic document-class routing on ingest, not just file-extension routing
- append-and-review draft workspace separate from canonical wiki notes
- extracted text, metadata, table previews, and figure notes
- source notes, concept pages, entity pages, thesis pages, synthesis notes, and self-model notes
- schema-driven self-model notes for constitution, modes, preferences, biases, anti-patterns, heuristics, decision rules, communication style, portfolio philosophy, and postmortems
- atomic claim pages plus claim snapshots, diffs, and "why believe" briefs
- state pages, state diffs, and regime briefs
- decision notes, meeting briefs, red-team briefs, and market-change briefs
- watch profiles and surveillance pages for persistent live topics
- zero-API PDF vision handoff for image-heavy or chart-heavy PDFs
- explicit source-note review states so reviewed text and visually reviewed chartpacks can be preferred over provisional capture
- GPT/Codex research handoff into the repo
- zero-API frontier handoff over the claim/state/decision stack
- zero-API report handoff that stores one canonical model-authored report per topic under `wiki/reports/`
- a generalized authored-output handoff for memos, decks, surveillance, belief/state/decision surfaces, self-model outputs, and postmortems
- a working-memory layer with automatic daily logs, due-based current-context refresh, weekly review refresh, and a root `MEMORY.md` mirror
- a Node-orchestrated, Python-executed scenario engine with Cato-owned market-data refresh, regime inference, intermarket transmission mapping, and Monte Carlo path simulation
- canonical probability surfaces, scenario diffs, and probability-brief packs grounded in `100,000`-path default runs for report-facing use
- a pinned Python runtime contract in `requirements-quant.txt`, validated by `doctor`, so the public and private engines can reproduce the quant and PDF helper layer instead of depending on undocumented machine state
- a compiled self-model artefact under `manifests/self_model.json` plus `wiki/self/current-operating-constitution.md` and command-relevant mode profiles
- an expanded doctrine corpus covering PM-grade research, macro/intermarket analysis, valuation, trading, sourcing, communication, cognitive augmentation, bias watch, anti-patterns, portfolio construction, workbook audit standards, idea-market discipline, and update discipline
- retrieval-budget discipline from maps to canonical notes to evidence notes to raw extracts
- a dedicated broad investment-summary report route that prepares curated report packs from reviewed evidence instead of generic lexical state hits
- tag, backlink, freshness, and open-thread maintenance surfaces
- repo health checks for lint, OCR readiness, repo-local Python, and browser automation availability
- a hardened internal architecture built around a command registry, shared handoff core, output-family registry, generated-note safety layer, split self-model/report internals, and focused test suites

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
- top-level substantive output commands now prepare packs and require capture rather than treating deterministic scaffold prose as final
- the compiled self-model should materially shape authored packs, reports, frontier packs, and decision scaffolds rather than sitting as passive notes
- forward probabilities are calibrated from market data, while corpus and doctrine shape overlays, priors, and interpretation rather than pretending prose can replace calibration data
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

### 4. Compile And Apply The Self-Model

`self-ingest` no longer just drops rough thoughts into a generic bucket.

It now supports schema-shaped self notes such as:

- constitution
- mode
- preference
- bias
- anti-pattern
- heuristic
- decision-rule
- communication-style
- portfolio-philosophy
- postmortem

`compile` turns those notes into:

- `manifests/self_model.json`
- `wiki/self/current-operating-constitution.md`
- `wiki/self/mode-profiles/investment-research.md`
- `wiki/self/mode-profiles/trading.md`
- `wiki/self/mode-profiles/communication.md`
- an updated self tension register

Authored packs, report packs, frontier packs, and decision scaffolds now receive a command-specific self-model block with:

- active hard rules
- active soft preferences
- challenge style
- bias checks
- writing constraints
- what not to do
- explicit rule conflicts and review pressure

That is the current mechanism for making Cato behave more like your operating constitution rather than merely remembering that it exists.

Use [docs/self_model_bootstrap.md](docs/self_model_bootstrap.md) to extend, refine, or supersede the current doctrine corpus without collapsing back into one omnibus personality memo.

### 5. Work Through Belief, State, And Decision

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

### 6. Model Forward Paths

The probability layer is now a first-class part of Cato rather than an external side calculation.

The live operating shape is:

- `market-refresh` = pull and normalize cross-asset market data through Cato-managed web fetches
- `scenario-refresh` = run the Python quant core and write a canonical probability surface into `wiki/probabilities/`
- `scenario-diff` = compare the latest two scenario snapshots for the same profile
- `probability-brief` = prepare an authored interpretation pack over the canonical probability surface

The default horizons are `5`, `21`, `63`, and `126` trading days.
The operational default for canonical scenario work is `100,000` simulated paths.

The quantitative stack is deliberately split:

- Cato owns data acquisition, caching, file layout, and authored-pack preparation
- Python owns regime inference, transmission mapping, and Monte Carlo path generation
- the active terminal model authors the final interpreted brief when one is needed

See [docs/scenario_engine.md](docs/scenario_engine.md) for the detailed contract.

### 7. Use The Right Loop

There are several main loops.

Local evidence loop:

1. add files
2. run `ingest`
3. run `compile`
4. run a pack-preparation command such as `ask`, `state-refresh`, or `decision-note`, then complete the authored output through capture

Common authored-output loop:

1. run the normal top-level command such as `ask`, `deck`, `surveil`, `watch`, `why-believe`, `state-refresh`, `regime-brief`, `meeting-brief`, `decision-note`, `red-team`, `what-changed-for-markets`, `reflect`, `principles`, or `postmortem`
2. open the generated files in `cache/authored-packs/`
3. let Codex/Claude author the final output into the generated capture bundle
4. fill `model` with the actual terminal session label used for authorship
5. run `capture-authored`

Working-memory loop:

1. meaningful Cato commands now append to daily working memory automatically
2. on the first meaningful Cato use of the day or ISO week when due, Cato refreshes current-context and weekly-review automatically and writes them back into the repo
3. use `memory-status` if you want to inspect whether either surface is current
4. use `memory-refresh` only as a manual override or force-refresh path
5. use `capture-memory` only when you intentionally want to replace the automatic note with a manually authored override

Report handoff loop:

1. run `report "topic"`
2. open the generated files in `cache/report-packs/`
3. let Codex/Claude author the final report into the generated capture bundle
4. fill `model` with the actual terminal session label used for authorship
5. run `capture-report`
6. let Cato write or update the canonical report under `wiki/reports/` and archive the previous canonical version

Probability loop:

1. run `market-refresh --profile ...` when cached market history needs refreshing
2. run `scenario-refresh "topic" --profile ...` to generate the canonical probability surface
3. run `scenario-diff "topic" --profile ...` when you need to inspect changes between consecutive runs
4. run `probability-brief "topic" --profile ...`
5. open the generated authored bundle in `cache/authored-packs/`
6. let Codex/Claude author the final interpretation
7. run `capture-authored`

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
- `wiki/probabilities/` = canonical probability surfaces from the scenario engine
- `wiki/memory/` = daily logs, current context, weekly reviews, and memory index
- `wiki/claims/` = atomic belief ledger
- `wiki/states/` = current-state pages
- `wiki/regimes/` = regime-level world-model surfaces
- `wiki/decisions/` = durable decision-support notes
- `wiki/watch-profiles/` = persistent watch instructions
- `wiki/surveillance/` = refreshed live watch pages
- `wiki/self/` = principles, heuristics, postmortems, biases, tensions
- `wiki/self/current-operating-constitution.md` = compiled current operating constitution
- `wiki/self/mode-profiles/` = compiled mode-specific profiles used by authored/report/frontier context
- `outputs/` = generated memos, briefs, decks, and meeting briefs, each now kept as one current file per slug with older runs archived under sibling `archive/` folders, plus legacy archived report runs
- `raw/market-data/` and `manifests/market-data/series/` = raw pulls and normalized market history used by the scenario engine
- `logs/` = lint, doctor, and workflow reports
- `cache/` = frontier packs, claim snapshots, and disposable runtime files
- `src/` = Node implementation
- `tests/` = verification, now split into focused suites with a stable top-level entrypoint

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
7. For rough personal operating rules, add atomic notes to `inbox/self/` and run `.\cato.cmd self-ingest --schema constitution` or another explicit schema when the routing is obvious.
8. Run `.\cato.cmd compile` so the self-model, indices, and belief layer refresh together.
9. Run `.\cato.cmd search "your topic"`.
10. Run `.\cato.cmd ask "your question"` to prepare a model-authored memo pack, then complete it with `.\cato.cmd capture-authored .\cache\authored-packs\...\...-capture.json`.
11. Run `.\cato.cmd report "your topic"` to prepare a final-report pack, then let the active terminal model author the capture bundle and run `.\cato.cmd capture-report .\cache\report-packs\...\...-capture.json`.
12. For the all-corpus investment route, use `.\cato.cmd report "Current investment summary across all ingested research"` and capture the authored result back through `capture-report`.
13. For forward probability work, run `.\cato.cmd market-refresh --profile global-risk-regime`, then `.\cato.cmd scenario-refresh "Global Risk Regime" --profile global-risk-regime`, and use `.\cato.cmd probability-brief "Global Risk Regime" --profile global-risk-regime` when you want a model-authored interpretation pack over the canonical surface.
14. Run `.\cato.cmd claims-refresh --snapshot` when you want the belief ledger rebuilt.
15. Run `.\cato.cmd state-refresh "Global Macro"` or `.\cato.cmd regime-brief --set weekly-investment-meeting` to prepare authored packs for the current world-model surface, then complete them with `capture-authored`.
16. Run `.\cato.cmd decision-note "topic"`, `.\cato.cmd meeting-brief "Weekly investment meeting brief"`, or `.\cato.cmd red-team "topic"` to prepare authored packs, and use `frontier-pack` / `capture-frontier` when you want a deeper bespoke frontier reasoning route over the same claim/state/decision stack.
17. Check working memory with `.\cato.cmd memory-status`; use `.\cato.cmd memory-refresh` only when you want to force or override the automatic write-through behaviour, and use `.\cato.cmd capture-memory` only for a deliberate manual replacement note.
18. Run `.\cato.cmd lint` and `.\cato.cmd doctor`.
19. When you want to update the public engine line, run `.\cato.cmd public-release --to ..\Cato_WisdomEngine_Public`, validate that worktree, and use the release checklist in [docs/release_runbook.md](docs/release_runbook.md) before committing there.

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
- `.\cato.cmd capture-authored`
- `.\cato.cmd memory-status`
- `.\cato.cmd memory-refresh`
- `.\cato.cmd capture-memory`
- `.\cato.cmd report`
- `.\cato.cmd capture-report`
- `.\cato.cmd market-refresh`
- `.\cato.cmd scenario-refresh`
- `.\cato.cmd scenario-diff`
- `.\cato.cmd probability-brief`
- `.\cato.cmd deck`
- `.\cato.cmd lint`
- `.\cato.cmd doctor`
- `.\cato.cmd public-release`

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
- `.\cato.cmd capture-authored .\path\to\bundle.json`
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

The runtime is Node-first. Repo-local Python wrappers exist so Python-dependent utilities can still be reached from the repo shell, and the PDF vision handoff uses the machine's real Python launcher plus available PDF-rendering libraries to generate page images for Codex/GPT review. The same Python allowance now also underpins the scenario engine, which uses installed scientific packages for regime inference and Monte Carlo path simulation while keeping market-data acquisition inside Cato's CLI. Browser automation is treated as an environment capability, not as an in-repo dependency, and `doctor` verifies Playwright/Puppeteer readiness when needed.

For a fresh machine, install the pinned Python helper layer with:

`python -m pip install -r requirements-quant.txt`

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
- [docs/internal_architecture.md](docs/internal_architecture.md)
- [docs/authored_output_handoff.md](docs/authored_output_handoff.md)
- [docs/report_handoff.md](docs/report_handoff.md)
- [docs/working_memory.md](docs/working_memory.md)
- [docs/scenario_engine.md](docs/scenario_engine.md)
- [docs/release_runbook.md](docs/release_runbook.md)
- [docs/pdf_handoff.md](docs/pdf_handoff.md)
- [docs/research_handoff.md](docs/research_handoff.md)
- [docs/frontier_handoff.md](docs/frontier_handoff.md)
- [docs/final_output_policy.md](docs/final_output_policy.md)
- [docs/project_map.md](docs/project_map.md)
