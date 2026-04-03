# Frontier Handoff

This file documents the zero-API bridge between Codex/GPT and Cato for claim-led, state-led, and decision-led reasoning.

## Why This Exists

The local CLI can maintain structured belief/state/decision surfaces, but it should not pretend to be the frontier model.

The correct split is:

- Codex/GPT = frontier reasoning, live web research, authored synthesis
- Cato = structured context, provenance, ingestion, durable storage, and repo refresh

`frontier-pack` and `capture-frontier` are the bridge between those roles.

## Workflow

1. Refresh the deterministic repo state as usual.
2. Run a frontier pack:

```powershell
.\cato.cmd frontier-pack "Global Macro" --mode decision
```

or:

```powershell
.\cato.cmd frontier-pack "Weekly investment meeting brief" --mode meeting
```

3. Open the generated files in `cache/frontier-packs/`:
   - `...-pack.json`
   - `...-prompt.md`
   - `...-capture.json`
4. Let Codex use the pack plus any additional live web research it judges necessary.
5. Write the final markdown output into `output.body` in the capture bundle.
6. Add any newly researched external URLs to `sources`.
7. Run:

```powershell
.\cato.cmd capture-frontier .\cache\frontier-packs\...\...-capture.json --promote
```

## What The Pack Contains

- the operating mode: `belief`, `state`, `decision`, or `meeting`
- refreshed deterministic artefacts such as state pages, decision notes, regime briefs, or belief briefs
- claim summaries
- state summaries
- evidence references
- local source references that should remain attached to the final output
- a ready-made capture bundle

## Modes

- `belief`
  Best when you want a frontier model to refine what the repo currently believes and why.

- `state`
  Best when you want a frontier model to assess the current state of one subject and what has shifted.

- `decision`
  Best when you want portfolio implications, risk flags, de-risk triggers, and counter-cases.

- `meeting`
  Best when you want a multi-subject investment meeting brief.

## Important Constraint

This workflow does not embed a direct API call into the CLI.

That is deliberate.

The value is:

- no double-paying for API access
- you keep using Codex/GPT interactively in the terminal
- Cato still receives a durable, structured, auditable record of what the frontier model produced

## Bundle Shape

See:

- `commands/research-capture.example.json`
- `commands/frontier-capture.example.json`

The frontier bundle supports:

- `local_sources` for existing Cato context
- `sources` for new web URLs discovered during frontier research
- `output` for the final authored markdown artefact
