# GHOST_404 — Lab LAN runbook (rehearsal build)

Branch `test/ghost404-lab-lan`, based on verified baseline `129c32f0217d1fb0a9339c1e03357d77196ac51d`.
Purpose: run the production server on **one Windows lab PC** and let ~20–30 other lab PCs use it in a browser. **Synthetic teams and a throw-away database only.**

> **Status: prepared and verified on the developer laptop only.** The physical two-PC test and the 20–30-PC rehearsal have **not** been done. Section 11 lists exactly what was and was not verified.

---

## QUICK START (one page, for standing in the lab)

**On the server PC** (PowerShell, in the project folder; Method A = Node installed, Method B = see §3):

1. Check Node: `node -v` → must be **22.18+ or 24+**.
2. First time only: copy `.env.lab.example` → `.env.lab`, set the two database URLs (database name **must** start with `ghost404_lab`), then
   `powershell -ExecutionPolicy Bypass -File scripts\lab\prepare-lab.ps1 -SetOrganizerCode -Teams 30`
   (asks for an organizer code, installs, builds, migrates the lab DB, creates 30 synthetic teams and writes their codes to `private\lab-credentials-*.csv`).
3. Allow the port (needs **Administrator** PowerShell once; scoped to TCP 3000, local subnet only):
   `powershell -ExecutionPolicy Bypass -File scripts\lab\firewall-lab.ps1 -Add`
4. Start: `powershell -ExecutionPolicy Bypass -File scripts\lab\start-lab.ps1`
   → it prints **“Participants open: http://\<server-ip\>:3000”**. Leave the window open.
5. Check: second window → `powershell -ExecutionPolicy Bypass -File scripts\lab\check-lab.ps1` → must end `Result: PASS`.

**On every other PC:** open the printed address in Chrome/Edge, e.g. `http://10.20.30.40:3000` → team login with an ID + code from the csv (`LAB-01` …). Organizer: `/organizer/login`. Projector: `/admin/projector`.

**If a PC cannot connect** (from that PC): `powershell -ExecutionPolicy Bypass -File scripts\lab\check-lab.ps1 -Url http://<server-ip>:3000`
- `TCP … NOT reachable`, ping replies → firewall rule missing / server not running / wrong port.
- `TCP … NOT reachable`, no ping → wrong IP, server off, or **network isolation between lab PCs** (ask IT).

