import { antecedent, fixOcr, isShortForm, isStatute, lookup, match, type Found } from "./citations";
import { CONFIG } from "./config";
import { askJevBatch } from "./jev";
import type { Matter } from "./matter";
import { SCHEME_IDS, SCHEMES } from "./schemes";
import type { Inference, Premise, Support } from "./types";

const SUPPORT: Record<Support, string> = {
	supports: "The passage states the premise or directly implies that it is true",
	contradicts: "The passage states the opposite of the premise or implies it is false",
	says_nothing: "The passage does not address what the premise asserts",
};

export async function verify(m: Matter, premisesIn: Premise[], inferencesIn: Inference[]) {
	const log: string[] = [];
	const premises = premisesIn.map((p) => ({ ...p, anchors: p.anchors.map((a) => ({ ...a })), citation: p.citation ? { ...p.citation } : null }));
	const inferences = inferencesIn.map((i) => ({ ...i }));

	// 1. Does each anchored passage support its premise?
	const checks = premises.flatMap((p) => p.anchors.filter((a) => a.file && !a.sealed).map((a) => ({ p, a })));
	const passage = (file: string, page: number) => (m.doc(file)?.pages[page - 1] ?? "").slice(0, 4000);
	const answers = await askJevBatch(
		checks.map(({ p, a }) => ({ premise: p.text, passage: passage(a.file!, a.page!) })),
		(path) => ({ type: "choice", instructions: `Does \`${path}.passage\` support, contradict, or say nothing about \`${path}.premise\`?`, criteria: SUPPORT }),
	);
	const unsure: number[] = [];
	checks.forEach(({ p, a }, i) => {
		const r = answers[i];
		if ((r.confidence ?? 0) >= CONFIG.hi && r.choice) {
			a.support = r.choice as Support;
			a.verified = r.choice === "supports";
			if (r.choice === "contradicts") log.push(`${p.id}: the anchored passage contradicts the premise (${a.file} p.${a.page})`);
		} else unsure.push(i);
	});
	// ponytail: the uncertain middle is marked for a reader instead of escalated to a frontier API; add escalation when an API model is in the loop
	for (const i of unsure) {
		checks[i].a.support = "uncertain";
		log.push(`${checks[i].p.id}: support uncertain (${answers[i].choice ?? "no answer"}, confidence ${(answers[i].confidence ?? 0).toFixed(2)})`);
	}

	// 2. Independent check of each inference's scheme.
	const textOf = (id: string) => premises.find((p) => p.id === id)?.text ?? id;
	const schemeAnswers = await askJevBatch(
		inferences.map((i) => ({ premises: i.from.map(textOf), warrant: i.warrant })),
		(path) => ({ type: "choice", instructions: `Which kind of reasoning does \`${path}\` use to reach its conclusion?`, criteria: Object.fromEntries(SCHEME_IDS.map((s) => [s, SCHEMES[s].what])) }),
	);
	inferences.forEach((inf, i) => {
		const a = schemeAnswers[i];
		if (a.choice) inf.schemeCheck = { scheme: a.choice, confidence: a.confidence ?? 0 };
		if (a.choice && a.choice !== inf.scheme && (a.confidence ?? 0) >= CONFIG.hi) log.push(`${inf.id}: scheme ${inf.scheme}, decision model says ${a.choice}`);
	});

	// 3. Case citations exist on CourtListener (rules and holdings only). Statutes are outside its scope; short forms resolve to their antecedent.
	const cited = premises.filter((p) => p.citation && (p.kind === "rule" || p.kind === "holding"));
	if (cited.length) {
		const brief = m.text("brief");
		const inBrief = await lookup(fixOcr(brief));
		for (const p of cited) {
			const c = p.citation!;
			if (isStatute(c.text)) {
				c.statute = true;
				continue;
			}
			let target: Found | null = null;
			if (isShortForm(c.text)) {
				target = antecedent(c.text, brief, inBrief);
				if (target) c.resolvedFrom = target.citation;
			} else target = match(c.text, inBrief);
			if (!target) c.note = "no citation recognised";
			else if (target.status === 200 || target.status === 300) Object.assign(c, { verified: true, courtListenerId: target.clusterId, how: target.status === 300 ? "ambiguous" : "lookup" });
			else c.note = "not in CourtListener";
			if (!c.verified) log.push(`${p.id}: citation ${c.note}: ${c.text}`);
		}
	}
	return { premises, inferences, log };
}
