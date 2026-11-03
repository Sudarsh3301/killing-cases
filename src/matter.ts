import { readFileSync } from "node:fs";
import { join } from "node:path";

export const MATTERS_DIR = join(__dirname, "..", "matters");

export type Role = "brief" | "motion" | "record" | "heldout" | "context";
export type ManifestRow = { role: Role; known_at_filing: string; file: string; url: string };
export type Doc = { file: string; role: Role; pages: string[] };
export type Matter = ReturnType<typeof loadMatter>;

export function parseManifest(csv: string): ManifestRow[] {
	const [head, ...lines] = csv.trim().split(/\r?\n/);
	const cols = head.split(",");
	return lines.map((l) => {
		const v = l.split(","); // urls contain no commas
		return Object.fromEntries(cols.map((c, i) => [c, v[i]])) as ManifestRow;
	});
}

export const isFrozen = (r: ManifestRow) => r.role !== "heldout" && r.known_at_filing === "yes";

export function loadMatter(matter: string) {
	const dir = join(MATTERS_DIR, matter);
	const profile = JSON.parse(readFileSync(join(dir, "profile.json"), "utf8")) as Record<string, string>;
	const docs: Doc[] = parseManifest(readFileSync(join(dir, "manifest.csv"), "utf8"))
		.filter(isFrozen)
		.map((r) => ({ file: r.file.replace(/\.pdf$/, ""), role: r.role, pages: readFileSync(join(dir, "text", r.file.replace(/\.pdf$/, ".txt")), "utf8").replace(/\r\n/g, "\n").split("\f") }));
	const doc = (file: string) => docs.find((d) => d.file === file) ?? docs.find((d) => d.file.startsWith(file.replace(/\.(pdf|txt)$/, "")));
	const text = (...roles: Role[]) => docs.filter((d) => roles.includes(d.role)).map((d) => `=== ${d.file} ===\n${d.pages.join("\n")}`).join("\n\n");
	return { matter, profile, docs, doc, text };
}