**Stop:** Ctrl+C in the server window, or `scripts\lab\stop-lab.ps1`. **After the rehearsal:** `firewall-lab.ps1 -Remove`, delete `private\`, drop the lab database (§4).

---

## 1. What was audited (Phase 1A)

Verified by reading code and by running it:

| Topic | Finding |
|---|---|
| Runtime | Next.js 16 + React 19, Prisma 6, PostgreSQL. Render uses Node 22. Helper scripts run TypeScript natively, so the lab needs **Node 22.18+ / 24+** (checked by the scripts). Package manager: npm (`package-lock.json`, `npm ci`). |
| Build/start | `npm run build` = `prisma generate && next build`. `next start` is the production server. Build and start do **not** touch database contents. `npm run start:render` runs `prisma migrate deploy` but is **not used** by the lab scripts. |
| Env vars | `DATABASE_URL`, `DIRECT_URL` (Prisma datasource), `ADMIN_ACCESS_HASH` (organizer code hash), optional `DB_POOL_SIZE`, `APP_ORIGIN`. Lab-only: `LAB_PORT`, `LAB_HOST_IP`, `GHOST_LAN_HTTP`. |
| Hardcoded hosts | No `localhost` or Render URL is hardcoded in `src/` (only an input placeholder on the QR-kit page). |
| Real-time | No WebSocket/SSE. Browsers **poll**: dashboard/chapter state every 5 s, drafts sync every 12 s, projector every 12 s. 30 browsers ≈ 7–10 requests/s steady. |
| Timers | Server-authoritative. Clients receive `serverNow` + `deadline` and count down from a measured offset, so a **wrong clock on a lab PC does not change deadlines or scoring**. (Code-verified, not yet observed across real PCs.) |
| Storage | No runtime file storage; state is in PostgreSQL. `.next/` is the build output. |
| Health | `/api/health` (no DB) and `/api/health?db=1` (DB + round state). |
| Auth | Per-role cookies (`ghost_team_session`, `ghost_admin_session`), HttpOnly, SameSite=Strict, 12 h, hashed tokens in DB, persistent login throttling. Organizer-only pages/APIs check the admin session on every request. |

### LAN blockers found and how they were handled

1. **Secure cookies on plain HTTP.** In production the session cookie is `Secure`; browsers drop Secure cookies on `http://<lan-ip>` (only `localhost` is exempt). Reproduced: login "succeeds" and redirects, but the cookie is not stored, so every page bounces back to login. **Fix (minimal, tested):** `cookieSecure()` in `src/lib/auth-policy.ts` — Secure stays on in production **unless** `GHOST_LAN_HTTP=1` is set **and** `APP_ORIGIN` is not `https://`. Render keeps `https` ⇒ unchanged. `start-lab.ps1` sets the flag; nothing else does.
2. **Same-origin (CSRF) check behind `-H 0.0.0.0`.** API writes require `Origin` = `APP_ORIGIN` or `request.nextUrl.origin`; with a wildcard bind `nextUrl.origin` is not the address the browser used, so every submission returned **403**. Pinning `APP_ORIGIN` to the IP works but breaks `localhost` on the server PC silently. **Fix (minimal, tested):** `sameOrigin()` in `src/lib/http.ts` — only when `GHOST_LAN_HTTP=1` and no `APP_ORIGIN` is set, also accept an Origin whose host equals the request `Host`. Cross-site pages still send a different Origin and are refused (unit-tested). Hosted behaviour is unchanged.
3. **HSTS header** in `next.config.ts` is ignored by browsers on HTTP; left as is.

**Not changed:** authentication, authorization, CSRF protection, scoring, rules, UI.

### Unknown until the real lab
College VLAN/client isolation, proxy or endpoint-protection policy, whether the server PC's Windows profile is Domain/Private/Public, antivirus interference, the lab PCs' browsers, real network latency, and the lab PC's hardware.

## 2. How it works

`start-lab.ps1` → loads `.env.lab` into the process → refuses any database not named `ghost404_lab*` (and any non-local host unless `GHOST_LAB_ALLOW_REMOTE_DB=1`) → refuses if a lab server is already running or the port is taken → picks the LAN IPv4 (default-route adapter first, virtual/VMware/WSL/link-local adapters last; override with `LAB_HOST_IP`) → starts `next start -p <port> -H 0.0.0.0` (production build) in the foreground, writing `.lab\server.pid`. Ctrl+C stops it; `stop-lab.ps1` stops only that recorded node PID.

| Script | Purpose |
|---|---|
| `scripts/lab/prepare-lab.ps1` | checks → `npm ci` → `prisma generate` → build → DB identity check → `prisma migrate deploy` (additive) → optional `-Teams N` (adds synthetic teams only) → `-SetOrganizerCode` stores only a hash |
| `scripts/lab/start-lab.ps1` / `stop-lab.ps1` | start/stop |
| `scripts/lab/check-lab.ps1` | server diagnostics (listener, memory, firewall rule, health, latency via localhost **and** LAN IP) or, with `-Url`, a client-side reachability test |
| `scripts/lab/firewall-lab.ps1` | `-Add` / `-Remove` one scoped inbound rule (TCP port, `LocalSubnet`); no argument just prints what it would do |
| `scripts/lab/lan-smoke.mjs` | browser smoke test of login, cookies, organizer/team isolation, cross-origin refusal against any origin |
| `scripts/lab/package-lab.ps1` | builds the Method B zip on the dev laptop |
| `scripts/lab/lab-tool.mjs` | helper (hash / read-only DB identity check) |

Windows Firewall is never disabled. No tunnel or public exposure is created.

## 3. Installing on the lab PC

### Method A — standard (can install software)
1. Install **Node.js 24 LTS** (or 22.18+) and **Git**, or copy the repo folder (zip from GitHub: branch `test/ghost404-lab-lan`).
2. A PostgreSQL 15+ server reachable from the server PC (§4).
3. Follow the quick start. `prepare-lab.ps1` runs `npm ci` (needs internet to the npm registry; if blocked, use Method B).

