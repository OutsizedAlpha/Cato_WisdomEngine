# Task Tracker

Use this file for active or recently completed non-trivial work. Keep it concise, checkable, and aligned to the actual repo state.

## Objective

- Turn `Cato-WisdomEngine` from a working research runtime into a stronger belief/state/decision engine for investment work.

## Plan

1. Maintain the new belief/state/decision layers without letting them drift into noisy generated surfaces.
2. Decide how much deterministic logic to keep versus where model-assisted compile passes should eventually enter.
3. Keep improving finance-specific note quality and operator usability without breaking source-grounded discipline.
4. Widen the handoff boundary so every substantive authored output is produced through the active terminal model rather than deterministic CLI prose.

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
- [x] Add semantic source/document-class routing so ingest can branch by document class, not only file format.
- [x] Add explicit L0/L1/L2/L3 retrieval-budget rules and TLDR-first reading discipline to the prompts and operator workflow.
- [x] Add managed counter-arguments / data-gaps blocks to the core claim/state/decision surfaces.
- [x] Add a draft or append-and-review workspace distinct from canonical wiki surfaces.
- [x] Add structured query/backlink/tag surfaces as a file-first sidecar catalog without rewriting storage away from markdown.
- [x] Decide whether to embed external LLM execution into the CLI or keep the repo agent-driven.
- [x] Add a zero-API PDF vision handoff so Codex/GPT can perform OCR, chart, and table extraction for image-heavy PDFs and feed the result back through normal Cato ingest.
- [x] Replace deterministic authored-output commands with model-pack plus capture flows wherever the command is doing substantive reasoning or writing.
- [x] Add a generalized authored-output pack/capture contract so memo, deck, surveillance, belief/state/decision, self-model, and meeting surfaces can all be model-authored through the active terminal session.
- [x] Keep pure repo plumbing deterministic only where it is not substantive authored IP: `init`, `ingest`, `self-ingest`, `compile`, `search`, `watch-list`, `claims-refresh`, `claim-diff`, `state-diff`, `doctor`, and `lint`.
- [x] Update the CLI help, operator docs, and final-output policy so the model-authorship boundary is explicit command by command.
- [x] Add tests that fail if substantive commands write final deterministic prose instead of preparing model handoff packs.

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
  - Reconnaissance validation on 2026-04-05 covering ordered context loading, `node .\tests\cato.test.js`, `node .\bin\cato.js lint`, and a verified headless global Playwright smoke
  - Environment-hardening validation on 2026-04-05 covering enhanced `doctor` checks for repo-local Python, Playwright, Puppeteer, and OCR readiness plus a full test pass
  - External architecture review on 2026-04-05 covering full reads of Karpathy `llm-wiki` and Garry Tan `GBrain.md`, Karpathy comment review, revision review for both gists, and capture of the resulting design recommendations into `docs/architecture_review_llm_wiki_gbrain_2026-04-05.md`
  - Architecture-ingestion implementation on 2026-04-05 covering semantic document routing, append-and-review drafts, retrieval budgets, structured catalog/backlink/tag indices, counter-argument/data-gap blocks, full test pass, live compile/state/decision refresh, zero-issue lint, and zero-issue doctor
  - PDF vision handoff implementation on 2026-04-05 covering `pdf-pack`, `capture-pdf`, rendered-page pack generation through Python PDF tooling, authored-extraction bundle capture back into normal ingest, full test pass, live CLI help, live one-document pack generation, and zero-issue live lint
  - Documentation hardening on 2026-04-05 covering README, operator guide, project map, lessons, and the dedicated PDF handoff guide so the new PDF workflow, staging boundaries, and commit hygiene are explicit before larger batch runs
  - 24-PDF batch ingestion on 2026-04-05 covering chunked `pdf-pack` / `capture-pdf` runs, Codex-authored title cleanup, a direct single-document capture workaround for `Markets Interactive Chart Pack.pdf`, a code fix so ingest skips native extraction when `extracted_text` is already supplied, a `capture-pdf` note-deduping fix for retries, a full test pass, and live lint with `0` errors, `0` warnings, and `62` infos
  - Broad investment-report hardening on 2026-04-05 covering red/green tests for reviewed-source preference and curated investment-report routing, search/report/ingest/lint/pdf-handoff updates for review-state handling, visual review plus page-route reconstruction of the global markets chart pack, promotion of 17 report-critical April 5 PDF notes from draft to reviewed, and regeneration of the built-in all-corpus investment summary with `reviewed_source_count: 17` and `provisional_source_count: 0`
  - Report-quality hardening on 2026-04-05 covering a red/green acceptance test for authored broad investment reports, source-note-led section routing, cleaned extracted-text takeaway parsing, fallback reduction so canonical state/claim pages do not pollute broad report prose, and regeneration of the built-in all-corpus investment summary without raw `Why it matters` dump sections or generic synthesis filler
  - Final-report boundary hardening on 2026-04-05 covering report-pack plus `capture-report`, canonical `wiki/reports/` storage, prior-version archival, removal of raw `outputs/reports/` from the claim layer, frontier bundle model/session metadata, launcher updates, and full test/lint validation
  - Current-state anchoring on 2026-04-05 covering stable legacy report archive filenames, report handoff operator documentation, refreshed generated markdown surfaces, scratch-space ignore rules, and Git/GitHub sync of the reconciled repo state
  - Ongoing validation expectations:
    - rerun tests after CLI or schema changes
    - keep live repo lint at zero or explain any deliberate exceptions
    - verify real ingest paths against actual user corpus types before broadening automation
    - rerun live `lint` after the next repo-generated output pass
  - Authored-output boundary widening on 2026-04-06 covering `capture-authored`, fixed-path capture into scaffold outputs, pack generation for memo/deck/surveillance/belief/state/decision/self-model commands, updated operator docs and final-output policy, CLI help refresh, and red/green enforcement that substantive commands prepare model-authored packs instead of final deterministic prose

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
- On 2026-04-05, `doctor` was promoted into the repeatable environment-readiness check for repo-local Python plus browser automation availability, replacing ad hoc shell probing.
- On 2026-04-05, the repo captured a durable architecture review of Karpathy's `llm-wiki` and Garry Tan's `GBrain.md`, with concrete Cato follow-up recommendations rather than a storage-model rewrite.
- On 2026-04-05, those architecture learnings were implemented directly into Cato: ingest now assigns semantic `document_class` routing, creates append-and-review draft notes, grounded workflows now follow explicit retrieval budgets, claim/state/decision pages now carry counter-argument and data-gap sections, and compile/lint now maintain a structured catalog with tags, backlinks, freshness, and open-thread audit.
- On 2026-04-05, the live repo corpus was backfilled and refreshed so the stricter maintenance checks still pass at zero live lint issues instead of only working for newly generated notes.
- On 2026-04-05, the remaining architecture decision was closed explicitly: keep the repo agent-driven, preserve the zero-API handoff model, and do not embed external LLM execution directly into the CLI.
- On 2026-04-05, the repo gained a zero-API PDF vision bridge so Codex/GPT can review rendered page images or raw PDF paths, author a clean extraction bundle, and feed that extraction back into normal Cato ingest without adding a model API client to the CLI.
- On 2026-04-05, the operator documentation was tightened so the repo now states clearly which folders are staging-only, which artefacts are disposable, and where the durable PDF handoff output begins.
- On 2026-04-05, the staged 24-PDF inbox batch was ingested into canonical Cato state through the PDF handoff path, and ingest was hardened so handoff-supplied `extracted_text` can bypass a failing native PDF parser on problematic chart decks.
- On 2026-04-05, the PDF workflow gained explicit batch lessons: chunk larger runs, use `capture-pdf --copy` while debugging outliers, keep a direct one-document capture fallback for chart-deck failures, and do not mistake info-only lint growth for structural ingest breakage.
- On 2026-04-05, retry safety in the PDF handoff flow was tightened so repeated capture attempts no longer duplicate operator note blocks, and the batch learnings were recorded in `docs/pdf_batch_retrospective_2026-04-05.md`.
- On 2026-04-05, broad all-corpus investment reports were hardened so the built-in `report` workflow now starts from curated investment evidence lenses, prefers reviewed source notes over provisional PDF handoff notes, filters ingestion-artifact claims, and can regenerate the all-corpus investment summary without the earlier draft-note and chartpack caveats.
- On 2026-04-05, the broad-report route was tightened again so it now stays source-note-led unless evidence is genuinely thin, composes section narratives from cleaned note sections and extracted-text takeaways, and no longer falls back into the earlier excerpt-dump style that made the first hardened report materially worse than the manual Codex-authored version.
- On 2026-04-05, the report path was corrected so `report` now prepares a model-authored capture pack instead of pretending to be the final author, `capture-report` writes one canonical current report per topic under `wiki/reports/`, and previous canonical versions are archived automatically.
- On 2026-04-05, raw `outputs/reports/` history was demoted to legacy operational artefact and removed from the claim-input set so only canonical model-authored reports can harden into the belief layer.
- On 2026-04-05, the live repo was migrated onto that model: `wiki/reports/current-investment-summary-across-all-ingested-research.md` became the canonical current report and 17 legacy timestamped report files were swept into `outputs/reports/archive/legacy-deterministic/`.
- On 2026-04-05, the archive policy was tightened so legacy report filenames remain stable inside `outputs/reports/archive/legacy-deterministic/`, report handoff now has its own operator doc, and transient `tmp/` review scratch is explicitly ignored rather than committed.
- On 2026-04-05, the reconciled current state was revalidated before sync: tests passed, live lint remained at `0` errors and `0` warnings with an info-only backlog, and the repo memory/docs layer was updated to match the final report-handoff and archive rules before GitHub push.
- On 2026-04-06, the general authored-output boundary was widened so `ask`, `deck`, `surveil`, `watch`, `why-believe`, `state-refresh`, `regime-brief`, `meeting-brief`, `decision-note`, `red-team`, `what-changed-for-markets`, `reflect`, `principles`, and `postmortem` now prepare packs for the active terminal model and file the authored result back through `capture-authored`.
- On 2026-04-06, the repo made the operating rule explicit in code and docs: Cato remains the memory and grounding layer, but substantive authored IP is produced by the active terminal model session rather than final deterministic CLI prose.

