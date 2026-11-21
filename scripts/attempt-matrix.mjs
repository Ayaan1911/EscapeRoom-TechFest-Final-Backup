// Prints the per-task attempt matrix (markdown) from the single source of truth, src/lib/attempts.ts. Usage: node scripts/attempt-matrix.mjs
import { taskTiers, attemptCap } from "../src/lib/attempts.ts";
import { catalog } from "../src/lib/game/scoring.ts";
import { r2Catalog, taskMax } from "../src/lib/round2/catalog.ts";
const sum = t => Object.values(t.criteria).reduce((a, b) => a + b, 0);
const rows = [];
catalog.forEach((list, i) => list.forEach(t => rows.push(["R1", ["Inbox", "Trail", "Insider", "Containment", "Final Verdict"][i], t.id, sum(t), taskTiers[t.id].tier, attemptCap(t.id), taskTiers[t.id].why])));
for (const t of r2Catalog) rows.push(["R2", `${t.part}${t.unit}`, t.id, taskMax(t), taskTiers[t.id].tier, attemptCap(t.id), taskTiers[t.id].why]);
console.log("| Round | Unit | Task | Pts | Tier | Cap | Reasoning |\n|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.join(" | ")} |`);
const count = (round, tier) => rows.filter(r => r[0] === round && r[4] === tier).length;
console.log(`\nCounts R1 A/B/C: ${count("R1", "A")}/${count("R1", "B")}/${count("R1", "C")}; R2 A/B/C: ${count("R2", "A")}/${count("R2", "B")}/${count("R2", "C")}; exception tier (8): 0`);