Manual fallback (what the scripts do), in PowerShell from the project folder:
```powershell
npm ci --include=dev ; npx prisma generate ; npm run build
# set DATABASE_URL / DIRECT_URL / ADMIN_ACCESS_HASH in this session's environment (values from .env.lab), then
npx prisma migrate deploy
$env:NODE_ENV="production"; $env:GHOST_LAN_HTTP="1"; $env:APP_ORIGIN=""
node node_modules\next\dist\bin\next start -p 3000 -H 0.0.0.0
```

### Method B — restricted / portable (no installer rights, user-space execution allowed)
This does **not** bypass IT policy: if the college blocks running unsigned/portable executables (Node, PostgreSQL) or listening on a port, stop and ask IT for that permission.

On the **development laptop** (Windows x64):
1. `npm ci --include=dev ; npm run build` then `powershell -ExecutionPolicy Bypass -File scripts\lab\package-lab.ps1` → `ghost404-lab-<sha>.zip` (source + production build + `node_modules` incl. the Windows Prisma engine and Next SWC binaries; no secrets). Note the SHA256 it prints.
2. Download the **Windows x64 portable Node zip** (nodejs.org, version 24 LTS or 22.18+) and a **portable PostgreSQL 15/16 Windows x64 binaries zip** (EnterpriseDB "binaries"). Put the three zips on a USB drive.

On the **lab PC** (must be **Windows x64** — the bundled native engines are x64-only; also needs the Microsoft Visual C++ 2015–2022 runtime, normally preinstalled):
```powershell
Get-FileHash .\ghost404-lab-<sha>.zip -Algorithm SHA256        # compare with the laptop
Expand-Archive node-v24*-win-x64.zip C:\ghost\ ; Expand-Archive postgresql-*-binaries.zip C:\ghost\
tar -xf ghost404-lab-<sha>.zip -C C:\ghost\app ; cd C:\ghost\app
$env:Path = "C:\ghost\node-v24...-win-x64;" + $env:Path        # portable Node for this window only
node -v
```
Portable PostgreSQL (loopback only, throw-away data directory; **documented, not executed on the laptop**):
```powershell
"choose-a-db-password" | Set-Content C:\ghost\pw.txt
C:\ghost\pgsql\bin\initdb.exe -D C:\ghost\pgdata -U postgres -A scram-sha-256 --pwfile=C:\ghost\pw.txt -E UTF8
C:\ghost\pgsql\bin\pg_ctl.exe -D C:\ghost\pgdata -o "-p 5432 -c listen_addresses=127.0.0.1" -l C:\ghost\pg.log start
$env:PGPASSWORD = (Get-Content C:\ghost\pw.txt) ; C:\ghost\pgsql\bin\createdb.exe -h 127.0.0.1 -U postgres ghost404_lab
```
Then `.env.lab` with `postgresql://postgres:<pw>@127.0.0.1:5432/ghost404_lab`, and `prepare-lab.ps1 -SetOrganizerCode -Teams 30 -SkipInstall` (no `npm ci`; the build in the zip is reused only if `.next\BUILD_ID` exists — it does). Delete `C:\ghost\pw.txt` afterwards.
Stop PostgreSQL: `C:\ghost\pgsql\bin\pg_ctl.exe -D C:\ghost\pgdata stop`.

## 4. Database isolation (Phase 1C)

