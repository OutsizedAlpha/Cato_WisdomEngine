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
