import { CONFIG } from "../config";
import { askJevBatch } from "../jev";
import { SCHEMES } from "../schemes";
import type { Claim, Inference, Premise } from "../types";

export async function attachQuestions(inferences: Inference[], premises: Premise[], claims: Claim[]): Promise<Inference[]> {
	const textOf = (id: string) => premises.find((p) => p.id === id)?.text ?? claims.find((c) => c.id === id)?.text ?? id;
	const items = inferences.flatMap((inf) => SCHEMES[inf.scheme].questions.map((q) => ({ inf, q })));
	const answers = await askJevBatch(
		items.map(({ inf, q }) => ({ conclusion: textOf(inf.to), premises: inf.from.map(textOf), warrant: inf.warrant, question: q })),
		(path) => ({
			type: "noul",
			instructions: `Do the premises and warrant in \`${path}\` already answer \`${path}.question\` in favour of the conclusion?`,
			criteria: { true: "The premises or the warrant answer the question in the argument's favour", false: "The argument leaves the question open" },
		}),
	);
	const out = inferences.map((inf) => ({ ...inf, criticalQuestions: [] as Inference["criticalQuestions"] }));
	items.forEach(({ inf, q }, i) => {
		const p = answers[i].noul;
		out.find((o) => o.id === inf.id)!.criticalQuestions.push({ q, status: p !== undefined && p >= CONFIG.hi ? "answered_in_input" : "open", p });
	});
	return out;
}
