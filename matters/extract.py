"""Extract text from <matter>/raw/*.pdf into <matter>/text/*.txt with PyMuPDF.
Page breaks are kept as form feeds so page numbers survive for pointers.
Prints, per file: pages, characters, and pages with almost no text (likely scanned, need OCR)."""
import sys
from pathlib import Path
import fitz

ROOT = Path(__file__).parent
for matter in (sys.argv[1:] or [p.name for p in ROOT.iterdir() if (p / "raw").is_dir()]):
    raw, out = ROOT / matter / "raw", ROOT / matter / "text"
    out.mkdir(exist_ok=True)
    print(f"== {matter}")
    for pdf in sorted(raw.glob("*.pdf")):
        try:
            with fitz.open(pdf) as doc:
                pages = [p.get_text() for p in doc]
        except Exception as e:
            print(f"  {pdf.name:58} ERROR {e}"); continue
        (out / (pdf.stem + ".txt")).write_text("\f".join(pages), encoding="utf-8")
        empty = sum(1 for t in pages if len(t.strip()) < 50)
        flag = "  <- needs OCR" if empty > len(pages) / 2 else ""
        print(f"  {pdf.name:58} {len(pages):4} p {sum(map(len, pages)):9,} ch  {empty:3} empty{flag}")