## Open Risks / Next Steps

- API-backed model execution is still not embedded in the CLI by design; the active terminal model remains the author through pack/capture workflows rather than a direct in-process API client.
- The self-model layer is now queryable and reflectable, but it still depends on user-supplied postmortems and bias notes to become genuinely sharp.
- Repo snapshots and figure extraction are now materially better, but semantic repo understanding, richer figure interpretation, and deeper dataset/table workflows are still partial rather than mature.
- Watch profiles now expand topic retrieval, but the underlying search engine is still mostly lexical rather than fully semantic; frontier-model-assisted routing remains an open upgrade path.
- The correct live-research model is now explicit, but it still depends on Codex/GPT producing the research bundle; the CLI is intentionally not trying to impersonate a frontier web-research model.
- The new PDF vision loop removes the weakest current OCR bottleneck, but it is still a human-or-agent-authored handoff rather than a fully automatic model invocation inside the CLI.
- Claim extraction, state diffs, and other maintenance transforms remain deterministic plumbing; if any of them start asserting new analytical judgement rather than maintaining structure, they should be widened onto the authored-output path too.
- The CLI still does not invoke the frontier model directly. The repo now has a zero-API bridge instead, which is the correct operating model for the current user workflow.
- `watch-refresh`, `claims-refresh`, `claim-diff`, and `state-diff` still operate as deterministic maintenance/reporting utilities. If the operator wants those to become authored analytical surfaces instead of maintenance tooling, they should be split into authored commands rather than silently changing the existing maintenance verbs.
- Retrieval discipline, draft/workspace separation, and maintenance audit are now materially stronger, but the search engine is still lexical and should not be mistaken for a full semantic query layer.
- Reviewed-source preference materially improves report quality, but broad investment synthesis still depends on good section queries and note quality rather than a fully semantic retrieval layer.
- Live lint is structurally clean, but the current corpus still carries an info-only backlog around provisional PDF-handoff review states, thin concept/entity extraction on some notes, and orphan claims that need later quality passes rather than runtime fixes.
