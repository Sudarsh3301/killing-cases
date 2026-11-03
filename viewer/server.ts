import { existsSync, readFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import { loadMatter } from "../src/matter";

const OUT = join(__dirname, "..", "out");
const send = (res: ServerResponse, code: number, body: string | Buffer, type: string) => res.writeHead(code, { "Content-Type": type }).end(body);

createServer((req, res) => {
	const path = new URL(req.url ?? "/", "http://localhost").pathname;
	if (path === "/") return send(res, 200, readFileSync(join(__dirname, "index.html")), "text/html; charset=utf-8");
	const m = path.match(/^\/twin\/([\w-]+)$/);
	if (m) {
		const f = join(OUT, m[1], "brief", "twin.json");
		return existsSync(f) ? send(res, 200, readFileSync(f), "application/json") : send(res, 404, "{}", "application/json");
	}
	const r = path.match(/^\/replay\/([\w-]+)$/);
	if (r) {
		const f = join(OUT, r[1], "replay", "replay.json");
		if (existsSync(f)) {
			// Round 6 rides along with the replay when it exists.
			const r6 = join(OUT, r[1], "replay", "round6.json");
			const body = JSON.parse(readFileSync(f, "utf8"));
			if (existsSync(r6)) body.round6 = JSON.parse(readFileSync(r6, "utf8"));
			return send(res, 200, JSON.stringify(body), "application/json");
		}
		return existsSync(f) ? send(res, 200, readFileSync(f), "application/json") : send(res, 404, "{}", "application/json");
	}
	// The record as known at filing, one document at a time. loadMatter already drops held-out files.
	const d = path.match(/^\/record\/([\w-]+)\/([\w.-]+)$/);
	if (d) {
		let doc;
		try { doc = loadMatter(d[1]).doc(d[2]); } catch { doc = undefined; } // unknown matter
		return doc ? send(res, 200, JSON.stringify({ file: doc.file, pages: doc.pages }), "application/json") : send(res, 404, "{}", "application/json");
	}
	send(res, 404, "not found", "text/plain");
}).listen(4317, () => console.log("twin viewer on http://localhost:4317"));
