# Matter-twin POC test set

3 public federal summary-judgment matters from CourtListener RECAP, chosen by hand so that each one stresses a different detector.

In each matter the twin takes **the side that lost**, so the replay can show whether it flagged the court's reasons before filing.

| Matter | Court | Our side (lost) and brief | Papers it answers | Outcome | Stresses |
|---|---|---|---|---|---|
| `hartford-v-carson-madrona` (lead demo) | N.D. Cal. (Chhabria, J.), 9th Cir. | Ohio Security / American Fire, movants (D.I. 64) | Carson Madrona's motion (63, context) | Denied (81; tentative 79): the endorsement governs; "caused, in whole or in part" means proximate cause | Reading a contract clause |
| `batten-v-kvat` | N.D. Ga. (Ray, J.; R&R by Johnson, M.J.), 11th Cir. | Plaintiff, non-movant: opposition (42), response to SMF (43), additional facts (44) | Food City's motion, brief, SMF (29–31) | Food City's motion granted (57; R&R 53): no genuine dispute on pretext | Record: 7 depositions |
| `tr-v-ross` | D. Del. (Bibas, J.), 3d Cir. | Ross, non-movant: opposition to the infringement motion (723) | Thomson Reuters' motion and brief (674, 694) | TR's motions granted, Ross's denied (772; opinion 770) | Authority |

## Layout

```
<matter>/
  profile.json   court, side, motion role, proceeding, notes
  manifest.csv   role,known_at_filing,file,url  (role: brief | motion | record | heldout | context)
  raw/           the PDFs, as filed
  text/          one .txt per PDF, pages separated by form feeds (\f)
```

The pipeline reads only `brief`, `motion`, `record` and `context` files with `known_at_filing = yes` (the freeze rule). `heldout` files are the later papers, the bench and the ruling: only the replay's reveal rounds and the evaluation open them. `context` is background (complaint, a co-party's motion).

## How the text was made

1. `extract.py`: the PDF's own text layer, with PyMuPDF.
2. `fetch_ocr.py`: where that layer is thin (below 300 characters a page, i.e. scanned), CourtListener's own OCR text replaces it.
3. Tesseract 5.3.4 at 200 dpi for the 4 files CourtListener had no good text for: Batten D.I. 35 and 46-0, Hartford D.I. 64-4 and 64-7.

## Known limits

- `tr-v-ross`: many exhibits are redacted, and Appendix A to the opinion (771) is sealed.
- `hartford-v-carson-madrona`: the final order is 5 pages and decides 4 motions at once, so it says little about each argument. The tentative order (79) is 1 page.
- `batten-v-kvat`: the attachments to D.I. 29 and 31 have no descriptions on the docket. They are named `*-msj-exhibit` and `*-brief-exhibit` until someone reads them.
- OCR text has errors, mostly line numbers and stamps in depositions. The pointer check must normalise whitespace and allow small differences.
