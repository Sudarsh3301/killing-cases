import assert from "node:assert/strict";
import test from "node:test";
import { isFrozen, loadMatter, parseManifest } from "./matter";

test("the manifest parses into rows keyed by its header", () => {
	const rows = parseManifest("role,known_at_filing,file,url\nbrief,yes,64-0-a.pdf,https://x/a.pdf\nheldout,n/a,81-b.pdf,https://x/b.pdf\n");
	assert.equal(rows.length, 2);
	assert.equal(rows[0].file, "64-0-a.pdf");
	assert.equal(rows[1].role, "heldout");
});

test("the freeze rule keeps only files known at filing and never held-out ones", () => {
	assert.equal(isFrozen({ role: "record", known_at_filing: "yes", file: "a", url: "" }), true);
	assert.equal(isFrozen({ role: "record", known_at_filing: "no", file: "a", url: "" }), false);
	assert.equal(isFrozen({ role: "heldout", known_at_filing: "yes", file: "a", url: "" }), false);
});

test("Hartford loads with its brief and without its orders", () => {
	const m = loadMatter("hartford-v-carson-madrona");
	assert.ok(m.docs.some((d) => d.role === "brief"));
	assert.ok(!m.docs.some((d) => d.file.startsWith("81-")));
	assert.ok(!m.docs.some((d) => d.file.startsWith("67-5-")));
	assert.ok(m.text("brief").length > 10000);
});
