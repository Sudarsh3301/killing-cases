import assert from "node:assert/strict";
import test from "node:test";
import { bestSentence, locate, matchScore } from "./anchor";

const page = "Case 3:23-cv-06259 Document 64-10. This insurance applies only to bodily injury caused, in whole or in part, by your acts or omissions in the performance of your ongoing operations for the additional insured.";

test("an exact quote scores 1 regardless of spacing and case", () => {
	assert.equal(matchScore("caused,  in WHOLE or in part, by your acts", page), 1);
});

test("one OCR-garbled word in twelve still passes the 0.85 threshold", () => {
	assert.ok(matchScore("bodily injury caused, in whoie or in part, by your acts or omissions", page) >= 0.85);
});

test("an unrelated sentence fails", () => {
	assert.ok(matchScore("the tenant shall pay rent monthly to the landlord in advance", page) < 0.5);
});

test("locate returns the 1-based page that holds the quote", () => {
	assert.deepEqual(locate("in the performance of your ongoing operations", ["nothing here", page])?.page, 2);
	assert.equal(locate("not anywhere at all in this text", ["nothing here", page]), null);
});

test("bestSentence picks the sentence closest to the premise", () => {
	assert.match(bestSentence("coverage only where injury caused in whole or in part by acts", page), /caused, in whole or in part/);
});
