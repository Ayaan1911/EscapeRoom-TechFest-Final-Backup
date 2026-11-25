// Organizer CLI: create the PRIVATE Round 1 case file (fresh answer selections/ids for the event).
//   node scripts/round1-case.mjs generate --out private/round1-case-v1.json
// Refuses to overwrite. Never prints any value. The server reads the file once at start-up (restart to apply; never mid-round).
// Generate it ONCE before the event, back it up next to the credential bundle, and never commit it (private/ is git-ignored).
// Changing it after teams have progress invalidates their recorded answers: use a fresh database.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2), value = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
if (args[0] !== "generate" || !value("out")) { console.error("usage: node scripts/round1-case.mjs generate --out <file>"); process.exit(2); }
const out = resolve(value("out"));
if (existsSync(out)) { console.error(`REFUSING: ${out} already exists (answers must not change once issued).`); process.exit(1); }
const tracked = spawnSync("git", ["check-ignore", "-q", out]).status; // 0 = ignored by git
if (tracked !== 0) { console.error(`REFUSING: ${out} is not git-ignored; put it under private/.`); process.exit(1); }

import { generateRound1Case } from "./round1-case-lib.mjs";

mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
writeFileSync(out, JSON.stringify(generateRound1Case(), null, 2) + "\n", { mode: 0o600, flag: "wx" });
console.log(`Wrote ${out} (mode 600). Nothing secret was printed. Run: npx vitest run tests/round1-case.test.ts  then restart the server.`);
