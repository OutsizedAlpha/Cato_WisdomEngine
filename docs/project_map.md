# Project Map

This file records the current local truth of the repository, not the full intended design.

## Stack

- Node.js CLI with no external runtime dependencies.
- Markdown-first repo structure designed for Obsidian browsing and LLM-maintained knowledge work.
- Git-initialised local repository with config, templates, policies, schemas, tests, and CLI entrypoints.
- Intended operating model remains local-first + Obsidian + Git + Codex/LLM workflow, with deterministic plumbing handled by the local CLI.
- Retrieval is now explicitly tiered: L0 maps/indices, L1 canonical knowledge pages, L2 evidence notes, L3 raw extracts.
- The knowledge layer now includes a draft append-and-review workspace plus a structured sidecar catalog for tags, backlinks, freshness, and open-thread audit.

## Package / Environment Manager

- `package.json` is present with a minimal Node package definition and script entrypoints.
- No external packages are required for the current implementation.
- No Python environment or package manager is configured in-repo.

## Run / Test / Lint / Typecheck / Build Commands

- Run CLI help: `node .\bin\cato.js help` or `.\cato.cmd help`
- Initialise/repair structure: `node .\bin\cato.js init`
- Ingest evidence: `node .\bin\cato.js ingest`
- Prepare a PDF vision handoff pack: `node .\bin\cato.js pdf-pack --from inbox/drop_here --limit 8 --dpi 144 --max-pages 0`
- Capture a Codex-authored PDF extraction bundle: `node .\bin\cato.js capture-pdf .\path\to\bundle.json`
- Import a GPT/Codex research bundle: `node .\bin\cato.js capture-research .\path\to\bundle.json`
- Prepare a frontier reasoning pack: `node .\bin\cato.js frontier-pack "topic" --mode decision`
- Capture a frontier-authored bundle: `node .\bin\cato.js capture-frontier .\path\to\bundle.json`
- Ingest self-notes: `node .\bin\cato.js self-ingest`
- Compile indices/concepts/entities: `node .\bin\cato.js compile`
- Search corpus: `node .\bin\cato.js search "query"`
- Generate a grounded memo: `node .\bin\cato.js ask "question"`
- Generate a report: `node .\bin\cato.js report "topic"`
- Generate a slide deck: `node .\bin\cato.js deck "topic"`
- Update a surveillance page: `node .\bin\cato.js surveil "topic"`
- Create or update a watch profile: `node .\bin\cato.js watch "topic" --context "..."`
- Refresh active watch profiles: `node .\bin\cato.js watch-refresh`
- List active watch profiles: `node .\bin\cato.js watch-list`
- Refresh the claim ledger: `node .\bin\cato.js claims-refresh --snapshot`
- Compare recent claim snapshots: `node .\bin\cato.js claim-diff --topic "topic"`
- Write a claim-led belief brief: `node .\bin\cato.js why-believe "topic"`
- Refresh a state page: `node .\bin\cato.js state-refresh "Global Macro"`
- Compare recent state snapshots: `node .\bin\cato.js state-diff "Global Macro"`
- Write a regime brief: `node .\bin\cato.js regime-brief --set weekly-investment-meeting`
- Write a meeting brief: `node .\bin\cato.js meeting-brief "Weekly investment meeting brief"`
- Refresh a decision note: `node .\bin\cato.js decision-note "topic"`
- Write a red-team brief: `node .\bin\cato.js red-team "topic"`
- Write a market-change brief: `node .\bin\cato.js what-changed-for-markets`
- Reflect on the self-model: `node .\bin\cato.js reflect`
- Snapshot active principles: `node .\bin\cato.js principles`
- Create a postmortem note: `node .\bin\cato.js postmortem "title"`
- Run repo health checks, including repo-local Python and browser automation readiness: `node .\bin\cato.js doctor`
- Lint the knowledge base: `node .\bin\cato.js lint`
- Test: `node .\tests\cato.test.js`
- Typecheck: none
- Build: none
- Launcher wrappers: `commands\*.cmd`

## Entry Points

- [`cato.cmd`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/cato.cmd)
- [`bin/cato.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/bin/cato.js)
- [`src/cli.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/cli.js)

## Key Modules

