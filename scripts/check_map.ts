import { readFileSync } from "node:fs";
import { checkMap } from "../src/check";
import type { Twin } from "../src/types";

const t: Twin = JSON.parse(readFileSync(`out/${process.argv[2] ?? "hartford-v-carson-madrona"}/brief/twin.json`, "utf8"));
const issues = checkMap(t.claims, t.premises, t.inferences);
for (const i of issues) console.log(`${i.rule.padEnd(16)} ${i.node}: ${i.message}`);
console.log(`${issues.length} issues`);
