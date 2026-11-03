import { z } from "zod/v4";
import { locate } from "../anchor";
import { runAgent } from "../claude";
import type { Matter } from "../matter";
import type { RecordIndex } from "../record-index";
import { SCHEME_IDS, SCHEMES } from "../schemes";
import { recordSearchTool } from "../tools";
import type { Claim, Inference, Premise } from "../types";

const ResultZ = z.object({
	premises: z.array(z.object({
		id: z.string(), text: z.string(),
		kind: z.enum(["fact", "rule", "holding", "text"]),
		citation: z.string().nullable(),
		quote: z.string().nullable(), file: z.string().nullable(),
		implicit: z.boolean(),
	})),
	inferences: z.array(z.object({ id: z.string(), scheme: z.enum(SCHEME_IDS), from: z.array(z.string()), to: z.string(), warrant: z.string() })),
});

export type RawElement = z.infer<typeof ResultZ>;
export type ElementPart = { premises: Premise[]; inferences: Inference[]; log: string[] };

export async function buildElement(m: Matter, idx: RecordIndex, claims: Claim[], el: Claim): Promise<ElementPart> {
	const r = await runAgent({
		system: `You map the reasoning a brief uses for ONE claim into premises and inferences.
Premises: every fact, rule, holding or document text the brief relies on for this claim, one proposition each.
- "citation": the brief's own citation for it, verbatim, or null.
- If you find the passage in the record with record_search, give "quote" (verbatim from the tool result, 1-3 sentences) and its "file"; otherwise null.
- "implicit": true for a premise the argument needs but the brief never states. Look for these on purpose.
Inferences: each reasoning step from premises (or sub-claims) to this claim or one of its sub-claims, with the best scheme and a one-sentence warrant.
Schemes: ${SCHEME_IDS.map((s) => `${s} (${SCHEMES[s].what})`).join("; ")}.
"from" may hold your premise ids and claim ids from the list; "to" must be a claim id.`,
		user: `CLAIMS:\n${JSON.stringify(claims)}\n\nTHIS CLAIM: ${el.id}: ${el.text}\n\nRECORD FILES: ${m.docs.filter((d) => d.role === "record").map((d) => d.file).join(", ")}\n\nBRIEF:\n${m.text("brief")}`,
		tools: [recordSearchTool(idx)],
		result: ResultZ,
		maxTurns: 12,
	});
	return normalizeElement(m, claims, el, r);
}

/** Namespaces ids, keeps only model quotes that code finds in the named file, and drops inferences that point at unknown nodes. */
export function normalizeElement(m: Matter, claims: Claim[], el: Claim, raw: RawElement): ElementPart {
	const r = ResultZ.parse(raw);
	const log: string[] = [];
	const local = new Set(r.premises.map((p) => p.id));
	const ns = (id: string) => (local.has(id) ? `${el.id}/${id}` : id);
	const claimIds = new Set(claims.map((c) => c.id));
	const premises: Premise[] = r.premises.map((p) => {
		const anchors: Premise["anchors"] = [];
		const doc = p.quote && p.file ? m.doc(p.file) : undefined;
		const hit = doc && p.quote ? locate(p.quote, doc.pages) : null;
		if (doc && hit) anchors.push({ file: doc.file, page: hit.page, quote: p.quote!, verified: false });
		else if (p.quote) log.push(`${el.id}/${p.id}: model quote not found in ${p.file}`);
		return { id: `${el.id}/${p.id}`, claim: el.id, text: p.text, kind: p.kind, anchors, citation: p.citation ? { text: p.citation, verified: false } : null, implicit: p.implicit };
	});
	const inferences: Inference[] = r.inferences
		.map((i) => ({ id: `${el.id}/${i.id}`, scheme: i.scheme, from: i.from.map(ns), to: i.to, warrant: i.warrant, criticalQuestions: [] }))
		.filter((i) => {
			const ok = claimIds.has(i.to) && i.from.every((f) => f.startsWith(`${el.id}/`) || claimIds.has(f));
			if (!ok) log.push(`${i.id}: dropped, refers to an unknown node`);
			return ok;
		});
	return { premises, inferences, log };
}
