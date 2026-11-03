import assert from "node:assert/strict";
import test from "node:test";
import { normFile } from "./attacks";

test("file names from agents normalise to the bare stem", () => {
	assert.equal(normFile("text/64-0-ohio-security-msj.txt"), "64-0-ohio-security-msj");
	assert.equal(normFile("64-10-ex7-hartford-policy.txt"), "64-10-ex7-hartford-policy");
	assert.equal(normFile("64-10-ex7-hartford-policy"), "64-10-ex7-hartford-policy");
	assert.equal(normFile(null), null);
});
