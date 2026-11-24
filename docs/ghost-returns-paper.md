> **Superseded.** This describes the retired 40-minute sequential format. The only Round 2 format is now GHOST RETURNS Part A, 60 minutes, four open injects: see `docs/ghost404-round2-open60.md`.

# GHOST RETURNS — paper edition (Round 2 rebuild)

Branch `feat/ghost404-round2-paper`, based on Phase 1 checkpoint `3327e506`. Phase 1 (`test/ghost404-lab-lan`) is untouched.

## Format
Top 10 teams. **Part A**: 40 minutes, four chapters that open and close by themselves on the **server clock**. Teams read evidence on screen and **write everything on paper**; nothing is submitted, scored or ranked online. AI is prohibited. **Part B**: offline Boardroom Verdict (two parallel panels of two judges). Part A 60 + Part B 40 = 100, all totalled by hand.

| Window | Chapter |
|---|---|
| 0:00–8:00 | 1 · Alert at 2:14 AM (alert console, 4 evidence tabs, scripted chat with Ravi, options A–E) |
| 8:00–20:00 | 2 · Kill Switch (read-only network monitor, 10 connections, sparklines; **no BLOCK command exists**) |
| 20:00–30:00 | 3 · Audit the AI (SENTINEL-AI's 5 claims, Night Timeline incl. the planted gateway line, case-file extracts) |
| 30:00–40:00 | 4 · The Three Calls (situation board, 3 calls, 6 statements) |
| 40:00+ | **INVESTIGATION COMPLETE — PENS DOWN** |

Chapter 3 is solvable without Chapters 1–2 on screen: it carries a timeline and five neutral case-file extracts (login log, process snapshot, backup schedule, network monitor, identity/update logs) that contain the needed facts but no verdicts, and it never repeats Chapter 2's attacker IP addresses.

## How access control works
- `src/lib/round2/paper/clock.ts`: pure function of the persisted `R2Session.startsAt/endedAt` and the server's `now`. No in-memory state, so restarts and reconnects land on the same chapter. The device clock is never an input (the browser counts down from `serverNow` plus a monotonic timer).
- `GET /api/round2/status` (active finalist required) returns **only the open chapter** (or `not_started` / `complete`). Past and future chapters are never in a response, and `/round2` renders only that chapter in its HTML. The handler reads no query string, header or body.
- Retired: `/api/round2/submit|drafts|evidence|results` answer **410**. No write path exists for participants.
- Organizer actions (`/api/round2/admin`): `enroll`, `promote`, `start`, `end` (reason required). `start` needs a confirmed qualification and enrolled finalists, is audited, and cannot repeat. No migrations: it reuses `R2Session` and `R2Finalist`.
- Answer key and rubrics are in `src/lib/round2/paper/key.server.ts` (server-only), rendered only by `/admin/round2/print/*` after `session("admin")`. A build-level test fails if any key or chapter text reaches `.next/static`.

## Organizer
- `/admin/round2` control room: readiness, enroll, start, current chapter + remaining time, scheduled transitions, end early.
- `/admin/round2/projector`: full-screen countdown, chapter indicator, GHOST_404 taunt for 40 s after each transition (derived from the clock; nothing stored), PENS DOWN at the end.
- `/admin/round2/print`: answer sheet (4 pages), answer key (organizer only), Part A rubric, Boardroom rubric, combined score sheet, timing script. Use the browser's Print.
- `/admin/demo/round2?unit=1..4`: Demo Mode, all four chapters, no timers, no API calls, nothing written.

## Marking (paper adaptations)
Ch 1: 5 action + 6 evidence + 4 reasoning. Ch 2 (adapted from the PDF's BLOCK scoring): 5 per correct attacker IP with evidence (10) + 5 for explaining why a convincing legitimate connection must not be blocked − 2 per legitimate connection named as attacker (floor 0). Ch 3: 3 per claim (1 call + 2 clue). Ch 4: per call 3 + 1, plus 3 for statements 1 and 3. Part B: four criteria × 10. The PDF's "faster Part A finish" tiebreak does not exist (fixed-time Part A); the score sheet says ties go to the higher Boardroom score, then the jury.

## Preview independently (no effect on Phase 1)
```powershell
cd D:\Ghost404-TestWorkspace\r2paper
# any disposable database; or use the lab scripts with a ghost404_lab_* database and LAB_PORT=3300
$env:DATABASE_URL="postgresql://…/ghost404_lab_r2paper"; $env:DIRECT_URL=$env:DATABASE_URL
npm ci --include=dev ; npm run build ; npx prisma migrate deploy
```
Organizer → `/admin/demo/round2?unit=1`. For a live dry run: log in as organizer, `/admin/round2`, enroll, start; log in a finalist team on another browser at `/round2`.

## Known limitations
- A tab that was already open keeps the framework payload it was served (the chapter text the team had already seen) in its page source after the chapter closes; the page stops *rendering* it. Nothing about future chapters is ever sent early.
- Legacy tables (`R2Submission`, `R2TaskScore`, drafts) and the 8-unit service code remain in the repo for history; the old Round 2 specs/tests are scoped behind `GHOST_R2_LEGACY=1`.
- Visual refinement beyond clarity (GHOST//OS) is Phase 3. Not tested: real 10-team room, projector hardware, real lab PCs.
- Chapter 2 sample data uses the PDF values for rows 1–5; rows 6–10 are invented neutral traffic.

## Rollback
Phase 1 is unaffected. To abandon this work: do not merge; `git worktree remove D:\Ghost404-TestWorkspace\r2paper`. To return a running preview to the previous Round 2, check out `3327e506` (the 8-unit Round 2 is intact there).

## Verification ledger (developer laptop, 23 Nov 2026, disposable local PostgreSQL)
| Check | Result |
|---|---|
| `tsc --noEmit`, `eslint .`, `npm run build` | clean |
| Vitest (all) | 444 passed, 19 skipped (16 legacy 8-unit DB tests scoped behind `GHOST_R2_LEGACY=1`; the rest are pre-existing opt-in skips) |
| Paper clock unit tests (boundaries 0, 7:59, 8:00, 19:59, 20:00, 29:59, 30:00, 39:59, 40:00, early stop, monotonic) | 15 passed |
| Paper DB suite: auth, enrollment, readiness, start/end audit, every window ±30 s margin, only-open-chapter payload, no answer strings, identical data for every finalist, no reopen, restart (fresh modules), 410 legacy endpoints, nothing written | 19 passed |
| Bundle/isolation guards (no key or chapter text in `.next/static`, key imported only by the admin print module) | 5 passed (after a production build) |
| Browser suite `phase5-paper.spec.ts`: organizer start from UI + waiting team flips live, read-only chapters (no form/input/submit), windows in HTML, direct-URL/API bypass, refresh/reconnect/device clock ±3 h, live 8:00 and 40:00 transitions without reload, organizer tools + all six printables + team refusal, Demo Mode zero-API/zero-write, overflow + axe WCAG A/AA at 375/768/1366 | 9 passed |
| Round 1 chain (`test:e2e:verdict`) | 21 passed; journey 1 passed |
| Demo/unlock/projector specs (Demo Mode isolation incl. the new Round 2 walk) | 8 passed |
| Phase 2 + attempt-cap specs | 15 passed, 3 skipped (spec-level) |
| Production server via the Phase 1 scripts (`prepare-lab`, `start-lab`, `stop-lab`) on a separate `ghost404_lab_*` database, port 3300, LAN IP and localhost: team login, `/round2` shows the right chapter, **server restart keeps the chapter and the countdown** | passed |
| Legacy Round 2 browser specs (`phase4-round2`, `phase5-round2`, `phase5-visual`, `organizer-ties`) | **not run**: they test the retired 8-unit UI/scoring; excluded in `playwright.config.ts` unless `GHOST_R2_LEGACY=1` |