- [`src/ingest.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/ingest.js) = archives inbox files, runs format-aware extraction, writes metadata, drafts source notes, and now skips native extraction when a source sidecar already supplies `extracted_text`
- [`src/source-routing.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/source-routing.js) = semantic document-class routing plus append-and-review draft note scaffolding
- [`src/pdf-handoff.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/pdf-handoff.js) = prepares zero-API PDF vision packs from inbox PDFs, dedupes retry note merges, and captures Codex-authored extraction bundles back into normal Cato ingest
- [`src/research-handoff.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/research-handoff.js) = imports GPT/Codex research bundles, downloads cited sources, ingests them, compiles the repo, and writes the supplied output artefact
- [`src/frontier.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/frontier.js) = prepares zero-API frontier reasoning packs from claim/state/decision surfaces and captures Codex-authored frontier bundles back into Cato
- [`src/web-import.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/web-import.js) = Windows-first web download/provenance helper used for URL ingest and research handoff capture
- [`src/extraction.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/extraction.js) = handles text extraction, PDF stream parsing, repo snapshot manifests, figure reference extraction, SVG text capture, and Windows OCR handoff for raster images
- [`src/self-ingest.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/self-ingest.js) = converts rough self-authored notes into structured self-model notes
- [`src/compile.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/compile.js) = rebuilds indices, unresolved registers, and managed evidence blocks
- [`src/claims.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/claims.js) = decomposes source and report material into atomic claims, writes `manifests/claims.jsonl`, and maintains `wiki/claims/`
- [`src/states.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/states.js) = turns claims plus grounded evidence into current-state pages, state diffs, and regime briefs
- [`src/decisions.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/decisions.js) = writes meeting briefs, decision notes, red-team outputs, and market-change briefs from states, claims, and self-model context
- [`src/concept-quality.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/concept-quality.js) = shared concept-normalisation and concept-quality heuristics used to keep promoted ontology terms domain-meaningful
- [`src/search.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/search.js) = token-based corpus search over markdown and extracted text
- [`src/retrieval.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/retrieval.js) = explicit L0/L1/L2/L3 retrieval-budget planner with TLDR-first escalation rules
- [`src/ask.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/ask.js) = generates grounded markdown memos and optional question pages
- [`src/report.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/report.js) = writes stronger report-style grounded outputs
- [`src/deck.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/deck.js) = writes Marp-friendly grounded slide decks
- [`src/surveil.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/surveil.js) = updates persistent surveillance pages
- [`src/watch.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/watch.js) = creates watch profiles, derives watch ontology, and expands retrieval for watch-driven topics
- [`src/reflect.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/reflect.js) = summarises the self-model and refreshes the tension register
- [`src/principles.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/principles.js) = writes a current principles snapshot from self notes
- [`src/postmortem.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/postmortem.js) = creates structured postmortem notes
- [`src/doctor.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/doctor.js) = checks runtime and repo health
- [`src/lint.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/lint.js) = checks metadata, link integrity, and note health
- [`src/project.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/project.js) = structure repair and project defaults
- [`src/markdown.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/markdown.js) = frontmatter, wiki-link, and managed-block helpers
- [`src/utils.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/utils.js) = filesystem and path helpers
- [`src/research.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/research.js) = shared evidence selection, output writing, and promotion helpers
- [`src/wiki-catalog.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/wiki-catalog.js) = structured catalog, tag summary, backlink graph, freshness, and open-thread extraction for maintenance
- [`tools/render_pdf_pages.py`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/tools/render_pdf_pages.py) = Python helper used by `pdf-pack` to render PDF pages into image files for Codex/GPT vision review
- [`commands/Cato-Launcher.ps1`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/commands/Cato-Launcher.ps1) = one-click Windows launcher for refresh, reports, decks, surveillance, watch creation, watch refresh, research-bundle import, frontier-pack prep, frontier-bundle import, claims, state refresh, regime briefs, decision notes, meeting briefs, red-team briefs, market-change briefs, reflection, doctor, latest-report opening, and Obsidian opening

## Architecture Notes

