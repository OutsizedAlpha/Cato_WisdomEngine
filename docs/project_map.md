# Project Map

This file records the current local truth of the repository, not the full intended design.

## Stack

- Node.js CLI with no external runtime dependencies.
- Markdown-first repo structure designed for Obsidian browsing and LLM-maintained knowledge work.
- Git-initialised local repository with config, templates, policies, schemas, tests, and CLI entrypoints.
- Intended operating model remains local-first + Obsidian + Git + Codex/LLM workflow, with deterministic plumbing handled by the local CLI.

## Package / Environment Manager

- `package.json` is present with a minimal Node package definition and script entrypoints.
- No external packages are required for the current implementation.
- No Python environment or package manager is configured in-repo.

## Run / Test / Lint / Typecheck / Build Commands

- Run CLI help: `node .\bin\cato.js help` or `.\cato.cmd help`
- Initialise/repair structure: `node .\bin\cato.js init`
- Ingest evidence: `node .\bin\cato.js ingest`
- Import a GPT/Codex research bundle: `node .\bin\cato.js capture-research .\path\to\bundle.json`
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
- Run repo health checks: `node .\bin\cato.js doctor`
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

- [`src/ingest.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/ingest.js) = archives inbox files, runs format-aware extraction, writes metadata, and drafts source notes
- [`src/research-handoff.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/research-handoff.js) = imports GPT/Codex research bundles, downloads cited sources, ingests them, compiles the repo, and writes the supplied output artefact
- [`src/web-import.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/web-import.js) = Windows-first web download/provenance helper used for URL ingest and research handoff capture
- [`src/extraction.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/extraction.js) = handles text extraction, PDF stream parsing, repo snapshot manifests, figure reference extraction, SVG text capture, and Windows OCR handoff for raster images
- [`src/self-ingest.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/self-ingest.js) = converts rough self-authored notes into structured self-model notes
- [`src/compile.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/compile.js) = rebuilds indices, unresolved registers, and managed evidence blocks
- [`src/claims.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/claims.js) = decomposes source and report material into atomic claims, writes `manifests/claims.jsonl`, and maintains `wiki/claims/`
- [`src/states.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/states.js) = turns claims plus grounded evidence into current-state pages, state diffs, and regime briefs
- [`src/decisions.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/decisions.js) = writes meeting briefs, decision notes, red-team outputs, and market-change briefs from states, claims, and self-model context
- [`src/concept-quality.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/concept-quality.js) = shared concept-normalisation and concept-quality heuristics used to keep promoted ontology terms domain-meaningful
- [`src/search.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/search.js) = token-based corpus search over markdown and extracted text
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
- [`commands/Cato-Launcher.ps1`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/commands/Cato-Launcher.ps1) = one-click Windows launcher for report, deck, watch creation, watch refresh, surveillance, research-bundle import, reflection, doctor, refresh, and Obsidian opening

## Architecture Notes

- `AGENTS.md` is the canonical shared policy file.
- `CLAUDE.md` is a thin loader pointing to `AGENTS.md`.
- [`INVESTMENT_RESEARCH.md`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/INVESTMENT_RESEARCH.md) acts as the domain overlay for investment-research-specific behaviour.
- The repo now includes the first full operating tree: `config/`, `inbox/`, `raw/`, `manifests/`, `extracted/`, `wiki/`, `outputs/`, `logs/`, `cache/`, `src/`, `tests/`, and root wrapper commands.
- The CLI now covers deterministic repo maintenance plus grounded memo, report, deck, watch-profile, claim-ledger, state/regime, decision-support, reflection, principles, postmortem, doctor, and promotion workflows over the local corpus.
- The live-research split is now explicit: GPT/Codex is expected to perform web research and author the synthesis, while Cato captures the cited sources and final artefacts through `capture-research`.
- `ingest` now treats repo directories and repo archives as first-class evidence objects instead of only plain files.
- `ingest` now writes figure notes into `extracted/figures/` for standalone images and markdown/HTML sources with image references.
- Watch profiles live in `wiki/watch-profiles/`; they are instruction objects, not evidence. Search now excludes them from retrieval so reports and surveillance do not cite watch instructions back as source material.
- Grounded output workflows also exclude surveillance pages, prior outputs, generic indices/maps, unresolved registers, and self-model pages from evidence selection so reports and surveillance stay source-grounded.
- `wiki/_indices/` and managed blocks are generated surfaces. Concept and entity pages are updatable knowledge objects with generated evidence sections.
- Candidate concept extraction is now ontology-aware and phrase-biased rather than raw token-frequency-driven; compile retires stale generated concept pages instead of letting weak concepts keep leaking into retrieval.
- Compile now also refreshes the atomic claim ledger, so the repo maintains a belief layer between source notes and higher-order outputs.
- State pages are canonical current-world-model surfaces built from claims plus grounded evidence, with their own history in `manifests/state_history.jsonl`.
- Decision outputs are now explicitly mandate-facing and combine claims, states, watch context, and the self-model rather than only summarising search results.
- Markdown frontmatter rendering now quotes empty scalar values, so refreshed source-note frontmatter round-trips without mutating empty strings into YAML-array placeholders.
- `compile` now also refreshes timeline, domain-index, synthesis-candidate, contradiction, thesis-index, watch-profile index/ontology, surveillance-index, and self-index surfaces.
- `commands/` now contains a launcher layer for common double-click workflows, including the new claim, state, regime, meeting, decision, and red-team surfaces.
- `commands/research-capture.example.json` provides the bundle shape for Codex-to-Cato research handoff.
- `docs/research_handoff.md` is the operator-facing reference for the research handoff contract.

## Environment / Dependency Notes

- Git is initialised in the current folder.
- `.obsidian/` may exist locally for vault settings, but user-specific Obsidian state is not version-controlled.
- The current shell has `node` and `git` available.
- The current shell does not have `python` on `PATH`, so the executable runtime is Node-first for now.
- PowerShell execution policy can block `.ps1` wrappers; the repo therefore provides `cato.cmd` and direct `node` entrypoints.
- Raster-image OCR depends on the Windows OCR runtime being callable from the local machine; sandboxed child-process environments can block that path even though the OCR layer exists in the repo.
- URL ingest currently relies on PowerShell `Invoke-WebRequest`, which is pragmatic for Windows-first operation but not yet a cross-platform fetch abstraction.
- No `.env` file or external API integration is configured yet.
- Launcher scripts call the Node CLI directly from PowerShell rather than shelling through `cato.cmd`, because batch argument forwarding was unreliable from inside the PowerShell wrapper.

## Conventions

- Use the repo as the source of truth; Obsidian is intended to be a frontend, not the underlying truth layer.
- Keep raw evidence separate from derived knowledge once those layers are created.
- Maintain project memory in `docs/` and `tasks/` rather than relying on chat history.
- Use managed blocks for generated evidence/index sections rather than blindly rewriting full note bodies.
- Prefer direct `node` or `cato.cmd` invocation in PowerShell.
