# Lessons

Only durable, repo-specific lessons and guardrails belong here. Do not record transient fixes, one-off observations, or chat-only notes.

- The executable runtime remains Node-first; Python is available repo-locally through `python.cmd` / `py.cmd` when operating from the repo root, but do not assume a separate global Python toolchain or in-repo Python package manager.
- Prefer `cato.cmd` or direct `node` commands in PowerShell because `.ps1` wrappers can be blocked by execution policy.
- Use `doctor` as the promoted environment check for repo-local Python, browser automation, OCR readiness, and structural health instead of re-running ad hoc shell probes.
- Navigation/index pages under domain folders are map surfaces, not typed thesis/surveillance/self notes, and linting should treat them accordingly.
- Keep append-and-review material in `wiki/drafts/` and exclude it from grounded retrieval by default; draft notes are workspace, not canonical evidence.
- When maintenance standards tighten, backfill the live corpus through compile/refresh before trusting lint output; otherwise lint mostly reports legacy-shape debt instead of current regressions.
