/**
 * Step 2: does a model without the graph engine know what falls with what?
 *  - court: a one-prompt baseline gets the brief, the attacks and the judge's rulings (no graph) and calls each claim; scored against the court.
 *  - cliff: what-if scenarios (knock out k premises). The engine's answer is the key; the model gets the same map and rules in words.
 *    This measures dependency tracking, not legal truth.
 * usage: tsx --env-file=.env scripts/cliff.ts [matter] [--model <openrouter slug>] [--n 40] [--keep 12] [--only court|cliff] [--offline]
 * --offline: no API. Writes each prompt to results/cliff/prompts/ and reads answers from results/cliff/answers/<model>/<prompt>.json
 *   (written by agent sessions). Re-run after the answers are in to score. --keep picks scenarios evenly across difficulty.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod/v4";
import { loadMatter } from "../src/matter";
import { askJson } from "../src/openrouter";
import { computeStatus } from "../src/status";
import type { Attack, Status, Twin } from "../src/types";

const arg = (name: string, d: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const matter = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "hartford-v-carson-madrona";
const model = arg("model", process.env.BASELINE_MODEL ?? "openai/gpt-6.1-sol");
const n = Number(arg("n", "40"));
const only = arg("only", "both");
const keep = Number(arg("keep", "0"));
const offline = process.argv.includes("--offline");
const short = matter.split("-")[0];

const twin: Twin = JSON.parse(readFileSync(`out/${matter}/brief/twin.json`, "utf8"));
const court: Record<string, { court: string }> = JSON.parse(readFileSync(`results/${short}-court-claims.json`, "utf8")).claims;
const claimIds = twin.claims.map((c) => c.id);
const Verdict = z.enum(["secure", "exposed", "lost"]);
const Answer = z.object({ claims: z.record(z.string(), Verdict) });
const outDir = `results/cliff`;
mkdirSync(outDir, { recursive: true });
let tokens = 0;
const pending: string[] = [];

/** One model call, or in --offline mode the agent-written answer for this prompt (null until it exists). */
async function ask(id: string, system: string, user: string): Promise<Record<string, string> | null> {
	if (!offline) {
		const { data, usage } = await askJson(model, system, user, Answer);
		tokens += usage.prompt + usage.completion;
		return data.claims;
	}
	mkdirSync(`${outDir}/prompts`, { recursive: true });
	writeFileSync(`${outDir}/prompts/${id}.txt`, `SYSTEM:\n${system}\n\nUSER:\n${user}\n`);
	const f = `${outDir}/answers/${model.replace(/[^\w.-]/g, "_")}/${id}.json`;
	if (!existsSync(f)) { pending.push(id); return null; }
	return Answer.parse(JSON.parse(readFileSync(f, "utf8"))).claims;
}

const claimList = twin.claims.map((c) => `- ${c.id} (${c.level}${c.parent ? `, under ${c.parent}` : ""}): ${c.text}`).join("\n");
const exposure = new Map(twin.exchanges!.map((e) => [e.attack, e.ruling]));

async function courtTest() {
	const attacks = twin.attacks!.map((a) => `[${a.id}] ${a.type} on ${a.target} — ${a.text}\n  JUDGE: ${exposure.get(a.id)?.exposure ?? "open"} — ${exposure.get(a.id)?.reason ?? ""}`).join("\n");
	const calls = await ask(`${short}-court`,
		`You are a senior litigator. For each claim the brief makes, say how it stands after the attacks and the judge's rulings: "secure" (it will be granted), "exposed" (it is genuinely in doubt) or "lost" (it will fail). Reply as JSON: {"claims": {"<claim id>": "secure" | "exposed" | "lost", ...}} with every claim id.`,
		`BRIEF:\n${loadMatter(matter).text("brief")}\n\nCLAIMS:\n${claimList}\n\nATTACKS ON THE BRIEF, EACH WITH THE JUDGE'S RULING (open = the attack stands, contested = in doubt, closed = answered):\n${attacks}`);
	if (!calls) return null;
	const score = (calls: Record<string, string>) => ({
		exact: claimIds.filter((c) => calls[c] === court[c].court).length,
		direction: claimIds.filter((c) => calls[c] === "exposed" && court[c].court === "lost").length,
		of: claimIds.length,
	});
	return { model, baseline: { calls, ...score(calls) }, engine: { calls: twin.statusAfter!.claims, ...score(twin.statusAfter!.claims) } };
}