- `AGENTS.md` is the canonical shared policy file.
- `CLAUDE.md` is a thin loader pointing to `AGENTS.md`.
- [`INVESTMENT_RESEARCH.md`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/INVESTMENT_RESEARCH.md) acts as the domain overlay for investment-research-specific behaviour.
- The repo now includes the first full operating tree: `config/`, `inbox/`, `raw/`, `manifests/`, `extracted/`, `wiki/`, `outputs/`, `logs/`, `cache/`, `src/`, `tests/`, and root wrapper commands.
- The CLI now covers deterministic repo maintenance plus grounded memo, report, deck, watch-profile, claim-ledger, state/regime, decision-support, reflection, principles, postmortem, doctor, and promotion workflows over the local corpus.
- The live-research split is now explicit: GPT/Codex is expected to perform web research and author the synthesis, while Cato captures the cited sources and final artefacts through `capture-research`.
- The PDF-vision split is now explicit: `pdf-pack` prepares rendered-page review packs for image-rich PDFs, Codex/GPT performs OCR/vision/chart extraction over those artefacts, and `capture-pdf` feeds the authored extraction back into normal Cato ingest.
- When `capture-pdf` or another handoff writes `extracted_text` into a source sidecar, ingest now treats that as authoritative enough to bypass brittle native extraction instead of re-running the local parser first.
- The current PDF batch operating rule is pragmatic rather than idealised: chunk larger runs, isolate heavy chart decks, and use a direct single-document capture bundle when `pdf-pack` still overflows on an outlier.
- The zero-API frontier split is also explicit: Cato prepares deterministic claim/state/decision context through `frontier-pack`, Codex performs the deeper reasoning, and Cato stores the final authored artefact through `capture-frontier`.
- The repo will keep repo agent-driven operation rather than embedding external LLM execution directly into the CLI; handoff commands remain the integration boundary.
- `ingest` now treats repo directories and repo archives as first-class evidence objects instead of only plain files.
- `ingest` now writes figure notes into `extracted/figures/` for standalone images and markdown/HTML sources with image references.
- `ingest` now assigns a semantic `document_class` and writes a companion append-and-review draft note under `wiki/drafts/append-review/`.
- Watch profiles live in `wiki/watch-profiles/`; they are instruction objects, not evidence. Search now excludes them from retrieval so reports and surveillance do not cite watch instructions back as source material.
- Grounded output workflows now follow explicit retrieval budgets and exclude draft notes, surveillance pages, prior outputs, generic indices/maps, unresolved registers, and self-model pages from evidence selection so reports and surveillance stay source-grounded.
- `wiki/_indices/` and managed blocks are generated surfaces. Concept and entity pages are updatable knowledge objects with generated evidence sections.
- Candidate concept extraction is now ontology-aware and phrase-biased rather than raw token-frequency-driven; compile retires stale generated concept pages instead of letting weak concepts keep leaking into retrieval.
- Compile now also refreshes the atomic claim ledger, so the repo maintains a belief layer between source notes and higher-order outputs.
- Compile now backfills legacy source-note routing, regenerates the draft workspace index, and writes `manifests/wiki_index.json` plus tag/backlink/open-thread maintenance surfaces.
- State pages are canonical current-world-model surfaces built from claims plus grounded evidence, with their own history in `manifests/state_history.jsonl`.
- Claim, state, and decision pages now carry explicit counter-argument and data-gap surfaces rather than only positive synthesis.
- Decision outputs are now explicitly mandate-facing and combine claims, states, watch context, retrieval-budget discipline, and the self-model rather than only summarising search results.
- Markdown frontmatter rendering now quotes empty scalar values, so refreshed source-note frontmatter round-trips without mutating empty strings into YAML-array placeholders.
- `compile` now also refreshes timeline, domain-index, synthesis-candidate, contradiction, thesis-index, watch-profile index/ontology, surveillance-index, and self-index surfaces.
- `commands/` now contains a launcher layer for common double-click workflows, including the new claim, state, regime, meeting, decision, and red-team surfaces.
- `commands/research-capture.example.json` provides the bundle shape for Codex-to-Cato research handoff.
- `commands/frontier-capture.example.json` provides the bundle shape for Codex-to-Cato frontier handoff.
- `docs/research_handoff.md` is the operator-facing reference for the research handoff contract.
- `docs/frontier_handoff.md` is the operator-facing reference for the zero-API frontier reasoning contract.

## Environment / Dependency Notes

- Git is initialised in the current folder.
- `.obsidian/` may exist locally for vault settings, but user-specific Obsidian state is not version-controlled.
- The current shell has `node` and `git` available.
- Repo-local Python shims are available at the root: `python.cmd` and `py.cmd`. In this workspace, `python --version` and `py --version` resolve successfully from the repo shell even though no in-repo Python environment manager is configured.
- `pdf-pack` currently relies on the real Python launcher (`py` / `python`) plus the already-available `PyMuPDF`/`fitz`, `pypdfium2`, and `Pillow` packages for live page rendering.
- PDF handoff packs are generated under `cache/pdf-packs/`, which is a disposable operator surface rather than canonical repo state.
- Global browser automation is available outside the repo: `npx playwright` resolves to Playwright `1.59.1`, Playwright-managed browsers are installed under `%LOCALAPPDATA%\ms-playwright\`, and a headless Chromium launch was validated locally on 2026-04-05.
- `npx puppeteer` is also callable in the current shell, but neither Playwright nor Puppeteer is vendored as an in-repo dependency.
- The executable runtime is still Node-first for now; do not assume a separate global Python toolchain outside the repo-root wrapper path.
- PowerShell execution policy can block `.ps1` wrappers; the repo therefore provides `cato.cmd` and direct `node` entrypoints.
- Raster-image OCR depends on the Windows OCR runtime being callable from the local machine; sandboxed child-process environments can block that path even though the OCR layer exists in the repo.
- URL ingest currently relies on PowerShell `Invoke-WebRequest`, which is pragmatic for Windows-first operation but not yet a cross-platform fetch abstraction.
- No `.env` file or external API integration is configured yet.
- Launcher scripts call the Node CLI directly from PowerShell rather than shelling through `cato.cmd`, because batch argument forwarding was unreliable from inside the PowerShell wrapper.
- Node child-process workflows should prefer the real Python launcher over repo-local `.cmd` shims when they need a machine-usable interpreter path.

## Conventions

- Use the repo as the source of truth; Obsidian is intended to be a frontend, not the underlying truth layer.
- Treat `inbox/drop_here/` and `inbox/self/` as git-ignored staging queues rather than durable repo state.
- Treat `cache/` and `logs/` as disposable operator artefacts; commit the workflow code and docs, not transient handoff packs.
- Keep raw evidence separate from derived knowledge once those layers are created.
- Keep draft append-and-review notes out of grounded retrieval unless the task explicitly needs workspace material.
- Maintain project memory in `docs/` and `tasks/` rather than relying on chat history.
- Use managed blocks for generated evidence/index sections rather than blindly rewriting full note bodies.
- Prefer direct `node` or `cato.cmd` invocation in PowerShell.
