# Frontier Handoff

This file documents the zero-API bridge between Codex/GPT and Cato for belief, state, regime, and decision work.

## Why This Exists

Cato now maintains a real belief/state/decision stack, but it should not impersonate the frontier model.

The operating split is:

- Codex/GPT = deeper reasoning, optional live web research, authored synthesis
- Cato = structured context, provenance, ingestion, and durable storage

`frontier-pack` and `capture-frontier` are the bridge between those roles.

## Commands

Prepare context:

```powershell
.\cato.cmd frontier-pack "Global Macro" --mode decision
```

Capture the final result:

```powershell
.\cato.cmd capture-frontier .\cache\frontier-packs\...\...-capture.json --promote
```

## Workflow

1. refresh the deterministic repo state as usual
2. run a frontier pack
3. open the generated files in `cache/frontier-packs/`
4. let Codex/GPT reason over that pack and add any needed live web work
5. write the final markdown output into `output.body` in the generated capture bundle
6. fill `model` with the actual Codex/Claude session label used for authorship
7. add any newly researched external URLs to `sources`
8. run `capture-frontier`

## What The Pack Contains

Each pack writes:

- `...-pack.json`
- `...-prompt.md`
- `...-capture.json`

The structured context can include:

- operating mode
- refreshed belief/state/decision artefacts
- claim summaries
- state summaries
- evidence references
- local source references that must remain attached to the final output
- a starter capture bundle

The surrounding Cato runtime already includes:

- semantic source routing
- append-and-review draft workspace
- retrieval-budget discipline
- claim, state, regime, and decision surfaces
- counter-argument and data-gap sections

The frontier handoff is how the external model reasons over that structure without Cato embedding an API client.

## Modes

- `belief` = refine what the repo currently believes and why
- `state` = assess one subject's current state and what shifted
- `decision` = portfolio implications, risk flags, de-risk triggers, counter-case
- `meeting` = multi-subject investment meeting brief

## Important Constraint

This workflow does not embed a direct external model call into the CLI.

That is deliberate.

The product decision is:

- keep Cato agent-driven
- keep the CLI deterministic
- use handoff files as the integration boundary

## Bundle Shape

See:

- `commands\frontier-capture.example.json`
- `commands\research-capture.example.json`

The frontier bundle supports:

- `model` and `authoring_session` so the final artefact records which terminal model/session authored it
- `local_sources` for existing Cato context
- `sources` for new web URLs discovered during frontier research
- `output` for the final authored markdown artefact
