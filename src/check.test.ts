import assert from "node:assert/strict";
import test from "node:test";
import { checkMap } from "./check";
import type { Claim, Inference, Premise } from "./types";

const claim = (id: string, text = id): Claim => ({ id, text, level: "element", parent: null, ourGoal: "establish", burden: "us", standard: "no_genuine_dispute" });
const prem = (id: string, kind: Premise["kind"]): Premise => ({ id, claim: "c", text: id, kind, anchors: [], citation: null, implicit: false });
const inf = (id: string, from: string[], to = "c"): Inference => ({ id, scheme: "rule_application", from, to, warrant: "", criticalQuestions: [] });

test("flags wide steps, rule-only steps, two-question claims and claims with no route", () => {
	const premises = ["a", "b", "c1", "d", "e", "f"].map((id) => prem(id, "fact")).concat(prem("h", "holding"));
	const issues = checkMap(
		[claim("c", "Hartford owed a duty to defend and breached it"), claim("orphan")],
		premises,
		[inf("wide", ["a", "b", "c1", "d", "e", "f"]), inf("bare", ["h"]), inf("ok", ["h", "a"])],
	);
	const rules = issues.map((i) => `${i.node}:${i.rule}`).sort();
	assert.deepEqual(rules, ["bare:rule-only", "c:two-questions", "orphan:no-route", "wide:too-many-inputs"]);
});
