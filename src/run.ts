import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { anchorPremises, citationMap } from "./convert/anchors";
import { buildElement, normalizeElement, type RawElement } from "./convert/elements";
import { attachQuestions } from "./convert/questions";
import { buildSkeleton } from "./convert/skeleton";
import { loadMatter } from "./matter";
import { RecordIndex, sectionize } from "./record-index";
import { computeStatus } from "./status";
import type { Twin } from "./types";
import { verify } from "./verify";
import { compareToBaseline, loadAttacks, rankAttacks, verifyAttacks, type BaselinePoint } from "./attacks";
import { replay, type AnswerKey } from "./replay";

async function main() {
	const matter = process.argv[2];
	if (!matter) throw new Error("usage: run.ts <matter> [--fresh]");
	const fresh = process.argv.includes("--fresh");
	const out = join(__dirname, "..", "out", matter, "brief");
	mkdirSync(out, { recursive: true });
	const step = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
		const f = join(out, `${name}.json`);
		if (existsSync(f) && !fresh) return JSON.parse(readFileSync(f, "utf8"));
		const t = Date.now();
		const v = await fn();
		writeFileSync(f, JSON.stringify(v, null, 1));
		console.log(`done ${name} in ${((Date.now() - t) / 1000).toFixed(0)} s`);
		return v;
	};

	const m = loadMatter(matter);
	const idx = new RecordIndex(sectionize(m.docs.filter((d) => d.role === "record")));
	console.log(`${matter}: ${m.docs.length} frozen files, ${idx.sections.length} record sections`);

	const claims = await step("1-claims", () => buildSkeleton(m));
	// A hand-written graph (2-elements.raw.json, keyed by element id) replaces the model call when present.
	const rawFile = join(out, "2-elements.raw.json");
	const elements = claims.filter((c) => c.level === "element");
	const parts = await step("2-elements", async () => {
		if (!existsSync(rawFile)) return Promise.all(elements.map((el) => buildElement(m, idx, claims, el)));
		const raw = JSON.parse(readFileSync(rawFile, "utf8")) as Record<string, RawElement>;
		return elements.map((el) => normalizeElement(m, claims, el, raw[el.id] ?? { premises: [], inferences: [] }));
	});
	const drafted = parts.flatMap((p) => p.premises);
	const map = await step("3-citation-map", () => citationMap(m, drafted));
	const anchored = await step("3-anchored", () => anchorPremises(m, idx, drafted, map));
	const questioned = await step("5-questions", () => attachQuestions(parts.flatMap((p) => p.inferences), anchored, claims));
	const checked = await step("6-verified", () => verify(m, anchored, questioned));

	// The uncertain middle goes to a reader: the pipeline lists it, the reader writes 6-escalated.json, and the rulings are applied here.
	const uncertain = checked.premises.flatMap((p) => p.anchors.filter((a) => a.support === "uncertain").map((a) => ({ premise: p.id, text: p.text, file: a.file, page: a.page, quote: a.quote, passage: (m.doc(a.file!)?.pages[a.page! - 1] ?? "").slice(0, 4000) })));
	writeFileSync(join(out, "6-escalate-needed.json"), JSON.stringify(uncertain, null, 1));
	const escalated = join(out, "6-escalated.json");
	if (existsSync(escalated)) {
		const rulings = JSON.parse(readFileSync(escalated, "utf8")) as { premise: string; file: string; page: number; verdict: "supports" | "contradicts" | "says_nothing"; reason: string }[];
		for (const r of rulings) {
			const a = checked.premises.find((p) => p.id === r.premise)?.anchors.find((x) => x.file === r.file && x.page === r.page && x.support === "uncertain");
			if (!a) continue;
			a.support = r.verdict;
			a.verified = r.verdict === "supports";
			checked.log.push(`${r.premise}: escalated, ${r.verdict}: ${r.reason}`);
		}
	}

	const twin: Twin = {
		matter, mode: "brief", claims,
		premises: checked.premises, inferences: checked.inferences,
		status: computeStatus(claims, checked.premises, checked.inferences),
		log: [...parts.flatMap((p) => p.log), ...checked.log],
	};
	// Slice 2: the attackers' files live in brief/slice2/; the answer key (from held-out filings) in replay/, read only here.
	const lanes = join(out, "slice2");
	if (existsSync(lanes)) {
		const baselineFile = join(lanes, "baseline-points.json");
		const points: BaselinePoint[] = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, "utf8")).points : [];
		twin.attacks = await step("7-attacks", async () => {
			const alog: string[] = [];
			const attacks = loadAttacks(lanes, twin, alog);
			await verifyAttacks(m, attacks, m.profile.filingDate, alog);
			await compareToBaseline(attacks, points);
			twin.log.push(...alog);
			return rankAttacks(attacks);
		});
		const keyFile = join(out, "..", "replay", "answer-key.json");
		if (existsSync(keyFile)) {
			const r = await step("8-replay", () => replay(JSON.parse(readFileSync(keyFile, "utf8")) as AnswerKey, twin.attacks!, points));
			writeFileSync(join(out, "..", "replay", "replay.json"), JSON.stringify(r, null, 1));
			console.log("replay", r.summary);
		}
	}
	// Slice 3: the defender's responses, opposing counsel's counters and the judge's rulings, each written by a separate agent.
	const s3 = join(out, "slice3");
	const read = (f: string) => (existsSync(join(s3, f)) ? JSON.parse(readFileSync(join(s3, f), "utf8")) : null);
	if (twin.attacks) {
		twin.statusUnderAttack = computeStatus(claims, twin.premises, twin.inferences, twin.attacks);
		twin.responses = read("responses.json")?.responses;
		const rulings = read("rulings.json")?.rulings as { attack: string; exposure: "closed" | "contested" | "open"; reason: string }[] | undefined;
		const counters = (read("counters.json")?.counters ?? []) as { attack: string; counter: string }[];
		if (rulings) {
			twin.exchanges = rulings.map((r) => ({ attack: r.attack, response: twin.responses?.find((x) => x.answers === r.attack)?.id ?? null, counter: counters.find((c) => c.attack === r.attack)?.counter ?? null, ruling: { exposure: r.exposure, reason: r.reason } }));
			twin.statusAfter = computeStatus(claims, twin.premises, twin.inferences, twin.attacks, twin.exchanges);
			// The redline: edits from responses that held. An edit applies only where its quote is in the brief verbatim.
			let hardened = m.text("brief");
			twin.redline = (twin.responses ?? []).filter((r) => r.edit).flatMap((r) => {
				const exposure = twin.exchanges!.find((e) => e.attack === r.answers)?.ruling.exposure ?? "open";
				if (exposure === "open") return [];
				const applied = hardened.includes(r.edit!.quote);
				if (applied) hardened = hardened.replace(r.edit!.quote, r.edit!.replacement);
				else twin.log.push(`${r.id}: redline quote not found verbatim in the brief`);
				return [{ attack: r.answers, response: r.id, quote: r.edit!.quote, replacement: r.edit!.replacement, applied, exposure }];
			});
			writeFileSync(join(out, "hardened-brief.txt"), hardened);
		}
	}
	writeFileSync(join(out, "twin.json"), JSON.stringify(twin, null, 1));
	const count = (o: Record<string, string>) => Object.values(o).reduce<Record<string, number>>((a, v) => ((a[v] = (a[v] ?? 0) + 1), a), {});
	console.log("claims", count(twin.status.claims), "premises", count(twin.status.premises));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
