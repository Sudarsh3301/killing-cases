import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadMatter } from "../src/matter";

const OUT = join(__dirname, "..", "out");
export const twinPath = (m: string) => join(OUT, m, "brief", "twin.json");

/** The map as the site publishes it: without the per-attack baseline comparison. */
export function twinJson(m: string): string | null {
	if (!existsSync(twinPath(m))) return null;
	const t = JSON.parse(readFileSync(twinPath(m), "utf8"));
	for (const a of t.attacks ?? []) { delete a.beyondBaseline; delete a.baselineMatch; }
	return JSON.stringify(t);
}

const RESULTS = join(__dirname, "..", "results");
type Hit = { attack: string; rank: number; lane: string } | null;

/** The replay as the site shows it: deciding reasons matched by hand (results/<case>-court-reasons.json), not by the
 *  automatic matcher; no baseline and no matcher totals; round 6 (the edited brief replayed) riding along. */
export function replayJson(m: string): string | null {
	const f = join(OUT, m, "replay", "replay.json");
	if (!existsSync(f)) return null;
	const body = JSON.parse(readFileSync(f, "utf8"));
	const hand = join(RESULTS, `${m.split("-")[0]}-court-reasons.json`);
	if (existsSync(hand)) {
		const ranks = new Map((JSON.parse(readFileSync(hand, "utf8")).reasons as { id: string; twinRank: number | null }[]).map((r) => [r.id, r.twinRank]));
		const attacks = JSON.parse(readFileSync(twinPath(m), "utf8")).attacks as { id: string; globalRank: number; lane: string }[];
		for (const x of body.ruling) {
			if (!ranks.has(x.item.id)) continue;
			const a = attacks.find((y) => y.globalRank === ranks.get(x.item.id));
			x.twin = (a ? { attack: a.id, rank: a.globalRank, lane: a.lane } : null) satisfies Hit;
			x.hand = true;
		}
	}
	for (const round of ["opposition", "bench", "ruling"]) for (const x of body[round] ?? []) { delete x.baseline; delete x.baselineAll; delete x.twinAll; if (x.twin) delete x.twin.beyondBaseline; }
	delete body.summary;
	const r6 = join(OUT, m, "replay", "round6.json");
	if (existsSync(r6)) body.round6 = JSON.parse(readFileSync(r6, "utf8"));
	return JSON.stringify(body);
}

/** One record file as known at filing; loadMatter already drops held-out files. */
export function recordJson(m: string, file: string): string | null {
	let doc;
	try { doc = loadMatter(m).doc(file); } catch { doc = undefined; } // unknown matter
	return doc ? JSON.stringify({ file: doc.file, pages: doc.pages }) : null;
}

const MATTERS = join(__dirname, "..", "matters");
/** The case the summary page and the run feature. */
export const FEATURED = "hartford-v-carson-madrona";
const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : null);
/** Per-case writing (labels, captions, featured items); its numbers are placeholders filled from the data. */
export const storyJson = (m: string) => read(join(MATTERS, m, "story.json"));
/** Headline numbers written by scripts/export_results.py. */
export const resultsJson = (m: string) => {
	const r = read(join(RESULTS, `${m.split("-")[0]}.json`));
	if (!r) return null;
	const o = JSON.parse(r);
	delete o.courtReasonsFoundByBaseline; // the site shows no baseline
	return JSON.stringify(o);
};
/** The court's deciding reasons, matched to attacks by hand. */
export const reasonsJson = (m: string) => {
	const r = read(join(RESULTS, `${m.split("-")[0]}-court-reasons.json`));
	if (!r) return null;
	const o = JSON.parse(r);
	for (const x of o.reasons) delete x.baseline; // the site shows no baseline
	o.note = "Hand-graded: each decisive reason in the court's order matched to the highest-ranked red-team attack that makes the same point. Ranks are out of the full attack list, fixed on the filing-day record.";
	return JSON.stringify(o);
};

const squaresOf = (k: number, n: number) => Array.from({ length: n }, (_, i) => (i < k ? "<i></i>" : '<i class="miss"></i>')).join("");
const LONG_DATE = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The landing page with every {placeholder} filled from the case's data. Throws if one is left, so no typed number reaches the page. */
export function homeHtml(m: string): string {
	const R = JSON.parse(resultsJson(m)!), S = JSON.parse(storyJson(m)!), T = JSON.parse(twinJson(m)!);
	const reasons = JSON.parse(reasonsJson(m)!).reasons as { twinRank: number | null }[];
	const days = Math.round((Date.parse(S.orderDate) - Date.parse(R.filed)) / 86_400_000);
	const v: Record<string, string | number> = {
		title: S.title, court: S.court, found: R.courtReasonsFlaggedByTwin, reasons: R.courtReasons,
		missed: R.courtReasons - R.courtReasonsFlaggedByTwin, days, premises: R.premises, unstated: R.unstatedPremises,
		onUnstated: R.courtReasonsOnUnstated, edits: R.redlineEditsApplied, still: R.hardenedReplayStillOpen,
		claims: R.claims, steps: R.inferences, attacks: R.attacks, filed: LONG_DATE(R.filed),
		otherFiles: loadMatter(m).docs.filter((d) => d.role !== "brief").length, docket: S.court, cast: S.cast,
		anchored: R.statedPremisesAnchored, stated: R.statedPremises,
		orderPoints: (JSON.parse(replayJson(m) ?? "{}").ruling ?? []).length,
		policySrc: S.skipped.policySrc, policy: S.skipped.policy, briefSrc: S.skipped.briefSrc, brief: S.skipped.brief,
		squares: reasons.map((r) => (r.twinRank ? "<i></i>" : '<i class="miss"></i>')).join(""),
		grid: (T.premises as { implicit: boolean }[]).map((p) => (p.implicit ? '<i class="h"></i>' : "<i></i>")).join(""),
		ticks: "<i></i>".repeat(R.redlineEditsApplied),
		alone: R.readers.briefOnly, withAttacks: R.readers.withAttacks, withRulings: R.readers.withRulings, falseSecure: R.readers.briefOnlyFalseSecure,
		aloneSquares: squaresOf(R.readers.briefOnly, R.claims), attacksSquares: squaresOf(R.readers.withAttacks, R.claims), rulingsSquares: squaresOf(R.readers.withRulings, R.claims),
		stillSquares: Array.from({ length: R.hardenedReplayReasons }, (_, i) => (i < R.hardenedReplayStillOpen ? "<i></i>" : '<i class="miss"></i>')).join(""),
	};
	const html = readFileSync(join(__dirname, "home.html"), "utf8").replace(/\{(\w+)\}/g, (all, k) => (k in v ? String(v[k]) : all));
	const left = html.match(/\{\w+\}/);
	if (left) throw new Error(`home.html: no value for ${left[0]}`);
	return html;
}