// Seeded, so a run can be repeated.
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const RULES = `How status is computed:
- A premise is "fallen" if knocked out, or already "undermined"/"contradicted". It is "ok" if "supported" or "unchecked". It is "soft" if "contested". Anything else (unanchored, sealed) is neither ok nor fallen.
- A sub-claim used as an input is ok if "secure", soft if "exposed", fallen if "lost".
- A step is "undercut" if listed as undercut. Otherwise it "holds" if every input is ok (it is "contested" instead if listed as contested), it is "contested" if every input is ok or soft, and it is "weak" otherwise.
- A route is a step with at least one input that is a fact premise, a text premise or a claim. Steps whose inputs are only rules or holdings are not routes.
- A claim is "lost" if listed as rebutted. Else, if it has steps but no routes: "exposed". Else, if it has no routes and has sub-claims: "secure" if all sub-claims are secure, "lost" if any is lost, else "exposed". Else, if any route holds: "secure" ("exposed" if the claim is listed as contested). Else, if every route is undercut or has a fallen input: "lost". Else "exposed".
- Sub-claims feed their parents, so resolve from the bottom up.`;

// The map as filed, before any attack: here knockouts can move many claims, so scenarios span easy to hard.
function mapText(s: Status) {
	return [
		`CLAIMS:\n${twin.claims.map((c) => `- ${c.id}${c.parent ? ` (under ${c.parent})` : ""}`).join("\n")}`,
		`STEPS (inputs -> claim):\n${twin.inferences.map((i) => `- ${i.id}: ${i.from.join(", ")} -> ${i.to}`).join("\n")}`,
		`PREMISES (id, kind, status):\n${twin.premises.map((p) => `- ${p.id}: ${p.kind}, ${s.premises[p.id]}`).join("\n")}`,
	].join("\n\n");
}

async function cliffTest() {
	const base = twin.status;
	const knockable = twin.premises.filter((p) => base.premises[p.id] === "supported" || base.premises[p.id] === "contested");
	const candidates = [];
	for (let j = 0; j < n; j++) {
		const k = 1 + (j % 6);
		const picked = [...knockable].sort(() => rand() - 0.5).slice(0, k).map((p) => p.id);
		const synthetic: Attack[] = picked.map((id, x) => ({ id: `ko-${x}`, type: "undermine", target: id, lane: "structure", question: null, text: "", severity: "critical", rank: 0, anchors: [], authority: [], verified: true }));
		const truth = computeStatus(twin.claims, twin.premises, twin.inferences, synthetic).claims;
		candidates.push({ id: `${short}-cliff-${String(j + 1).padStart(2, "0")}`, picked, truth, changed: claimIds.filter((c) => truth[c] !== base.claims[c]).length });
	}
	// --keep: evenly spaced across difficulty (claims that change), so a small run still spans easy to hard.
	const sorted = [...candidates].sort((a, b) => a.changed - b.changed);
	const chosen = keep && keep < n ? Array.from({ length: keep }, (_, x) => sorted[Math.round((x * (n - 1)) / (keep - 1))]) : candidates;
	const scenarios = [];
	for (const c of chosen) {
		const calls = await ask(c.id,
			`You trace an argument map exactly by its rules. Reply as JSON: {"claims": {"<claim id>": "secure" | "exposed" | "lost", ...}} with every claim id.`,
			`${RULES}\n\n${mapText(base)}\n\nKNOCK OUT these premises (they are now fallen): ${c.picked.join(", ")}\n\nGive every claim's status after the knockout.`);
		if (!calls) continue;
		const right = claimIds.filter((x) => calls[x] === c.truth[x]).length;
		scenarios.push({ id: c.id, knocked: c.picked, changed: c.changed, right, of: claimIds.length, allRight: right === claimIds.length, model: calls, engine: c.truth });
		console.log(`${c.id}: knocked ${c.picked.length}, ${c.changed} claims change, model right on ${right}/${claimIds.length}`);
	}
	const byChanged: Record<number, { scenarios: number; allRight: number }> = {};
	for (const s of scenarios) { const b = (byChanged[s.changed] ??= { scenarios: 0, allRight: 0 }); b.scenarios++; b.allRight += +s.allRight; }
	return { model, offline, note: "Answer key is the engine; this measures dependency tracking, not legal truth." + (offline ? " Offline: answers written by Claude agent sessions told to answer from the prompt alone; that they used no tools is instructed, not enforced." : ""), byChanged, scenarios };
}

(async () => {
	const tag = model.replace(/[^\w.-]/g, "_");
	if (only !== "cliff") {
		const r = await courtTest();
		if (r) writeFileSync(`${outDir}/${short}-court-${tag}.json`, JSON.stringify(r, null, 1));
		if (r) console.log(`court test: baseline ${r.baseline.exact}/${r.baseline.of} exact (+${r.baseline.direction} direction); engine ${r.engine.exact}/${r.engine.of} (+${r.engine.direction})`);
	}
	if (only !== "court") {
		const r = await cliffTest();
		if (r.scenarios.length) writeFileSync(`${outDir}/${short}-cliff-${tag}.json`, JSON.stringify(r, null, 1));
		console.log("all claims right, by number of claims that change:", r.byChanged);
	}
	if (pending.length) console.log(`${pending.length} prompts waiting for answers in ${outDir}/answers/${model.replace(/[^\w.-]/g, "_")}/: ${pending.join(", ")}`);
	if (!offline) console.log(`tokens used: ${tokens}`);
})().catch((e) => { console.error(e); process.exit(1); });
