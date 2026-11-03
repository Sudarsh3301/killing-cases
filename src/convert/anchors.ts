import { z } from "zod/v4";
import { bestSentence } from "../anchor";
import { runAgent } from "../claude";
import { askJevBatch } from "../jev";
import type { Matter } from "../matter";
import type { RecordIndex, Section } from "../record-index";
import type { Premise } from "../types";

export type CitationMapEntry = { citation: string; file: string | null; sealed: boolean };

export async function citationMap(m: Matter, premises: Premise[]): Promise<CitationMapEntry[]> {
	const cites = [...new Set(premises.filter((p) => p.kind === "fact" || p.kind === "text").map((p) => p.citation?.text).filter((c): c is string => !!c))];
	if (!cites.length) return [];
	const { map } = await runAgent({
		system: `You map each record citation from a brief to the file in the public record it refers to. Citation forms differ by brief: deponent and page:line, exhibit number, Bates number, joint-index page, declaration name, docket number. Use the file names, which start with the docket entry number. If the cited document is not among the files (sealed, or never filed publicly), set file null and sealed true. If the citation is to case law or a statute, set file null and sealed false.`,
		user: `PROFILE:\n${JSON.stringify(m.profile)}\n\nFILES:\n${m.docs.map((d) => `${d.file} (${d.role}, ${d.pages.length} pages)`).join("\n")}\n\nCITATIONS:\n${cites.join("\n")}`,
		result: z.object({ map: z.array(z.object({ citation: z.string(), file: z.string().nullable(), sealed: z.boolean() })) }),
	});
	return map;
}

const OPTIONS = ["s0", "s1", "s2", "s3", "s4"];

/** Anchors fact and text premises that have no located quote yet. Returns new premise objects. */
export async function anchorPremises(m: Matter, idx: RecordIndex, premises: Premise[], map: CitationMapEntry[]): Promise<Premise[]> {
	const out = premises.map((p) => ({ ...p, anchors: [...p.anchors] }));
	const pending: { p: Premise; cands: Section[] }[] = [];
	for (const p of out) {
		if (p.anchors.length || p.kind === "rule" || p.kind === "holding") continue;
		const entry = map.find((e) => e.citation === p.citation?.text);
		if (entry?.sealed) {
			p.anchors.push({ file: null, page: null, quote: "", verified: false, sealed: true });
			continue;
		}
		const file = entry?.file ? m.doc(entry.file)?.file : undefined;
		const cands = idx.search(`${p.text} ${p.citation?.text ?? ""}`, 5, file);
		if (cands.length) pending.push({ p, cands });
	}
	const answers = await askJevBatch(
		pending.map(({ p, cands }) => ({ premise: p.text, sections: cands.map((c) => c.text.slice(0, 2500)) })),
		(path) => ({
			type: "choice",
			instructions: `Which section in \`${path}.sections\` states or directly shows \`${path}.premise\`? Sections are numbered from 0. Answer none if no section does.`,
			criteria: { ...Object.fromEntries(OPTIONS.map((o, i) => [o, `Section ${i} states or directly shows the premise`])), none: "No section states or directly shows the premise" },
		}),
		10,
	);
	pending.forEach(({ p, cands }, i) => {
		const pick = answers[i].choice;
		const s = pick && pick !== "none" ? cands[OPTIONS.indexOf(pick)] : undefined;
		if (s) p.anchors.push({ file: s.file, page: s.page, quote: bestSentence(p.text, s.text), verified: false });
	});
	return out;
}
