# Design: a typed argument map that is attacked to harden a brief or test a case strategy

**Date:** 2026-11-02
**Status:** The original design, kept as written before the build. Results are in [results.md](results.md). In the code and this document the argument map is called the "twin".

## Goal

Give a litigator a twin of the matter that they can attack before the other side does. It has 2 uses:

- **Harden a brief.** Before filing, find the attacks on the draft, play them out, and return a redline that closes the exposures.
- **Test a case strategy.** Before or while drafting, take the theory and the arguments the team plans to make, find where they are exposed on this record, and compare them with alternative strategies.

In both uses the litigator gets:

1. the attacks they have not seen, each anchored to the record or to an authority;
2. how each attack plays out over 2 exchanges, judged under the legal standard that applies;
3. what to change: a redline for a brief, or a revised strategy with tasks (evidence to obtain, a deposition to take) for a strategy. Each change names the attacks it closes.

The bar: a litigator gets something they could not get before, and can trust it enough to act on it.

**The demo is a replay.** For each test matter, the history and the outcome are known. The twin takes the side that lost, sees only what that side had on its filing date, and attacks the brief. Then the real history is revealed step by step: the other side's papers, the bench, the ruling. The demo shows which of the court's reasons the twin flagged before filing, and what the hardened brief would have looked like.

## Why this shape

