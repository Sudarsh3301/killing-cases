"""Replace thin local text (a scanned PDF, below 300 characters a page) with CourtListener's own OCR text.
File names start with <entry>[-<attachment>]-..., which identify the RECAP document on the matter's docket."""
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

API = "https://www.courtlistener.com/api/rest/v4"
KEY = next(l.split("=", 1)[1].strip().strip('"') for l in (Path(__file__).parent / "../.env").read_text().splitlines() if l.startswith("COURTLISTENER_API_KEY="))

def get(url, params=None):
    if params: url += "?" + urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": f"Token {KEY}"}), timeout=60) as r: return json.load(r)
        except Exception:
            if attempt == 2: raise
            time.sleep(5)

ROOT = Path(__file__).parent
for matter in (sys.argv[1:] or [p.name for p in ROOT.iterdir() if (p / "profile.json").exists()]):
    docket = int(re.search(r"/docket/(\d+)/", json.loads((ROOT / matter / "profile.json").read_text())["courtlistener_docket"]).group(1))
    print(f"== {matter} (docket {docket})")
    for txt in sorted((ROOT / matter / "text").glob("*.txt")):
        local = txt.read_text(encoding="utf-8"); pages = local.count("\f") + 1
        if len(local) / pages >= 300: continue
        m = re.match(r"(\d+)(?:-(\d+))?-", txt.name)
        entry, att = int(m.group(1)), (int(m.group(2)) if m.group(2) else None)
        docs = get(API + "/recap-documents/", {"docket_entry__docket__id": docket, "docket_entry__entry_number": entry,
                                                   "fields": "attachment_number,ocr_status,plain_text"})["results"]
        d = next((d for d in docs if d["attachment_number"] == att), None)
        remote = (d or {}).get("plain_text") or ""
        if len(remote) > len(local) * 2:
            txt.write_text(remote, encoding="utf-8")
            print(f"  {txt.name:58} {len(local):8,} -> {len(remote):9,} ch (CourtListener OCR)")
        else:
            print(f"  {txt.name:58} {len(local):8,} ch, no better text on CourtListener  <- needs local OCR")