- The lab scripts operate **only** on a database named `ghost404_lab*`. `ghost404_demo`, `neondb` and anything else are refused before any command runs; non-local hosts need an explicit `GHOST_LAB_ALLOW_REMOTE_DB=1`. Verified by test (§11).
- Migrations are applied with `prisma migrate deploy` (additive only). Teams are created by the existing `provision-teams.mjs --generate N --prefix LAB --expect-database <connected db name>`, which refuses to write unless the typed name equals the connected database. Nothing is reset, truncated or reseeded; no existing credentials or competition data are copied. Codes are random per run and live only in `private\` (git-ignored).
- **Preferred when the college allows internet to Neon:** a **new, separate** Neon project/database (name e.g. `ghost404_lab`) with its own credentials. **Needs the owner to create it** — nothing here connects to Neon. Use the pooled URL for `DATABASE_URL` and the direct URL for `DIRECT_URL`, plus `GHOST_LAB_ALLOW_REMOTE_DB=1`. Free-tier cold starts add latency to the first requests.
- **If Neon is blocked (likely):** local PostgreSQL on the server PC (Method A installer, or portable zip in Method B). No Docker is required or installed. (On the developer laptop the project's existing disposable test container was used.)
- **Discard after the rehearsal:** local → stop PostgreSQL and delete its data folder, or `DROP DATABASE ghost404_lab;` · Neon → delete the dedicated project. Also delete `private\` and `.env.lab`.
- Resetting between rehearsal runs: use a **new** `ghost404_lab_<n>` database (create, point `.env.lab` at it, `prepare-lab.ps1 -Teams 30`). The scripts deliberately contain no reset command.

## 5. Authentication and networking (Phase 1D)

- **HTTP vs HTTPS.** Secure cookies need HTTPS. Trusted HTTPS on 30 PCs needs a certificate every browser trusts (an internal CA installed on every PC — needs admin on each — or a real domain). For a closed rehearsal with synthetic credentials this runbook uses **plain HTTP with the explicit `GHOST_LAN_HTTP=1` switch**. Consequence: team codes and session cookies cross the LAN in clear text. Acceptable for synthetic data on a lab LAN; **do not use this mode for the real event on a shared network** — use the hosted HTTPS deployment or a trusted-certificate setup instead.
- **Use one address consistently.** Cookies are per host: signing in at `http://10.0.0.5:3000` does not sign you in at `http://localhost:3000`. Participants use the printed IP address.
- **Windows Firewall.** Minimum: one inbound TCP rule for the lab port, remote scope `LocalSubnet` (`firewall-lab.ps1 -Add`, admin once). If IT forbids it, IT must allow that port another way.
- **Firewall vs VLAN isolation vs blocked port** (run from a *client*): `check-lab.ps1 -Url http://<ip>:3000`. Server itself fine (`check-lab.ps1` PASS on the server) but clients fail: (a) ping works, TCP fails → server firewall/port; (b) neither works from any client → network isolation/routing → IT; (c) works from some PCs only → per-VLAN/switch policy. Also test with `Test-NetConnection <ip> -Port 3000` and from a second client.
- Respect the college's policy: no network scanning, no tunnels, no public exposure. The scripts do none of these.

## 6. Troubleshooting

| Symptom | Cause / action |
|---|---|
| `start-lab` says port in use | another server (or program) on that port. `stop-lab.ps1`, or set `LAB_PORT` and re-run the firewall script with `-Port`. |
| “connection refused” on a client | server not running, or wrong IP/port. On the server run `check-lab.ps1`. |
| Browser “timed out” | firewall rule missing, or network isolation (see §5). |
| Login seems to work but returns to login | the cookie was rejected: server must have been started with `start-lab.ps1` (sets `GHOST_LAN_HTTP=1`) and the PC must use `http://<ip>:<port>` (not https, not a different hostname than the one used to sign in). |
| Submissions fail with “Invalid origin” / 403 | the page was opened through a different address than the server sees (proxy/other hostname) or `APP_ORIGIN` is set in `.env.lab` — remove `APP_ORIGIN` from `.env.lab`. |
| Wrong IP printed | set `LAB_HOST_IP=<correct ip>` in `.env.lab`. |
| DB errors / `/api/health?db=1` → 503 | PostgreSQL not running, wrong URL/password, or `DB_POOL_SIZE` × connection limit. Run `node scripts\lab\lab-tool.mjs db-check` after loading `.env.lab`, or just `check-lab.ps1`. |
| `ERROR … database 'X'` at start | by design: database name must start with `ghost404_lab`. |
| Node too old | install Node 22.18+/24+ (or use the portable zip). |
| Server died | `stop-lab.ps1` (clears the stale PID), then `start-lab.ps1`. Progress is in PostgreSQL, so teams resume where they were. |

