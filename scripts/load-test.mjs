// Reproducible load/rehearsal harness.
// LOCAL (default): runs the REAL production build (`next start`) against a DISPOSABLE local PostgreSQL database (needs the local test server, see docs).
//   npm run build && node scripts/load-test.mjs [--teams 50] [--participants 3] [--speed 1] [--port 3100] [--storm] [--connection-limit N]
// REMOTE (fail-closed; see docs/phase-8-render-neon-deployment.md): drives a DEDICATED, DISPOSABLE test service + test database ONLY.
//   Needs: --origin https://<host containing "loadtest"> --yes-remote --authorize-round-control, GHOST_LOAD_ENV=disposable-loadtest,
//   GHOST_LOAD_TARGET_DB=<db name containing "loadtest">, GHOST_LOAD_DATABASE_URL, GHOST_LOAD_ADMIN_CODE (all read from the environment, never printed).
//   The database must be completely empty; target identity is proven by logging in over HTTPS as a nonce-named marker team seeded in that database.
//   It starts then expires the round on the TEST service (authorized by the flag) and removes ONLY the rows it created (exact ids/keys/tokens).
// --speed N compresses think-time (1 = realistic 5s polling). --storm holds every team before its final submission and releases them together.
import assert from "node:assert/strict";
import { createInterface } from "node:readline/promises";
import { createTempDatabase } from "./pg-temp.mjs";
import { Scope, assertEmpty, assertRemoteTarget, cleanup, databaseName, redact, writeRound } from "./load-safety.mjs";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress, score } from "../src/lib/game/engine.ts";
import { generateCode, generatedTeams, planTeams } from "./provision-lib.mjs";
import { inboxAnswers, tamperAnswer } from "../tests/fixtures/inbox.ts";
import { trailAnswers } from "../tests/fixtures/trail.ts";
import { insiderAnswers } from "../tests/fixtures/insider.ts";
import { containmentAnswers } from "../tests/fixtures/containment.ts";
import { verdictAnswers } from "../tests/fixtures/verdict.ts";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const TEAMS = Number(arg("teams", 50)), PARTICIPANTS = Number(arg("participants", 3)), SPEED = Number(arg("speed", 1)), PORT = Number(arg("port", 3100));
const STORM = process.argv.includes("--storm"), CONN = arg("connection-limit", "");
const REMOTE_ORIGIN = arg("origin", ""), REMOTE = !!REMOTE_ORIGIN, PAUSE = process.argv.includes("--pause-for-restart");
const ORIGIN = REMOTE ? new URL(REMOTE_ORIGIN).origin : `http://127.0.0.1:${PORT}`;
if (REMOTE) assertRemoteTarget({ origin: ORIGIN, databaseUrl: process.env.GHOST_LOAD_DATABASE_URL, adminCode: process.env.GHOST_LOAD_ADMIN_CODE, argv: process.argv, env: process.env });
const sleep = ms => new Promise(r => setTimeout(r, ms / SPEED));
const cool = () => new Promise(r => setTimeout(r, 3200)); // server submission cooldown is real-time, never compressed
const temp = REMOTE ? null : await createTempDatabase("load");
const databaseUrl = REMOTE ? process.env.GHOST_LOAD_DATABASE_URL : temp.url;
const adminCode = REMOTE ? process.env.GHOST_LOAD_ADMIN_CODE : generateCode();
const serverUrl = `${databaseUrl}${CONN ? `${databaseUrl.includes("?") ? "&" : "?"}connection_limit=${CONN}` : ""}`;
const env = { ...process.env, DATABASE_URL: serverUrl, DIRECT_URL: databaseUrl, ADMIN_ACCESS_HASH: hashPassword(adminCode), APP_ORIGIN: ORIGIN, NODE_ENV: "production" };
if (!REMOTE) assert.ok(/^ghostt_/.test(databaseName(databaseUrl)) && ["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname), "local mode only targets its own disposable ghostt_ database");
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const scope = new Scope(), clients = [], secrets = [databaseUrl, adminCode, process.env.GHOST_LOAD_DATABASE_URL, process.env.GHOST_LOAD_ADMIN_CODE, process.env.DATABASE_URL, process.env.DIRECT_URL];
try { secrets.push(new URL(databaseUrl).password, new URL(databaseUrl).hostname); } catch { /* validated earlier */ }
const safe = t => redact(t, secrets);
let server, bytes = 0;
const dbSamples = [];
const stats = new Map(), errors = [], samples = [];
function record(name, ms, status) { const s = stats.get(name) ?? { lat: [], codes: {} }; s.lat.push(ms); s.codes[status] = (s.codes[status] ?? 0) + 1; stats.set(name, s); }
const pct = (a, p) => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

class Client {
  cookie = "";
  constructor() { clients.push(this); }
  async req(name, path, { method = "GET", body, headers = {}, ok = [200] } = {}) {
    const t = performance.now();
    let res;
    try { res = await fetch(ORIGIN + path, { method, body, redirect: "manual", headers: { ...(this.cookie ? { cookie: this.cookie } : {}), origin: ORIGIN, ...headers } }); }
    catch (e) { record(name, performance.now() - t, "NETERR"); errors.push(`${name}: ${safe(e.message)}`); return { status: 0, text: "" }; }
    const text = await res.text(); bytes += text.length;
    for (const c of res.headers.getSetCookie()) { const [pair, ...attrs] = c.split(";"), i = pair.indexOf("="), gone = /max-age=0|expires=thu, 01 jan 1970/i.test(attrs.join(";")) || pair.slice(i + 1) === ""; (this.jar ??= new Map())[gone ? "delete" : "set"](...(gone ? [pair.slice(0, i)] : [pair.slice(0, i), pair.slice(i + 1)])); }
    this.cookie = [...(this.jar ?? [])].map(([k, v]) => `${k}=${v}`).join("; ");
    record(name, performance.now() - t, res.status);
    if (!ok.includes(res.status)) errors.push(`${name} -> ${res.status}`);
    return { status: res.status, text };
  }
  async login(role, id, code) {
    const page = await this.req("login:page", `/login?role=${role}`);
    const action = /name="(\$ACTION_ID_[a-f0-9]+)"/.exec(page.text)?.[1];
    assert.ok(action, "login form action id not found");
    const form = new FormData(); form.set(action, ""); form.set("role", role); form.set("id", id); form.set("code", code);
    const r = await this.req("login:submit", `/login?role=${role}`, { method: "POST", body: form, ok: [303] });
    return r.status === 303 && !!this.cookie;
  }
  api(name, payload, ok = [200, 409, 429]) {
    return this.req(name, "/api/game", { method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" }, ok });
  }
}
function dbSampler() {
  const timer = setInterval(async () => { try { const [r] = await db.$queryRawUnsafe("SELECT count(*)::int AS conns FROM pg_stat_activity WHERE datname = current_database()"); dbSamples.push(r.conns); } catch { /* best-effort */ } }, 3000);
  return () => clearInterval(timer);
}
function sampler() {
  if (REMOTE) return () => {}; // hosted CPU/memory are read from the provider dashboard
  const ps = `$p=Get-CimInstance Win32_Process; $ids=@(${server.pid}); do{$n=$ids.Count; $ids=@(@($ids)+@($p|?{$ids -contains $_.ParentProcessId}|%{$_.ProcessId})|sort -Unique)}while($ids.Count -gt $n); $q=Get-Process -Id $ids -ErrorAction SilentlyContinue; "$([math]::Round(($q|measure WorkingSet64 -Sum).Sum/1MB,1)),$([math]::Round(($q|measure CPU -Sum).Sum,2))"`;
  const timer = setInterval(() => { try { const [mb, cpu] = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8", windowsHide: true }).trim().split(",").map(Number); samples.push({ t: Date.now(), mb, cpu }); } catch { /* sampling is best-effort */ } }, 4000);
  return () => clearInterval(timer);
}
let release = () => {}, gate = Promise.resolve(), arrived = 0;
async function team(n, id, code, variant) {
  const lead = new Client(), mates = Array.from({ length: PARTICIPANTS - 1 }, () => new Client());
  if (!await lead.login("team", id, code)) { errors.push(`login failed ${id}`); return null; }
  let alive = true;
  const matePoll = Promise.all(mates.map(async (m, i) => { await sleep(500 + i * 700); if (!await m.login("team", id, code)) return; while (alive) { await m.req("poll:/api/game", "/api/game"); await sleep(5000); } }));
  const wrong = [{ kind: "conclusion", emailId: "NOPE" }, { kind: "x" }, { kind: "conclusion", employeeId: "x" }, { kind: "plan" }, { kind: "verdict" }];
  const right = [inboxAnswers[variant], trailAnswers[variant], insiderAnswers[variant], containmentAnswers[variant], verdictAnswers[variant]];
  const pages = ["/play/inbox", "/play/trail", "/play/insider", "/play/containment", "/play/verdict"];
  const apis = [null, "/api/game/trail", "/api/game/insider", "/api/game/containment", "/api/game/verdict"];
  await sleep(2000 + Math.random() * 4000);
  for (let ch = 0; ch < 5; ch++) {
    await lead.req(`page:${pages[ch]}`, pages[ch]); if (apis[ch]) await lead.req(`evidence:${apis[ch]}`, apis[ch]);
    if (ch === 0 && n % 5 === 0) { await cool(); await lead.api("submit:tamper", { action: "submit", chapter: 0, answer: { kind: "tamper", tamper: tamperAnswer(variant) } }); await cool(); }
    for (let k = 0; k < 4; k++) { await lead.req("poll:/api/game", "/api/game"); await sleep(5000); }
    if (ch === 2) {
      const access = await db.insiderAccess.findUnique({ where: { teamId: id } });
      await lead.api("unlock:wrong", { action: "unlock", chapter: 2, answer: { fragmentA: "A" + "0".repeat(24), fragmentB: "B" + "0".repeat(24) } }); await cool();
      await lead.api("unlock:right", { action: "unlock", chapter: 2, answer: { fragmentA: access.fragmentA, fragmentB: access.fragmentB } });
      await lead.req("evidence:/api/game/insider", "/api/game/insider");
    }
    if (n % 3 === 0) await lead.api("hint", { action: "hint", chapter: ch });
    await lead.api("submit:wrong", { action: "submit", chapter: ch, answer: wrong[ch] }); await cool();
    if (ch === 4 && STORM) { if (++arrived === TEAMS) release(); await gate; }
    const res = await lead.api("submit:right", { action: "submit", chapter: ch, answer: right[ch] });
    let accepted = false; try { accepted = res.status === 200 && JSON.parse(res.text).accepted; } catch { /* non-JSON */ }
    if (!accepted) { errors.push(`${id} chapter ${ch} correct answer not accepted: ${res.status} ${res.text.slice(0, 120)}`); break; }
  }
  await lead.req("poll:/api/game", "/api/game");
  alive = false; await matePoll; return lead;
}
async function organizer(flag) {
  const admin = new Client();
  if (!await admin.login("admin", "organizer", adminCode)) { errors.push("ORGANIZER LOGIN FAILED"); return admin; }
  while (!flag.done) { await admin.req("admin:/admin", "/admin"); await admin.req("admin:scores-csv", "/api/admin/scores"); await sleep(8000); }
  return admin;
}
function stop() { if (!REMOTE && server?.pid) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); }
async function waitUp() { for (let i = 0; i < 240; i++) { try { if ((await fetch(ORIGIN + (REMOTE ? "/api/health" : "/login"))).ok) return; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 500)); } throw new Error("server did not start"); }
let exitCode = 1, cleaning = null;
const finish = () => cleaning ??= (async () => {
  const r = await cleanup(db, scope); // exact-scope only; a failure is reported, never escalated to a broader delete
  if (!r.ok) { console.error(`CLEANUP INCOMPLETE (${r.failed.join(", ")}). Rows created by this run all have ids GH-nn / GHZ-ID-*; remove only those by hand.`); exitCode = 1; }
  return r;
})();
const abort = code => async () => { console.error(`
Aborted (${code}); removing only this run's rows.`); stop(); await finish(); await db.$disconnect().catch(() => {}); await temp?.drop().catch(() => {}); process.exit(code); };
process.on("SIGINT", abort(130)); process.on("SIGTERM", abort(143));
const watchdog = setTimeout(abort(124), Number(arg("max-minutes", 40)) * 60_000); watchdog.unref();
try {
  if (REMOTE) {
    await assertEmpty(db); // nothing real can exist in a database that is completely empty
    await waitUp();
    // Target identity: seed a nonce-named marker team in THIS database and log in to the hosted origin as it. Success proves the service reads this very database.
    const nonce = randomBytes(4).toString("hex").toUpperCase(), markId = `GHZ-ID-${nonce}`, markCode = generateCode();
    scope.addTeam(markId);
    await db.team.create({ data: { id: markId, name: markId, participants: JSON.stringify(["A", "B", "C"]), codeHash: hashPassword(markCode), variant: "A", progress: JSON.stringify(initialProgress()) } });
    assert.ok(await new Client().login("team", markId, markCode), "IDENTITY CHECK FAILED: the hosted service does not see the target database. Nothing was run.");
  }
  const hex = () => [...Array(24)].map(() => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("");
  const creds = planTeams(generatedTeams(TEAMS), []).map(t => ({ ...t, code: generateCode() }));
  for (const t of creds) scope.addTeam(t.id);
  for (const t of creds) await db.team.create({ data: { id: t.id, name: t.name, participants: JSON.stringify(t.participants), codeHash: hashPassword(t.code), variant: t.variant, progress: JSON.stringify(initialProgress()), insiderAccess: { create: { fragmentA: "A" + hex(), fragmentB: "B" + hex() } } } });
  const now = Date.now();
  await writeRound(db, scope, { startsAt: new Date(now), deadline: new Date(now + 3600_000) });
  let serverErr = "";
  if (!REMOTE) { server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true }); server.stderr.on("data", d => { serverErr += d; }); }
  await waitUp();
  const stopSampling = sampler(), stopDbSampling = dbSampler();
  const flag = { done: false }, started = Date.now();
  if (STORM) { gate = new Promise(r => { release = r; }); setTimeout(release, 240_000 / SPEED); }
  const orgP = organizer(flag);
  const results = await Promise.all(creds.map((t, i) => team(i + 1, t.id, t.code, t.variant)));
  flag.done = true; const admin = await orgP; stopSampling(); stopDbSampling();
  const wall = (Date.now() - started) / 1000;
  const ids = [...scope.teamIds].filter(i => i.startsWith("GH-")); const rows = await db.team.findMany({ where: { id: { in: ids } } }); const subs = await db.submission.findMany({ where: { accepted: true, teamId: { in: ids } } });
  const round = await db.gameSession.findUnique({ where: { id: 1 } });
  let bad = 0, completed = 0, bonus = 0;
  for (const r of rows) {
    const p = JSON.parse(r.progress), sc = score(p);
    if (p.chapters.every(c => c.completedAt)) completed++;
    bonus += p.bonus;
    const n = Number(r.id.slice(3)), expected = 100 + (n % 5 === 0 ? 5 : 0) - (n % 3 === 0 ? 15 : 0);
    if (sc !== expected) { bad++; errors.push(`INVARIANT ${r.id} score ${sc} != expected ${expected}`); }
    if (p.bonus > 5 || sc > 105 || sc < 0) { bad++; errors.push(`INVARIANT ${r.id} score ${sc}`); }
    if (p.chapters.some(c => c.completedAt && c.completedAt > round.deadline.getTime())) { bad++; errors.push(`INVARIANT ${r.id} completed after deadline`); }
    const acc = subs.filter(s => s.teamId === r.id && s.reason === "completed").length;
    if (acc !== p.chapters.filter(c => c.completedAt && !c.override).length) { bad++; errors.push(`INVARIANT ${r.id} accepted submissions ${acc} != completed chapters`); }
  }
  // ---- recovery: server crash/restart persistence, reconnect, and post-deadline rejection ----
  const lead = creds[0];
  if (REMOTE) {
    if (PAUSE) { const rl = createInterface({ input: process.stdin, output: process.stdout }); await rl.question("\nRESTART the hosted service now (Render dashboard > Manual restart), wait until it is back up, then press Enter: "); rl.close(); }
    else console.log("\n(no --pause-for-restart: recovery below proves persistence across NEW sessions and the deadline, not a process restart)");
    await waitUp();
  } else {
    stop(); await new Promise(r => setTimeout(r, 1500));
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    await waitUp();
  }
  const again = new Client(); const relogin = await again.login("team", lead.id, lead.code);
  const saved = JSON.parse((await again.req("recovery:state", "/api/game")).text);
  const expectSaved = 100 - (1 % 3 === 0 ? 15 : 0);
  const recovered = relogin && saved.score === expectSaved && saved.current === -1;
  await writeRound(db, scope, { startsAt: round.startsAt, deadline: new Date(Date.now() - 1000) });
  const late = new Client(); await late.login("team", creds[1].id, creds[1].code);
  const lateRes = await late.api("recovery:late-submit", { action: "submit", chapter: 4, answer: verdictAnswers[creds[1].variant] });
  const rejected = lateRes.status === 409 && /not active/i.test(lateRes.text);
  const afterLate = JSON.parse((await again.req("recovery:state", "/api/game")).text);
  const unchanged = afterLate.score === expectSaved;
  const finalCsv = await admin.req("admin:scores-csv-final", "/api/admin/scores");
  const lines = finalCsv.text.trim().split(/\r?\n/).length - 1;
  const total = [...stats.values()].reduce((a, s) => a + s.lat.length, 0);
  console.log(`\n=== LOAD TEST: ${TEAMS} teams x ${PARTICIPANTS} participants, speed x${SPEED}${STORM ? ", storm" : ""}${CONN ? `, connection_limit=${CONN}` : ""}, wall ${wall.toFixed(0)}s ===`);
  console.log(`Total requests: ${total} (${(total / wall).toFixed(1)} req/s avg); teams that completed all 5 chapters: ${completed}/${TEAMS}; bonus awards: ${bonus / 5}; CSV rows: ${lines}; invariant violations: ${bad}`);
  console.log("endpoint".padEnd(36), "n".padStart(6), "p50ms".padStart(8), "p95ms".padStart(8), "max".padStart(8), " status codes");
  for (const [k, s] of [...stats].sort()) console.log(k.padEnd(36), String(s.lat.length).padStart(6), pct(s.lat, .5).toFixed(0).padStart(8), pct(s.lat, .95).toFixed(0).padStart(8), Math.max(...s.lat).toFixed(0).padStart(8), JSON.stringify(s.codes));
  if (samples.length > 1) console.log(`Server process tree memory MB: peak ${Math.max(...samples.map(s => s.mb))}, last ${samples.at(-1).mb}; CPU seconds used: ${(samples.at(-1).cpu - samples[0].cpu).toFixed(1)} over ${((samples.at(-1).t - samples[0].t) / 1000).toFixed(0)}s`);
  console.log(`Recovery: restart+relogin keeps saved score=${recovered ? "PASS" : "FAIL"}; submission after deadline rejected=${rejected ? "PASS" : "FAIL"}; scores unchanged after expiry=${unchanged ? "PASS" : "FAIL"}`);
  if (!recovered || !rejected || !unchanged) errors.push("RECOVERY CHECK FAILED");
  const [{ size }] = await db.$queryRawUnsafe("SELECT pg_database_size(current_database())::int AS size");
  console.log(`Mode: ${REMOTE ? "REMOTE " + ORIGIN : "local production build"}; database size ${(size / 1024).toFixed(0)} KiB; PostgreSQL connections seen (this DB): peak ${Math.max(0, ...dbSamples)}, avg ${(dbSamples.reduce((a, b) => a + b, 0) / Math.max(1, dbSamples.length)).toFixed(1)}; HTTP payload received by clients: ${(bytes / 1024 / 1024).toFixed(1)} MiB; errors: ${errors.length}`);
  if (errors.length) console.log(safe([...new Set(errors)].slice(0, 15).join("\n")));
  const lockLines = serverErr.split("\n").filter(l => /locked|BUSY|Timed out|P2034|P1008|P2028/i.test(l));
  if (lockLines.length) console.log(`SERVER LOG: ${lockLines.length} contention lines, e.g. ${lockLines[0].slice(0, 300)}`);
  if (results.some(r => !r)) console.log(`${results.filter(r => !r).length} teams failed to log in`);
  exitCode = bad || errors.length ? 1 : 0;
} catch (e) {
  console.error(`LOAD TEST STOPPED: ${safe(e?.message ?? e)}`); exitCode = 1;
} finally {
  stop(); clearTimeout(watchdog);
  for (const c of clients) { const m = /(?:^|; )ghost_admin_session=([^;]+)/.exec(c.cookie); if (m) scope.adminTokens.add(m[1]); }
  await finish(); // exact-scope cleanup only (remote and local); local additionally drops its disposable database below
  await db.$disconnect().catch(() => {}); await new Promise(r => setTimeout(r, 800));
  await temp?.drop();
}
process.exit(exitCode);
