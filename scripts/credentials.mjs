// Organizer CLI for the final event credentials (32 teams, TEAM-01..TEAM-32). It NEVER prints a password, a shared code or the passphrase.
//
//   node scripts/credentials.mjs generate  --out D:\Ghost404-Credentials\event-credentials.v1.enc        (ONCE; refuses to overwrite; prompts for the passphrase)
//   node scripts/credentials.mjs check     --bundle <file>                                              (decrypts and validates; prints counts only)
//   node scripts/credentials.mjs preflight --bundle <file> [--url-env DATABASE_URL]                     (read-only: which database, what is there, what would happen)
//   node scripts/credentials.mjs import    --bundle <file> [--url-env ...]                              (DRY RUN)
//   node scripts/credentials.mjs import    --bundle <file> --apply --confirm-database <exact name>      (writes; never overwrites an existing account)
//   node scripts/credentials.mjs verify    --bundle <file> [--url-env ...]                              (every printed password vs the database, groups, shared codes)
//   node scripts/credentials.mjs print     --bundle <file> --out <dir> [--include primary|reserve|all] [--url-env ...]   (HTML cards with plaintext passwords)
//
// Passphrase: environment variable GHOST_CRED_PASSPHRASE, or a hidden prompt. Database: DIRECT_URL, else DATABASE_URL (or the variable named by --url-env). The bundle MUST live outside the repository.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";
import { decryptBundle, encryptBundle, fingerprint, generateBundle, renderCardsHtml, MIN_PASSPHRASE } from "./credentials-lib.mjs";
import { describeUrl, importBundle, inspect, reserveActivations, verifyDatabase } from "./credentials-db.mjs";

const args = process.argv.slice(2), command = args[0];
const flag = n => args.includes(`--${n}`);
const value = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const REPO = resolve(import.meta.dirname, "..");
const outside = p => { const r = resolve(p); if (r === REPO || r.startsWith(REPO + sep)) throw new Error("Refusing to use a path inside the repository: credentials must never be committed. Use a protected folder such as D:\\Ghost404-Credentials."); return r; };

function ask(question, hidden) {
  return new Promise(accept => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) { rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(question); }; }
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write("\n"); accept(answer); });
  });
}
async function passphrase(confirm) {
  const fromEnv = process.env.GHOST_CRED_PASSPHRASE; if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) throw new Error("Set GHOST_CRED_PASSPHRASE for this command, or run it in an interactive terminal.");
  const first = await ask("Bundle passphrase: ", true);
  if (confirm && first !== await ask("Repeat passphrase: ", true)) throw new Error("The passphrases differ.");
  return first;
}
const load = async () => { const file = outside(value("bundle") ?? ""); if (!existsSync(file)) throw new Error("--bundle <file> not found."); return decryptBundle(readFileSync(file, "utf8"), await passphrase(false)); };
function protect(path) { // best effort: owner-only access (Windows ACL; POSIX mode is set at creation)
  if (process.platform === "win32" && process.env.USERNAME) spawnSync("icacls", [path, "/inheritance:r", "/grant:r", `${process.env.USERNAME}:F`], { stdio: "ignore" });
}
function connect() {
  const env = value("url-env"), url = env ? process.env[env] : process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL: set DATABASE_URL (or DIRECT_URL, or pass --url-env NAME).");
  return { db: new PrismaClient({ datasourceUrl: url }), ...describeUrl(url) };
}
const show = (label, v) => console.log(`${label.padEnd(26)}${v}`);

