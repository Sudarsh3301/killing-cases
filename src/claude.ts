import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { CONFIG, requireEnv } from "./config";

export type Tool = { name: string; description: string; input: z.ZodObject; run: (input: any) => Promise<string> };

export async function runAgent<T>(a: { system: string; user: string; tools?: Tool[]; result: z.ZodType<T>; maxTurns?: number }): Promise<T> {
	const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
	const tools = [
		...(a.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: z.toJSONSchema(t.input) as any })),
		{ name: "submit", description: "Submit the final result. Call it exactly once, when you are done.", input_schema: z.toJSONSchema(a.result) as any },
	];
	const messages: any[] = [{ role: "user", content: a.user }];
	for (let turn = 0; turn < (a.maxTurns ?? 25); turn++) {
		const res = await client.messages.create({ model: CONFIG.frontierModel, max_tokens: CONFIG.maxTokens, system: a.system, tools, messages });
		messages.push({ role: "assistant", content: res.content });
		const uses = res.content.filter((b: any) => b.type === "tool_use") as any[];
		if (!uses.length) {
			messages.push({ role: "user", content: "Call submit with the result now." });
			continue;
		}
		const results: any[] = [];
		for (const u of uses) {
			if (u.name === "submit") {
				const parsed = a.result.safeParse(u.input);
				if (parsed.success) return parsed.data;
				results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: `Invalid result: ${parsed.error.message}` });
				continue;
			}
			const tool = a.tools?.find((t) => t.name === u.name);
			results.push({ type: "tool_result", tool_use_id: u.id, content: tool ? await tool.run(tool.input.parse(u.input)) : `Unknown tool ${u.name}` });
		}
		messages.push({ role: "user", content: results });
	}
	throw new Error("The agent did not submit within its turn budget");
}
