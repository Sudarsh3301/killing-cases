import { z } from "zod/v4";
import { runAgent } from "../claude";
import type { Matter } from "../matter";
import { STANDARDS, STANDARDS_TEXT } from "../schemes";
import type { Claim } from "../types";

const ClaimZ = z.object({
	id: z.string(), text: z.string(),
	level: z.enum(["relief", "element", "sub_issue"]),
	parent: z.string().nullable(),
	ourGoal: z.enum(["establish", "defeat"]),
	burden: z.enum(["us", "them"]),
	standard: z.enum(STANDARDS),
});

export async function buildSkeleton(m: Matter): Promise<Claim[]> {
	const { claims } = await runAgent({
		system: `You turn a litigation brief into the claim tree of the side that filed it.
${STANDARDS_TEXT}
Rules:
- Exactly one "relief" claim (parent null): what the brief asks the court to do.
- One "element" per issue the brief must win to get that relief (parent = the relief id).
- A "sub_issue" only where the brief argues a distinct point under an element.
- ourGoal is "establish" when our side argues the claim is true, "defeat" when it argues the other side cannot prove it.
- Ids are short slugs such as "el-endorsement". Use only what the brief argues.`,
		user: `PROFILE:\n${JSON.stringify(m.profile, null, 1)}\n\nBRIEF:\n${m.text("brief")}\n\nPAPERS THE BRIEF ANSWERS, AND CONTEXT:\n${m.text("motion", "context")}`,
		result: z.object({ claims: z.array(ClaimZ) }),
	});
	return claims;
}
