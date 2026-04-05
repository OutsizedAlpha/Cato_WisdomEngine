# Project Brief

This file records the current product brief for the repository, not an earlier bootstrap intention.

## Objective

- Build `Cato_WisdomEngine` as a local, file-first, markdown-first research operating system.
- Turn evidence into durable knowledge, durable knowledge into beliefs, and beliefs into current-state and decision support.
- Make the system especially strong for investment research across macro, market structure, derivatives, company work, surveillance, and PM process.
- Preserve a structured self-model so output can reflect the user's principles, heuristics, biases, and tensions without collapsing into sycophancy.

## Scope

Implemented and in scope now:

- local ingest for notes, PDFs, images, datasets, web captures, and repo snapshots
- semantic document-class routing during ingest
- append-and-review draft workspace separate from canonical notes
- extracted text, metadata, table previews, and figure notes
- source notes, concepts, entities, theses, synthesis notes, and self-model notes
- atomic claim ledger, claim snapshots, claim diffs, and belief briefs
- state pages, state diffs, and regime briefs
- decision notes, meeting briefs, red-team briefs, and market-change briefs
- watch profiles, surveillance pages, and derived watch ontology
- GPT/Codex research handoff via `capture-research`
- zero-API frontier handoff via `frontier-pack` and `capture-frontier`
- structured sidecar catalog, backlink/tag/open-thread surfaces, and maintenance linting

## Constraints

- `AGENTS.md` remains the canonical shared policy file.
- The system stays markdown-first, file-first, auditable, and git-friendly.
- Raw evidence stays separate from derived knowledge.
- Windows PowerShell remains the primary operating environment for the current version.
- Obsidian is the browsing layer, not the system of record.
- Changes should remain pragmatic and avoid speculative infrastructure.
- Important claims must remain traceable to source notes and raw artefacts.
- The repo stays agent-driven rather than embedding external LLM execution directly into the CLI.

## Assumptions

- The user operates with an external frontier model such as Codex/GPT-5.x as the reasoning layer.
- New material arrives as PDFs, web captures, images, repo snapshots, datasets, transcripts, and rough notes.
- The user wants cumulative improvement: useful outputs should become durable repo assets.
- Lexical search plus maintained indices and sidecar cataloging are sufficient for the current phase.
- The user values PM-grade output: direct, rigorous, source-grounded, and willing to challenge weak assumptions.

## Non-goals

- treating the repo as a passive dump folder
- mixing raw evidence and derived interpretation
- replacing markdown with a database-first storage model right now
- embedding fake always-on automation or hidden model calls into the CLI
- building heavyweight RAG or fine-tuning infrastructure before the workflow justifies it
- duplicating the full policy content from `AGENTS.md` into project memory

## Current Phase

- The bootstrap phase is complete.
- The repo is now in operational hardening and refinement.
- The current focus is maintaining a clean belief/state/decision runtime, improving source and claim quality, and keeping the agent-driven handoff model disciplined.

## Settled Decisions

- Keep the runtime Node-first for now.
- Keep the product markdown-first and file-first.
- Keep external frontier reasoning outside the CLI.
- Use `capture-research` and `capture-frontier` as the integration boundary.
- Keep draft append-and-review notes distinct from canonical knowledge and exclude them from grounded retrieval by default.

## Open Decisions

- Whether a parallel Python tool layer is worth adding later once there is clear benefit beyond the current Node-first runtime.
- How far to push deterministic claim extraction and state inference before adding optional model-assisted compile passes.
- Whether lexical search plus the current sidecar catalog remains enough, or whether a richer structured query layer is justified later.
- How aggressive watch-profile-driven routing should become before adding stronger semantic indexing.
