import { readFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { FEATURED, homeHtml, reasonsJson, recordJson, replayJson, resultsJson, storyJson, twinJson } from "./data";

const send = (res: ServerResponse, code: number, body: string | Buffer, type: string) => res.writeHead(code, { "Content-Type": type }).end(body);
const json = (res: ServerResponse, body: string | null) => (body ? send(res, 200, body, "application/json") : send(res, 404, "{}", "application/json"));
const DATA: Record<string, (m: string) => string | null> = { "twin.json": twinJson, "replay.json": replayJson, "story.json": storyJson, "results.json": resultsJson, "reasons.json": reasonsJson };

// The same paths the static site uses (scripts/export_site.ts writes them as files).
createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
	if (path === "/" || path === "/index.html") return send(res, 200, homeHtml(FEATURED), "text/html; charset=utf-8");
	if (path === "/run.html" || path === "/map.html") return send(res, 200, readFileSync(join(__dirname, path.slice(1))), "text/html; charset=utf-8");
	let m = path.match(/^\/data\/([\w-]+)\/([\w.]+\.json)$/);
	if (m && DATA[m[2]]) return json(res, DATA[m[2]](m[1]));
	if ((m = path.match(/^\/data\/([\w-]+)\/record\/([\w.-]+)\.json$/))) return json(res, recordJson(m[1], m[2]));
	send(res, 404, "not found", "text/plain");
}).listen(4317, () => console.log("site on http://localhost:4317"));
