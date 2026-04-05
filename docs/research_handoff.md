# Research Handoff

This document defines the boundary between live external research and durable Cato state.

## Purpose

Use this workflow when:

- Codex/GPT has already done live web research
- you want the cited sources preserved in Cato
- you want those sources turned into normal Cato evidence objects
- you want the authored memo/report/deck stored durably

The operating split is settled:

- external frontier model = live research and authored synthesis
- Cato = capture, ingest, compile, and durable storage

## Command

```powershell
.\cato.cmd capture-research .\path\to\bundle.json
```

Launcher equivalent:

```powershell
.\commands\Import-Research-Bundle.cmd .\path\to\bundle.json
```

## Bundle Shape

Use `commands\research-capture.example.json` as the template.

High-level fields:

- `topic` or `question`
- `watch_topic` and optional `watch` block
- `sources[]`
- `output`

Each `sources[]` entry can include:

- `url`
- `title`
- `author`
- `date`
- `publisher`
- `tags`
- `entities`
- `concepts`
- `notes`

The `output` block can include:

- `kind` = `memo`, `report`, `deck`, or `brief`
- `title`
- `promote`
- `body`

## What Cato Does

When you run `capture-research`, Cato:

1. downloads each cited URL
2. writes provenance sidecars
3. ingests the downloaded sources into `raw/`, `extracted/`, and `wiki/source-notes/`
4. assigns semantic document classes to the imported sources
5. creates append-and-review draft notes alongside the canonical source notes
6. compiles the repo and refreshes maintained surfaces
7. optionally creates or refreshes a watch profile and surveillance page
8. writes the supplied output body into `outputs/`
9. optionally promotes that output into `wiki/synthesis/`

## Why This Boundary Matters

This keeps the product honest:

- Cato does not pretend to be a live web-research model
- Codex/GPT does not stay ephemeral
- the final work lands with preserved evidence, provenance, and repo structure

## Operator Pattern

1. Ask Codex/GPT to research something live.
2. Ask it to return:
   - the final output body
   - the cited URLs
   - any watch metadata worth persisting
3. save that into a handoff bundle
4. run `capture-research`

That preserves the live intelligence of the external model while keeping Cato as the durable evidence and memory layer.
