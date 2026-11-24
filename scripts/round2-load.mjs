// Round 2 (paper) load rehearsal: disposable local PostgreSQL + the real production build (`next start`). Local only, never a hosted target.
//   npm run build && node scripts/round2-load.mjs [--finalists 10] [--per-team 3] [--window 40] [--port 3110]
// GHOST RETURNS (60 minutes, four open injects). Simulates every finalist PC (and teammates' screens) polling the status endpoint as the real shell does,
// the organizer + projector polling timing, a simultaneous sign-in burst, and every screen firing Kill Switch BLOCK commands at once (TEST key fixture).
// The shared clock is moved so that the start (0:00) and pens down (60:00) both happen inside the run. Checks: every response agrees with the clock for its
// own serverNow; injects only while running; no team ever stores more than 4 attempts; no 5xx; lag between a transition and the first client that sees it.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { createTempDatabase } from "./pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { generateCode } from "./provision-lib.mjs";
import { initialProgress } from "../src/lib/game/engine.ts";
import { openClock } from "../src/lib/round2/paper/format.ts";
import { resolve } from "node:path";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const FIN = Number(arg("finalists", 10)), PER = Number(arg("per-team", 3)), WIN = Number(arg("window", 40)), PORT = Number(arg("port", 3110));
const ORIGIN = `http://127.0.0.1:${PORT}`, sleep = ms => new Promise(r => setTimeout(r, ms));
const temp = await createTempDatabase("r2load"), url = temp.url, adminCode = generateCode(), teamCode = generateCode();
assert.ok(/ghostt_/.test(url) && ["127.0.0.1", "localhost"].includes(new URL(url).hostname), "disposable local database only");
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, ADMIN_ACCESS_HASH: hashPassword(adminCode), APP_ORIGIN: ORIGIN, NODE_ENV: "production", GHOST_R2_KEY_FILE: resolve("tests/fixtures/round2-key-fixture.json"), UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE ?? "16" };
const db = new PrismaClient({ datasourceUrl: url });
const stats = new Map(), problems = [];
const pct = (a, p) => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
const rec = (k, ms, st) => { const s = stats.get(k) ?? { lat: [], codes: {} }; s.lat.push(ms); s.codes[st] = (s.codes[st] ?? 0) + 1; stats.set(k, s); };
let server;
const stop = () => { if (server && process.platform === "win32") spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); else server?.kill(); };

class Client {
  jar = new Map();
  cookie() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  async req(name, path, { method = "GET", body, headers = {} } = {}) {
    const t = performance.now(); let res;
    try { res = await fetch(ORIGIN + path, { method, body, redirect: "manual", headers: { cookie: this.cookie(), origin: ORIGIN, ...headers } }); }
    catch (e) { rec(name, performance.now() - t, "NETERR"); problems.push(`${name}: ${e.message}`); return { status: 0, text: "" }; }
    const text = await res.text();
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split(";"), i = pair.indexOf("="); if (pair.slice(i + 1)) this.jar.set(pair.slice(0, i), pair.slice(i + 1)); else this.jar.delete(pair.slice(0, i)); }
    rec(name, performance.now() - t, res.status); return { status: res.status, text };
  }
  async login(role, id, code) {
    const path = role === "admin" ? "/organizer/login" : "/login", page = await this.req("login:page", path), action = /name="(\$ACTION_ID_[a-f0-9]+)"/.exec(page.text)?.[1];
    assert.ok(action, "login form action id not found");
    const form = new FormData(); form.set(action, ""); if (role !== "admin") form.set("id", id); form.set("code", code);
    return (await this.req("login:submit", path, { method: "POST", body: form })).status === 303;
  }
}
async function waitUp() { for (let i = 0; i < 90; i++) { try { if ((await fetch(ORIGIN + "/login")).ok) return; } catch { /* starting */ } await sleep(1000); } throw new Error("server did not start"); }
const setClock = (startsAt) => db.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt, contentVersion: "case-v2", format: "open-60" }, update: { startsAt, endedAt: null, format: "open-60" } });

