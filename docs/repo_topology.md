# Repository Topology

This file records the intended repository split for Cato as of 2026-04-07.

## Purpose

The project now has two distinct lines:

- the public line = open reference, template, and external collaboration surface
- the private line = personalised working repository with user-specific doctrine, self-model notes, curated corpus, and captured authored outputs

The private line is the real operating repo for ongoing work.
The public line should remain functionally aligned with the private engine rather than becoming a feature-thinned demo.

## Remote Roles

- one private working remote for day-to-day use
- one public reference remote for selective engine releases

The exact remote names are a local convention, not a product requirement. The important rule is the split itself: private for personalised operation, public for reusable engine behaviour.

## What Belongs In The Private Line

- seeded self-model doctrine
- user-specific operating constitution
- private research corpus and ingestion history
- captured authored outputs that reflect the user's real working process
- future refinements that are specific to this operator rather than the generic public template

## What The Public Line Is For

- a clean external-facing version of the architecture
- open reference for workflow ideas, structure, and improvement
- generic improvements that are safe to share publicly
- the same core CLI/runtime capability, prompts, policies, and scaffolded engine surfaces without the private knowledge payload

The public line should not become the default home for user-specific doctrine or private operating memory.

The intended projection path is `.\cato.cmd public-release --to ..\Cato_WisdomEngine_Public` from the private worktree, followed by validation and a separate commit in the public worktree.

## Push Discipline

- do normal day-to-day pushes to the private working remote
- only push to the public reference remote deliberately, after deciding that the material is generic enough to be public
- if a change contains user-specific self-model doctrine, private corpus material, or personal working outputs, it belongs only in the private line

This is now the default operating assumption for this repo.

If no explicit public-push instruction is given, default to the private working line.

## Reasoning Boundary

The repo split does not change the model-authorship rule.

Cato still provides memory, retrieval, provenance, and scaffolding.
The active terminal model still authors final intellectual output through the pack/capture workflows.
