import { z } from "zod/v4";
import { requireEnv } from "./config";

/** One chat call through OpenRouter that must return JSON matching `schema`. Retries once with the parse error. */
export async function askJson<T>(model: string, system: string, user: string, schema: z.ZodType<T>): Promise<{ data: T; usage: { prompt: number; completion: number } }> {
	const messages: { role: string; content: string }[] = [{ role: "system", content: system }, { role: "user", content: user }];
	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: { Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}`, "Content-Type": "application/json", "X-Title": "killing-cases" },
			body: JSON.stringify({ model, messages, response_format: { type: "json_object" } }),
		});
		if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
		const body = await res.json();
		const text: string = body.choices?.[0]?.message?.content ?? "";
		const usage = { prompt: body.usage?.prompt_tokens ?? 0, completion: body.usage?.completion_tokens ?? 0 };
		const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
		let parsed: ReturnType<typeof schema.safeParse>;
		try { parsed = schema.safeParse(JSON.parse(json)); } catch (e) { parsed = { success: false, error: e } as any; }
		if (parsed.success) return { data: parsed.data, usage };
		messages.push({ role: "assistant", content: text }, { role: "user", content: `That was not valid. Error: ${String((parsed as any).error?.message ?? parsed.error).slice(0, 500)}. Reply with the JSON object only.` });
	}
	throw new Error("The model did not return valid JSON");
}
