# Architecture Review: LLM Wiki + GBrain

Date: 2026-04-05

## Scope

This note reviews two external reference documents and maps their useful ideas into Cato's current direction:

- Andrej Karpathy, `llm-wiki`:
  - main gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - revisions: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f/revisions
- Garry Tan, `GBrain.md`:
  - main gist: https://gist.github.com/garrytan/49c88e83cf8d7ae95e087426368809cb
  - revisions: https://gist.github.com/garrytan/49c88e83cf8d7ae95e087426368809cb/revisions

Review state on 2026-04-05:

- Karpathy gist created 2026-04-04, single revision, 124 comments.
- Garry Tan gist created 2026-04-05, single revision, 0 comments.

The goal here is not to copy either system wholesale. It is to extract durable design signal that improves Cato without violating Cato's constraints:

- markdown-first
- file-first
- auditable
- Windows-first for v1
- source-grounded
- minimal drift from the existing repo

## What Karpathy Adds

Karpathy's gist is deliberately abstract. The value is the framing, not the implementation.

Core signal:

- The right comparison target is not generic RAG. It is "compiled knowledge" versus repeated re-derivation from raw files.
- The persistent wiki is the compounding layer between raw evidence and user queries.
- The three-layer split is correct:
  - raw sources
  - wiki
  - schema/instructions
- Query outputs should be fileable back into the knowledge layer so exploration compounds.
- Lint and logging are not optional polish. They are what keeps the system trustworthy as it grows.

Why this matters for Cato:

- Cato is already aligned with this architecture and is further along than the gist on belief/state/decision surfaces.
- The gist strengthens the case for keeping Cato as a maintained knowledge layer instead of sliding back toward "search the files again every time."

## High-Signal Karpathy Comment Learnings

Most of the 124 comments are variants of "I built this too" or implementation links. The comments worth taking seriously were these:

- `peas`:
  - capture is often the real bottleneck, not synthesis
  - a split between machine-managed knowledge and draft/workspace output is useful
  - the strongest guardrail is "editor, not ghostwriter"
  - provenance should reach all the way back to the raw capture
  - cross-links should be as mechanical/deterministic as possible when trust matters
- `bluewater8008`:
  - classify before extraction
  - make retrieval/context budgets explicit
  - use per-entity-type templates, not one generic note shape
  - every task should create both the user-facing output and the memory update
  - domain tags should exist from day one if cross-domain overlap is likely
  - the human must retain verification ownership in high-stakes work
- `mpazik`:
  - search/query pressure and schema pressure are what break first at scale
  - hand-maintained indices eventually want structured query support
- `localwolfpackai`:
  - add explicit counter-arguments and data gaps, not just positive synthesis
- `Okohedeki`:
  - collection is not enough; the system must also support repeated consumption in useful output formats
- `flyersworder`:
  - contradiction matrices and canonical vocabularies are how cross-document synthesis scales
  - lint and event logs become more important as the corpus grows

Lower-signal but still worth noting:

- `expectfun` points to the "append-and-review note" pattern as a useful complement.
- `tkgally` shows the pattern also works as a planning memory inside a live software repo, not only as a reading/research vault.

## What GBrain Adds

Garry Tan's gist is the opposite of Karpathy's: concrete, opinionated, and implementation-heavy.

The key additions are:

- a formal "compiled truth + timeline" model:
  - above the line = current assessment
  - below the line = append-only evidence trail
- an explicit structured query layer:
  - FTS5
  - vector search
  - typed list/backlink/tag queries
- a thin CLI / fat skills split
- MCP from day one
- a lossless, round-trippable migration standard
- a stronger maintenance discipline:
  - stale state detection
  - contradiction checks
  - orphan detection
  - tag normalization
  - embedding freshness
- a briefing skill that turns the knowledge base into a live operational surface

The most useful part for Cato is not the SQLite choice itself. It is the operational discipline around:

- explicit state versus timeline
- structured query surfaces
- durable maintenance reports
- skill-defined workflows instead of burying behavior inside code

## Fit Against Current Cato

### Already aligned

Cato already has the strongest parts of the Karpathy framing:

- immutable raw evidence
- derived markdown knowledge layer
- schema/policy-driven maintenance
- durable outputs filed back into the corpus
- linting and logs
- watch profiles as standing instructions
- claim, state, regime, and decision layers

In one important sense Cato is ahead of both references:

- Karpathy stops at wiki maintenance.
- GBrain stops at a personal knowledge brain.
- Cato already extends the stack into belief, state, regime, and PM-facing decision support.

### Borrow now

These are the highest-leverage ideas to import without violating current constraints:

- Source/document classification before deep extraction.
  - Cato is already format-aware.
  - The next step is semantic document routing: report, transcript, filing, letter, deck, dataset note, meeting transcript, etc.
  - This should drive extraction rules and evidence weighting.

