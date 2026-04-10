# Internal Architecture

This file records the current internal runtime shape of Cato as of 2026-04-07.

It is about implementation structure, not the higher-level operating philosophy.

## Design Goal

Recent refactors were intentionally behaviour-preserving.

The aim was to reduce drift and duplication without changing:

- the authored-output boundary
- the markdown-first storage model
- the pack/capture workflow
- the operator command surface
- the claim/state/decision flow

## Current Structure

### CLI Dispatch

- [`src/cli.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/cli.js) parses arguments and dispatches
- [`src/command-registry.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/command-registry.js) owns command registration, help text, option handling, and command execution wiring

This keeps the public CLI entrypoint small and makes command drift easier to control.

### Shared Handoff Core

- [`src/handoff-core.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/handoff-core.js)

This centralises:

- pack path creation
- prompt file creation
- capture bundle writing
- placeholder enforcement
- capture metadata checks
- shared capture logging

That logic is now reused by authored, frontier, report, and memory flows instead of being reimplemented separately.

### Working-Memory Runtime

- [`src/memory.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/memory.js)

This module now owns the working-memory layer:

- append-only event logging in `manifests/memory_events.jsonl`
- deterministic daily log regeneration under `wiki/memory/daily/`
- due-based current-context and weekly-review pack generation
- capture of authored memory notes back into `wiki/memory/`
- mirroring of `wiki/memory/current-context.md` into the repo-root `MEMORY.md`
- automatic post-command orchestration through the command registry

The trigger rule is deliberate: refresh happens on the first meaningful Cato action when due, not on shell startup.

### Output Policy

- [`src/output-registry.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/output-registry.js)
- [`src/research.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/research.js)

Output behaviour is now resolved through shared families such as:

- canonical
- rolling current-plus-archive
- fixed-path

This is what now keeps recurring generated outputs consistent across memos, briefs, decks, meeting briefs, captured surfaces, and working-memory notes.

### Generated-Note Safety

- [`src/generated-note-safety.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/generated-note-safety.js)

Generated markdown writes now pass through shared guards for:

- frontmatter sanitisation
- malformed generated content rejection
- size ceilings
- quarantine-friendly failure handling

This was added after prior generated-note corruption surfaced in the claim layer.

### Public Facades With Split Internals

- [`src/self-model.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/self-model.js) -> thin public façade
- [`src/self-model-lib/internal.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/self-model-lib/internal.js) -> actual implementation

- [`src/report.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/report.js) -> thin public façade
- [`src/report-lib/internal.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/src/report-lib/internal.js) -> actual implementation

The intent is to preserve stable module imports while allowing deeper internal decomposition later.

### Test Layout

- [`tests/cato.test.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/tests/cato.test.js) remains the stable top-level entrypoint
- [`tests/test-helpers.js`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/tests/test-helpers.js) carries the temp-repo harness and shared helpers
- [`tests/suites/`](C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/tests/suites) contains the split focused suites

The suite split is organisational only. The assertions were kept intact.

## Why This Matters

The current refactor set improves:

- change isolation
- command consistency
- pack/capture consistency
- generated-note safety
- test maintainability
- operator-doc fidelity

without changing the actual runtime contract the user works with day to day.

## What Did Not Change

- Cato is still markdown-first
- Cato still does not embed a model API runtime inside the CLI
- the active terminal model is still the author of final intellectual output
- deterministic maintenance commands are still deterministic
- pack/capture workflows are still the integration boundary
- working memory still follows the same boundary: daily logs are deterministic, while current-context and weekly-review notes are model-authored through pack/capture
- the private repo is still the default working line
