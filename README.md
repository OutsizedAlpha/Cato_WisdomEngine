# Cato_WisdomEngine

Cato_WisdomEngine is a local, file-based research operating system for building and maintaining an evidence-backed markdown knowledge base with LLM assistance.

## What It Does

- preserves raw source evidence
- extracts machine-usable artefacts
- treats repo snapshots and figures as evidence-bearing sources rather than second-class metadata
- decomposes source notes and major outputs into an auditable claim ledger
- maintains explicit state and regime pages for live macro, geopolitical, and market-structure monitoring
- produces PM-facing decision notes, meeting briefs, red-team outputs, and market-change briefs
- compiles source notes, concepts, entities, timelines, theses, and self-model notes
- maintains watch profiles as persistent instructions for live surveillance topics
- generates markdown-first outputs such as briefs, reports, decks, and memos
- keeps the knowledge base healthier over time through linting, indexing, and search

## Core Rule

Raw evidence is immutable. Derived knowledge lives in the `wiki/` layer. Outputs belong in `outputs/` unless they become durable synthesis worth filing back into `wiki/`.

## Repository Layout

- `config/` = settings, ontology, prompt guides, policies, schemas
- `inbox/` = staging area for new evidence and self-authored notes
- `raw/` = preserved source archive
- `manifests/` = source manifests and hash tracking
- `extracted/` = text, metadata, figures, and tables derived from raw evidence
- `wiki/` = compiled knowledge layer and self-model
- `wiki/claims/` = atomic claim ledger
- `wiki/states/` and `wiki/regimes/` = canonical current-state surfaces
- `wiki/decisions/` = durable decision-support notes
- `outputs/` = generated answer artefacts
- `logs/` = lint and workflow logs
- `cache/` = disposable local cache
- `src/` = Node implementation
- `tests/` = focused verification

## Quick Start

1. Open this folder in Obsidian as a vault.
2. Run `.\cato.cmd init`.
3. Drop source files into `inbox/drop_here/`.
4. Run `.\cato.cmd ingest`.
5. Run `.\cato.cmd compile`.
6. Run `.\cato.cmd search "your topic"`.
7. Run `.\cato.cmd ask "your question"`.
8. Run `.\cato.cmd report "your topic"` or `.\cato.cmd surveil "your topic"` when you need a stronger output or a live watch page.
9. Run `.\cato.cmd claims-refresh --snapshot` when you want the belief ledger updated and diffable.
10. Run `.\cato.cmd state-refresh "Global Macro"` or `.\cato.cmd regime-brief --set weekly-investment-meeting` when you want a current world-model surface.
11. Run `.\cato.cmd meeting-brief "Weekly investment meeting brief"` or `.\cato.cmd decision-note "topic"` when you want mandate-facing output.
12. Run `.\cato.cmd lint`.

For live web research through GPT/Codex:

1. Let Codex/GPT-5.4 do the live research in conversation.
2. Save the researched sources and the finished memo/report/deck into a JSON bundle shaped like `commands\research-capture.example.json`.
3. Run `.\cato.cmd capture-research .\commands\research-capture.example.json`.

That keeps GPT as the live researcher and Cato as the durable ingestion, provenance, wiki, and output layer.

For persistent live topics:

1. Run `.\cato.cmd watch "topic" --context "why this matters"`.
2. Run `.\cato.cmd watch-refresh` whenever you want all active watches refreshed.
3. Run `.\cato.cmd report "topic"` or `.\cato.cmd deck "topic"` and Cato will use the matching watch profile when one exists.

If you prefer double-click launchers instead of typing commands, use the wrappers in `commands/`. Start with:

- `commands\Open-Cato-Vault.cmd`
- `commands\Refresh-Cato.cmd`
- `commands\Write-Report.cmd`
- `commands\Run-Surveillance.cmd`
- `commands\Create-Watch.cmd`
- `commands\Refresh-Watches.cmd`
- `commands\Import-Research-Bundle.cmd`
- `commands\Run-Claims.cmd`
- `commands\Refresh-State.cmd`
- `commands\Write-Regime-Brief.cmd`
- `commands\Write-Decision-Note.cmd`
- `commands\Write-Meeting-Brief.cmd`
- `commands\Run-Red-Team.cmd`
- `commands\Run-Market-Changes.cmd`

See `docs/operator_guide.md` for the operating model behind those launchers.
See `docs/research_handoff.md` for the exact GPT/Codex-to-Cato handoff flow and bundle shape.

For personal thinking and PM process notes:

1. Drop rough notes into `inbox/self/`.
2. Run `.\cato.cmd self-ingest`.
3. Run `.\cato.cmd compile`.

## Python In This Repo