- Explicit retrieval budget tiers.
  - Karpathy implies progressive disclosure.
  - Bluewater makes it operational with L0/L1/L2/L3 context budgets.
  - Cato should encode this in prompts/policies so the agent does not over-read by default.

- Stronger page-type enforcement.
  - Cato has multiple templates already.
  - The next step is stronger required-section discipline by page type, especially for claims, states, decisions, and surveillance.

- Two-output rule.
  - User-facing answer plus durable repo update should become an explicit policy, not just a good habit.

- Counter-arguments and data gaps as first-class surfaces.
  - Cato already supports counter-case in some outputs.
  - It should become more systematic in claims, states, and decision notes.

- Draft/workspace separation.
  - Cato has outputs and wiki, but not yet an explicit append-and-review or draft workspace concept.
  - A thin draft layer would help exploratory synthesis without prematurely promoting it into canonical knowledge.

- Maintenance report expansion.
  - Current lint is useful.
  - GBrain's stale/open-thread/tag/backlink discipline suggests a richer maintenance pass.

- Canonical vocabulary and contradiction structures.
  - Cato already has ontology-aware concept promotion.
  - The next step is contradiction matrices and stronger concept normalization for claims/state synthesis.

### Borrow later, only if justified by pain

- Structured query sidecar or DB-backed query surface.
  - Do not replace markdown-first storage now.
  - If lexical search becomes a real bottleneck, add a sidecar index or SQLite query layer while keeping markdown as source of truth.

- MCP server.
  - Useful if Cato needs to be a tool endpoint for multiple clients.
  - Not necessary just because GBrain includes it.

- Multi-brain support.
  - Attractive, but only after the single-repo operating model is genuinely stable.

- Round-trip import/export guarantees.
  - Worth doing only if Cato adds a secondary structured storage layer.

### Do not copy blindly

- Do not pivot Cato's core storage from markdown files to SQLite right now.
  - That would conflict with the current repo's stated constraints and the user's current workflow.
  - GBrain's database-first approach solves a scale/query problem Cato has not yet earned.

- Do not add a file watcher or always-on daemon by default.
  - Explicit commands remain the right operating model for now.

- Do not inherit OpenClaw-specific patterns just because they appear in adjacent discussion.
  - The useful parts are capture discipline, verification, and workflow design, not the surrounding agent stack.

## Recommended Cato Upgrades From This Review

Priority 1:

- Add semantic source/document-class routing ahead of deeper extraction and note synthesis.
- Add explicit L0/L1/L2/L3 retrieval-budget guidance to prompts and operator docs.
- Add managed `Counter-Arguments / Data Gaps` blocks to core generated surfaces.
- Make "deliverable + repo update" an explicit operating rule.

Priority 2:

- Add a draft or append-and-review workspace distinct from canonical wiki pages.
- Expand lint into a richer maintenance pass covering stale pages, orphan pages, tag drift, and unresolved open threads.
- Add stronger canonical-vocabulary handling for contradiction and pattern synthesis.

Priority 3:

- Evaluate structured query/backlink/tag surfaces.
- Evaluate an optional sidecar index or MCP server only if retrieval and multi-client usage justify it.

## Implemented Snapshot

Implemented in the repo on 2026-04-05:

- semantic `document_class` routing during ingest
- append-and-review draft notes under `wiki/drafts/append-review/`
- explicit L0/L1/L2/L3 retrieval budgets with TLDR-first escalation
- managed counter-argument and data-gap sections on claim/state/decision surfaces
- structured sidecar catalog at `manifests/wiki_index.json`
- generated tag and backlink indices plus open-thread register
- stronger lint for stale operational pages, tag drift, orphan pages, and legacy-shape debt

Not implemented from these references:

- no storage rewrite away from markdown
- no watcher/daemon
- no SQLite/FTS/vector migration
- no direct OpenClaw adoption

## Recommended Directional Decision

Inference from the current repo state:

- Cato should stay file-first and markdown-first.
- Cato should borrow GBrain's query and maintenance ideas as sidecar capabilities, not as a storage rewrite.
- Cato should borrow Karpathy's compounding-wiki framing as the conceptual anchor, while preserving Cato's stronger investment-grade provenance and belief/state/decision stack.

In short:

- take Karpathy's pattern
- take Bluewater's operational discipline
- take Peas' provenance and editor-not-writer guardrail
- take GBrain's maintenance/query rigor
- do not take GBrain's database-first storage model yet

## Source Links

- Karpathy gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Karpathy revisions: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f/revisions
- Garry Tan gist: https://gist.github.com/garrytan/49c88e83cf8d7ae95e087426368809cb
- Garry Tan revisions: https://gist.github.com/garrytan/49c88e83cf8d7ae95e087426368809cb/revisions
- Peas comment context: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Bluewater comment context: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- mpazik comment context: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- localwolfpackai comment context: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Okohedeki comment context: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- flyersworder comment context: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
