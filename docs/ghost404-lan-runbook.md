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
npx next start -H 0.0.0.0 -p 3000
```
Run it under `systemd` or `tmux` so it survives the SSH session. Open the port in `ufw` (`sudo ufw allow from <lab subnet> to any port 3000`) only for the lab subnet. Team provisioning on Ubuntu: `node scripts/provision-teams.mjs` (reads `DATABASE_URL`; see `scripts/provision-lib.mjs`). The PowerShell wrappers do not run on Ubuntu; the commands above are what they wrap.

## Origin and cookie settings (plain HTTP on a closed LAN)
- Leave `APP_ORIGIN` unset: the CSRF check then compares the browser's `Origin` with the request `Host`, so the LAN IP, a hostname and `localhost` all work consistently.
- `GHOST_LAN_HTTP=1` turns off only the cookie `Secure` flag, and only while `APP_ORIGIN` is not https. Never set it on a hosted (https) deployment.
- Do not mix addresses in one browser session (cookies belong to one host): give teams one URL.

## Round 2 on event day
1. After Round 1, organizer confirms qualification in `/admin`, then `/admin/round2` -> **Enroll finalists**.
2. Open `/admin/round2/projector` on the projector machine. Print `/admin/round2/print` (answer sheets, rubrics, script).
3. **Start investigation** only when every finalist PC shows the "Stand by" screen. The clock cannot be paused; **End now** (reason required) closes every chapter immediately.
4. A server restart mid-round keeps the same chapter and countdown (the clock is the stored start time). The restart itself costs real time: the chapter keeps counting while the server is down.

## Recovery
- Server process died: start it again; progress and the Round 2 clock are in the database. Teams stay signed in for 12 hours; if the address changed they must sign in again.
- Database backup: `npm run db:backup` (scripts/db-backup.mjs) or `pg_dump` on a schedule to a second device. This is the only copy of the event if the laptop dies.
- Never run `prisma migrate reset`, truncate tables or reuse a demo/competition database for rehearsals.

## Remaining dependencies and unknowns
- Internet is needed only for `npm ci`/build (and for a hosted fallback, which is a separate decision not made here).
- Unknown until the real lab: firewall policy, Wi-Fi isolation, browser versions, proxy settings, projector resolution (the projector view targets 1920x1080; it was not tested on real projector hardware).
