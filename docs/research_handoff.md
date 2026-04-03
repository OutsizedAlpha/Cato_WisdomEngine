# Research Handoff

This document defines the bridge between live GPT/Codex research and durable Cato state.

## Purpose

Use this workflow when:

- Codex has already done live web research
- you want the cited sources downloaded and preserved in Cato
- you want source notes, compilation, watch refresh, and output storage to happen in one durable pass

The operating split is:

- GPT/Codex does the live reasoning and web research
- Cato captures, ingests, compiles, and stores the resulting work

## Command

```powershell
.\cato.cmd capture-research .\path\to\bundle.json
```

Launcher equivalent:

```powershell
.\commands\Import-Research-Bundle.cmd .\path\to\bundle.json
```

## Bundle Shape

Use [research-capture.example.json](/C:/Users/DameonDeans/OneDrive%20-%20Furnley%20House%20Ltd/Documents/AI/AI%20Builds/Cato_WisdomEngine/commands/research-capture.example.json) as the template.

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

- `kind`: `memo`, `report`, `deck`, or `brief`
- `title`
- `promote`
- `body`

## What Cato Does

When you run `capture-research`, Cato:

1. downloads each cited URL
2. writes provenance sidecars
3. ingests the downloaded sources into `raw/`, `extracted/`, and `wiki/source-notes/`
4. compiles the repo
5. optionally creates or refreshes a watch profile and surveillance page
6. writes the supplied output body into `outputs/`
7. optionally promotes that output into `wiki/synthesis/`

## Operator Pattern

The intended usage is:

1. Ask Codex to research something live.
2. Ask Codex to return:
   - the final report/memo/deck body
   - the cited source URLs
   - any watch metadata worth persisting
3. Save that into a handoff bundle JSON.
4. Run `capture-research`.

That gives you the GPT/Codex intelligence layer without losing the durable evidence trail and markdown knowledge base.
