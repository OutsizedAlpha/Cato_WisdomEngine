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
   - `claims/` for atomic belief units
   - `states/` and `regimes/` for canonical current-world-model surfaces
   - `decisions/` for durable PM-facing decision notes
   - `watch-profiles/` for durable topic-watch instructions
   - `concepts/`, `entities/`, `timelines/`, `theses/`, `surveillance/`
   - `self/` for principles, heuristics, biases, and postmortems

5. `outputs/`
   This is where generated artefacts land:
   - `memos/`
   - `briefs/`
   - `reports/`
   - `decks/`
   - `meeting-briefs/`

`logs/` and `manifests/` provide auditability around what happened and when.

## Terminal vs Obsidian

The intended control surface is the terminal:

- PowerShell / WSL / Codex = where you operate the system
- Obsidian = where you read and navigate the markdown comfortably

You do not need to “use Obsidian instead” of the terminal. Obsidian is optional as the viewing layer.

## Is This Just Memory?

Not exactly.

It is fair to call Cato an extended memory layer, but the more accurate description is:

- structured external memory
- evidence-backed research memory
- a local operating system for durable reasoning

That distinction matters because Cato does not merely remember. It also organises, grounds, refreshes, and promotes knowledge into claims, states, regimes, and decisions.

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
   - `claims-refresh` when you want the belief ledger rebuilt and snapshotted
   - `why-believe` when you want a belief-led explanation of why the repo currently holds a view
   - `state-refresh` when you want a current state page for a topic or regime subject
   - `regime-brief` when you want a world-model summary across a chosen state basket
   - `meeting-brief`, `decision-note`, `red-team`, and `what-changed-for-markets` for PM-facing outputs
   - `capture-research` when Codex has already done live web research and you want the sources plus the final artefact persisted into Cato
   - `frontier-pack` when you want Codex to use the claim/state/decision stack as frontier-quality reasoning scaffolding without embedded API access
   - `capture-frontier` when the Codex-authored final output is ready to be written back into Cato
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

## Frontier-Assisted Claim / State / Decision Reasoning

The deterministic claim ledger, state engine, and PM decision layer are now bridged into Codex through a frontier pack workflow.

The split is:

- Cato prepares structured context from claims, states, decisions, watches, and evidence.
- Codex/GPT does the deeper analytical reasoning.
- Cato captures the final authored output back into the repo.

The commands are:

- `frontier-pack "topic" --mode decision`
- `frontier-pack "subject" --mode state`
- `frontier-pack "topic" --mode belief`
- `frontier-pack "Weekly investment meeting brief" --mode meeting`
- `capture-frontier .\path\to\generated-capture.json`

Each frontier pack writes three files into `cache/frontier-packs/`:

- `...-pack.json` = structured context for Codex
- `...-prompt.md` = operator prompt and exact next-step instructions
- `...-capture.json` = starter bundle to fill with the final Codex-authored output

This is the zero-API bridge. There is no fake embedded model call inside the CLI. Codex is the frontier model, and Cato gives it structured scaffolding plus a durable landing path.

## What Each Core Command Means

- `ingest`
  Archives new evidence, extracts text, creates metadata, drafts source notes, and now treats repo folders and repo archives as first-class ingest objects.

- `self-ingest`
  Converts rough personal notes into structured self-model notes.

- `compile`
  Rebuilds concept/entity pages, claim pages, indices, timelines, contradiction candidates, and synthesis candidates from the current corpus.

- `claims-refresh`
  Rebuilds the atomic claim ledger, writes `manifests/claims.jsonl`, refreshes `wiki/claims/`, and can snapshot the ledger for later diffs.

- `claim-diff`
  Compares the latest two claim snapshots so the repo can answer what has changed in the belief set rather than only what exists.

- `why-believe`
  Writes a belief brief that explains why the current repo believes something, using active claims, contested claims, and the grounded evidence map together.

- `ask`
  Writes a grounded memo from the current local corpus.

- `report`
  Writes a more deliberate report-style artefact with evidence, synthesis, counter-case, and open questions.

- `deck`
  Writes a Marp-friendly markdown deck for Obsidian/slide workflows.

- `surveil`
  Maintains a durable watch page for a live topic, thesis, company, or regime.

- `state-refresh`
  Maintains a canonical state page in `wiki/states/` for subjects such as Global Macro, US Inflation, or Geopolitical Risk.

- `state-diff`
  Compares the last two snapshots for a state so you can see what strengthened, weakened, and stayed the same.

- `regime-brief`
  Writes a cross-subject brief and refreshes the corresponding canonical page in `wiki/regimes/`.

- `watch`
  Creates or updates a persistent watch profile. The watch profile is the standing instruction object that tells Cato what the topic means, why it matters, which aliases/entities/concepts belong to it, and which triggers to keep in view.

- `capture-research`
  Imports a GPT/Codex research bundle. This is the bridge between live web research and the durable Cato corpus.

- `frontier-pack`
  Refreshes the deterministic claim/state/decision context, then writes a Codex-ready pack, prompt, and starter capture bundle.

- `capture-frontier`
  Imports a Codex-authored frontier bundle that may reference both local Cato sources and newly researched web URLs.

- `reflect`
  Reviews the self-model and updates the tension register.

- `meeting-brief`
  Writes a PM-facing brief that combines refreshed state pages, claim changes, and the self-model.

- `decision-note`
  Writes or refreshes a durable decision-support note in `wiki/decisions/`.

- `red-team`
  Writes the strongest counter-case, likely blind spots, and invalidation triggers for a topic.

- `what-changed-for-markets`
  Writes a state-led market-change brief so the repo can answer what shifted, not just what new documents landed.

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

## Belief -> State -> Decision Stack

The new operating order is:

1. source notes and reports provide grounded material
2. `claims-refresh` decomposes that into atomic claims
3. `state-refresh` turns the claim set into a current-state page
4. `regime-brief` aggregates states into a world-model surface
5. decision outputs use claims + states + self-model together

When you want frontier-quality reasoning on top of that stack, the next layer is:

6. `frontier-pack` prepares the structured context for Codex
7. Codex reasons over it, optionally does fresh web work, and writes the final bundle
8. `capture-frontier` stores that final output back into Cato

That is the core architectural upgrade. Cato no longer stops at notes and reports; it now maintains beliefs, current states, and mandate-aware decision surfaces.

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
- `Prepare-Frontier-Pack.cmd`
- `Import-Frontier-Bundle.cmd`
- `Run-Reflect.cmd`
- `Run-Doctor.cmd`
- `Open-Latest-Report.cmd`
- `Run-Claims.cmd`
- `Refresh-State.cmd`
- `Write-Regime-Brief.cmd`
- `Write-Decision-Note.cmd`
- `Write-Meeting-Brief.cmd`
- `Run-Red-Team.cmd`
- `Run-Market-Changes.cmd`

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