This machine has Python 3.13 registered, but shell resolution may be unreliable when the interpreter comes from the Windows Store package path. Repo-local wrappers are provided:

- `.\python.cmd`
- `.\py.cmd`
- `.\Use-CatoPython.ps1`
- `.\Use-CatoPython.cmd`

For a PowerShell session in this folder, run:

```powershell
.\Use-CatoPython.cmd
python --version
```

Resolution order:

1. local `.venv\Scripts\python.exe` if present
2. registry-resolved `HKCU\SOFTWARE\Python\PythonCore\3.13\InstallPath\ExecutablePath`

## Command Reference

- `.\cato.cmd init` = repair/create the operating structure and seed core files
- `.\cato.cmd ingest` = archive evidence from `inbox/drop_here/`, extract text from notes/web/PDFs, apply image OCR when available, ingest repo directories/archives, and draft source notes with figure/table sidecars where relevant
- `.\cato.cmd ingest --url "https://..."` = fetch a web page into the ingest pipeline without manual clipping
- `.\cato.cmd capture-research .\path\to\bundle.json` = import a GPT/Codex research bundle, download the cited web sources, ingest them as proper evidence, compile the repo, optionally refresh a watch, and write the supplied memo/report/deck into `outputs/`
- `.\cato.cmd self-ingest` = convert self-authored notes into structured self-model notes
- `.\cato.cmd compile` = rebuild indices, maps, claim pages, managed evidence blocks, and unresolved registers
- `.\cato.cmd claims-refresh --snapshot` = rebuild the atomic claim ledger and optionally write a diffable snapshot
- `.\cato.cmd claim-diff --topic "..."` = compare the latest two claim snapshots
- `.\cato.cmd why-believe "topic"` = write a belief brief grounded in the current claim ledger plus source evidence
- `.\cato.cmd search "query"` = rank relevant notes and extracted artefacts
- `.\cato.cmd ask "question"` = produce a grounded markdown memo from the current corpus
- `.\cato.cmd report "topic"` = produce a stronger report-style output in `outputs/reports/`
- `.\cato.cmd deck "topic"` = produce a Marp-friendly markdown slide deck in `outputs/decks/`
- `.\cato.cmd surveil "topic"` = update a persistent surveillance page in `wiki/surveillance/`
- `.\cato.cmd watch "topic"` = create or update a persistent watch profile and refresh the related surveillance page
- `.\cato.cmd watch-refresh` = refresh one or all active watch profiles
- `.\cato.cmd watch-list` = list active watch profiles
- `.\cato.cmd state-refresh "subject"` = refresh a canonical state page in `wiki/states/`
- `.\cato.cmd state-diff "subject"` = compare the last two state snapshots for that subject
- `.\cato.cmd regime-brief --set weekly-investment-meeting` = write a regime brief and refresh the corresponding canonical regime page
- `.\cato.cmd meeting-brief "title"` = write a PM-facing meeting brief into `outputs/meeting-briefs/`
- `.\cato.cmd decision-note "topic"` = refresh a durable decision-support note in `wiki/decisions/`
- `.\cato.cmd red-team "topic"` = write a counter-case and blind-spot brief
- `.\cato.cmd what-changed-for-markets` = write a state-led change brief across the chosen market subjects
- `.\cato.cmd reflect` = summarise the current self-model and refresh the tension register
- `.\cato.cmd principles` = write a current principles snapshot from the self-model layer
- `.\cato.cmd postmortem "title"` = create a structured self postmortem note
- `.\cato.cmd doctor` = run repo health checks and write a doctor report
- `.\cato.cmd lint` = check structure, metadata, and link integrity

Run `.\cato.cmd help` for command options.

## Design Notes

- The CLI handles deterministic plumbing and repository maintenance.
- The CLI now supports memo, report, deck, surveillance, watch-profile, claim-ledger, state/regime, decision-support, self-reflection, doctor, and promotion workflows directly over the local corpus.
- Live internet research should come from GPT/Codex itself; Cato now provides a handoff layer so researched sources and LLM-authored outputs become durable repo artefacts instead of ephemeral chat-only work.
- The claim ledger is now the belief layer between source notes and higher-order outputs.
- State pages and regime briefs are now canonical current-world-model surfaces rather than ad hoc reports.
- Decision outputs now combine claims, states, watch context, and the self-model so Cato can answer mandate-aware questions instead of only summarising evidence.
- Obsidian is the reading and navigation layer, not the truth layer.
- Git should be used from day one to preserve diffs and rollback.
- `docs/operator_guide.md` explains the daily loop and what the launcher layer is actually automating.

## Current Runtime

This first implementation is Node-first so it runs on the current machine without requiring a Python interpreter on `PATH`.
