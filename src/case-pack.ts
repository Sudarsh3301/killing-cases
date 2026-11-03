/** Runs an attacker's case-law queries against CourtListener and saves the opinions' full text.
 *  usage: case-pack.ts <queries.json> <out-dir> <filing-date YYYY-MM-DD> "<case name to exclude>"
 *  Every query is limited to opinions decided before the filing date and excludes the case itself. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireEnv } from "./config";

const API = "https://www.courtlistener.com/api/rest/v4";
const get = async (url: string) => {
	const res = await fetch(url, { headers: { Authorization: `Token ${requireEnv("COURTLISTENER_API_KEY")}` } });
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.json() as Promise<any>;
};
const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n");

async function main() {
	const [queriesFile, outDir, filingDate, exclude] = process.argv.slice(2);
	const queries = JSON.parse(readFileSync(queriesFile, "utf8")).queries as { id: string; query: string }[];
	mkdirSync(outDir, { recursive: true });
	const before = new Date(Date.parse(filingDate) - 86_400_000).toISOString().slice(0, 10);
	const seen = new Map<number, { file: string; caseName: string; citation: string; dateFiled: string; court: string; url: string; queries: string[] }>();
	for (const q of queries) {
		const full = `(${q.query}) AND dateFiled:[* TO ${before}] AND NOT caseName:(${JSON.stringify(exclude)})`;
		const r = await get(`${API}/search/?${new URLSearchParams({ type: "o", q: full, order_by: "score desc" })}`);
		const hits = (r.results ?? []).slice(0, 5);
		console.log(`${q.id}: ${r.count ?? 0} results, keeping ${hits.length}`);
		for (const h of hits) {
			const prior = seen.get(h.cluster_id);
			if (prior) { prior.queries.push(q.id); continue; }
			const opinionId = h.opinions?.[0]?.id;
			if (!opinionId) continue;
			const op = await get(`${API}/opinions/${opinionId}/?fields=plain_text,html_with_citations,html`);
			const text = op.plain_text || strip(op.html_with_citations || op.html || "");
			const meta = { file: `cl-${h.cluster_id}.txt`, caseName: h.caseName, citation: (h.citation ?? []).join("; "), dateFiled: h.dateFiled, court: h.court, url: `https://www.courtlistener.com${h.absolute_url}`, queries: [q.id] };
			writeFileSync(join(outDir, meta.file), `${meta.caseName}\n${meta.citation}\nDecided ${meta.dateFiled} · ${meta.court}\n${meta.url}\n\n${text}`);
			seen.set(h.cluster_id, meta);
		}
	}
	writeFileSync(join(outDir, "index.json"), JSON.stringify([...seen.values()], null, 1));
	console.log(`${seen.size} opinions saved to ${outDir}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
