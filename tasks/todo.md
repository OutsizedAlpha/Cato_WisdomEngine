# Task Tracker

Use this file for active or recently completed non-trivial work. Keep it concise, checkable, and aligned to the actual repo state.

## Objective

- Turn `Cato-WisdomEngine` from a working research runtime into a stronger belief/state/decision engine for investment work.

## Plan

1. Maintain the new belief/state/decision layers without letting them drift into noisy generated surfaces.
2. Decide how much deterministic logic to keep versus where model-assisted compile passes should eventually enter.
3. Keep improving finance-specific note quality and operator usability without breaking source-grounded discipline.

## Tasks

- [x] Convert the user conversation into a structured project brief.
- [x] Update the project map to reflect the current local truth of the repository.
- [x] Initialise Git in the repo and create a top-level `README.md`.
- [x] Create the phase-1 folder structure for `config/`, `inbox/`, `raw/`, `manifests/`, `extracted/`, `wiki/`, `outputs/`, `logs/`, `cache/`, and implementation code.
- [x] Decide and document the initial project layout and dependency definition.
- [x] Add first-pass templates for source notes, concept pages, thesis pages, surveillance pages, question pages, and principle notes.
- [x] Add first-pass prompt/policy files covering provenance, editing rules, file write rules, market research, and self-model behaviour.
- [x] Scaffold the CLI with working command contracts for `init`, `ingest`, `self-ingest`, `compile`, `search`, `ask`, and `lint`.
- [x] Implement a real `ingest -> source note -> compile -> ask output` path.
- [x] Add focused tests and run them.
- [x] Add deeper PDF extraction and optional OCR/image-aware extraction.
- [x] Add richer `report`, `deck`, `surveil`, `doctor`, `reflect`, `principles`, and `postmortem` workflows.
- [x] Add output-promotion flow from generated artefacts back into `wiki/synthesis/`.
- [x] Treat repo directories and repo archives as first-class ingest objects.
- [x] Write figure-note sidecars for images and markdown/HTML figure references.
- [x] Add a first launcher layer for common Windows + Obsidian workflows.
- [x] Add watch profiles as persistent instruction objects that drive surveillance and topic retrieval.
- [x] Add a GPT/Codex-to-Cato research handoff flow so live web research can be captured as durable Cato evidence and outputs.
- [x] Add an atomic claim ledger with claim pages, snapshots, diffs, and belief briefs.
- [x] Add a state/regime engine with state pages, state diffs, and regime briefs.
- [x] Add a PM decision layer with meeting briefs, decision notes, red-team outputs, and market-change briefs.
- [x] Extend the launcher layer for the new belief/state/decision surfaces.
- [x] Add a zero-API frontier-pack bridge so Codex can reason over claim/state/decision context and capture the final output back into Cato.
- [ ] Decide whether to embed external LLM execution into the CLI or keep the repo agent-driven.

## Validation

- Current validation completed:
  - `node .\bin\cato.js help`
  - `node .\tests\cato.test.js`
  - Live temp-repo smoke on 2026-04-03 covering PDF ingest, real Windows OCR, compile, `ask`, and lint
  - Live CLI smoke on 2026-04-03 covering `report`, `deck`, `surveil`, `reflect`, `principles`, `postmortem`, `doctor`, promotion, and lint
  - Launcher smoke on 2026-04-03 covering `doctor` and `report` through `commands/Cato-Launcher.ps1`
  - Watch-profile validation on 2026-04-03 covering profile creation, watch ontology generation, and watch-driven surveillance/report retrieval in `tests/cato.test.js`
  - GPT/Codex handoff validation on 2026-04-03 covering `capture-research`, imported-source notes, watch refresh, template exclusion, and CLI smoke against public web pages
  - First live research-run validation on 2026-04-03 covering a real weekly macro brief, 16 imported live sources, source-note creation, watch refresh, synthesis promotion, and zero-issue lint after ingest
  - Ontology-noise validation on 2026-04-03 covering candidate concept filtering, stale concept retirement, full test pass, live compile, and zero-issue lint after tightening concept generation
  - Legacy source-note refresh validation on 2026-04-03 covering empty-frontmatter round-trip protection, refreshed source-note candidate concepts, live compile, and zero-issue lint after rewriting the existing corpus notes
  - Claim/state/decision validation on 2026-04-03 covering `claims-refresh`, `claim-diff`, `why-believe`, `state-refresh`, `state-diff`, `regime-brief`, `meeting-brief`, `decision-note`, `red-team`, `what-changed-for-markets`, full test pass, and zero-issue live lint after regenerating superseded outputs
  - Frontier-pack validation on 2026-04-03 covering `frontier-pack`, `capture-frontier`, local-context bundle capture, full test pass, real live smoke against the current repo, and zero-issue lint after a real frontier-authored output capture
  - Ongoing validation expectations:
    - rerun tests after CLI or schema changes
    - keep live repo lint at zero or explain any deliberate exceptions
    - verify real ingest paths against actual user corpus types before broadening automation
    - rerun live `lint` after the next repo-generated output pass

