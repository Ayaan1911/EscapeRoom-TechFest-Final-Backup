// Organizer-only real-team provisioning. Usage (PowerShell):
//   node --env-file=.env scripts/provision-teams.mjs --list
//   node --env-file=.env scripts/provision-teams.mjs --input teams.csv --out private\credentials.csv            (dry run)
//   node --env-file=.env scripts/provision-teams.mjs --input teams.csv --out private\credentials.csv --apply
//   node --env-file=.env scripts/provision-teams.mjs --generate 50 --out private\credentials.csv --apply --expect-database <name>   (fictional; the name must match the connected database)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine.ts";
import { csvField, generateCode, generatedTeams, planTeams, teamsFromCsv } from "./provision-lib.mjs";
const args = process.argv.slice(2);
const flag = n => args.includes(`--${n}`);
const value = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (use --env-file=.env)");
const db = new PrismaClient();
try {
  // Target identity (names only, never the URL): writes require the operator to type the exact database name they intend to change.
  const [{ name: connected }] = await db.$queryRaw`select current_database() as name`;
  const round = await db.gameSession.findUnique({ where: { id: 1 } });
  console.log(`Target database: ${connected}; round: ${!round?.startsAt ? "not started" : round.endedAt ? "ended" : "started"}`);
  if (flag("apply") && value("expect-database") !== connected) throw new Error(`Refusing to write: pass --expect-database <name> equal to the connected database (connected: ${connected})`);
  const existing = await db.team.findMany({ select: { id: true, name: true, variant: true, progress: true }, orderBy: { id: "asc" } });
  if (flag("list")) {
    console.log("id,name,variant");
    for (const t of existing) console.log(`${csvField(t.id)},${csvField(t.name)},${t.variant}`);
    console.log(`# ${existing.length} registered teams (access codes are stored hashed and cannot be shown)`);
  } else {
    const requested = value("input") ? teamsFromCsv(readFileSync(value("input"), "utf8")) : value("generate") ? generatedTeams(Number(value("generate"))) : null;
    if (!requested) throw new Error("Use --list, --input <csv> or --generate <n>");
    const plan = planTeams(requested, existing, value("prefix") ?? "GH");
    const out = value("out");
    if (flag("apply") && (!out || existsSync(out))) throw new Error("--apply needs --out <new file>; refusing to overwrite an existing credentials file");
    const rows = plan.map(t => ({ ...t, code: generateCode() }));
    const per = Object.fromEntries(["A", "B", "C"].map(v => [v, rows.filter(r => r.variant === v).length]));
    console.log(`Plan: ${rows.length} new teams (${rows[0].id} … ${rows.at(-1).id}); variants A/B/C = ${per.A}/${per.B}/${per.C}; ${existing.length} existing teams untouched.`);
    if (!flag("apply")) console.log("DRY RUN: nothing written. Re-run with --apply and --out <private file> to register.");
    else {
      // Credentials file first (exclusive create) so a database success never loses the only copy of the codes.
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, ["id,name,variant,access_code", ...rows.map(r => [r.id, r.name, r.variant, r.code].map(csvField).join(","))].join("\r\n") + "\r\n", { flag: "wx", mode: 0o600 });
      const hashed = rows.map(r => ({ id: r.id, name: r.name, participants: JSON.stringify(r.participants), codeHash: hashPassword(r.code), variant: r.variant, progress: JSON.stringify(initialProgress()) }));
      await db.$transaction(hashed.map(data => db.team.create({ data })));
      console.log(`Registered ${rows.length} teams. PRIVATE credentials written to ${out} — distribute individually, never commit, delete after the event.`);
    }
  }
} finally { await db.$disconnect(); }
