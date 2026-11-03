import { askJevBatch } from "./jev";
import { tokens } from "./record-index";
import type { Attack } from "./types";
import type { BaselinePoint } from "./attacks";

export type KeyItem = { id: string; text: string; quote: string; by?: string; targets?: string; decisive?: boolean };
export type AnswerKey = { opposition: KeyItem[]; bench: KeyItem[]; ruling: KeyItem[]; outcome: string };
export type Hit = { id: string; p: number; rank?: number; lane?: string; beyondBaseline?: boolean };
export type Match = { item: KeyItem; twin: { attack: string; rank: number; lane: string; beyondBaseline: boolean } | null; twinAll: Hit[]; baseline: string | null; baselineAll: Hit[] };
export type Replay = { opposition: Match[]; bench: Match[]; ruling: Match[]; outcome: string; summary: Record<string, string | number> };

const overlap = (a: string, b: string) => {
	const A = new Set(tokens(a));
	return tokens(b).filter((t) => A.has(t)).length;
};

/** For each item, the options that make the same point: the k closest options by shared words, each judged yes or no by Jev. */
async function samePoint(items: KeyItem[], options: { id: string; text: string }[], k = 10): Promise<Hit[][]> {
	const pairs = items.flatMap((it, i) =>
		options.map((o) => ({ i, o, s: overlap(it.text, o.text) })).sort((x, y) => y.s - x.s).slice(0, k).map(({ i, o }) => ({ i, id: o.id, argument: it.text, other: o.text })),
	);
	const answers = await askJevBatch(
		pairs.map((p) => ({ argument: p.argument, other: p.other })),
		(path) => ({
			type: "noul",
			instructions: `Does \`${path}.other\` make the same point as \`${path}.argument\`? The same point means the same weakness or reason, even in different words. A different weakness on the same topic is not the same point.`,
			criteria: { true: "It makes the same point", false: "It makes a different point, or none" },
		}),
	);
	const out: Hit[][] = items.map(() => []);
	pairs.forEach((p, j) => {
		const v = answers[j].noul ?? 0;
		if (v >= 0.6) out[p.i].push({ id: p.id, p: v });
	});
	return out;
}

export async function replay(key: AnswerKey, attacks: Attack[], baseline: BaselinePoint[]): Promise<Replay> {
	const byId = new Map(attacks.map((a) => [a.id, a]));
	const round = async (items: KeyItem[]): Promise<Match[]> => {
		const t = await samePoint(items, attacks.map((a) => ({ id: a.id, text: a.text })));
		const b = baseline.length ? await samePoint(items, baseline) : items.map(() => []);
		return items.map((item, i) => {
			const twinAll = t[i].map((h) => ({ ...h, rank: byId.get(h.id)!.globalRank, lane: byId.get(h.id)!.lane, beyondBaseline: !!byId.get(h.id)!.beyondBaseline })).sort((x, y) => (x.rank ?? 1e9) - (y.rank ?? 1e9));
			const best = twinAll[0];
			const baselineAll = b[i].sort((x, y) => y.p - x.p);
			return { item, twin: best ? { attack: best.id, rank: best.rank ?? 0, lane: best.lane ?? "", beyondBaseline: !!best.beyondBaseline } : null, twinAll, baseline: baselineAll[0]?.id ?? null, baselineAll };
		});
	};
	const opposition = await round(key.opposition);
	const bench = await round(key.bench);
	const ruling = await round(key.ruling);
	const decisive = ruling.filter((r) => r.item.decisive);
	const pct = (xs: Match[], f: (m: Match) => boolean) => `${xs.filter(f).length}/${xs.length}`;
	return {
		opposition, bench, ruling, outcome: key.outcome,
		summary: {
			"opposition arguments surfaced by the twin": pct(opposition, (m) => !!m.twin),
			"opposition arguments in the baseline": pct(opposition, (m) => !!m.baseline),
			"bench points flagged by the twin": pct(bench, (m) => !!m.twin),
			"decisive ruling reasons flagged by the twin": pct(decisive, (m) => !!m.twin),
			"decisive ruling reasons in the baseline": pct(decisive, (m) => !!m.baseline),
			"decisive reasons flagged only by the twin": pct(decisive, (m) => !!m.twin && !m.baseline),
			"decisive reasons flagged in the twin's top 10": pct(decisive, (m) => !!m.twin && m.twin.rank <= 10),
		},
	};
}
