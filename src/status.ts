import type { Attack, Claim, Exchange, Inference, Premise, Status } from "./types";

/** Status of every node. Attacks count once verified; each is "open" until an exchange rules it "contested" or "closed". */
export function computeStatus(claims: Claim[], premises: Premise[], inferences: Inference[], attacks: Attack[] = [], exchanges: Exchange[] = []): Status {
	const s: Status = { premises: {}, inferences: {}, claims: {} };
	const state = (a: Attack) => exchanges.find((e) => e.attack === a.id)?.ruling.exposure ?? "open";
	const live = attacks.filter((a) => a.verified && state(a) !== "closed");
	const open = (id: string, type: Attack["type"]) => live.some((a) => a.target === id && a.type === type && state(a) === "open");
	const contested = (id: string) => live.some((a) => a.target === id && state(a) === "contested");

	for (const p of premises) {
		if (p.anchors.some((a) => a.support === "contradicts")) s.premises[p.id] = "contradicted";
		else if (open(p.id, "undermine")) s.premises[p.id] = "undermined";
		else if (contested(p.id)) s.premises[p.id] = "contested";
		else if (p.anchors.some((a) => a.verified) || p.citation?.verified) s.premises[p.id] = "supported";
		else if (p.anchors.some((a) => a.sealed)) s.premises[p.id] = "sealed";
		// A statute, or a case CourtListener lacks, is a gap in the tooling, not in the brief.
		else if (p.citation?.statute || p.citation?.note === "not in CourtListener") s.premises[p.id] = "unchecked";
		else s.premises[p.id] = "unanchored";
	}
	const claimIds = new Set(claims.map((c) => c.id));
	const ok = (f: string) => (claimIds.has(f) ? s.claims[f] === "secure" : s.premises[f] === "supported" || s.premises[f] === "unchecked");
	const soft = (f: string) => (claimIds.has(f) ? s.claims[f] === "exposed" : s.premises[f] === "contested");
	const fallen = (f: string) => (claimIds.has(f) ? s.claims[f] === "lost" : s.premises[f] === "undermined" || s.premises[f] === "contradicted");
	// Claims depend on sub-claims, so resolve from the leaves up; the tree is shallow, a fixed number of passes is enough.
	for (let pass = 0; pass < 4; pass++) {
		for (const i of inferences) {
			if (open(i.id, "undercut")) s.inferences[i.id] = "undercut";
			else if (i.from.every(ok)) s.inferences[i.id] = contested(i.id) ? "contested" : "holds";
			else if (i.from.every((f) => ok(f) || soft(f))) s.inferences[i.id] = "contested";
			else s.inferences[i.id] = "weak";
		}
		for (const c of claims) {
			const into = inferences.filter((i) => i.to === c.id);
			const children = claims.filter((k) => k.parent === c.id);
			let v: Status["claims"][string];
			if (open(c.id, "rebut")) v = "lost";
			else if (!into.length && children.length) {
				// A claim with no inference into it (typically the relief) stands on all of its children.
				v = children.every((k) => s.claims[k.id] === "secure") ? "secure" : children.some((k) => s.claims[k.id] === "lost") ? "lost" : "exposed";
			} else if (into.some((i) => s.inferences[i.id] === "holds")) v = contested(c.id) ? "exposed" : "secure";
			else if (into.length && into.every((i) => s.inferences[i.id] === "undercut" || i.from.some(fallen))) v = "lost";
			else v = "exposed";
			s.claims[c.id] = v;
		}
	}
	return s;
}
