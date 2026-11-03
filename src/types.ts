import type { SchemeId } from "./schemes";
import type { STANDARDS } from "./schemes";

export type Standard = (typeof STANDARDS)[number];
export type Support = "supports" | "contradicts" | "says_nothing";

export type Pointer = { file: string | null; page: number | null; quote: string; verified: boolean; support?: Support | "uncertain"; sealed?: boolean };

export type Claim = {
	id: string; text: string;
	level: "relief" | "element" | "sub_issue";
	parent: string | null;
	ourGoal: "establish" | "defeat";
	burden: "us" | "them";
	standard: Standard;
};

export type Premise = {
	id: string; claim: string; text: string;
	kind: "fact" | "rule" | "holding" | "text";
	anchors: Pointer[];
	citation: { text: string; courtListenerId?: string; verified: boolean; how?: "lookup" | "ambiguous"; resolvedFrom?: string; statute?: boolean; note?: string } | null;
	implicit: boolean;
};

export type CriticalQuestion = { q: string; status: "open" | "answered_in_input" | "raised"; p?: number };

export type Inference = {
	id: string; scheme: SchemeId;
	schemeCheck?: { scheme: string; confidence: number };
	from: string[]; to: string; warrant: string;
	criticalQuestions: CriticalQuestion[];
};

export type Authority = { citation: string; caseName: string; dateFiled: string; courtListenerUrl?: string; proposition: string; quote: string | null; verified?: boolean; note?: string };

export type Attack = {
	id: string;
	type: "undermine" | "undercut" | "rebut";
	target: string; // a premise, inference or claim id
	lane: "authority" | "record" | "structure" | "baseline";
	question: string | null; // the critical question it raises
	text: string;
	severity: "critical" | "moderate" | "minor";
	rank: number; // within its lane
	globalRank?: number; // across lanes
	anchors: Pointer[];
	authority: Authority[];
	verified: boolean; // every anchor found and supporting, every authority found and decided before filing
	beyondBaseline?: boolean;
	baselineMatch?: { point: string | null; confidence: number };
};

export type Status = {
	premises: Record<string, "supported" | "unanchored" | "contradicted" | "sealed" | "unchecked" | "undermined" | "contested">;
	inferences: Record<string, "holds" | "weak" | "undercut" | "contested">;
	claims: Record<string, "secure" | "exposed" | "lost">;
};

export type Twin = {
	matter: string; mode: "brief";
	claims: Claim[]; premises: Premise[]; inferences: Inference[];
	status: Status; log: string[];
	attacks?: Attack[];
	responses?: Response[];
	exchanges?: Exchange[];
	statusUnderAttack?: Status; // every verified attack open
	statusAfter?: Status; // after the exchanges' rulings
	redline?: RedlineEdit[];
};

export type RedlineEdit = { attack: string; response: string; quote: string; replacement: string; applied: boolean; exposure: Exchange["ruling"]["exposure"] };

export type Response = {
	id: string; answers: string; // attack id
	move: "rebut" | "undercut" | "reroute" | "redraft" | "concede";
	text: string;
	anchors: Pointer[];
	edit?: { quote: string; replacement: string }; // the brief's text, verbatim, and what replaces it
	task?: { kind: "obtain_evidence" | "depose" | "research"; text: string };
};

export type Exchange = {
	attack: string; response: string | null; counter: string | null;
	ruling: { exposure: "closed" | "contested" | "open"; reason: string };
};