- **A structure, not text.** Attacks need an exact target, "what if" needs state that can change, and a redline needs to point at the node it fixes.
- **Inferences are nodes** (the Argument Interchange Format's shape). The most common legal attack is "the fact and the rule are right, but the step does not hold here": a case is distinguishable, an exception applies, the clause has another reading. That needs a node to target.
- **3 attack types** (from ASPIC+): undermine a premise, undercut an inference, rebut a conclusion.
- **Schemes with critical questions** (adapted from Walton). The questions are the red team's checklist for each node. Their value is coverage and traceability.
- **The legal standard decides status.** Each claim carries our goal, the burden and the standard, as in Carneades, so status is computed the way a court would compute it.
- **Frontier models with tools.** The model reads the brief whole and searches the record and the case law. An attacker that searches for the overlooked case is the frontier part.
- **Verification is the trust layer.** Code checks every anchor quote against its source and every citation against CourtListener.

## Non-goals

- No database and no product UI. The viewer is a local workbench.
- No contracts in this POC.
- No odds. Strength is shown as exposure (closed, contested, open).
- No multi-agent debate beyond the depth-2 exchange.
- No privileged data. The test set is public filings.

## Test set

3 public summary-judgment matters in `matters/` (see its `README.md`). In each one the twin takes the side that lost.

| Matter | Our side and brief (lost) | Papers it answers | What happened | Stresses |
|---|---|---|---|---|
| **Hartford v. Carson Madrona** (N.D. Cal.) — lead demo | Ohio Security and American Fire, movants: motion and memorandum (D.I. 64) | Carson Madrona's motion (context) | Denied. The endorsement governs, not the coverage form; "caused, in whole or in part" means proximate cause (D.I. 81; tentative D.I. 79) | Reading a contract clause |
| **Batten v. K-VA-T Food Stores** (N.D. Ga.) | The plaintiff, non-movant: opposition, response to the statement of facts, additional facts (D.I. 42–44) | Food City's motion, brief and statement of facts (D.I. 29–31) | Food City's motion granted: no genuine dispute that its reason was a pretext (D.I. 57; R&R D.I. 53) | Record (7 depositions) |
| **Thomson Reuters v. Ross** (D. Del.) | Ross, non-movant: opposition to the infringement motion (D.I. 723) | Thomson Reuters' motion and brief (D.I. 674, 694) | Thomson Reuters' motions granted, Ross's denied (D.I. 772; opinion D.I. 770) | Authority |

Each matter has `profile.json` (court, side, motion role, filing date, outcome), `manifest.csv`, `raw/*.pdf` and `text/*.txt` (pages separated by form feeds).

`manifest.csv` columns: `role` (`brief`, `motion`, `record`, `heldout`, `context`), `known_at_filing` (`yes`, `no`, `n/a`), `file`, `url`.

**The freeze rule.** The pipeline reads only files with role `brief`, `motion`, `record` or `context` **and** `known_at_filing = yes`. `heldout` files (the later papers, the bench, the ruling) are opened only by the replay's reveal rounds and the evaluation. They never reach a prompt that builds, attacks or defends.

## Input modes

| Mode | Input | Hardening output |
|---|---|---|
| `brief` | A brief, with the papers it answers | A redline on the brief |
| `strategy` | A strategy statement: the relief, the theory, and the arguments the team plans to make, in plain text of any length | A revised strategy (arguments to drop, add or re-route) and tasks (evidence to obtain, a deposition to take, research to do) |

Both modes build the same twin. In strategy mode, a premise the record does not support yet stays `unanchored`. That is a finding: it is the evidence the strategy still needs. Several strategies can run on the same matter, and the viewer compares them element by element.

## The twin: a typed inference graph

### Data model

```ts
type Pointer = { file: string | null; page: number | null; quote: string; verified: boolean; sealed?: boolean };   // sealed: cited, but not in the public record

type Standard =
  | "no_genuine_dispute"     // movant on an element it must prove
  | "absence_of_evidence"    // movant on an element the other side must prove
  | "genuine_dispute"        // non-movant: a reasonable fact-finder could find for us
  | "question_of_law";       // decided by the court on the text, e.g. an unambiguous clause

type Claim = {
  id: string; text: string;
  level: "relief" | "element" | "sub_issue";   // relief sought → elements → sub-issues
  parent: string | null;
  ourGoal: "establish" | "defeat";
  burden: "us" | "them";
  standard: Standard;
};

type Premise = {
  id: string; text: string;
  kind: "fact" | "rule" | "holding" | "text";   // "text" = the words of a contract, statute or document
  anchors: Pointer[];
  citation?: { text: string; courtListenerId?: string; verified: boolean };
  span?: { start: number; end: number };        // where the brief or strategy statement states it
  implicit: boolean;                            // true when the input relies on it without stating it
};

type Inference = {
  id: string;
  scheme: SchemeId;
  from: string[];                               // premise or claim ids
  to: string;                                   // claim id
  warrant: string;                              // why the step holds, in one sentence
  criticalQuestions: { q: string; status: "open" | "answered_in_input" | "raised" }[];
  span?: { start: number; end: number };
};

type Attack = {
  id: string;
  type: "undermine" | "undercut" | "rebut";     // premise | inference | claim
  target: string;
  lane: "authority" | "record" | "structure" | "baseline";
  question?: string;                            // the critical question it raises
  text: string; anchors: Pointer[];
  rank: number;                                 // 1 = most damaging, set by the red team
  beyondBaseline: boolean;
};

type Response = {
  id: string; answers: string;                  // attack id
  move: "rebut" | "undercut" | "reroute" | "redraft";
  text: string; anchors: Pointer[];
  edit?: { quote: string; replacement: string };                        // brief mode
  strategyChange?: { kind: "drop" | "add" | "reroute"; text: string };  // strategy mode
  task?: { kind: "obtain_evidence" | "depose" | "research"; text: string };
};

type Exchange = {                               // the depth-2 simulation for one attack
  attack: string; response: string; counter: string | null;
  ruling: { exposure: "closed" | "contested" | "open"; reason: string };
};

type Twin = {
  matter: string; mode: "brief" | "strategy"; strategyName?: string;
  claims: Claim[]; premises: Premise[]; inferences: Inference[];
  attacks: Attack[]; responses: Response[]; exchanges: Exchange[];
};
```

| Attack type | Target | Legal form |
|---|---|---|
| Undermine | a premise | "The record does not show that." "The citation does not support the fact." |
| Undercut | an inference | "The case is distinguishable." "An exception applies." "The clause has another reasonable reading." |
| Rebut | a claim | "Contrary authority holds the opposite." "The element fails on another ground." |

### Schemes and critical questions (POC catalog, adapted from Walton)

| Scheme | Critical questions |
|---|---|
| `rule_application` | Are all the rule's conditions met on these facts? Does an exception apply? Is the rule binding in this forum and still good law? |
| `precedent_holding` | Is the case binding or only persuasive here? Was it limited, distinguished or overruled later? Is the proposition its holding or dicta? |
| `precedent_analogy` | Are the cases alike in the respects that mattered to the court? Is there a relevant difference? Is there a closer case that went the other way? |
| `witness_testimony` | Was the witness in a position to know? Is the testimony consistent with the witness's other statements and with the documents? Is the witness interested or biased? |
| `documentary` | Does the document say what the brief says it says? Is it complete and authentic? Does another document qualify or contradict it? |
| `expert_opinion` | Is the expert qualified in this field? Is the opinion based on the evidence in this record? Do other experts disagree? |
| `circumstantial` | Does the inference from these facts follow, or is there an equally likely explanation? Are facts missing that the inference needs? |
| `interpretation` | Is the meaning plain, or is there another reasonable reading? Does another provision, a definition or an endorsement change it? Does a canon of construction point the other way? |

### Standards (summary judgment)

| Our position | `standard` | Our side is exposed on the claim when |
|---|---|---|
| Movant, we must prove the element (Hartford, on coverage facts) | `no_genuine_dispute` | an attack with a verified record anchor undermines a material premise, or an undercut on the inference is open |
| Movant, the other side must prove it | `absence_of_evidence` | an attack points to a verified record passage that supports the element |
| Non-movant, we must prove the element (Batten, on pretext) | `genuine_dispute` | every premise that supports the element is undermined, or every inference to it is undercut, with the attacks open |
| Non-movant, the other side must prove it (Ross, on infringement) | `genuine_dispute` | every premise we offer to create a dispute is undermined or undercut, with the attacks open |
| Either side, a question of law (Hartford, on which clause governs and what "caused, in whole or in part" means) | `question_of_law` | an undercut or rebut on the interpretation inference is open. Record anchors matter less; the text and the authorities decide |

### Status (computed in code)

- A **premise** is `supported` with at least 1 verified anchor, `unanchored` with none, and `undermined` when an attack on it with verified anchors is open.
- An **inference** `holds` unless an undercut on it is open, or a critical question is `raised` with no answer.
- A **claim** is `secure`, `exposed` or `lost` for our side, by the row of the standards table that applies. `exposed` means the decisive attacks are `contested`, and `lost` means at least 1 is `open`.
- An attack is open until an exchange rules it `closed` or `contested`.

## Pipeline

All steps are plain functions in `src/`, run with `tsx`. Each step writes JSON to `out/<matter>/<mode>/`, so any step can be re-run alone and every model output stays inspectable. The frontier model is set in the POC's config. The data is public, so any provider can be used.

1. **Index the record (code).** Split each frozen record file into sections of about 3,000 characters, keeping the page number. Build a full-text (BM25) index.
2. **Convert the input into the twin.** This is the step everything else depends on: every later step works on the graph's node ids. The work is split by one rule: the frontier model writes, a decision model judges bounded questions at volume, and code does everything deterministic.

   | Work | Done by |
   |---|---|
   | Parse headings; resolve citations to file and page; check that quotes exist; compute status | Code |
   | Claim skeleton; premises and inferences with warrants; implicit premises; the citation map | Frontier model, with the whole input in context and the record through `record_search` |
   | Choose the right quote among candidate passages; check that a passage supports its premise; check whether a critical question is answered in the input; check the scheme | Decision model (Jev) |
   | Decision-model answers with a probability between 0.2 and 0.8 | Escalated to the frontier model |

   The 5 stages:
   1. *Claim skeleton.* Code parses the argument headings of the brief (or the points of a strategy statement) and the grounds in the papers it answers. The model turns them into the claim tree (relief, then elements, then sub-issues) and gives each claim its goal, burden and standard from `profile.json` and the standards table.
   2. *Premises and inferences, section by section.* For each section of the input, the model lists the premises the section relies on (fact, rule, holding, or the text of a document) and the inferences that link them to the section's claim, each with a scheme from the catalog and a one-sentence warrant. Every premise keeps the citation the input itself gives, and its span in the input.
   3. *Resolve the input's own citations, in code where possible.* Each brief cites the record in its own format. In the test set: Batten cites by deponent and page:line ("Batten Dep. 20:24-21:19") and affidavit paragraph; Hartford by exhibit, Bates number and joint-index page ("Exh. 5, p. Hartford_006157 [Joint Index 00162]"); Ross by declaration name and docket number ("Canter Decl.", "D.I. 675 at 2"). So the model first builds a **citation map** for the input: each citation form (deponent, exhibit number, Bates prefix, declaration name, docket number) mapped to a file in the manifest. Code then resolves the page or paragraph, and `record_search` finds the exact quote there, or anywhere in the file as a fallback. Case citations go to the CourtListener citation-lookup API, and the holding is anchored to a quote from the opinion. A citation that cannot be resolved leaves the premise `unanchored`. A citation to a sealed or missing document is marked `sealed` and is not counted against the input.
   4. *Implicit premises.* The model adds the unstated premises each inference needs, marked `implicit: true`, and anchors them through `record_search` where the record supports them. These are often the best targets for an undermine, because the input never defended them.
   5. *Critical questions.* Code instantiates them on each inference from the scheme catalog. The model marks one `answered_in_input` only when it quotes where the input answers it.
3. **Verify (code).**
   - Each anchor quote must be found in its file. Matching normalises whitespace and tolerates small OCR differences (a fuzzy match above a fixed threshold). A quote that is not found sets `verified: false`.
   - Each citation goes through the CourtListener citation-lookup API.
   - **Support, not only existence.** A quote that exists can still fail to support its premise. For each anchor, the decision model answers one Choice question: does the passage support, contradict or say nothing about the premise? An anchor that does not support its premise sets `verified: false`, and a contradicting one is recorded as a candidate undermine for the record attacker.
   - The decision model re-types each inference's scheme with one Choice question over the catalog. A disagreement with the frontier model is flagged, not silently fixed.
4. **Red team (3 attacker agents and a baseline).** Each attacker works through the open critical questions in its lane, with a budget of tool calls, and ranks its attacks.
   - *Authority:* tools `courtlistener_search` (opinions in the forum's circuit, decided before the filing date), `citing_opinions(id)`, `read_opinion(id)`. It looks for negative treatment, holdings stated too broadly, binding adverse cases not cited, and canons of construction that point the other way.
   - *Record:* tool `record_search`. It looks for passages that contradict or qualify each fact premise, and facts asserted with no anchor.
   - *Structure:* no tools. It checks each claim against its standard: missing elements, inferences with an unanswered critical question, claims that rest on 1 premise.
   - *Baseline:* one plain prompt: "You are opposing counsel. Write the strongest opposition to this brief." Its points become attacks with `lane: "baseline"`.
   - `beyondBaseline` is true when the baseline does not make the same point. Unverified attacks are shown as unverified and excluded from status.
5. **Blue team (frontier model, same tools).** For each attack, the best response: rebut, undercut, re-route or redraft, with an edit (brief mode), a strategy change (strategy mode), and a task when the fix is outside the text.
6. **Exchange (depth 2).** Attack, our response, the opponent's counter, then a ruling by a judge persona given the court and the standard from `profile.json`: `closed`, `contested` or `open`, with a reason.
7. **Harden (code).** Apply the changes from responses ruled `closed` or `contested` to a copy of the twin, recompute status, and output a before/after table per claim, plus the redline or the revised strategy with tasks.
8. **What if (code only).** `simulate(twin, change)`: remove an exhibit, concede a premise, drop an authority, apply or revert a change. It recomputes status and returns what changed.
9. **Compare strategies (code).** For 2 or more twins of the same matter, line up the claims and their status, and list the attacks each strategy closes or opens.

The authority attacker's case-law search is limited to opinions decided before the filing date, so it cannot find the case's own later rulings.

## The demo: a replay round

Per matter, in the viewer, as a timeline the presenter steps through:

1. **Freeze.** The filing date, the losing brief, and only the record known then. The twin builds, and its claims show their status.
2. **Red team.** The attacks appear on the nodes they target, ranked, with the depth-2 exchanges.
3. **Reveal: the other side's papers.** The real opposition or reply opens. A frontier call lists its arguments with quotes, and each one is linked to the twin's matching attack, or marked missed.
4. **Reveal: the bench.** Hartford: the tentative order (D.I. 79). Batten: the magistrate judge's report and recommendation (D.I. 53). Thomson Reuters v. Ross: the hearing transcript (D.I. 769), with the judge's real questions next to the twin's predicted bench questions.
5. **Reveal: the ruling.** The court's reasons, each marked flagged (with its rank before filing) or missed.
6. **Hardened replay.** The blue team's redline or strategy for the losing side. Then the court's actual reasons are played as attacks against the hardened twin, and the judge persona rules on each: closed, contested or open. **This round is a counterfactual and is labelled as one.**

## Viewer (local workbench)

One HTML file and a small Node server on the desktop, opened in the built-in browser.

- **Timeline** across the top: the 6 replay rounds. Each reveal unlocks the next panel.
- **Input**: the brief or strategy statement, with the redline overlaid. Click a sentence to see its node.
- **Twin**: relief, then claims, inferences and premises, coloured by status, with attack badges on their targets. What-if toggles on exhibits, premises, authorities and changes recompute at once.
- **Exchange**: for the selected attack, the depth-2 tree with the ruling and every anchor, clickable to its source page.
- **Changes**: the redline or the revised strategy and tasks, with the attacks each closes and the before/after status.
- **Compare**: 2 or more strategies side by side.

Added feature: **label overrides**. A person can rewrite any status, edge or ruling, and the twin recomputes. The override is stored with the old value, the new value and the time.

## Evaluation

All of it comes from the replay. The thresholds are starting values.

1. **The other side's arguments:** ≥ 70% surfaced across the 3 matters (round 3).
2. **The court's reasons:** each one flagged before filing, or the miss explained. Report the rank each one had (round 5).
3. **Beyond the baseline:** at least 1 attack beyond the baseline that matches a real argument or reason, in at least 2 of the 3 matters.
4. **Record attacks (Batten):** Food City's response to the plaintiff's additional facts (D.I. 50) marks facts as disputed or unsupported. The record attacker should flag ≥ 70% of them.
5. **Trust:** ≥ 95% of the anchors shown as verified are found in their source. No unverified citation is shown as verified.
6. **Strategy mode:** run it on each brief's argument headings alone (the planned arguments, without the text). Report how many of brief mode's attacks it also surfaces, and which premises it leaves `unanchored`.
7. **Cost and time** per matter and mode.
8. **A lawyer's read** of the Hartford hardened replay: would they have made at least 1 of the changes before filing?

## Risks

- **The conversion is the single point of failure.** A wrong graph poisons every later step. Mitigations: the conversion runs in stages with inspectable output, the input's own citations are resolved in code, every anchor is checked for existence and for support, a second model checks the schemes, and unanchored or implicit premises are shown plainly.
- **OCR noise** in depositions can make true quotes fail to verify. Tune the fuzzy threshold on Batten first.
- **Redacted and sealed material** in Thomson Reuters v. Ross limits the record attacker there. That matter mainly tests the authority attacker.
- **CourtListener has no treatment flags**, so treatment is judged from the citing opinions' text.
- **The judge persona can be lenient or harsh.** Rounds 3 and 5 do not depend on its rulings, only round 6 does.
- **Cost.** Each agent has a budget of tool calls, and cost is reported per step.

## If it works

Possible uses: as the input to brief review and hearing rehearsal, as a redline in a drafting editor, as a strategy step before drafting, and, with contract attackers, for contracts.
