import { requireEnv } from "./config";

export type JevAnswer = { choice?: string; noul?: number; confidence?: number; probabilities?: Record<string, number> };

async function post(state: unknown, questions: Record<string, unknown>, attempt = 0): Promise<Record<string, JevAnswer>> {
	const res = await fetch("https://api.typesafe.ai/v1/systemone", {
		method: "POST",
		headers: { Authorization: `Bearer ${requireEnv("TYPESAFE_API_KEY")}`, "Content-Type": "application/json" },
		body: JSON.stringify({ model: "jev-latest", state, questions }),
		signal: AbortSignal.timeout(60_000),
	});
	if (!res.ok) {
		// ponytail: one retry after 3 s on 429/5xx; add backoff if the logs show more
		if (attempt < 1 && (res.status === 429 || res.status >= 500)) {
			await new Promise((r) => setTimeout(r, 3000));
			return post(state, questions, attempt + 1);
		}
		throw new Error(`TypeSafe ${res.status}: ${await res.text()}`);
	}
	const body = (await res.json()) as { answers?: Record<string, JevAnswer> };
	if (!body.answers) throw new Error("TypeSafe response has no answers");
	return body.answers;
}

/** One question per item, batched; answers come back in item order. `question` gets the item's path, e.g. `items[3]`; wrap paths in backticks inside instructions, e.g. `` `items[3].premise` ``. */
export async function askJevBatch<T>(items: T[], question: (path: string) => Record<string, unknown>, size = 20, shared: Record<string, unknown> = {}): Promise<JevAnswer[]> {
	const out: JevAnswer[] = [];
	for (let i = 0; i < items.length; i += size) {
		const chunk = items.slice(i, i + size);
		const questions = Object.fromEntries(chunk.map((_, j) => [`q${j}`, question(`items[${j}]`)]));
		const answers = await post({ ...shared, items: chunk }, questions);
		chunk.forEach((_, j) => out.push(answers[`q${j}`] ?? {}));
	}
	return out;
}
