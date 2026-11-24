# GHOST_404 event release checklist (go / no-go)

Tick every line on the day. Any unchecked **MUST** is a no-go. Evidence for what was already verified is in `docs/ghost404-verification.md`.

## T-7 days to T-1 day (on the server PC, with the real network)
- [ ] **MUST** Branch `feat/ghost404-unified-ghost-os` checked out; `git status` clean; `npm ci`, `npx prisma generate`, production build succeed **on the event server itself**.
- [ ] **MUST** Database is a local PostgreSQL named `ghost404_lab_*`; `prisma migrate deploy` applied (additive only); **no** reset or reseed.
- [ ] **MUST** Organizer code set (hash only in `.env.lab`/environment); real team credentials generated into `private/` and handed out individually.
- [ ] **MUST** `lan-smoke.mjs` run from a **different PC on the lab network** against the server's real address: all PASS (this was never done on a real LAN).
- [ ] **MUST** 3+ real team PCs open the URL, sign in, reach `/play`, refresh without losing the session. Same browser versions as the lab's students.
- [ ] Firewall: only the lab subnet can reach the server port; the server PC has a static address or reserved DHCP lease and does not sleep.
- [ ] A rehearsal with the **real number of PCs** at the same time (staggered logins are fine; a simultaneous start is the worst case: login p95 was 2.0 s with 50 simulated teams on a 16-core laptop with the thread pool sized to the CPUs, and 3.5 s with Node's default pool of 4; a lab server with fewer cores will be slower).
- [ ] **MUST** On two real team PCs (the lab's browser and screen size, at least 1280x720): open a Round 1 chapter, confirm the dock appears at the bottom, open a tool window, drag it, minimize/restore it, close it, refresh and confirm the layout returns. Confirm the Round 2 Kill Switch map and Audit split screen fit the screen without sideways scrolling.
- [ ] Server start used `start-lab.ps1` (sets the password-hashing thread pool to the CPU count); on Ubuntu confirm `UV_THREADPOOL_SIZE` is exported before `next start`.
- [ ] Backup: `pg_dump` (or `npm run db:backup`) scheduled to a second device, restore tested once.
- [ ] Printables: print `/admin/round2/print` (answer sheets for all finalists, rubrics, score sheet, timing script). Check one printed sheet on paper (only checked on screen so far).
- [ ] Projector: `/admin/projector` (organizer sign-in on the projector PC) shown on the real projector at its real resolution; readable from the back of the room; check every scene changes by itself (standby, Round 1 live, Round 2 live, pens down).
- [ ] **MUST** `prisma migrate deploy` includes `20261125000000_round2_paper_marks` (jury marking table).

## Round 1 (digital)
- [ ] All team PCs on the sign-in page; organizer starts the 60-minute clock once.
- [ ] Watch `/admin` for stuck teams; do not restart the server unless necessary (a restart keeps scores and the clock but costs real minutes).
- [ ] After the deadline, confirm qualification in `/admin` (organizer decision; nothing advances automatically).

## Round 2 (paper)
- [ ] **MUST** Enroll finalists; 10 active + standby shown correctly; every finalist PC shows "Stand by".
- [ ] **MUST** Volunteers hold printed answer sheets; jury (2 panels x 2 judges) has rubrics.
- [ ] **MUST** `private/round2-key-v2.json` is on the event server (the Kill Switch terminal says "offline" without it). Print the correct-IP slips.
- [ ] Press **Start Round 2** once (the only format: 60 minutes, four open injects); confirm all four injects on two finalist PCs and the countdown on the projector.
- [ ] Pacing is advice only (10/12/25/10 + 3). At 60:00 the screens show PENS DOWN and every terminal locks by themselves. Do not refresh to "help" a team: the server clock decides.
- [ ] Kill Switch: watch "terminal review" in the control room; hand a correct-IP slip only after a team is OUT OF ATTEMPTS; never reset attempts. Print the terminal results after pens down.
- [ ] If something goes wrong: **End now** (reason required) closes everything for everyone. It cannot be undone.
- [ ] Jury marking in `/admin/round2#marking`: enter Injects 1, 3, 4 (0-15) with the marker name; Inject 2 fills itself from the terminal. Pending stays pending (never zero).
- [ ] **Publish results** only when every finalist is complete (reason + confirmation). Publishing locks marks and puts the ranking on the projector.
- [ ] Projector content: Round 1 standings and finalist names are hidden until switched on in `/admin/leaderboard` (audited).

## No-go triggers
- Server cannot be reached from a second PC on the lab network.
- Any team can open another team's page or the organizer pages (should be impossible; stop and investigate).
- Database not backed up, or not on a `ghost404_lab_*` database.
- Third-party requests appear in the browser's network tab while playing (should be none).

## After the event
- [ ] Stop the server, take a final backup, export scores (Round 1 CSV in `/admin`), delete `private/*.csv` and any test databases.
