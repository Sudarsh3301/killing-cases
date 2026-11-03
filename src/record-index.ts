import type { Doc } from "./matter";

export type Section = { id: string; file: string; page: number; text: string };

const STOP = new Set("the of and to in that is for on as by with be this was it or are at from an not his he which a".split(" "));
export const tokens = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1 && !STOP.has(t));

export function sectionize(docs: Doc[], size = 3000): Section[] {
	const out: Section[] = [];
	for (const d of docs)
		d.pages.forEach((p, i) => {
			for (let s = 0; s < p.length; s += size) {
				const text = p.slice(s, s + size).trim();
				if (text) out.push({ id: `${d.file}#p${i + 1}.${s / size}`, file: d.file, page: i + 1, text });
			}
		});
	return out;
}

// ponytail: in-memory BM25 rebuilt per run (about 1 s for 3,000 sections); persist it if runs get slow
export class RecordIndex {
	private tf: Map<string, number>[];
	private df = new Map<string, number>();
	private len: number[];
	private avg: number;

	constructor(readonly sections: Section[]) {
		this.tf = sections.map((s) => {
			const m = new Map<string, number>();
			for (const t of tokens(s.text)) m.set(t, (m.get(t) ?? 0) + 1);
			return m;
		});
		this.len = this.tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
		this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(this.len.length, 1);
		for (const m of this.tf) for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
	}

	search(query: string, k = 8, file?: string): Section[] {
		const q = [...new Set(tokens(query))];
		const n = this.sections.length;
		return this.sections
			.map((s, i) => {
				if (file && s.file !== file) return { s, score: 0 };
				let score = 0;
				for (const t of q) {
					const f = this.tf[i].get(t);
					if (!f) continue;
					const df = this.df.get(t) ?? 0;
					const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
					score += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * this.len[i]) / this.avg));
				}
				return { s, score };
			})
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, k)
			.map((x) => x.s);
	}
}