## Results

- On 2026-04-03, the repo moved from scaffold-only to a working Node-based MVP foundation.
- On 2026-04-03, Git was initialised and the Cato operating tree was created.
- On 2026-04-03, the CLI gained working `init`, `ingest`, `self-ingest`, `compile`, `search`, `ask`, and `lint` commands.
- On 2026-04-03, prompt/policy/template/config assets and finance-specific domain guidance were added.
- On 2026-04-03, automated tests passed and live repo lint was reduced to zero.
- On 2026-04-03, ingest gained dedicated PDF parsing plus image-OCR plumbing, and `ask` was upgraded from brief-shaped output to a grounded memo flow.
- On 2026-04-03, a production OCR subprocess bug and memo-link lint regression were found during live validation and fixed.
- On 2026-04-03, phase-2 workflow commands were added for report, deck, surveillance, reflection, principles, postmortem, doctor, and synthesis promotion.
- On 2026-04-03, compile was expanded to refresh timelines, domain maps, synthesis candidates, contradiction candidates, and collection indices.
- On 2026-04-03, ingest was expanded to treat repo directories as first-class repo snapshots and to write figure-note sidecars for images and embedded figure references.
- On 2026-04-03, a launcher layer was added under `commands/` for refresh, report, ask, deck, surveillance, reflection, doctor, and Obsidian opening.
- On 2026-04-03, watch profiles were added under `wiki/watch-profiles/`, a derived watch ontology was added under `wiki/glossary/watch-ontology.md`, and watch-driven retrieval was wired into surveillance/report/deck generation.
- On 2026-04-03, the temporary built-in search-provider research path was removed from the operator workflow and replaced with `capture-research`, which lets GPT/Codex do live web research and then hand the sources plus authored output into Cato for durable ingestion, compilation, and storage.
- On 2026-04-03, the first real live-research macro bundle was captured into Cato, producing 16 new source notes, a `Global Macro` surveillance refresh, a weekly investment meeting report, and a promoted synthesis note.
- On 2026-04-03, concept generation was tightened so compile now filters out low-value macro-table jargon, retires stale generated concept pages from active retrieval, and leaves the live repo at zero lint issues after recompilation.
- On 2026-04-03, the existing source-note corpus and metadata sidecars were refreshed to remove legacy candidate-concept suggestions, repair empty scalar frontmatter fields, and align the live markdown library with the new concept-quality rules.
- On 2026-04-03, the repo gained an atomic claim ledger under `wiki/claims/` plus `manifests/claims.jsonl`, claim snapshots, diffs, and `why-believe` output.
- On 2026-04-03, the repo gained a state/regime engine under `wiki/states/` and `wiki/regimes/`, with state history stored in `manifests/state_history.jsonl`.
- On 2026-04-03, the repo gained a PM decision layer under `wiki/decisions/` plus `outputs/meeting-briefs/` and new decision-support briefs.
- On 2026-04-03, the launcher layer was extended for claims, state refresh, regime briefs, decision notes, meeting briefs, red-team briefs, and market-change briefs.
- On 2026-04-03, the repo gained a zero-API frontier-pack bridge so Codex can consume structured claim/state/decision context, optionally add fresh web research, and file the final authored output back into Cato.

## Open Risks / Next Steps

- API-backed model execution is still not embedded in the CLI; `ask` now writes grounded memos locally rather than calling an external model.
- The self-model layer is now queryable and reflectable, but it still depends on user-supplied postmortems and bias notes to become genuinely sharp.
- Repo snapshots and figure extraction are now materially better, but semantic repo understanding, richer figure interpretation, and deeper dataset/table workflows are still partial rather than mature.
- Watch profiles now expand topic retrieval, but the underlying search engine is still mostly lexical rather than fully semantic; frontier-model-assisted routing remains an open upgrade path.
- The correct live-research model is now explicit, but it still depends on Codex/GPT producing the research bundle; the CLI is intentionally not trying to impersonate a frontier web-research model.
- Claim extraction and state inference are now useful but still deterministic; a later model-assisted pass may improve claim quality and contradiction handling.
- The CLI still does not invoke the frontier model directly. The repo now has a zero-API bridge instead, which is the correct operating model for the current user workflow.
- The next build phase needs discipline so it does not jump too early into fine-tuning or heavyweight retrieval before the corpus and workflows justify it.
