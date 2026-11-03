const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Share of the quote's words found in order-free form in the best window of the page; 1 for an exact match. */
export function matchScore(quote: string, page: string): number {
	const q = words(quote);
	const p = words(page);
	if (!q.length) return 0;
	if (` ${p.join(" ")} `.includes(` ${q.join(" ")} `)) return 1;
	const need = new Map<string, number>();
	for (const w of q) need.set(w, (need.get(w) ?? 0) + 1);
	let best = 0;
	const last = Math.max(0, p.length - q.length);
	// ponytail: O(page × quote) window scan, fine for pages of a few hundred words
	for (let i = 0; i <= last && best < 1; i++) {
		const have = new Map(need);
		let hit = 0;
		for (const w of p.slice(i, i + q.length + 2)) {
			const n = have.get(w);
			if (n) {
				have.set(w, n - 1);
				hit++;
			}
		}
		best = Math.max(best, hit / q.length);
	}
	return best;
}

export function locate(quote: string, pages: string[], threshold = 0.85): { page: number; score: number } | null {
	let best = { page: 0, score: 0 };
	pages.forEach((t, i) => {
		const s = matchScore(quote, t);
		if (s > best.score) best = { page: i + 1, score: s };
	});
	return best.score >= threshold ? best : null;
}

export function bestSentence(target: string, text: string): string {
	const want = new Set(words(target));
	const sentences = text.split(/(?<=[.;:?!])\s+/).map((s) => s.trim()).filter((s) => s.length > 20);
	let best = sentences[0] ?? text.slice(0, 300);
	let score = -1;
	for (const s of sentences) {
		const w = words(s);
		const sc = w.filter((x) => want.has(x)).length / Math.sqrt(w.length || 1);
		if (sc > score) {
			score = sc;
			best = s;
		}
	}
	return best.slice(0, 500);
}
