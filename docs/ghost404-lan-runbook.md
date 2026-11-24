# GHOST_404 LAN runbook (unified branch)

The full Windows procedure, troubleshooting tables and field checklist are in `docs/lab-lan-runbook.md` (Phase 1) and still apply unchanged: this branch did not touch `scripts/lab/*`. This page records what is different or new, and the **Ubuntu** equivalent, which has **not been tested**.

## What the LAN needs
- One server PC running Node 20+ (tested with Node 25 on Windows) and PostgreSQL 15+ (local, no internet).
- Team PCs need only a browser and the server's address. **Nothing is fetched from the internet while playing**: fonts are bundled, no CDN, no analytics, no AI calls (verified by a browser test that fails on any third-party request).
- The **build** needs the npm registry once (`npm ci`). Do that before the event on a PC with internet, or carry the built folder (`scripts/lab/package-lab.ps1`, Method B in the Phase 1 runbook).

## Windows (tested on the developer laptop)
```powershell
cd <repo>                         # branch feat/ghost404-unified-ghost-os
copy .env.lab.example .env.lab    # database name MUST start with ghost404_lab ; set ADMIN_ACCESS_HASH; LAB_PORT
powershell -ExecutionPolicy Bypass -File scripts\lab\prepare-lab.ps1 -Teams 10     # build, verify DB identity, migrate (additive), synthetic teams
powershell -ExecutionPolicy Bypass -File scripts\lab\start-lab.ps1                 # foreground, binds 0.0.0.0
powershell -ExecutionPolicy Bypass -File scripts\lab\check-lab.ps1                 # health / listening address / database
powershell -ExecutionPolicy Bypass -File scripts\lab\stop-lab.ps1                  # clean stop; database untouched
node scripts/lab/lan-smoke.mjs --origin http://<server-ip>:<port> --creds private\lab-credentials-*.csv   # from any PC with the repo
```
Credentials CSVs go to `private\` (git-ignored). Delete them after the event.

## Ubuntu server (NOT tested here: the development machine is Windows)
```bash
sudo apt install postgresql nodejs npm            # Node 20+; or use nvm
sudo -u postgres createdb ghost404_lab_event      # name must start with ghost404_lab (convention of the lab scripts)
export DATABASE_URL="postgresql://<user>:<pw>@127.0.0.1:5432/ghost404_lab_event" DIRECT_URL="$DATABASE_URL"
export ADMIN_ACCESS_HASH="$(GHOST_LAB_SECRET='<organizer code>' node scripts/lab/lab-tool.mjs hash)"
npm ci && npx prisma generate && npm run build
npx prisma migrate deploy                          # additive only; never `migrate reset`
export NODE_ENV=production GHOST_LAN_HTTP=1 NEXT_TELEMETRY_DISABLED=1   # APP_ORIGIN left unset on purpose (see below)
export UV_THREADPOOL_SIZE=$(( $(nproc) < 16 ? $(nproc) : 16 ))            # parallel password hashing during the login burst (default is 4)
npx next start -H 0.0.0.0 -p 3000
```
Run it under `systemd` or `tmux` so it survives the SSH session. Open the port in `ufw` (`sudo ufw allow from <lab subnet> to any port 3000`) only for the lab subnet. Team provisioning on Ubuntu: `node scripts/provision-teams.mjs` (reads `DATABASE_URL`; see `scripts/provision-lib.mjs`). The PowerShell wrappers do not run on Ubuntu; the commands above are what they wrap.

## Before the event: three things the scripts do NOT do for you
1. **Install the private answer key** at `<repo>\private\round2-key-v2.json` (the folder the server is started from) or point `GHOST_R2_KEY_FILE` at it. It is re-read at most every 30 s, so no restart is needed. Check `/admin/round2` -> "Kill Switch · terminal review" says "Answer key installed (approved)". Without it the Kill Switch terminal is offline for every team and consumes no attempts. Never commit or e-mail the file.
2. **Migrations**: `prepare-lab.ps1` (or `npx prisma migrate deploy`) must apply, in order, `20261125000000_round2_paper_marks`, `20261126000000_insider_wall_pairs` and `20261127000000_insider_group_assignment`. Both are additive. Back up first.
3. **Insider physical fragments**: once the FINAL team accounts exist, use "Prepare group assignment (all teams)" in `/admin/insider-kit` ONCE (30 teams -> 10 A / 10 B / 10 C, one private fragment and one matching public card per team). Re-running or reprinting never changes anything. Teams with no group fall back to the old two-fragment gate.
4. **Chapter 1 needs no QR card or phone**: players use the in-app "Open Forensic Snapshot" button; do not print `/admin/inbox-kit`.
5. **Projector** (`/admin/projector`, organizer signed in): shows the Top 12 only after the organizer switches on "Round 1 standings" (or finalist names) in `/admin/leaderboard`.

## Dry run on the lab server (what to do tomorrow)
Start the server (`start-lab.ps1`), then: organizer signs in -> start Round 1 with the synthetic teams -> **Stop round** -> `/admin#qualification`. NOTE: if more than 10 teams are tied on the same Round 1 score at 10th place (all synthetic teams with 0 points are), the system will not choose; tick the open places yourself, then **Confirm Top 10 and Advance to Round 2** -> `/admin/round2` shows 10 qualified teams -> **Start Round 2** -> "Yes, start the 60-minute investigation". Sign in as a qualified team PC: dashboard shows "Enter Round 2" -> Kill Switch. Try one typo, one wrong block and one refresh. Use only synthetic team accounts; each team gets four blocks per Round 2 session, so reset by using a fresh database for the real event.

