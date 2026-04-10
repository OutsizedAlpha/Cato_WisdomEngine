# Authored Output Handoff

This file documents the common pack-and-capture contract for substantive authored output in Cato.

## Core Rule

Cato may still do deterministic maintenance, retrieval, and scaffold preparation.

The active terminal model must author the final memo, deck, surveillance page, belief brief, state page, decision note, meeting brief, reflection, principles snapshot, or postmortem.

That means these commands now prepare packs instead of pretending their first deterministic draft is the final artefact:

- `ask`
- `deck`
- `surveil`
- `watch`
- `why-believe`
- `state-refresh`
- `regime-brief`
- `meeting-brief`
- `decision-note`
- `red-team`
- `what-changed-for-markets`
- `reflect`
- `principles`
- `postmortem`

## Commands

Prepare the pack by running the normal command:

```powershell
.\cato.cmd ask "What does the corpus currently say about passive flows?"
```

Capture the model-authored result:

```powershell
.\cato.cmd capture-authored .\cache\authored-packs\...\...-capture.json
```

## What The Command Creates

Each authored-output run now writes:

- `...-pack.json`
- `...-prompt.md`
- `...-capture.json`

under `cache/authored-packs/`.

The command may also refresh a deterministic scaffold at the final output path so the terminal model has a structured starting point.

That scaffold is not the final artefact.

Each pack now also carries command-specific self-model context compiled from the current self notes. In practice that means the prompt and pack can include:

- active hard rules
- active soft preferences
- challenge style
- bias checks
- writing constraints
- what not to do
- current tensions and review pressure

Treat that block as part of the operating brief, not as decorative metadata.

Internally, the authored-output workflow now shares its pack/capture mechanics with the report and frontier handoff paths through the common handoff core. That reduces drift in path generation, placeholder enforcement, and capture metadata rules.

## Required Capture Discipline

Before running `capture-authored`:

1. read the pack and listed local sources
2. replace the scaffold marker in `output.body`
3. fill `model` with the actual active Codex/Claude session label
4. add fresh URLs under `sources` only if you really used them
5. then run `capture-authored`

If the scaffold marker is still present or `model` is blank, capture should fail.

In a live terminal session, the agent can carry that loop end to end. The important boundary is not who typed the command; it is that the active terminal model authored the body and that the capture metadata records that authorship honestly.

## What Stays Deterministic

These remain deterministic because they are maintenance, retrieval, or structural bookkeeping rather than substantive authored IP:

- `init`
- `ingest`
- `self-ingest`
- `compile`
- `search`
- `watch-list`
- `watch-refresh`
- `claims-refresh`
- `claim-diff`
- `state-diff`
- `doctor`
- `lint`

The important distinction is not "did code run".

It is "is this final reasoning or authored judgement".
