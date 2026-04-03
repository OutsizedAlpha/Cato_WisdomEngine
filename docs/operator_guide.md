# Operator Guide

This file explains the practical operating model of Cato so the launcher layer stays tied to real workflows rather than random commands.

## What Cato Is Doing

Cato is a local research operating system with five layers:

1. `inbox/`
   Drop new material here. This is only a staging area.

2. `raw/`
   Cato moves originals here and treats them as immutable evidence.

3. `extracted/`
   Cato writes machine-usable artefacts here:
   - `text/` for extracted text
   - `metadata/` for manifest records
   - `tables/` for dataset previews
   - `figures/` for figure notes and image-sidecar analysis

4. `wiki/`
   This is the maintained knowledge layer:
   - `source-notes/` for one-note-per-source grounding
   - `watch-profiles/` for durable topic-watch instructions
   - `concepts/`, `entities/`, `timelines/`, `theses/`, `surveillance/`
   - `self/` for principles, heuristics, biases, and postmortems

5. `outputs/`
   This is where generated artefacts land:
   - `memos/`
   - `reports/`
   - `decks/`

`logs/` and `manifests/` provide auditability around what happened and when.

## Daily Loop

The default loop is:

1. Drop evidence into `inbox/drop_here/`.
2. Drop rough self-notes into `inbox/self/` when relevant.
3. Run refresh:
   - ingest
   - self-ingest
   - compile
4. Generate the output you need:
   - `ask` for a memo
   - `report` for a stronger write-up
   - `deck` for slides
   - `capture-research` when Codex has already done live web research and you want the sources plus the final artefact persisted into Cato
   - `watch` to persist a live topic and its instruction profile
   - `surveil` for a persistent watch page
   - `reflect` for self-model review
5. Run `lint` or `doctor` when you want structural confidence.

## GPT/Cato Symbiosis

The correct split is:

- GPT/Codex = live reasoning and live web research
- Cato = durable capture, source-note creation, compilation, surveillance, and memory

Cato should not try to imitate GPT's web-research capability with its own search engine layer. Instead, Codex researches the topic, chooses the sources, writes the actual memo/report/deck, and then hands that work into Cato.

That handoff now happens through:

- `capture-research .\path\to\bundle.json`

The bundle contains:

- the topic or question
- the cited source URLs and optional relevance notes
- optional watch-profile data
- the GPT-authored output body

Cato then:

1. downloads the cited sources
2. ingests them as normal evidence
3. writes source notes and metadata
4. compiles the wiki
5. optionally creates or refreshes the watch
6. writes the supplied memo/report/deck into `outputs/`

This keeps the live intelligence with GPT and the durable structure with Cato.

## What Each Core Command Means

- `ingest`
  Archives new evidence, extracts text, creates metadata, drafts source notes, and now treats repo folders and repo archives as first-class ingest objects.

- `self-ingest`
  Converts rough personal notes into structured self-model notes.

- `compile`
  Rebuilds concept/entity pages, indices, timelines, contradiction candidates, and synthesis candidates from the current corpus.

- `ask`
  Writes a grounded memo from the current local corpus.

- `report`
  Writes a more deliberate report-style artefact with evidence, synthesis, counter-case, and open questions.

- `deck`
  Writes a Marp-friendly markdown deck for Obsidian/slide workflows.

- `surveil`
  Maintains a durable watch page for a live topic, thesis, company, or regime.

- `watch`
  Creates or updates a persistent watch profile. The watch profile is the standing instruction object that tells Cato what the topic means, why it matters, which aliases/entities/concepts belong to it, and which triggers to keep in view.

- `capture-research`
  Imports a GPT/Codex research bundle. This is the bridge between live web research and the durable Cato corpus.

- `reflect`
  Reviews the self-model and updates the tension register.

- `principles`
  Writes a current snapshot of active principle notes.

- `postmortem`
  Adds a structured outcome review into the self-model layer.

- `doctor`
  Checks runtime readiness, repo health, and current lint state.

## New Ingest Capabilities

### Repo Snapshots

Cato now treats repository material as evidence in two forms:

- repo directories dropped into `inbox/drop_here/`
- repo archives such as `.zip`, `.tar`, `.gz`, `.tgz`

Repo ingest writes:

- preserved snapshot in `raw/repos/`
- extracted repo manifest text in `extracted/text/`
- source note in `wiki/source-notes/`

The current repo extraction is structural rather than semantic. It indexes layout and key files such as `README.md`, `package.json`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, and `go.mod`.

### Figure Extraction

Cato now writes figure notes into `extracted/figures/` when:

- the source itself is an image
- a markdown or HTML source contains figure/image references

Figure notes capture:

- image references
- captions or alt text when present
- OCR or visible extracted text when available

This is still a lightweight figure layer, not full computer vision analysis. It is good enough to stop figures from being invisible to the repo.

## Surveillance Pages vs Watch Profiles vs Watch Ontology

- `surveillance page`
  The live readable page in `wiki/surveillance/`. This is what you read when you want the current state of a topic.

- `watch profile`
  The persistent instruction object in `wiki/watch-profiles/`. This tells Cato what to include when the topic is refreshed. It carries context, aliases, entities, concepts, cadence, priority, and risk triggers.

- `watch ontology`
  The derived summary in `wiki/glossary/watch-ontology.md`. This grows from watch profiles, not from ad hoc user prompts, so ontology drift stays controlled.

The intended operating model is:

1. Create a watch profile once.
2. Refresh surveillance repeatedly.
3. Let reports and decks resolve through that watch profile when the topic matches.

Grounded output commands treat watch profiles, surveillance pages, unresolved registers, and prior generated outputs as control surfaces rather than evidence. They route toward source notes, extracted text, concept pages, entity pages, and other source-grounded material instead of feeding on their own previous artefacts.

## Suggested Launchers

The current launcher set in `commands/` covers the first useful operator surface:

- `Open-Cato-Vault.cmd`
- `Refresh-Cato.cmd`
- `Write-Report.cmd`
- `Ask-Cato.cmd`
- `Write-Deck.cmd`
- `Run-Surveillance.cmd`
- `Create-Watch.cmd`
- `Refresh-Watches.cmd`
- `Import-Research-Bundle.cmd`
- `Run-Reflect.cmd`
- `Run-Doctor.cmd`
- `Open-Latest-Report.cmd`

These are the right first launchers because they match the repeatable motions:

- open the workspace
- refresh the corpus
- ask for an answer
- write a report
- write a deck
- refresh surveillance
- inspect self-model health
- inspect repo health

## What To Decide Next

If you want more launchers, the next sensible candidates are:

- `Open-Latest-Memo`
- `Run-Lint`
- `Postmortem`
- `Refresh-And-Report`
- `Open-Surveillance-Index`

Do not add launcher buttons for every command just because you can. Add them only for motions you expect to repeat often enough that typing becomes friction.