## What was and was NOT verified (2026-11-25)
Verified on the development PC with a disposable database: the whole organizer-to-player flow (14 steps, real private key read at runtime), a production `next start` bound to `0.0.0.0` with the variables below and the key at its default path, reached through this PC's own LAN address, and that every browser request goes only to the server (no external service). NOT verified: a second PC, the college network, firewall/Wi-Fi isolation, lab browsers, the lab server itself, projector hardware, Ubuntu. Do not read this as a LAN test.

## Origin and cookie settings (plain HTTP on a closed LAN)
- Leave `APP_ORIGIN` unset: the CSRF check then compares the browser's `Origin` with the request `Host`, so the LAN IP, a hostname and `localhost` all work consistently.
- `GHOST_LAN_HTTP=1` turns off only the cookie `Secure` flag, and only while `APP_ORIGIN` is not https. Never set it on a hosted (https) deployment.
- Do not mix addresses in one browser session (cookies belong to one host): give teams one URL.

## Round 2 on event day
1. After Round 1, organizer opens `/admin#qualification` ("Review Top 10 Teams"), resolves any tie at 10th place, and presses **Confirm Top 10 and Advance to Round 2** (this enrolls the finalists and does not start Round 2). Check `/admin/round2` shows 10 qualified teams.
2. Open `/admin/projector` on the projector machine (signed in as organizer; full screen with F11). It changes scenes by itself. Print `/admin/round2/print` (answer sheets, rubrics, script).
3. Press **Start Round 2** (then "Yes, start the 60-minute investigation") only when every finalist PC shows "Qualified for Round 2 - Waiting for Organizer" / "Stand by". The clock cannot be paused; **End now** (reason required) closes every chapter immediately.
4. After pens down: jury marks in `/admin/round2#marking`, then **Publish results**. Round 1 standings / finalist names on the projector are switched in `/admin/leaderboard`.
5. A server restart mid-round keeps the same chapter and countdown (the clock is the stored start time). The restart itself costs real time: the chapter keeps counting while the server is down.

## Recovery
- Server process died: start it again; progress and the Round 2 clock are in the database. Teams stay signed in for 12 hours; if the address changed they must sign in again.
- Database backup: `npm run db:backup` (scripts/db-backup.mjs) or `pg_dump` on a schedule to a second device. This is the only copy of the event if the laptop dies.
- Never run `prisma migrate reset`, truncate tables or reuse a demo/competition database for rehearsals.

## Remaining dependencies and unknowns
- Internet is needed only for `npm ci`/build (and for a hosted fallback, which is a separate decision not made here).
- Unknown until the real lab: firewall policy, Wi-Fi isolation, browser versions, proxy settings, projector resolution (the projector view targets 1920x1080; it was not tested on real projector hardware).
