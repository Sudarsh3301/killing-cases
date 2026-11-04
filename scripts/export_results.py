"""Collect the headline numbers for one replayed matter into results/<matter>.json.

Reads the pipeline output (out/<matter>/) and the hand-graded court reasons
(results/<matter>-court-reasons.json). Everything the README shows comes from
the file this writes.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
matter = sys.argv[1] if len(sys.argv) > 1 else "hartford-v-carson-madrona"
short = matter.split("-")[0]
out = ROOT / "out" / matter
twin = json.loads((out / "brief" / "twin.json").read_text(encoding="utf8"))
round6 = json.loads((out / "replay" / "round6.json").read_text(encoding="utf8"))
reasons = json.loads((ROOT / "results" / f"{short}-court-reasons.json").read_text(encoding="utf8"))["reasons"]
profile = json.loads((ROOT / "matters" / matter / "profile.json").read_text(encoding="utf8"))
court_claims = json.loads((ROOT / "results" / f"{short}-court-claims.json").read_text(encoding="utf8"))["claims"]
# A frontier model calls each claim from the brief alone, then with the red team's attacks, then with the AI judge's rulings too.
readers = json.loads((ROOT / "results" / "cliff" / f"{short}-court-ablation.json").read_text(encoding="utf8"))["runs"]

premises = twin["premises"]
implicit = {p["id"] for p in premises if p["implicit"]}
exposure = {e["attack"]: e["ruling"]["exposure"] for e in twin["exchanges"]}
open_attacks = [a for a in twin["attacks"] if exposure[a["id"]] == "open"]
explicit = [p for p in premises if not p["implicit"]]
status = lambda key: twin[key]["claims"]

result = {
    "matter": matter,
    "filed": profile.get("filingDate"),
    "claims": len(twin["claims"]),
    "inferences": len(twin["inferences"]),
    "premises": len(premises),
    "unstatedPremises": len(implicit),
    "statedPremisesAnchored": sum(twin["status"]["premises"][p["id"]] == "supported" for p in explicit),
    "statedPremises": len(explicit),
    "attacks": len(twin["attacks"]),
    "attacksStillOpen": len(open_attacks),
    "openAttacksOnUnstated": sum(a["target"] in implicit for a in open_attacks),
    "attacksOnUnstated": sum(a["target"] in implicit for a in twin["attacks"]),
    "attacksOnOther": sum(a["target"] not in implicit for a in twin["attacks"]),
    "openAttacksOnOther": sum(a["target"] not in implicit for a in open_attacks),
    "courtFirstReasonAttack": next({"rank": a["globalRank"], "onUnstatedPremise": a["target"] in implicit, "ruling": exposure[a["id"]]}
                                   for a in twin["attacks"] if a["globalRank"] == reasons[0]["twinRank"]),
    "secureClaims": {"asFiled": list(status("status").values()).count("secure"),
                     "underAttack": list(status("statusUnderAttack").values()).count("secure"),
                     "afterExchange": list(status("statusAfter").values()).count("secure")},
    "courtReasons": len(reasons),
    "courtReasonsFlaggedByTwin": sum(r["twinRank"] is not None for r in reasons),
    "courtReasonsFoundByBaseline": sum(r["baseline"] for r in reasons),
    # Of the reasons the red team found, how many it found by attacking a premise the brief never states.
    "courtReasonsOnUnstated": sum(next(a["target"] in implicit for a in twin["attacks"] if a["globalRank"] == r["twinRank"]) for r in reasons if r["twinRank"]),
    "courtFirstTwoRanks": [r["twinRank"] for r in reasons[:2]],
    "redlineEditsApplied": sum(e["applied"] for e in twin.get("redline", [])),
    "hardenedReplayStillOpen": sum(r["exposure"] == "open" for r in round6["rulings"]),
    "hardenedReplayReasons": len(round6["rulings"]),
    # Each claim's status after the exchange against the court's order. "Direction": the map has it at risk, the court ruled against it.
    "claimAgreement": {"exact": sum(status("statusAfter")[c] == v["court"] for c, v in court_claims.items()),
                       "direction": sum(status("statusAfter")[c] == "exposed" and v["court"] == "lost" for c, v in court_claims.items()),
                       "of": len(court_claims)},
    "readers": {"briefOnly": readers["Opus, brief only"]["exact"],
                "withAttacks": readers["Opus, brief + attacks"]["exact"],
                "withRulings": readers["Opus, brief + attacks + AI judge rulings"]["exact"],
                "briefOnlyFalseSecure": readers["Opus, brief only"]["calledSecureCourtDidNot"]},
}
(ROOT / "results" / f"{short}.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf8")
print(json.dumps(result, indent=2))
