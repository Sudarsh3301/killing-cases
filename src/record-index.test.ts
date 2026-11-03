import assert from "node:assert/strict";
import test from "node:test";
import { RecordIndex, sectionize } from "./record-index";

const docs = [
	{ file: "policy", role: "record" as const, pages: ["Coverage applies to bodily injury caused, in whole or in part, by your acts.", "Definitions of insured contract."] },
	{ file: "lease", role: "record" as const, pages: ["Tenant shall maintain commercial general liability insurance naming Landlord as additional insured."] },
];

test("sections keep their file and 1-based page", () => {
	const s = sectionize(docs);
	assert.equal(s.length, 3);
	assert.deepEqual([s[1].file, s[1].page], ["policy", 2]);
});

test("search ranks the section with the rare term first and filters by file", () => {
	const idx = new RecordIndex(sectionize(docs));
	assert.equal(idx.search("additional insured landlord")[0].file, "lease");
	assert.equal(idx.search("caused in whole or in part")[0].page, 1);
	assert.equal(idx.search("insured", 5, "policy").every((s) => s.file === "policy"), true);
});

test("a page longer than the section size is split", () => {
	const s = sectionize([{ file: "big", role: "record", pages: ["x ".repeat(4000)] }], 3000);
	assert.equal(s.length, 3);
});
