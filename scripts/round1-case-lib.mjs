// Pure generator for the private Round 1 case file (no I/O). Used by scripts/round1-case.mjs and tests/round1-case.test.ts.
import { randomInt } from "node:crypto";
const pick = list => list[randomInt(list.length)];
const sample = (pool, n) => { const p = [...pool]; for (let i = p.length - 1; i > 0; i--) { const j = randomInt(i + 1); [p[i], p[j]] = [p[j], p[i]]; } return p.slice(0, n); };
const twoDigit = exclude => Array.from({ length: 90 }, (_, i) => String(i + 10)).concat(["01", "02", "03", "04"]).filter(x => !exclude.includes(x));
const hex3 = () => randomInt(0x1000).toString(16).padStart(3, "0");

function variant(v) {
  const lower = v.toLowerCase();
  let session; do session = `nx-${lower}-${hex3()}`; while (session === `nx-${lower}-managed`);
  const [mint, replay, trap] = sample(Array.from({ length: 144 }, (_, i) => i + 1), 3);
  const [policy, message, access, approval] = sample(twoDigit([]), 4); // different prefixes, but keep them distinct anyway
  return {
    inbox: { entry: pick(["payroll", "supplier", "security"]), auth: pick([1, 2]), database: pick([1, 2]), session, campaign: `NX-${String(randomInt(10, 100))}` },
    trail: { mint, replay, trap },
    insider: { employee: pick([1, 3, 4]), policy, message, access, approval },
    containment: {
      events: sample(twoDigit([]), 7),
      immediate: sample(twoDigit(["05", "06", "07", "08", "09", "10"]), 4),
      recovery: sample(twoDigit(["05", "06", "07"]), 6),
    },
    verdict: null, // filled below
  };
}
export function generateRound1Case() {
  const variants = Object.fromEntries(["A", "B", "C"].map(v => [v, variant(v)]));
  for (const v of Object.values(variants)) { const [replay, employee, maintenance] = sample(twoDigit([]), 3); v.verdict = { replay, employee, maintenance }; }
  return { version: "r1-case-v1", variants };
}

