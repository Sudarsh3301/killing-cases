export const SCHEMES = {
	rule_application: { what: "Applies a rule (statute, regulation, contract term) to the facts", questions: ["Are all the rule's conditions met on these facts?", "Does an exception apply?", "Is the rule binding in this forum and still good law?"] },
	precedent_holding: { what: "Relies on what a court held", questions: ["Is the case binding or only persuasive here?", "Was it limited, distinguished or overruled later?", "Is the proposition its holding or dicta?"] },
	precedent_analogy: { what: "Argues this case is like a decided case", questions: ["Are the cases alike in the respects that mattered to the court?", "Is there a relevant difference?", "Is there a closer case that went the other way?"] },
	witness_testimony: { what: "Relies on what a witness said", questions: ["Was the witness in a position to know?", "Is the testimony consistent with the witness's other statements and with the documents?", "Is the witness interested or biased?"] },
	documentary: { what: "Relies on what a document says", questions: ["Does the document say what the brief says it says?", "Is it complete and authentic?", "Does another document qualify or contradict it?"] },
	expert_opinion: { what: "Relies on an expert's opinion", questions: ["Is the expert qualified in this field?", "Is the opinion based on the evidence in this record?", "Do other experts disagree?"] },
	circumstantial: { what: "Infers a conclusion from surrounding facts", questions: ["Does the inference follow, or is there an equally likely explanation?", "Are facts missing that the inference needs?"] },
	interpretation: { what: "Reads the meaning of a text (contract, statute, policy)", questions: ["Is the meaning plain, or is there another reasonable reading?", "Does another provision, a definition or an endorsement change it?", "Does a canon of construction point the other way?"] },
} as const;

export type SchemeId = keyof typeof SCHEMES;
export const SCHEME_IDS = Object.keys(SCHEMES) as [SchemeId, ...SchemeId[]];

export const STANDARDS = ["no_genuine_dispute", "absence_of_evidence", "genuine_dispute", "question_of_law"] as const;

export const STANDARDS_TEXT = `Summary-judgment standards, by our position on a claim:
- movant, we must prove it: "no_genuine_dispute"
- movant, the other side must prove it: "absence_of_evidence"
- non-movant (either burden): "genuine_dispute" — we need record evidence a reasonable fact-finder could credit
- a question of law the court decides on the text (e.g. which policy clause governs): "question_of_law"`;
