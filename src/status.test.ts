import assert from "node:assert/strict";
import test from "node:test";
import { computeStatus } from "./status";
import type { Attack, Claim, Inference, Premise } from "./types";

const claim = (id: string, parent: string | null = null): Claim => ({ id, text: id, level: parent ? "element" : "relief", parent, ourGoal: "establish", burden: "us", standard: "no_genuine_dispute" });
const prem = (id: string, anchor: Partial<Premise["anchors"][0]> | null, kind: Premise["kind"] = "fact"): Premise => ({ id, claim: "el", text: id, kind, implicit: false, citation: null, anchors: anchor ? [{ file: "f", page: 1, quote: "q", verified: false, ...anchor }] : [] });
const inf = (id: string, from: string[], to: string): Inference => ({ id, scheme: "documentary", from, to, warrant: "", criticalQuestions: [] });

test("a claim is secure when one inference into it rests only on supported premises", () => {
	const s = computeStatus([claim("relief"), claim("el", "relief")], [prem("a", { verified: true }), prem("b", null)], [inf("i1", ["a"], "el"), inf("i2", ["b"], "el"), inf("i3", ["el"], "relief")]);
	assert.equal(s.premises.a, "supported");
	assert.equal(s.premises.b, "unanchored");
	assert.equal(s.inferences.i2, "weak");
	assert.equal(s.claims.el, "secure");
	assert.equal(s.claims.relief, "secure");
});

test("a claim with no inference into it stands only when all its children stand", () => {
	const claims = [claim("relief"), claim("a", "relief"), claim("b", "relief")];
	const premises = [prem("pa", { verified: true }), prem("pb", null)];
	const s = computeStatus(claims, premises, [inf("ia", ["pa"], "a"), inf("ib", ["pb"], "b")]);
	assert.equal(s.claims.a, "secure");
	assert.equal(s.claims.b, "exposed");
	assert.equal(s.claims.relief, "exposed");
	premises[1] = prem("pb", { verified: true });
	assert.equal(computeStatus(claims, premises, [inf("ia", ["pa"], "a"), inf("ib", ["pb"], "b")]).claims.relief, "secure");
});

test("a statute or a case missing from CourtListener is unchecked and does not block the inference", () => {
	const statute: Premise = { ...prem("st", null, "rule"), citation: { text: "Code Civ. Proc. § 685.010", verified: false, statute: true } };
	const missing: Premise = { ...prem("tr", null, "holding"), citation: { text: "56 Cal.App.5th 619", verified: false, note: "not in CourtListener" } };
	const s = computeStatus([claim("el")], [statute, missing], [inf("i1", ["st", "tr"], "el")]);
	assert.equal(s.premises.st, "unchecked");
	assert.equal(s.premises.tr, "unchecked");
	assert.equal(s.claims.el, "secure");
});

const atk = (id: string, type: Attack["type"], target: string, verified = true): Attack => ({ id, type, target, lane: "record", question: null, text: id, severity: "critical", rank: 1, anchors: [], authority: [], verified });

test("an open verified attack undermines, undercuts or defeats its target; an unverified one does nothing", () => {
	const claims = [claim("el")];
	const premises = [prem("a", { verified: true }), prem("b", { verified: true })];
	const infs = [inf("i1", ["a"], "el"), inf("i2", ["b"], "el")];
	const s1 = computeStatus(claims, premises, infs, [atk("x", "undermine", "a"), atk("y", "undercut", "i2")]);
	assert.equal(s1.premises.a, "undermined");
	assert.equal(s1.inferences.i2, "undercut");
	assert.equal(s1.claims.el, "lost");
	assert.equal(computeStatus(claims, premises, infs, [atk("x", "undermine", "a", false)]).claims.el, "secure");
	assert.equal(computeStatus(claims, premises, infs, [atk("z", "rebut", "el")]).claims.el, "lost");
});

test("an exchange ruling closes or contests an attack", () => {
	const claims = [claim("el")];
	const premises = [prem("a", { verified: true })];
	const infs = [inf("i1", ["a"], "el")];
	const attacks = [atk("x", "undermine", "a")];
	const ruled = (exposure: "closed" | "contested" | "open") => computeStatus(claims, premises, infs, attacks, [{ attack: "x", response: "r", counter: null, ruling: { exposure, reason: "" } }]);
	assert.equal(ruled("closed").claims.el, "secure");
	assert.equal(ruled("contested").premises.a, "contested");
	assert.equal(ruled("contested").claims.el, "exposed");
	assert.equal(ruled("open").claims.el, "lost");
});

test("a contradicting anchor makes the premise contradicted, and a claim resting only on it is lost", () => {
	const s = computeStatus([claim("el")], [prem("a", { verified: false, support: "contradicts" })], [inf("i1", ["a"], "el")]);
	assert.equal(s.premises.a, "contradicted");
	assert.equal(s.claims.el, "lost");
});

test("a sealed anchor is reported as sealed, and rules and holdings count as supported when their citation verifies", () => {
	const sealed = prem("s", { sealed: true, file: null, page: null });
	const rule: Premise = { ...prem("r", null, "rule"), citation: { text: "32 Cal. App. 4th 643", verified: true } };
	const s = computeStatus([claim("el")], [sealed, rule], [inf("i1", ["r"], "el")]);
	assert.equal(s.premises.s, "sealed");
	assert.equal(s.premises.r, "supported");
	assert.equal(s.claims.el, "secure");
});
