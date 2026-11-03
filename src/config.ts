export const CONFIG = {
	frontierModel: process.env.TWIN_FRONTIER_MODEL ?? "claude-opus-5-5",
	maxTokens: 16000,
	hi: 0.8, // a decision-model answer at or above this is trusted
	lo: 0.2, // between lo and hi it is escalated to the frontier model
};

export function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set`);
	return v;
}
