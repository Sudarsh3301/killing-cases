import { requireEnv } from "./config";

export type Found = { citation: string; start: number; status: number; clusterId?: string; caseName?: string; dateFiled?: string };

export const isStatute = (c: string) => /§|\bCode\b|\bConst\.|U\.S\.C\.|C\.F\.R\./.test(c);
export const isShortForm = (c: string) => /^\s*(Id\.|Ibid\.)/i.test(c) || /\bsupra\b/i.test(c);
/** OCR often reads the "l" in "Cal." as a capital "I". */
export const fixOcr = (c: string) => c.replace(/\bCaI\b/g, "Cal").replace(/CaI\./g, "Cal.");
const squash = (s: string) => fixOcr(s).toLowerCase().replace(/[\s.]/g, "");

/** The citation found in the brief that a premise's full citation names, matched on the reporter cite without spaces or periods. */
export const match = (cite: string, found: Found[]) => found.find((f) => squash(cite).includes(squash(f.citation))) ?? null;

const pattern = (s: string) => new RegExp(s.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i");

/** The full citation a short form ("Id. at p. 632", "Rossmoor, supra, …") points back to, from the citations found in the brief. */
export function antecedent(short: string, brief: string, found: Found[]): Found | null {
	if (/\bsupra\b/i.test(short)) {
		const name = short.split(/,?\s+supra/i)[0].trim().split(/\s+/)[0].toLowerCase();
		return found.find((f) => (f.caseName ?? "").toLowerCase().includes(name) || brief.slice(Math.max(0, f.start - 200), f.start).toLowerCase().includes(name)) ?? null;
	}
	const at = brief.search(pattern(short.split(",")[0]));
	if (at < 0) return null;
	return found.filter((f) => f.start < at).at(-1) ?? null;
}

/** Every full citation CourtListener recognises in a text, with its offset. */
export async function lookup(text: string): Promise<Found[]> {
	const out: Found[] = [];
	let retried = false;
	const size = 50_000; // ponytail: fixed chunks may split a citation at a boundary; overlap chunks if that shows up
	for (let off = 0; off < text.length; off += size) {
		const res = await fetch("https://www.courtlistener.com/api/rest/v4/citation-lookup/", {
			method: "POST",
			headers: { Authorization: `Token ${requireEnv("COURTLISTENER_API_KEY")}`, "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ text: text.slice(off, off + size) }),
		});
		if (res.status === 429 && !retried) {
			// The endpoint throttles by citations per minute and says when to come back.
			const wait = Date.parse(((await res.json()) as { wait_until?: string }).wait_until ?? "") - Date.now();
			await new Promise((r) => setTimeout(r, Math.min(Math.max(wait, 5_000), 90_000)));
			retried = true;
			off -= size;
			continue;
		}
		if (!res.ok) throw new Error(`CourtListener citation lookup ${res.status}`);
		for (const r of (await res.json()) as { citation: string; start_index: number; status: number; clusters?: { id: number; case_name?: string; date_filed?: string }[] }[])
			out.push({ citation: r.citation, start: off + r.start_index, status: r.status, clusterId: r.clusters?.[0] ? String(r.clusters[0].id) : undefined, caseName: r.clusters?.[0]?.case_name, dateFiled: r.clusters?.[0]?.date_filed });
	}
	return out;
}
