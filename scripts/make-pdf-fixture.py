"""Generate a tiny two-page PDF used by the E2E test. Run once; commit the output."""
import os

OUT = "apps/web/public/samples/sample.pdf"
PAGES = ["Hello page one", "Hello page two"]


def content(text, y):
    return f"BT /F1 24 Tf 72 {y} Td ({text}) Tj ET"


def make_pdf():
    font_obj = 3 + len(PAGES) * 2
    objects = []
    for i, text in enumerate(PAGES):
        stream = content(text, 700)
        page_obj = 3 + i * 2
        content_obj = page_obj + 1
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Contents {content_obj} 0 R "
            f"/Resources << /Font << /F1 {font_obj} 0 R >> >> >>"
        )
        objects.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")

    catalog = "<< /Type /Catalog /Pages 2 0 R >>"
    kids = " ".join(f"{3 + i * 2} 0 R" for i in range(len(PAGES)))
    pages = f"<< /Type /Pages /Kids [{kids}] /Count {len(PAGES)} >>"
    all_objects = [catalog, pages] + objects + [
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    ]

    out = "%PDF-1.4\n"
    offsets = []
    for index, obj in enumerate(all_objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n{obj}\nendobj\n"

    xref = len(out)
    out += f"xref\n0 {len(all_objects) + 1}\n0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n"
    out += (
        f"trailer\n<< /Size {len(all_objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n"
    )
    return out


os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="latin-1") as f:
    f.write(make_pdf())
print("wrote", OUT)
