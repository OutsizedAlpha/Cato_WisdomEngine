# Release Runbook

This file records the intended release sequence for the split private/public Cato workflow.

## Purpose

The private repo is the real working system.
The public repo is the engine-only reference line.

The release job is therefore two separate actions, not one blind push:

1. update and validate the private working repo
2. project and validate the public-safe engine worktree

## Current Topology

- private remote = normal day-to-day push target
- public remote = deliberate engine-only release target
- public projection path = `.\cato.cmd public-release --to ..\Cato_WisdomEngine_Public`

## Before Any Release

Make sure the markdown memory is current:

- `README.md`
- `docs/project_brief.md`
- `docs/project_map.md`
- `tasks/todo.md`
- any operator/runbook doc touched by the recent work

Do not rely on an old lint file. Rerun validation in the current repo state first.

## Private Release Sequence

1. finish the intended ingest, capture, compile, and report/scenario refresh work
2. run the relevant validation path
3. inspect `git status`
4. commit the private repo
5. push the private repo to the private remote

Typical private validation path:

- `node .\tests\cato.test.js`
- `node .\bin\cato.js compile`
- `node .\bin\cato.js lint`
- `node .\bin\cato.js doctor`

Use the heavier checks proportionally. If the work touched the scenario engine or canonical probability/report surfaces, rerun the relevant scenario and report commands before commit.

## Public Projection Sequence

1. from the private repo, run `.\cato.cmd public-release --to ..\Cato_WisdomEngine_Public`
2. inspect the projected public worktree for leakage
3. validate the public worktree
4. commit in the public worktree
5. push the public worktree to the public remote

Typical public validation path:

- `node .\tests\cato.test.js`
- `node .\bin\cato.js lint`

Add `doctor` when the change materially touched environment assumptions or the scenario/PDF tooling surface.

## What Must Stay Private

- raw evidence
- extracted evidence artefacts
- source notes
- claims, states, regimes, decisions, and reports derived from the private corpus
- seeded self-model doctrine and operator-specific memory
- canonical probability surfaces and scenario history grounded in the private working set
- authored outputs that reveal private research or personal operating process

## What Should Ship Public

- CLI/runtime code
- quant/scenario engine code
- configs and schemas
- tests
- docs and operator runbooks
- starter scaffold files
- generic launcher layer and release plumbing

The public line should preserve capability, not private payload.

## Release Checklist

- repo docs match the live runtime
- current lint is rerun and clean enough for release
- tests are rerun after meaningful code changes
- probability defaults and scenario docs match the live config
- public projection is inspected before public commit
- no private corpus or generated private knowledge has leaked into the public worktree
