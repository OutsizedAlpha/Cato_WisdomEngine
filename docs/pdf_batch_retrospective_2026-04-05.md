# PDF Batch Retrospective

This note records the local truth from the 24-PDF batch run on 2026-04-05.

## Outcome

- 24 staged PDFs were ingested into canonical Cato state.
- The inbox was emptied through the handoff path rather than plain `ingest`.
- Final live lint after the batch was:
  - `0` errors
  - `0` warnings
  - `62` infos

Those infos are enrichment backlog on the new notes and claims, not structural ingest failure.

## What Failed

### 1. `pdf-pack` did not scale cleanly to the whole batch

The attempted 24-document run failed with:

- `Maximum call stack size exceeded`

In practice, the reliable route was chunking the batch into smaller packs rather than forcing one oversized run.

### 2. One chart deck still broke the generic pack flow

`Markets Interactive Chart Pack.pdf` overflowed the pack path even as a single-document run.

The working fallback was:

- create a direct single-document capture bundle
- write the authored extraction manually
- feed it through `capture-pdf`

### 3. Handoff extraction did not fully bypass the native parser

Even when a bundle already supplied `extracted_text`, `ingest` still tried to run the local PDF parser first.

That defeated the point of the handoff path for exactly the PDFs that needed it most.

This was fixed in `src/ingest.js` so sidecar-supplied `extracted_text` can bypass native extraction.

### 4. Retrying capture duplicated operator notes

Repeated attempts on the same source caused `capture_notes` to accumulate duplicate paragraphs.

This was fixed in `src/pdf-handoff.js` by deduplicating merged note blocks.

### 5. Bundle metadata still needed operator cleanup

Titles and `document_class` inference were often a good starting point, but not reliable enough to trust blindly across a mixed research batch.

Manual cleanup of the capture bundle remained necessary for:

- paper titles
- chart-pack titles
- document classes on visually dense notes

## What Worked

- Rendered-page handoff plus Codex-authored extraction worked for the bulk of the set.
- `pdfplumber` was a materially stronger local text pass than the built-in stream parser for many text-first PDFs.
- `capture-pdf` remained the right integration boundary once the native-parser bypass was fixed.
- The draft/source-note split held up correctly during the batch.

## Operator Rules Going Forward

Use these as the default batch rules:

- Start larger runs in chunks of roughly 6-12 PDFs, not one oversized pack.
- If one document still breaks `pdf-pack`, isolate it and use a direct single-document capture bundle.
- Clean title and `document_class` values in the capture bundle before capture.
- When debugging or retrying an outlier, prefer `capture-pdf --copy` until the run is proven clean.
- Treat info-only lint growth after a large batch as enrichment debt, not as proof that ingest failed.

## Remaining Limitation

The repo now has a reliable fallback path for problematic chart decks, but the root overflow inside `pdf-pack` for certain high-page-count or visually dense PDFs is still not fully eliminated.

That means the current product stance is:

- generic handoff path for most PDFs
- chunking for larger runs
- direct bundle fallback for outliers
