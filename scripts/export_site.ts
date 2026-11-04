/** Writes the site as static files to site/: the summary (index.html), the run (run.html), the full map (map.html),
 *  and data/<matter>/ for every matter with a recorded run.  usage: npx tsx scripts/export_site.ts */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMatter, MATTERS_DIR } from "../src/matter";
import { FEATURED, homeHtml, reasonsJson, recordJson, replayJson, resultsJson, storyJson, twinJson, twinPath } from "../viewer/data";

const SITE = join(__dirname, "..", "site");
rmSync(join(SITE, "data"), { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
writeFileSync(join(SITE, "index.html"), homeHtml(FEATURED)); // fails if a number on the page has no value in the data
for (const page of ["run.html", "map.html"]) copyFileSync(join(__dirname, "..", "viewer", page), join(SITE, page));
for (const m of readdirSync(MATTERS_DIR).filter((d) => existsSync(twinPath(d)))) {
	const dir = join(SITE, "data", m);
	mkdirSync(join(dir, "record"), { recursive: true });
	const files = { "twin.json": twinJson(m), "replay.json": replayJson(m), "story.json": storyJson(m), "results.json": resultsJson(m), "reasons.json": reasonsJson(m) };
	for (const [f, body] of Object.entries(files)) if (body) writeFileSync(join(dir, f), body);
	// Only the filing-day record: held-out papers and the ruling never reach the site except through the replay.
	const docs = loadMatter(m).docs;
	for (const d of docs) writeFileSync(join(dir, "record", `${d.file}.json`), recordJson(m, d.file)!);
	console.log(`${m}: ${Object.entries(files).filter(([, b]) => b).map(([f]) => f).join(", ")}, ${docs.length} record files`);
}
