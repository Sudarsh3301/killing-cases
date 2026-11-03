import assert from "node:assert/strict";
import test from "node:test";
import { antecedent, fixOcr, isShortForm, isStatute, match, type Found } from "./citations";

const brief = "See Rossmoor Sanitation, Inc. v. Pylon, Inc., 13 Cal.3d 622 (1975). Then Truck v. AMCO, 56 Cal.App.5th 619 (2020). Id. at p. 632. Later, Rossmoor, supra, 13 Cal.3d at pp. 633–635.";
const found: Found[] = [
	{ citation: "13 Cal.3d 622", start: brief.indexOf("13 Cal.3d 622"), status: 200, caseName: "Rossmoor Sanitation, Inc. v. Pylon, Inc." },
	{ citation: "56 Cal.App.5th 619", start: brief.indexOf("56 Cal.App.5th 619"), status: 404 },
];

test("Id. points back to the nearest full citation before it", () => {
	assert.equal(antecedent("Id. at p. 632, citation omitted", brief, found)?.citation, "56 Cal.App.5th 619");
});

test("supra points back to the full citation of the same case name", () => {
	assert.equal(antecedent("Rossmoor, supra, 13 Cal.3d at pp. 633–635", brief, found)?.citation, "13 Cal.3d 622");
});

test("a full citation matches the brief's citation despite spacing, periods and OCR", () => {
	assert.equal(match("Truck Ins. Exch. v. AMCO Ins. Co., 56 Cal. App. 5th 619, 630 (2020)", found)?.citation, "56 Cal.App.5th 619");
	assert.equal(match("JPI v. RJS, 156 CaI.App.4th 1448", [{ citation: "156 Cal.App.4th 1448", start: 0, status: 200 }])?.citation, "156 Cal.App.4th 1448");
	assert.equal(match("Some Case, 1 F.4th 2", found), null);
});

test("statutes, short forms and OCR errors are recognised", () => {
	assert.equal(isStatute("California Code of Civil Procedure §§ 685.010, 685.020(a)"), true);
	assert.equal(isStatute("Truck Ins. Exch. v. AMCO Ins. Co., 56 Cal.App.5th 619"), false);
	assert.equal(isShortForm("Id. at pp. 328–329"), true);
	assert.equal(isShortForm("Rossmoor, supra, 13 Cal.3d at p. 633"), true);
	assert.equal(fixOcr("156 CaI.App.4th 1448"), "156 Cal.App.4th 1448");
});