try {
  if (command === "generate") {
    const out = outside(value("out") ?? ""); if (!value("out")) throw new Error("--out <file> is required.");
    if (existsSync(out)) throw new Error("Refusing to overwrite an existing bundle: credentials are generated ONCE and kept forever.");
    const pass = await passphrase(true); if (pass.length < MIN_PASSPHRASE) throw new Error(`The passphrase must be at least ${MIN_PASSPHRASE} characters.`);
    const bundle = generateBundle();
    mkdirSync(dirname(out), { recursive: true }); protect(dirname(out));
    writeFileSync(out, encryptBundle(bundle, pass), { flag: "wx", mode: 0o600 }); protect(out);
    const check = decryptBundle(readFileSync(out, "utf8"), pass); // prove the saved file decrypts before anything else happens
    show("Bundle saved", out); show("Bundle id", check.bundleId); show("Fingerprint", fingerprint(check)); show("Teams", `${check.teams.length} (TEAM-01 … TEAM-30 primary, TEAM-31 and TEAM-32 reserve)`);
    console.log("Keep the passphrase and a second copy of the file in separate safe places. Nothing secret was printed.");
  } else if (command === "check") {
    const b = await load(); const g = { A: 0, B: 0, C: 0 }; for (const t of b.teams) if (t.group) g[t.group]++;
    show("Bundle", "valid"); show("Bundle id", b.bundleId); show("Fingerprint", fingerprint(b)); show("Teams", `${b.teams.length} (${b.teams.filter(t => t.kind === "primary").length} primary, ${b.teams.filter(t => t.kind === "reserve").length} reserve)`); show("Groups A/B/C", `${g.A}/${g.B}/${g.C}`); show("Shared fragments", "6 unique (3 private, 3 public)");
  } else if (command === "preflight" || command === "import") {
    const bundle = await load(), { db, target, environment } = connect();
    try {
      const apply = command === "import" && flag("apply");
      const result = command === "import" ? await importBundle(db, bundle, { apply, confirmDatabase: value("confirm-database") }) : { status: "preflight", info: await inspect(db, bundle) };
      const i = result.info;
      show("Environment", environment); show("Database host/name", target); show("Database name", i.database); show("Bundle", `${i.bundleId} (fingerprint ${i.fingerprint})`);
      if (i.classification === "schema-missing") { show("Schema", `NOT READY. missing tables: ${i.schema.missingTables.join(", ") || "-"}; missing migrations: ${i.schema.missingMigrations.join(", ") || "-"}`); console.log("Back up the database, run `npx prisma migrate deploy`, then try again."); process.exitCode = 2; }
      else {
        show("Teams in database", i.teamCount); show("TEAM-01..32 present", `${i.existingBundleTeams} of 32`); show("Round", i.round); show("Submissions / task scores", `${i.submissions} / ${i.taskScores}`); show("Insider codes in database", `${i.insiderCodes} of 3 groups`);
        show("Classification", i.classification);
        show("Plan", `create ${i.plan.create.length} · attach ${i.plan.attach.length} · verify ${i.plan.verify.length} · new Insider codes ${i.plan.codes.length} · new group memberships ${i.plan.members.length}`);
        for (const c of i.conflicts) console.log(`CONFLICT  ${c}`);
        if (result.status === "conflict") { console.log("Nothing was written. Resolve the conflicts (this tool never overwrites an account)."); process.exitCode = 3; }
        else if (command === "import") console.log({ applied: "APPLIED: accounts, roster records, Insider codes and group memberships were written.", verified: "Already provisioned: nothing to write (verified).", "dry-run": "DRY RUN: nothing written. Re-run with --apply --confirm-database <name> to install.", }[result.status] ?? result.status);
        else console.log("Preflight only: nothing was written.");
      }
    } finally { await db.$disconnect(); }
  } else if (command === "verify") {
    const bundle = await load(), { db, target } = connect();
    try {
      const r = await verifyDatabase(db, bundle); show("Database host/name", target); show("Credentials checked", `${r.passwordsOk} of ${r.checked} passwords match`); show("Primary teams per group", `A ${r.groups.A} · B ${r.groups.B} · C ${r.groups.C}`);
      for (const p of r.problems) console.log(`PROBLEM   ${p}`);
      console.log(r.ok ? "VERIFIED: every printed credential, group and shared code matches this database." : "NOT VERIFIED."); if (!r.ok) process.exitCode = 3;
    } finally { await db.$disconnect(); }
  } else if (command === "print") {
    const bundle = await load(), include = value("include") ?? "primary"; if (!["primary", "reserve", "all"].includes(include)) throw new Error("--include must be primary, reserve or all.");
    const dir = outside(value("out") ?? ""); if (!value("out")) throw new Error("--out <directory> is required.");
    let activations = {}; if (value("url-env") || process.env.DATABASE_URL || process.env.DIRECT_URL) { const { db } = connect(); try { activations = await reserveActivations(db, bundle); } catch { /* printing never needs the database */ } finally { await db.$disconnect(); } }
    mkdirSync(dir, { recursive: true }); protect(dir);
    const file = join(dir, `access-cards-${include}-${bundle.bundleId}-${new Date().toISOString().replace(/[:.]/g, "-")}.html`);
    writeFileSync(file, renderCardsHtml(bundle, { include, activations }), { flag: "wx", mode: 0o600 }); protect(file);
    show("Card file", file); show("Cards", String(bundle.teams.filter(t => include === "all" || t.kind === include).length));
    console.log("The file contains plaintext passwords. Open it in a browser, print, then DELETE it. Run `verify` against the event database before printing the final cards.");
  } else {
    console.log("Commands: generate | check | preflight | import | verify | print   (see the header of scripts/credentials.mjs)");
    process.exitCode = command ? 1 : 0;
  }
} catch (error) { console.error(`ERROR: ${error.message}`); process.exitCode = 1; }
