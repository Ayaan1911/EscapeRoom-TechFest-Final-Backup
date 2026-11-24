# Round 1 owner test checklist (Windows 11 / PowerShell)

Run from `D:\Projects\EscapeRoom TechFest`. Everything below uses a **temporary local PostgreSQL database** (start the disposable server once with `npm run db:test:up`); your real data is never touched.

## A. Full playthrough rehearsal (~30 min)

```powershell
npm run rehearsal:round1
```

Expected: prints `Temporary Chapter 1 demo: http://127.0.0.1:3000`, a generated access code, and the step list. Keep the window open.

1. Browser window 1 (organizer): open `http://127.0.0.1:3000/login?role=admin`, Team ID not needed, paste the generated code → **Event operations** page. Click **Start Round 1**; a 60-minute clock appears.
2. (Superseded: no QR or CCTV kit; see `ghost404-release-checklist.md`.) Still as organizer, open `/admin/inbox-kit` (QR evidence), `/admin/insider-kit` (prepare **Part A private** and **Part B public** cards), `/admin/containment-kit` (CCTV sheets). Print preview should show A4 pages without cut-off.
3. Browser window 2 (a **separate profile or private window**): `http://127.0.0.1:3000/login?role=team`, Team ID `DEMO-A`, same code.
4. Play: Inbox → Trail → Insider (enter the Part A and Part B fragments of DEMO-A from the kit) → Containment → Final Verdict.
5. Expected after each correct submission: the next chapter unlocks. A wrong answer shows a rejection and, after the cooldown (3 s), you can retry. Hints cost −3 (first) and −9 total for two.
6. After Final Verdict: **CASE CLOSED** and a saved score. Maximum is 105 (needs the Tamper Alert bonus and no hints). Refresh and log out/in: score and CASE CLOSED persist.
7. Try `DEMO-B` and `DEMO-C` (different case variants). Try opening `/play/verdict` on a fresh team: it must refuse until Containment is done.
8. Organizer: refresh `/admin`; check scores, hints, bonus, completion time, Top 10 / standby lists (“PROVISIONAL” while running). Click **Stop**, then confirm the results (“pending organizer confirmation” → confirmed). Download `/api/admin/scores` (CSV opens in Excel without formulas executing).
9. Press **Ctrl+C** in the terminal. Expected: the temporary database folder is removed.

Troubleshooting: port 3000 busy → close the other app or earlier demo. Login fails → copy the code exactly (it is shown once per run). Force-closed window → delete only the folder named `ghost-inbox-demo-…` in `%TEMP%` (Win+R, `%TEMP%`).

## B. Automated checks (~15 min)

```powershell
npm run lint; npm run typecheck
npm test
$env:GHOST_DB_TEST='1'; npm test; Remove-Item Env:GHOST_DB_TEST
npm run test:e2e:verdict      # all chapters in Chromium, ~8 min
npm run build
```

Expected: no lint errors; 133 tests passing (95 without the DB flag); browser suites passing (`npm run test:e2e:verdict`, `npm run test:e2e:journey`); build succeeds.

## C. 50-team load test (~3 min)

```powershell
npm run build
npm run load:round1 -- --teams 50 --storm
```

Expected: `errors: 0`, `invariant violations: 0`, `50/50` teams completed, `Recovery: … PASS` (three times). Note the p95 numbers; compare with `docs/phase-7-round1-readiness.md`.

## D. Real team registration (dry run first)

```powershell
npm run teams:provision -- --input teams.csv --out private\credentials.csv       # dry run only
npm run teams:provision -- --list                                                   # no codes are shown
```

Only add `--apply` for the real event database, then hand out each code privately.

## E. Backup / restore drill (PostgreSQL)

```powershell
npm run db:backup                                  # JSON snapshot of DIRECT_URL into backupsnode scripts/db-backup.mjs verify backups\<the new file>.json
```

Expected: `Backup OK` with table counts. Practise `restore <file> --yes` only into an EMPTY scratch database (a populated one is refused).

## F. Things only you can verify (not done by automated tests)

- Phone camera scans the printed Chapter 1 QR from the venue network (needs the final HTTPS URL).
- Printed A4 kits look right; cards are cut and placed; Part A cards are NOT visible to other teams.
- HTTPS hosting is chosen and works from phones (participants cannot stay logged in over plain `http://` on the LAN).
- Volunteers have read the procedure; a timed 60-minute pilot with real people; accessibility needs.