## 7. Monitoring during the rehearsal

- `check-lab.ps1` every few minutes: listener, process memory/CPU, health latency (median/p95) on localhost and LAN, machine CPU.
- Task Manager → Details → `node.exe` (memory, CPU) and `postgres.exe`.
- Live counters: `Get-Process node | Select Id,CPU,@{n='MB';e={[int]($_.WorkingSet64/1MB)}}`.
- The organizer dashboard shows round state, submissions and audit.

## 8. Shutdown, restart, rollback

- Clean stop: Ctrl+C in the server window (or `stop-lab.ps1`). Database contents are untouched; restart with `start-lab.ps1` — Round state, teams, drafts and scores persist.
- After a crash: `stop-lab.ps1` then `start-lab.ps1`.
- Return to the known-good baseline: `git checkout feat/ghost404-hybrid-ui-redesign` (commit `129c32f…`) — note that it lacks the two LAN compatibility fixes and the lab scripts, so over HTTP LAN login will not work there; it is the right target only for hosted HTTPS. Render and its branch were not touched by this work.

## 9. Field checklist — physical rehearsal (tomorrow)

Record results in the table in §10. Each step has a pass criterion.

| # | Step | Pass criterion |
|---|---|---|
| 1 | Server PC: `prepare-lab.ps1`, `firewall-lab.ps1 -Add`, `start-lab.ps1` | banner shows the LAN IP; no errors |
| 2 | Server PC: `check-lab.ps1` | `Result: PASS`; listening `0.0.0.0` |
| 3 | Server PC browser at the **printed IP** and at `localhost` | login page; organizer login works at both |
| 4 | **One** remote PC: `check-lab.ps1 -Url …` then open the site | PASS; team login lands on the dashboard |
| 5 | `node scripts\lab\lan-smoke.mjs --origin http://<ip>:3000 --creds private\lab-credentials-*.csv` from the remote PC (needs the repo + Node there) *or* do the same checks by hand | all `[PASS]` |
| 6 | **Five** PCs at once, different teams (`LAB-01…05`) | all sign in < 5 s each; no errors |
| 7 | **20–30** PCs, one team each | all sign in; `check-lab.ps1` p95 health latency stays < 500 ms; no 5xx |
| 8 | Organizer starts Round 1 (lab database only) | every PC shows an active timer within ~10 s |
| 9 | Verify independent progress: each team submits a different chapter answer | each sees only its own score; projector shows all |
| 10 | Everyone submits at the same moment (call a countdown) | every submission acknowledged; no duplicates; no 5xx; median response < 2 s |
| 11 | Compare timers on 5 PCs side by side | remaining times within ~2 s of each other (also if a PC's clock is off) |
| 12 | Organizer dashboard + projector (`/admin/projector`) on the projector PC/screen | updates within ~15 s; readable |
| 13 | Demo Mode (`/admin/demo`) from the organizer PC | opens without starting anything |
| 14 | Round 2 start/units (organizer flow) for a few teams | releases on schedule; submissions accepted |
| 15 | Restart: Ctrl+C, `start-lab.ps1`, reload on 3 PCs | still signed in (12 h session), progress/scores unchanged, timers continue |
| 16 | Measure: server CPU %, `node.exe` memory, `check-lab.ps1` latency, error count, at idle / 30 logged in / during the simultaneous submit | record numbers in §10 |
| 17 | Shutdown: Ctrl+C, `firewall-lab.ps1 -Remove`, delete `private\`, drop the lab DB | done |

**Overall PASS** = steps 6–16 pass with zero 5xx, zero lost submissions, no manual intervention. A single failure → record it with the time and the server's console output.

## 10. Result sheet (copy and fill in)

```
Date/time:            Server PC (CPU/RAM/OS):          Server IP:
Commit (git rev-parse HEAD):          Node version:     DB: local / Neon
Step 1 [ ]  2 [ ]  3 [ ]  4 [ ]  5 [ ]  6 [ ]  7 [ ]  8 [ ]  9 [ ]  10 [ ]  11 [ ]  12 [ ]  13 [ ]  14 [ ]  15 [ ]  16 [ ]  17 [ ]
PCs tested: __   Failed logins: __   5xx errors: __   Slowest submit: __ s
Server CPU idle/30 users/peak: __ / __ / __ %    node.exe MB: __   health p95 ms: __
Problems and fixes:
```

## 11. Verification status (honest ledger, developer laptop, 23 Nov 2026)

| Category | Status |
|---|---|
| Implementation completed | **Yes**: LAN scripts, two minimal compatibility fixes, tests, this runbook |
| Local verification passed | **Yes** (below) |
| Database isolation verified | **Yes, locally**: the guard refused `ghost404_demo` and a non-local host (executed); 30 synthetic teams were added only to `ghost404_lab_dev` in the local disposable PostgreSQL container. **No separate Neon lab project exists yet** (needs the owner) and the portable-PostgreSQL commands in §3 were not executed |
| Two-PC LAN test | **Pending**: the dev laptop's own LAN IP (`192.168.1.39`) was used from the same machine. This proves binding, cookies, origin handling and the browser flow, **not** other PCs, firewall rules or college network policy |
| Full 20–30-PC lab rehearsal | **Pending** |
| Remaining blockers | lab PC access (Node/PostgreSQL permission, a firewall rule needing admin), a lab database, confirmation that the college LAN allows PC-to-PC TCP on the port |

Executed on the lab branch (real results):

| Check | Result |
|---|---|
| `tsc --noEmit`, `eslint .`, `npm run build` | clean |
| Vitest (local PostgreSQL) | **423 passed, 1 skipped** (incl. 3 new cookie-policy and 3 new same-origin tests) |
| Redesign specs (demo-mode isolation, 50 % unlock, projector) | 8 passed |
| Round 1 chapter chain (`test:e2e:verdict`) | 21 passed (6+1+6+1+5+2), 0 failed |
| Round 1 journey | 1 passed |
| Round 2, organizer, visual (`phase5-round2`, `phase5-visual`) | 19 passed |
| Organizer exact-ties | 1 passed |
| `phase2`, `phase2-journey`, `phase2-visual`, `phase6a-attempts` | 15 passed, 3 skipped (spec-level skips), 0 failed |
| Production server on `0.0.0.0:3000`, `lan-smoke.mjs` (headless Chromium) via the LAN IP **and** `localhost` | 12/12 PASS on each: team login, cookie stored (HttpOnly, SameSite=Strict; Secure off only in LAN mode), refresh keeps session, team blocked from `/admin`, `/admin/demo` and the organizer API, cross-origin POST refused (403), organizer login, projector, Demo Mode, organizer session is not a team session |
| Negative control | server **without** `GHOST_LAN_HTTP`: login redirects but the browser drops the cookie (blocker reproduced) |
| Origin control | pinned `APP_ORIGIN` made `localhost` submissions 403 (fixed as described in §1); after the fix same-origin POSTs reach validation on IP, `localhost` and `127.0.0.1` |
| Lab script guards | wrong DB name refused; non-local DB host refused; `stop-lab` twice is safe; a second `start-lab` while one runs is refused and keeps the first PID record (all executed; a cleanup bug that let a failed second start delete the first one’s PID file was found and fixed). **Not executed:** the interactive `-SetOrganizerCode` prompt (the same hashing helper was run directly) |
| `check-lab.ps1` (server mode and `-Url` mode) | PASS; health median ≈ 49 ms over 20 sequential requests (localhost and LAN IP) |
| Load harness: 30 teams × 1 participant, 4× faster think-time, simultaneous-submit storm, production build, local disposable DB | 1472 requests (23.9 req/s), **30/30 teams completed all 5 chapters**, 0 errors, 0 invariant violations; submit p50/p95 126/625 ms; poll p95 135 ms; server memory peak ≈ 300 MB, 14.8 CPU-s over 55 s; PostgreSQL connections peak 24; restart + re-login keeps score PASS; submission after deadline rejected PASS |

These figures come from a laptop talking to itself. They do **not** substitute for the physical lab test, and the lab PC may be slower. The harness drives Round 1 only; Round 2 was verified by the browser specs above, not under load.
