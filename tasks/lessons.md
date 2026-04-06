# Lessons

Only durable, repo-specific lessons and guardrails belong here. Do not record transient fixes, one-off observations, or chat-only notes.

- The executable runtime remains Node-first; Python is available repo-locally through `python.cmd` / `py.cmd` when operating from the repo root, but do not assume a separate global Python toolchain or in-repo Python package manager.
- Prefer `cato.cmd` or direct `node` commands in PowerShell because `.ps1` wrappers can be blocked by execution policy.
- Use `doctor` as the promoted environment check for repo-local Python, browser automation, OCR readiness, and structural health instead of re-running ad hoc shell probes.
- Navigation/index pages under domain folders are map surfaces, not typed thesis/surveillance/self notes, and linting should treat them accordingly.
- Keep append-and-review material in `wiki/drafts/` and exclude it from grounded retrieval by default; draft notes are workspace, not canonical evidence.
- When maintenance standards tighten, backfill the live corpus through compile/refresh before trusting lint output; otherwise lint mostly reports legacy-shape debt instead of current regressions.
- Quote numeric-looking frontmatter strings on render and fall back from weak PDF-derived titles to the filename; otherwise valid source notes can reload with non-string titles and break downstream sort paths.
- From Node child-process workflows on Windows, prefer the real `py` / `python` launchers over repo-local `.cmd` shims; the shims are fine in an interactive repo shell but are not a reliable renderer bridge for pack-generation code.
- Treat `inbox/` as a git-ignored staging queue and `cache/pdf-packs/` as disposable operator artefacts; commit intentional ingested state and workflow code, not transient PDF handoff inputs.
- For image-heavy PDFs, use `pdf-pack` plus `capture-pdf` instead of trusting plain `ingest`; the baseline extractor is a fallback aid, not the final truth surface for visual documents.
- If a handoff sidecar already supplies `extracted_text`, ingest must be able to skip native extraction; otherwise the exact PDFs that need the handoff path can still fail inside the local parser.
- Large mixed PDF runs should be chunked by default; visually dense batches and high-page-count chart decks can overflow `pdf-pack` even when the general workflow is sound.
- Keep a direct single-document capture fallback for outlier PDFs that still break `pdf-pack`; use the same `capture-pdf` contract rather than inventing a second ingestion path.
- When retrying a problematic PDF workflow, prefer `capture-pdf --copy` until the run is stable; otherwise a failed attempt can move the staged file before debugging is finished.
- Retry-safe PDF capture merges must dedupe note-like fields such as `capture_notes`; repeated attempts on the same source should not compound operator notes into duplicate paragraphs.
- Pack-generated titles and `document_class` values are only first-pass hints; clean them in the capture bundle before capture when the inferred metadata is obviously weak.
- Info-only lint spikes after a large ingest batch usually mean enrichment debt on new notes and claims, not a structural ingest failure, as long as errors and warnings remain at zero.
- Broad all-corpus investment reports should not rely on generic lexical report routing; use curated section lenses that start from reviewed source notes and only use states/claims as supporting context.
- For broad investment reports, keep the route source-note-led unless evidence is genuinely thin, and build section prose from cleaned note sections or extracted-text takeaways rather than raw search excerpts or claim pages.
- PDF-handoff notes need explicit review-state metadata, and unreviewed chartpacks should stay downgraded until a visual-review trail exists.
- If a chartpack becomes report-critical, do not just clear the draft flag; add a page-route summary so the note can support qualitative cross-asset synthesis without pretending to be a machine-perfect numeric surface.
- Final intellectual outputs should be model-authored through the active terminal session and captured back into Cato; deterministic CLI prose is scaffolding unless it goes through a capture boundary.
- If a top-level command produces substantive memo, deck, surveillance, belief/state/decision, self-model, or postmortem prose, prepare a pack and capture the result back into the same output path rather than creating a second near-duplicate file.
- Raw `outputs/reports/` files are legacy operational history and must not feed the claim layer; canonical model-authored reports live in `wiki/reports/` with one current file per topic.
- When sweeping legacy report runs into archive, preserve the original filenames under `outputs/reports/archive/legacy-deterministic/`; changing archive filenames breaks historical markdown references for no benefit.
- Treat `tmp/` as scratch review space and keep it out of version control.
