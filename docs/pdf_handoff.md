# PDF Handoff

This file documents the zero-API PDF vision bridge between Codex/GPT and Cato.

## Why This Exists

The built-in PDF parser is useful for text-first documents but it is not enough for image-rich research PDFs, chart books, or visually dense market slide decks.

The operating split is:

- Codex/GPT = OCR, chart-reading, table-reading, and structured extraction over rendered PDF pages
- Cato = pack preparation, provenance, deterministic ingest, and durable storage

`pdf-pack` and `capture-pdf` are the bridge between those roles.

## When To Use This

Use the PDF handoff when:

- the PDF is mostly charts, figures, or scanned pages
- the baseline extract is visibly degraded
- titles, tables, or captions are being lost
- you need chart-reading and table-reading rather than only text recovery

Use plain `ingest` when the PDF is already text-first and the baseline extraction is clean enough to trust.

## Commands

Prepare a pack:

```powershell
.\cato.cmd pdf-pack --from inbox/drop_here --limit 8 --dpi 144 --max-pages 0
```

Prepare a larger batch:

```powershell
.\cato.cmd pdf-pack --from inbox/drop_here --limit 24 --dpi 144 --max-pages 0
```

Capture the authored extraction bundle:

```powershell
.\cato.cmd capture-pdf .\cache\pdf-packs\...\...-capture.json
```

## Workflow

1. drop PDFs into `inbox/drop_here/`
2. run `pdf-pack`
3. open the generated files in `cache/pdf-packs/`
4. let Codex/GPT inspect the rendered page images and, if useful, the original PDF path directly
5. replace the placeholder text in each generated `authored-extraction.md`
6. update the generated capture bundle with title, document class, tags, entities, concepts, and any figure refs worth preserving
7. run `capture-pdf`
8. let Cato ingest, compile, and file the PDFs through the normal source-note path

## Direct PDF Access Vs Rendered Pages

In a live Codex session, the model can often inspect the original local PDF path directly.

That is useful, but it is not the whole contract.

The rendered page images still matter because they provide:

- a stable review surface that does not depend on a specific terminal or viewer capability
- page-by-page visual provenance inside the generated pack
- a deterministic handoff artefact that can be checked before capture

Use the raw PDF path when it helps. Treat the rendered pages as the default shared review surface.

## What The Pack Contains

Each pack writes:

- `...-pack.json`
- `...-prompt.md`
- `...-capture.json`
- one document folder per PDF with:
  - `baseline-extract.txt`
  - `authored-extraction.md`
  - `pages/page-###.png`

The pack keeps the original PDFs in place. `capture-pdf` is the point where the normal ingest move/copy policy applies.

## What Gets Version-Controlled

Treat the workflow in two phases.

Transient operator material:

- PDFs sitting in `inbox/drop_here/`
- generated handoff packs under `cache/pdf-packs/`
- temporary prompt and capture files while extraction is in progress

These are staging artefacts and should remain uncommitted.

Canonical repo material after intentional capture:

- archived PDFs under `raw/`
- extracted artefacts under `extracted/`
- source notes under `wiki/source-notes/`
- append-review drafts under `wiki/drafts/append-review/`
- refreshed manifests and maintained wiki surfaces

That is the durable state worth reviewing and committing.

## Important Constraint

This workflow does not embed a direct external model call into the CLI.

That is deliberate.

The product decision is:

- keep Cato agent-driven
- keep the CLI deterministic
- use handoff files as the integration boundary

## Quality Bar For Authored Extraction

The authored extraction should aim to preserve:

- clean readable text
- page-level figure and chart interpretation when material
- table structure and key numeric rows when material
- visible titles, authors, dates, and source identifiers
- explicit uncertainty when an image, chart, or table is ambiguous

Do not compress the document into a summary if the point of the handoff is faithful extraction.

## Bundle Shape

See:

- `commands\pdf-capture.example.json`

The PDF capture bundle supports:

- `source_path` for the original inbox PDF
- `extracted_text` or `extracted_text_path` for the Codex-authored extraction
- `title`, `document_class`, `author`, `date`, and URLs for source metadata
- `tags`, `entities`, `concepts`, and `figure_refs` for structured ingest hints

## Common Failure Modes

- If `capture-pdf` says no authored extraction text was provided, the placeholder marker is still present or the bundle points to the wrong file.
- If page rendering fails, the pack can still be useful through the original PDF paths, but the visual handoff is degraded and should be treated more carefully.
- If the baseline extract and the authored extraction disagree materially, trust the authored extraction only where the underlying page evidence supports it.
- If the PDF should stay out of version control, do not capture it into canonical Cato state until that storage decision is intentional.
