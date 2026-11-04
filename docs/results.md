# How we tested, and what we measured

All numbers come from one replayed case, *Hartford Fire v. Carson Madrona* (N.D. Cal. No. 23-cv-06259-VC). The headline numbers are in [`results/hartford.json`](../results/hartford.json), written by `scripts/export_results.py` from the pipeline output.

## The replay

1. **Freeze.** The AI takes the side that lost: Ohio Security and American Fire, who moved for partial summary judgment on 2 January 2025. It sees the brief and the 18 record files filed by that day. The other side's papers, the tentative order and the final order are held out.
2. **Map.** A large language model turns the brief into an argument map: 14 claims, 25 reasoning steps (inferences) and 110 premises, of which 24 are premises the brief relies on but never states.
3. **Check the map.** Each stated premise is matched to a quote in the record, and each case citation is looked up on CourtListener.
4. **Red team.** Three attacker agents work through the map: one searches case law (60 opinions from CourtListener, all decided before the filing date), one the record, one the structure of each claim. Each attack has a target in the map: it undermines a premise, undercuts a reasoning step, or rebuts a claim. 47 attacks passed the checks: every quote was found in the record, and every cited opinion predates the filing.
5. **Exchange.** A defence agent answers each attack and proposes edits. An opposing-counsel agent counters. A judge agent rules on each attack: closed, contested or open.
6. **Score.** The court's order (20 March 2025) is revealed. Each of its 7 deciding reasons is matched to the highest-ranked attack that makes the same point.
7. **Rewritten-brief replay.** The defence's edits that held are applied, and a separate judge agent replays the court's 7 reasons against the rewritten brief.

**Leakage controls.** Agents read a profile with no outcome and no docket link. Case-law search was limited to opinions decided before the filing date and excluded this case. The answer key was stored outside every folder the agents could read.

**Matching.** The court's reasons were matched to attacks and to the baseline by hand; see [`results/hartford-court-reasons.json`](../results/hartford-court-reasons.json). An automatic matcher (the decision model) scored the red team 5 of 7 and the baseline 2 of 7; on reading, it missed one red-team match (attack #13, fees and costs) and three baseline matches.

**Baseline.** One frontier-model prompt with the same brief and record: "write the strongest opposition".

## Results

| Measure | Result |
| --- | --- |
| Court's deciding reasons found by the red team | 6 of 7 (ranks #2, #3, #7, #13, #14, #23) |
| Found by the one-prompt baseline | 5 of 7 |
| Attacks still standing after the exchange | 22 of 47 |
| Attacks on premises the brief never states, still open | 9 of 15 (60%), against 13 of 32 (41%) for all other attacks |
| The attack matching the court's first reason (#2) | Targets an unstated premise; still open after the exchange |
| Claims rated secure: as filed, under attack, after the exchange | 2, 0, 1 of 14 |
| Court's reasons that still defeat the rewritten brief | 7 of 7, after 15 applied edits |

Examples of applied edits: the several judgment against Carson Madrona was $12.75 million, not the $25.5 million the brief states; and the dates of two Hartford letters were corrected. The full redline is in the pipeline output (`out/<matter>/brief/twin.json`, field `redline`).

## How faithful the argument map is

| Measure | Result |
| --- | --- |
| Stated premises matched to a supporting quote in the record | 63 of 86 (73%) |
| Hand check of "supported" matches | 7 of 8 sampled truly support their premise |
| Case citations found on CourtListener | 19 of 23 |
| Support checks the decision model left uncertain (probability 0.2 to 0.8), sent to the large model | 41 of 71 (58%) |
| Reasoning-step types the decision model rated below 0.5 confidence | 8 of 25 |

**Text quality.** One exhibit, the Ace umbrella policy, has a text layer garbled by its font encoding (75 of 78 pages). All 10 quotes matched in it are garbled, and 9 were wrongly marked as supporting. A check for garbled pages before matching would catch this. It is not one of the 4 files that needed OCR.

## Does the map's verdict match the court?

After the exchange, each claim has a status. Against the court's order ([`results/hartford-court-claims.json`](../results/hartford-court-claims.json), graded by hand):

| | Claims |
| --- | --- |
| Same as the court | 11 of 14 |
| At risk where the court ruled against it, but not marked lost | 2 of 14 |
| Wrong | 1 of 14 |

A reasoning step counts as a route into a claim only when at least one input applies the law to this case: a fact, the text of a document, or a sub-claim. A rule or holding alone does not carry a claim. This rule took the match from 9 to 11 of 14.

The one wrong claim: **"Hartford owed a continuing defence, and breached it"** is marked lost, but the court held the duty to defend on appeal may have existed and left breach undecided. The map puts the duty to defend and the indemnity question into one step with 10 inputs. `scripts/check_map.ts` flags that step and that claim; the fix is to convert the claim again.

## Does the red team change what a reader concludes?

A frontier model (Claude Opus 5.5) called each of the 14 claims: secure, exposed or lost. The three prompts have the same brief, claims and instructions. Only the added material changes.

| The model reads | Same as the court | Called secure, court did not accept |
| --- | --- | --- |
| The brief alone | 2 of 14 | 6 |
| The brief and the red team's 47 attacks | 9 of 14 | 1 |
| The brief, the attacks and the AI judge's rulings | 12 of 14 | 1 |
| *The map's own status, for comparison* | *11 of 14* | *0* |

Asked about the case with no documents, the model did not recall it. Prompts and answers: [`results/cliff/`](../results/cliff/).

## Can a model trace the map without the code?

Yes, at this size. The code knocked out 1 to 6 premises in 12 scenarios, changing 0 to 10 claims. Given the map and the status rules in words, the same model traced every scenario exactly. The map's value is the structure it gives the attacks, not the code that computes status.

## Who does what

| Work | Done by |
| --- | --- |
| The argument map, unstated premises, attacks, answers, counters, rulings | A large language model, with the whole brief in context and the record through search |
| Yes/no checks: does this passage support this premise, is this the right reasoning type, is this the same point | Jev, a small decision model that returns a typed answer with a probability ([TypeSafe](https://typesafe.ai)) |
| Uncertain decision-model answers (0.2 to 0.8) | Sent back to the large language model |
| Quote location, citation lookup, status, applying edits | Code |

The map combines four standard models of argument: the Argument Interchange Format (reasoning steps as nodes), ASPIC+ (three kinds of attack), Walton's argumentation schemes (each step type comes with critical questions, which the attackers work through), and Carneades (burden and proof standard per claim).

## Test set

| Case | Side the AI takes (lost) | Outcome | Tests |
| --- | --- | --- | --- |
| Hartford Fire v. Carson Madrona (N.D. Cal.) | Ohio Security and American Fire, movants | Denied: the endorsement governs, and "caused, in whole or in part" means proximate cause | Reading a contract clause |
| Batten v. K-VA-T Food Stores (N.D. Ga.) | The plaintiff, opposing summary judgment | Defendant's motion granted | The record: 7 depositions |
| Thomson Reuters v. ROSS Intelligence (D. Del.) | ROSS, opposing summary judgment | Thomson Reuters' motions granted in part on direct infringement and in full on fair use; ROSS's motions denied | Case law |

Only Hartford has been replayed. See [`matters/README.md`](../matters/README.md) to rebuild the test set.

## Limits

One case, one run of each agent, and hand-graded matching. The next steps are the other two cases, two independent maps per case to measure stability, and a blind review by a litigator.
