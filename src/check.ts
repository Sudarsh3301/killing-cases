import type { Claim, Inference, Premise } from "./types";

export type Issue = { node: string; rule: string; message: string };

const MAX_INPUTS = 5;

/** Structural checks on a converted map. Each message says what to change, so it can go back to the converter as feedback. */
export function checkMap(claims: Claim[], premises: Premise[], inferences: Inference[]): Issue[] {
	const issues: Issue[] = [];
	const kind = new Map(premises.map((p) => [p.id, p.kind]));
	const claimIds = new Set(claims.map((c) => c.id));
	for (const i of inferences) {
		if (i.from.length > MAX_INPUTS)
			issues.push({ node: i.id, rule: "too-many-inputs", message: `${i.from.length} inputs; split it into steps of at most ${MAX_INPUTS}, one per legal test, each into its own sub-claim.` });
		if (!i.from.some((f) => claimIds.has(f) || kind.get(f) === "fact" || kind.get(f) === "text"))
			issues.push({ node: i.id, rule: "rule-only", message: "only rules or holdings as inputs; add the fact or document text the rule is applied to, or merge it into the step that applies it." });
	}
	for (const c of claims) {
		if (c.level !== "relief" && /\band (?:then )?(?:breach|owe|is|was|must|did|may)\w*\b/i.test(c.text))
			issues.push({ node: c.id, rule: "two-questions", message: "the claim joins two legal questions with \"and\"; split it into one claim per question." });
		if (!inferences.some((i) => i.to === c.id) && !claims.some((k) => k.parent === c.id))
			issues.push({ node: c.id, rule: "no-route", message: "no step leads to this claim and it has no sub-claims; add the step the brief uses, or drop the claim." });
	}
	return issues;
}
