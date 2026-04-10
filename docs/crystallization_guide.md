# Crystallization Guide

Crystallization is the deliberate step that turns a completed memo, report, brief, state page, or other authored artefact into durable reusable knowledge.

## When To Use It

Use `crystallize` when a finished artefact contains any of the following:

- durable claims worth promoting or refreshing
- concept or entity updates that should live beyond the original session
- state or decision implications that should feed maintained pages
- process or self-model lessons that should compound future work

Do not crystallize speculative scratch work just because it is recent.

## Workflow

1. Produce the finished authored artefact through the normal pack/capture path.
2. Run `.\cato.cmd crystallize <artifact-path-or-title>`.
3. Review the generated pack in `cache/crystallize-packs/`.
4. Let the active terminal model write the final crystallized note in the capture bundle.
5. Run `.\cato.cmd capture-crystallize <capture-bundle>`.
6. Use the resulting note in `wiki/synthesis/` as the durable bridge into claims, concepts, states, or self-model updates.

## Content Shape

Good crystallized notes are compact and structured:

- durable takeaways
- claim candidates
- concept/entity updates
- state or decision implications
- self-model or process lessons
- open threads

The source artefact remains the provenance anchor. A crystallized note is not a replacement for the original output.
