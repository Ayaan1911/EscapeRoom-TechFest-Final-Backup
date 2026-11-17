// Reproducible load/rehearsal harness. Runs the REAL production build (`next start`) against a DISPOSABLE temp database.
// Usage: npm run build && node scripts/load-test.mjs [--teams 50] [--participants 3] [--speed 1] [--port 3100] [--storm]
// --speed N compresses think-time (1 = realistic 5s polling). --storm holds every team before its final submission and releases them together.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
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
const ORIGIN = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms / SPEED));
const cool = () => new Promise(r => setTimeout(r, 3200)); // server submission cooldown is real-time, never compressed
const folder = mkdtempSync(join(tmpdir(), "ghost-load-"));
const dbFile = join(folder, "load.db").replaceAll("\\", "/");
const databaseUrl = `file:${dbFile}${CONN ? `?connection_limit=${CONN}` : ""}`;
const adminCode = generateCode();
const env = { ...process.env, DATABASE_URL: databaseUrl, ADMIN_ACCESS_HASH: hashPassword(adminCode), APP_ORIGIN: ORIGIN, NODE_ENV: "production" };
const db = new PrismaClient({ datasourceUrl: databaseUrl });
let server;
const stats = new Map(), errors = [], samples = [];
function record(name, ms, status) { const s = stats.get(name) ?? { lat: [], codes: {} }; s.lat.push(ms); s.codes[status] = (s.codes[status] ?? 0) + 1; stats.set(name, s); }
const pct = (a, p) => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

class Client {
  cookie = "";
  async req(name, path, { method = "GET", body, headers = {}, ok = [200] } = {}) {
    const t = performance.now();
    let res;
    try { res = await fetch(ORIGIN + path, { method, body, redirect: "manual", headers: { ...(this.cookie ? { cookie: this.cookie } : {}), origin: ORIGIN, ...headers } }); }
    catch (e) { record(name, performance.now() - t, "NETERR"); errors.push(`${name}: ${e.message}`); return { status: 0, text: "" }; }
    const text = await res.text();
    const setCookie = res.headers.get("set-cookie"); if (setCookie) this.cookie = setCookie.split(";")[0];
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
function sampler() {
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
function stop() { if (server?.pid) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); }
async function waitUp() { for (let i = 0; i < 60; i++) { try { if ((await fetch(ORIGIN + "/login")).ok) return; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 500)); } throw new Error("server did not start"); }
let exitCode = 1;
try {
  assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
  for (const m of readdirSync("prisma/migrations").sort().filter(x => /^\d/.test(x))) for (const sql of readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8").split(";").filter(v => v.trim())) await db.$executeRawUnsafe(sql);
  const hex = () => [...Array(24)].map(() => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("");
  const creds = planTeams(generatedTeams(TEAMS), []).map(t => ({ ...t, code: generateCode() }));
  for (const t of creds) await db.team.create({ data: { id: t.id, name: t.name, participants: JSON.stringify(t.participants), codeHash: hashPassword(t.code), variant: t.variant, progress: JSON.stringify(initialProgress()), insiderAccess: { create: { fragmentA: "A" + hex(), fragmentB: "B" + hex() } } } });
  const now = Date.now();
  await db.gameSession.upsert({ where: { id: 1 }, create: { id: 1, startsAt: new Date(now), deadline: new Date(now + 3600_000) }, update: { startsAt: new Date(now), deadline: new Date(now + 3600_000) } });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  let serverErr = ""; server.stderr.on("data", d => { serverErr += d; });
  await waitUp();
  const stopSampling = sampler();
  const flag = { done: false }, started = Date.now();
  if (STORM) { gate = new Promise(r => { release = r; }); setTimeout(release, 240_000 / SPEED); }
  const orgP = organizer(flag);
  const results = await Promise.all(creds.map((t, i) => team(i + 1, t.id, t.code, t.variant)));
  flag.done = true; const admin = await orgP; stopSampling();
  const wall = (Date.now() - started) / 1000;
  const rows = await db.team.findMany(); const subs = await db.submission.findMany({ where: { accepted: true } });
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
  stop(); await new Promise(r => setTimeout(r, 1500));
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  await waitUp();
  const again = new Client(); const relogin = await again.login("team", lead.id, lead.code);
  const saved = JSON.parse((await again.req("recovery:state", "/api/game")).text);
  const expectSaved = 100 - (1 % 3 === 0 ? 15 : 0);
  const recovered = relogin && saved.score === expectSaved && saved.current === -1;
  await db.gameSession.update({ where: { id: 1 }, data: { deadline: new Date(Date.now() - 1000) } });
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
  console.log(`DB file size: ${(statSync(dbFile).size / 1024).toFixed(0)} KiB; errors: ${errors.length}`);
  if (errors.length) console.log([...new Set(errors)].slice(0, 15).join("\n"));
  const lockLines = serverErr.split("\n").filter(l => /locked|BUSY|Timed out|P2034|P1008|P2028/i.test(l));
  if (lockLines.length) console.log(`SERVER LOG: ${lockLines.length} contention lines, e.g. ${lockLines[0].slice(0, 300)}`);
  if (results.some(r => !r)) console.log(`${results.filter(r => !r).length} teams failed to log in`);
  exitCode = bad || errors.length ? 1 : 0;
} finally {
  stop(); await db.$disconnect(); await new Promise(r => setTimeout(r, 800));
  assert.ok(folder.includes("ghost-load-") && resolve(folder).startsWith(resolve(tmpdir()) + sep));
  rmSync(folder, { recursive: true, force: true });
}
process.exit(exitCode);