let exitCode = 1;
try {
  const ids = Array.from({ length: FIN + 2 }, (_, i) => `R2L-${String(i + 1).padStart(2, "0")}`);
  for (const id of ids) await db.team.create({ data: { id, name: `Finalist ${id}`, participants: JSON.stringify(["One", "Two", "Three"]), codeHash: hashPassword(teamCode), variant: "A", progress: JSON.stringify(initialProgress()) } });
  await db.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ digest: "seeded-digest-0001", top10: ids.slice(0, FIN), standby: ids.slice(FIN), reason: "load" }) } });
  await db.r2Finalist.createMany({ data: ids.map((teamId, i) => ({ teamId, status: i < FIN ? "active" : "standby", seed: i + 1, snapshotDigest: "seeded-digest-0001" })) });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: "ignore", windowsHide: true });
  await waitUp();
  await setClock(new Date(Date.now() + 3_600_000)); // not started yet: everyone is on stand-by during the sign-in burst

  const clients = []; // one per physical screen
  const burst = performance.now();
  await Promise.all(ids.flatMap((id, i) => Array.from({ length: i < FIN ? PER : 1 }, async () => { const c = new Client(); c.team = id; if (await c.login("team", id, teamCode)) clients.push(c); else problems.push(`login failed ${id}`); })));
  const org = new Client(); assert.ok(await org.login("admin", "", adminCode), "organizer login failed");
  console.log(`Sign-in burst: ${clients.length} screens + organizer in ${((performance.now() - burst) / 1000).toFixed(1)} s`);

  let session = { startsAt: null, endedAt: null }, run = true, observed = []; // observed: {t, chapter|0|5}
  const expectFor = now => { const c = openClock(session, now); return c.phase === "running" ? 1 : c.phase === "complete" ? 5 : 0; };
  const check = (name, text, status) => {
    if (status >= 500) problems.push(`${name} -> ${status}`);
    if (status !== 200) return;
    let j; try { j = JSON.parse(text); } catch { problems.push(`${name}: not JSON`); return; }
    const now = Date.parse(j.serverNow), want = expectFor(now), got = j.phase === "running" ? 1 : j.phase === "complete" ? 5 : 0;
    if (want !== got) problems.push(`INVARIANT ${name}: serverNow says chapter ${want}, payload says ${got}`);
    if (name === "status" && (j.phase === "running") !== Array.isArray(j.injects)) problems.push(`INVARIANT ${name}: injects present outside the running phase`);
    observed.push({ at: now, got });
  };
  const pollers = clients.map(c => (async () => {
    await sleep(Math.random() * 3000); let end = null;
    while (run) {
      const r = await c.req(c.team.endsWith(String(FIN + 1).padStart(2, "0")) || c.team.endsWith(String(FIN + 2).padStart(2, "0")) ? "status:standby" : "status", "/api/round2/status");
      if (r.status === 200) { check("status", r.text, r.status); const j = JSON.parse(r.text); end = j.endsAt ? Date.parse(j.endsAt) : null; } else if (r.status >= 500) check("status", r.text, r.status);
      const near = end !== null && end - Date.now() < 2500; await sleep(near ? 1000 : 4000);
    }
  })());
  const orgPoll = (async () => { while (run) { const r = await org.req("admin:timing", "/api/round2/admin?view=timing"); check("admin:timing", r.text, r.status); await sleep(2000); } })();

  const lags = [];
  for (const boundary of [0, 60]) { // start so that this boundary falls WIN/2 s into the segment
    const startsAt = new Date(Date.now() - boundary * 60_000 + (WIN / 2) * 1000); session = { startsAt, endedAt: null }; await setClock(startsAt);
    const at = startsAt.getTime() + boundary * 60_000, before = observed.length;
    await sleep(WIN * 1000);
    if (boundary === 0) { // Kill Switch burst: every screen fires 3 BLOCK commands at once; the server must keep each team at 4 attempts or fewer
      const ips = ["192.0.2.25", "198.51.100.12", "203.0.113.9", "198.51.100.77", "192.0.2.81", "203.0.113.45", "198.51.100.140", "203.0.113.88", "203.0.113.30", "192.0.2.92"];
      await Promise.all(clients.flatMap(c => [0, 1, 2].map(() => c.req("terminal:block", "/api/round2/terminal", { method: "POST", body: JSON.stringify({ command: `block ${ips[Math.floor(Math.random() * ips.length)]}` }), headers: { "content-type": "application/json" } }))));
      const counts = await db.r2BlockAttempt.groupBy({ by: ["teamId"], _count: { _all: true } });
      for (const t of counts) if (t._count._all > 4) problems.push(`INVARIANT terminal: ${t.teamId} stored ${t._count._all} attempts`);
      console.log(`Terminal burst: ${clients.length * 3} BLOCK commands; teams with attempts: ${counts.length}; max per team: ${Math.max(0, ...counts.map(t => t._count._all))}`);
    }
    const after = observed.slice(before).filter(o => o.at >= at), firstNew = after.filter(o => o.got === expectFor(at + 1)).map(o => o.at).sort((a, b) => a - b);
    lags.push({ boundary, seen: firstNew.length, lagMs: firstNew.length ? firstNew[0] - at : null });
  }
  run = false; await Promise.all([...pollers, orgPoll]);

  // clients that polled a transition: how long after the boundary did the LAST pre-boundary-chapter response get served (a stale view window)?
  console.log(`\n=== ROUND 2 LOAD: ${FIN} finalists x ${PER} screens (+2 standby), organizer + projector, ${WIN}s per transition ===`);
  console.log("endpoint".padEnd(20), "n".padStart(6), "p50ms".padStart(8), "p95ms".padStart(8), "max".padStart(8), " codes");
  for (const [k, s] of [...stats].sort()) console.log(k.padEnd(20), String(s.lat.length).padStart(6), pct(s.lat, .5).toFixed(0).padStart(8), pct(s.lat, .95).toFixed(0).padStart(8), Math.max(...s.lat).toFixed(0).padStart(8), JSON.stringify(s.codes));
  for (const l of lags) console.log(`transition at ${String(l.boundary).padStart(2)}:00 -> first response with the new state ${l.lagMs === null ? "NEVER SEEN" : `${l.lagMs} ms after the instant`} (server clock)`);
  if (lags.some(l => l.lagMs === null)) problems.push("a transition was never observed");
  const uniq = [...new Set(problems)]; console.log(uniq.length ? `PROBLEMS (${problems.length}):\n${uniq.slice(0, 15).join("\n")}` : "No invariant violations, no 5xx, no network errors.");
  exitCode = uniq.length ? 1 : 0;
} catch (e) { console.error(`ROUND 2 LOAD STOPPED: ${e?.message ?? e}`); } finally {
  stop(); await sleep(800); await db.$disconnect().catch(() => {}); await temp.drop().catch(() => {});
}
process.exit(exitCode);
