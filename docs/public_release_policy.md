# Public Release Policy

This file records the intended boundary between the private working repo and the public engine repo.

## Core Rule

The public repo should preserve Cato's engine architecture and operator-facing capability.

The public repo should not preserve the user's private corpus, personal doctrine, operator-specific working memory, or captured private outputs.

That means the split is about payload, not about feature-thinning.

## What Must Stay In The Private Repo

- inbox staging material
- raw evidence archives
- extracted text, figures, and metadata derived from private sources
- manifests that describe the private corpus and private operating history
- private source notes, claims, states, regimes, decisions, reports, and syntheses
- private probability surfaces, scenario snapshots, and any generated market views grounded in the private corpus or private working state
- seeded self-model doctrine and operator-specific operating constitution
- live working-memory surfaces and private output history

## What Must Ship To The Public Repo

- the CLI and runtime implementation under `src/`, `bin/`, and wrapper commands
- the scenario engine implementation, configs, tests, and operator docs
- prompts, policies, schemas, ontology, tests, hooks, roles, and skills
- architecture and operator documentation
- starter self-model and working-memory scaffold surfaces
- the same pack/capture workflows, compile/lint flows, and maintenance commands that define the private engine

## Public Projection Standard

When exporting to the public line:

1. preserve engine behaviour and repo shape
2. strip private corpus and personal payloads
3. reseed any required markdown surfaces with clean starter scaffolds
4. validate the public worktree before commit and push

## Intended Workflow

1. finish and validate work in the private repo
2. run `.\cato.cmd public-release --to ..\Cato_WisdomEngine_Public`
3. review the public diff for any accidental private leakage
4. run the public validation path
5. commit and push the private repo to the private remote
6. commit and push the public worktree to the public remote
