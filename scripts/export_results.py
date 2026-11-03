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
    "courtFirstTwoRanks": [r["twinRank"] for r in reasons[:2]],
    "redlineEditsApplied": sum(e["applied"] for e in twin.get("redline", [])),
    "hardenedReplayStillOpen": sum(r["exposure"] == "open" for r in round6["rulings"]),
    "hardenedReplayReasons": len(round6["rulings"]),
}
(ROOT / "results" / f"{short}.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf8")
print(json.dumps(result, indent=2))
