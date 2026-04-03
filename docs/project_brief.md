# Project Brief

This file turns the user's long-form conversation into the current working brief for the repository. It should stay concise, practical, and aligned to the repo's actual build direction.

## Objective

- Build `Cato-WisdomEngine` as a local, file-based research operating system for evidence-backed knowledge work.
- Support a workflow where raw material is ingested, preserved, extracted, compiled into a structured markdown knowledge base, queried by LLM agents, and used to generate durable outputs such as reports, briefs, decks, and charts.
- Make the system especially strong for investment research: macro, market structure, derivatives, company work, portfolio process, and surveillance.
- Add a structured self-model layer so the system can understand the user's principles, heuristics, communication style, and recurring blind spots without becoming sycophantic.

## Scope

- MVP scope is a local-first repository operated from PowerShell and viewed in Obsidian.
- Core layers in scope: acquisition/inbox, immutable raw evidence, extracted artefacts, compiled wiki, outputs, manifests/logs, config/policies/prompts, and CLI tooling.
- Core workflows in scope: `init`, `ingest`, `compile`, `lint`, and `ask`.
- Phase-2 workflows now in scope and implemented locally: `report`, `deck`, `surveil`, `watch`, `watch-refresh`, `watch-list`, `doctor`, `self-ingest`, `reflect`, `principles`, and `postmortem`.
- Phase-3 knowledge and decision layers are now in scope and implemented locally: `claims-refresh`, `claim-diff`, `why-believe`, `state-refresh`, `state-diff`, `regime-brief`, `meeting-brief`, `decision-note`, `red-team`, and `what-changed-for-markets`.
- GPT/Codex-to-Cato handoff is now in scope: Codex does the live web research and authored synthesis, while Cato imports the cited sources plus the finished artefact through `capture-research`.
- Knowledge objects in scope: source notes, claim pages, concept pages, entity pages, state pages, regime pages, decision notes, timeline pages, thesis pages, watch profiles, surveillance pages, question pages, synthesis pages, and self-model notes.

## Constraints

- `AGENTS.md` is the canonical shared policy file; `CLAUDE.md` remains a thin loader only.
- The system must remain markdown-first, file-first, auditable, and version-controllable.
- Raw evidence must be kept separate from derived knowledge; the LLM may maintain the knowledge layer but must not rewrite source truth.
- Windows PowerShell is the primary operating environment for the first version.
- Obsidian is the viewing/navigation layer, not the system of record.
- Changes should stay minimal and practical; avoid speculative architecture and unnecessary dependencies.
- Investment-grade provenance matters: important claims should remain traceable to source notes and raw artefacts.

## Assumptions

- The user will work locally with a frontier LLM agent such as Codex/GPT-5.x as the main reasoning/compiler layer.
- New source material will arrive as PDFs, clipped web articles, images, repo snapshots, datasets, transcripts, and personal notes.
- The user wants the system to improve cumulatively: good outputs should be fileable back into the knowledge base as durable synthesis.
- A disciplined markdown ontology plus good index pages is sufficient for the first version; vector search and fine-tuning are later options, not initial requirements.
- The user values first-principles, PM-grade output that is concise, rigorous, and willing to challenge weak assumptions.

## Non-goals

- Treating the repo as just a dump folder that an LLM scans ad hoc.
- Mixing raw evidence and derived interpretation in the same layer.
- Building fine-tuning, complex RAG, or heavyweight infrastructure before the file-based workflow proves itself.
- Letting the self-model hard-code conclusions or simply mirror the user's priors.
- Repeating the full policy text from `AGENTS.md` in project memory files.

## Current Phase

- MVP foundation implemented.
- The repository now includes the first working local runtime, repo structure, templates, policies, fixture data, and test coverage for the core workflow.
- Immediate goal shifts from repo bootstrap to phase-3 hardening and integration: stronger claim quality, cleaner state/regime surfaces, sharper PM decision outputs, and continued GPT/Codex-to-Cato handoff discipline for live research.

## Open Decisions

- Whether to keep the runtime permanently Node-first or add a parallel Python tool layer once Python is reliably available on the machine.
- Manifest format details and stable ID scheme for ingested sources.
- Whether to add API-backed LLM execution inside the CLI or keep LLM synthesis as an external Codex/ChatGPT agent workflow over the repo.
- How far to push deterministic claim extraction and state inference before adding optional model-assisted compile passes.
- How aggressive watch-profile-driven retrieval and state routing should become before introducing richer semantic indexing or embedded model passes.
