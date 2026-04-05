#!/usr/bin/env python
import argparse
import json
import os
import sys


def render_with_fitz(input_path, output_dir, dpi, max_pages):
    import fitz

    document = fitz.open(input_path)
    scale = float(dpi) / 72.0
    matrix = fitz.Matrix(scale, scale)
    rendered_pages = []

    for index in range(document.page_count):
        if max_pages and len(rendered_pages) >= max_pages:
            break
        page = document.load_page(index)
        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        filename = f"page-{index + 1:03d}.png"
        output_path = os.path.join(output_dir, filename)
        pixmap.save(output_path)
        rendered_pages.append(
            {
                "page": index + 1,
                "path": filename,
                "width": pixmap.width,
                "height": pixmap.height,
            }
        )

    metadata = document.metadata or {}
    return {
        "renderer": "pymupdf",
        "page_count": document.page_count,
        "rendered_pages": rendered_pages,
        "metadata": {
            "title": metadata.get("title", "") or "",
            "author": metadata.get("author", "") or "",
            "subject": metadata.get("subject", "") or "",
        },
    }


def render_with_pdfium(input_path, output_dir, dpi, max_pages):
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(input_path)
    rendered_pages = []
    scale = float(dpi) / 72.0

    for index in range(len(document)):
        if max_pages and len(rendered_pages) >= max_pages:
            break
        page = document[index]
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil()
        filename = f"page-{index + 1:03d}.png"
        output_path = os.path.join(output_dir, filename)
        image.save(output_path)
        rendered_pages.append(
            {
                "page": index + 1,
                "path": filename,
                "width": image.width,
                "height": image.height,
            }
        )

    return {
        "renderer": "pypdfium2",
        "page_count": len(document),
        "rendered_pages": rendered_pages,
        "metadata": {"title": "", "author": "", "subject": ""},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--dpi", type=int, default=144)
    parser.add_argument("--max-pages", type=int, default=0)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    last_error = None
    for renderer in (render_with_fitz, render_with_pdfium):
        try:
            result = renderer(args.input, args.output_dir, args.dpi, args.max_pages)
            print(json.dumps({"ok": True, **result}))
            return 0
        except Exception as exc:
            last_error = f"{renderer.__name__}: {exc}"

    print(json.dumps({"ok": False, "error": last_error or "No PDF renderer available."}))
    return 1


if __name__ == "__main__":
    sys.exit(main())
