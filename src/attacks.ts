import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { locate } from "./anchor";
import { lookup } from "./citations";
import { CONFIG } from "./config";
import { askJevBatch } from "./jev";
import type { Matter } from "./matter";
import type { Attack, Twin } from "./types";

const SEVERITY = { critical: 0, moderate: 1, minor: 2 } as const;
/** Agents write file names in several forms ("text/64-0-x.txt", "64-0-x.txt", "64-0-x"); the twin uses the bare stem. */
export const normFile = (f: string | null) => (f ? f.replace(/^.*[\\/]/, "").replace(/\.(txt|pdf)$/, "") : f);

export type BaselinePoint = { id: string; text: string; severity: Attack["severity"] };

/** Reads the attackers' files from `dir`; ids that do not name a node of the twin are dropped. */
export function loadAttacks(dir: string, twin: Twin, log: string[]): Attack[] {
	const ids = new Set([...twin.claims, ...twin.premises, ...twin.inferences].map((n) => n.id));
	const out: Attack[] = [];
	for (const lane of ["structure", "record", "authority"] as const) {
		const f = join(dir, `attacks-${lane}.json`);
		if (!existsSync(f)) {
			log.push(`no attacks-${lane}.json`);
			continue;
		}
		for (const a of JSON.parse(readFileSync(f, "utf8")).attacks as any[]) {
			if (!ids.has(a.target)) {
				log.push(`${a.id}: dropped, unknown target ${a.target}`);
				continue;
			}
			out.push({ ...a, lane, question: a.question ?? null, authority: a.authority ?? [], anchors: (a.anchors ?? []).map((x: any) => ({ file: normFile(x.file), page: x.page, quote: x.quote, verified: false })), verified: false });
		}
	}
	return out;
}

/** Most damaging first: severity, then each lane's own rank; lanes interleave at equal rank. */
export function rankAttacks(attacks: Attack[]): Attack[] {
	const sorted = [...attacks].sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || a.rank - b.rank);
	sorted.forEach((a, i) => (a.globalRank = i + 1));
	return sorted;
}

/** Anchors must exist on their page and support the attack; authorities must exist on CourtListener and predate the filing. */
export async function verifyAttacks(m: Matter, attacks: Attack[], filingDate: string, log: string[]): Promise<void> {
	const checks: { a: Attack; i: number }[] = [];
	for (const a of attacks)
		a.anchors.forEach((p, i) => {
			const doc = p.file ? m.doc(p.file) : undefined;
			const hit = doc && p.page ? locate(p.quote, [doc.pages[p.page - 1] ?? ""]) : null;
			if (hit) checks.push({ a, i });
			else log.push(`${a.id}: anchor quote not found on ${p.file} p.${p.page}`);
		});
	const answers = await askJevBatch(
		checks.map(({ a, i }) => ({ claim: a.text, passage: (m.doc(a.anchors[i].file!)?.pages[a.anchors[i].page! - 1] ?? "").slice(0, 4000) })),
		(path) => ({ type: "choice", instructions: `Does \`${path}.passage\` support, contradict, or say nothing about the point made in \`${path}.claim\`?`, criteria: { supports: "The passage shows what the point relies on", contradicts: "The passage shows the opposite", says_nothing: "The passage does not bear on the point" } }),
	);
	checks.forEach(({ a, i }, k) => {
		const r = answers[k];
		a.anchors[i].support = (r.confidence ?? 0) >= CONFIG.hi ? (r.choice as any) : "uncertain";
		// A found quote that the classifier cannot confirm still counts; only a confident "contradicts" or "says_nothing" disqualifies it.
		a.anchors[i].verified = a.anchors[i].support === "supports" || a.anchors[i].support === "uncertain";
	});
	const cites = attacks.flatMap((a) => a.authority);
	if (cites.length) {
		const found = await lookup(cites.map((c) => c.citation).join("\n"));
		for (const c of cites) {
			const f = found.find((x) => c.citation.replace(/\s+/g, "").includes(x.citation.replace(/\s+/g, "")));
			const date = f?.dateFiled ?? c.dateFiled;
			if (!f || (f.status !== 200 && f.status !== 300)) c.note = "not found on CourtListener";
			else if (date && date >= filingDate) c.note = `decided ${date}, after the filing date`;
			else c.verified = true;
			if (!c.verified) log.push(`authority ${c.citation}: ${c.note}`);
		}
	}
	for (const a of attacks) a.verified = a.anchors.every((p) => p.verified) && a.authority.every((c) => c.verified) && (a.anchors.length > 0 || a.authority.length > 0 || a.lane === "structure");
}

/** Marks each attack that the baseline opposition does not already make. */
export async function compareToBaseline(attacks: Attack[], points: BaselinePoint[]): Promise<void> {
	if (!points.length) return;
	const criteria = { ...Object.fromEntries(points.map((p) => [p.id, p.text])), none: "None of the baseline points makes this argument" };
	const answers = await askJevBatch(
		attacks.map((a) => ({ attack: a.text })),
		(path) => ({ type: "choice", instructions: `Which point of the baseline opposition makes the same argument as \`${path}.attack\`? Same argument means the same weakness, not just the same topic.`, criteria }),
		10,
	);
	attacks.forEach((a, i) => {
		const r = answers[i];
		const point = r.choice && r.choice !== "none" && (r.confidence ?? 0) >= 0.5 ? r.choice : null;
		a.baselineMatch = { point, confidence: r.confidence ?? 0 };
		a.beyondBaseline = point === null;
	});
}
