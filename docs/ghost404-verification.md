# GHOST_404 unified branch: verification report (pass 2)

> **Inject 2 and LAN dry-run readiness, 2026-11-25:** PASSED: Kill Switch fidelity/parser/DB tests (see `ghost404-inject2-killswitch.md`), Round 2 browser spec (6), a 15-step organizer-to-player smoke on a disposable database with the real private key, and a production-mode `next start` probe on `0.0.0.0` via this PC's LAN address. **NOT tested:** the real college LAN or a second PC. **DEFERRED:** full Playwright regression, Round 1 chain specs, load tests.

> **Gameplay corrections (qualification, PDF wording, Evidence Wall), 2026-11-24:** PASSED before the C: drive filled: Top 10 unit/DB/browser (11+9+2), PDF fidelity (27/27 against the source, 9 tests), Evidence Wall DB (15) and one browser journey. This finalizing pass re-ran only typecheck, lint, build and the changed-feature tests listed in `ghost404-implementation-progress.md`. **DEFERRED:** full Playwright regression, Round 1 chain and journey specs, load tests, real-LAN run. A disk-full event on C: interrupted one layout measurement (see the Evidence Wall note in the progress ledger).

> **Phase 3 (event control center) verification:** see `docs/ghost404-phase3-event-control.md`. Static checks, build, 482 unit/database tests and 7 targeted browser smoke tests PASS; the exhaustive browser regression is **DEFERRED** (not run to completion in Phase 3). The pass-2 results below predate Phase 3.

Developer laptop (Windows 11, 16 cores, Node 25.2.1), 23 Nov 2026. Disposable local PostgreSQL 15 in Docker (`ghost404-pg-test`, port 55432) for every test. No hosted database, Render, Neon or Vercel was touched. Everything below was executed on the final code unless marked.

## Static, unit and database
| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean (0 errors, 0 warnings) |
| `npx next build` (production) | succeeds |
| `GHOST_DB_TEST=1 npx vitest run` | **444 passed, 19 skipped** (28 files passed, 2 skipped). The skips are the 16 legacy 8-unit Round 2 DB tests (`GHOST_R2_LEGACY=1`) plus 3 pre-existing opt-in skips. Includes the new time-range filter assertions in `tests/trail.test.ts`, the 15 paper clock boundary tests (0, 7:59, 8:00, 19:59, 20:00, 29:59, 30:00, 39:59, 40:00, early end), the 19-test paper DB suite (auth, only-open-chapter payloads, no reopen, server restart with fresh modules, 410 legacy endpoints) and the bundle/key isolation guards |

## Browser journeys (Playwright, disposable database)
| Journey | Suite | Result |
|---|---|---|
| **A** Full Round 1: login -> Inbox -> Trail -> Insider -> Containment -> Verdict -> completion, scoring, partial scoring, 50 % unlock, Continue, back navigation, drafts, hints, tamper bonus, restart recovery | `npm run test:e2e:verdict` (8 stages) + `test:e2e:journey` | **38 passed in the two later runs; in the chain run one test failed once** (see Intermittent failure) |
| **B** Full Round 2: organizer starts from the UI, Chapter 1 -> 2 -> 3 -> 4 -> PENS DOWN with live 8:00 / 40:00 transitions, bypass attempts, refresh, reconnect, device clock +-3 h, printables, Demo isolation | `phase5-paper.spec.ts` (9) + `paper-clock`/`paper-db` unit/DB suites (boundaries 8/20/30/40) | 9 passed + unit/DB passed |
| **C** GHOST//OS windows: open, focus order, drag, viewport clamping (cannot be dragged out of reach), resize, minimize/restore, close, keyboard move/resize/Escape, reset, refresh restores layout, no evidence in storage, phone sheet | `phase5-ghostos-windows.spec.ts` | 5 passed |
| **C2** Chapter tools: Inbox compare/link inspector (no verdict language), Insider link board filters the dossier, Containment map mirrors the plan literally and never grades, Verdict evidence board + case file, Round 2 Kill Switch map (10 nodes, shared selection, no suspicion colouring, keyboard, no overflow at 375/768/1366), Audit split screen (search, tabs, local ticks store nothing, still no form) | `phase5-ghostos-chapters.spec.ts` | 6 passed |
| **D** Organizer: sign in, event pipeline from real state, Round 2 control links, team refused | `phase5-ghostos-shell.spec.ts` | 7 passed (incl. system bar on every screen, **no third-party request on any page**, boot reveal non-blocking, reduced motion, identical login failure text, axe) |
| **E** Security: team cannot open organizer pages/APIs, cross-origin POST 403, locked/future chapters, other team's data, legacy Round 2 endpoints 410 | `phase5-paper`, `phase2` suites, LAN smoke, DB suites | passed (see rows above and below) |
| **F** Layout, console, overflow: **18 routes x 6 viewports** (1920x1080, 1440x900, 1366x768, 1280x720, tablet, phone): no horizontal overflow, no console errors, no failed requests, key heading visible, system bar above content | `phase5-ghostos-layout.spec.ts` | 3 passed |
| Demo/unlock/projector isolation | `scripts/redesign-e2e.mjs` | 3 passed |
| Phase 2 specs (task scoring, attempt caps, journey) | `scripts/phase2-e2e.mjs` | 19 passed, 0 failed, 46 skipped (gated to other phase flags) |

The five `phase5-*` suites together: **30 passed** in one run. Legacy Round 2 specs (`phase4-round2`, `phase5-round2`, `phase5-visual`, `organizer-ties`) still **not run** (retired UI; `GHOST_R2_LEGACY=1`).

### Intermittent failure (not resolved)
In the one chain run, `verdict.spec.ts` "Final Verdict A" failed: after the team re-submitted the correct session answer, Session & impact stayed at 2/3, so "CASE CLOSED" never appeared. This test deliberately fires a rapid direct submission to assert throttling (3 s evidence cooldown), so it is timing-sensitive. The same stage then passed in **three** consecutive reruns (38/38, 38/38, 31/31 in an earlier variant). I did not isolate the cause; it has not reproduced, and I cannot rule out a latent race between the cooldown window and the test's own direct request. Treat Verdict A as "passes 3 of 4 recent full runs".

### Other flakes seen and fixed in this pass
- Round 2 Kill Switch: intermittent page-wide overflow (`position:absolute` screen-reader cells outside the scroll wrapper) failed the overflow test about half the time -> fixed (`.rp-tablewrap` is now the containing block).
- Round 2 Chapter 1 on a 390 px phone: deterministic 124 px overflow (grid children could not shrink below their table) -> fixed (`min-width: 0`).
- Window layout was being overwritten by the empty initial state (exposed by React StrictMode in dev) -> fixed.
- Insider test selected an option before hydration, which React then reset -> tests now wait for the dock (mounts after hydration).
- LAN smoke: the first run on the earlier build failed once on a slow redirect; on the final build one run of `LAB-02` ended without printing a result (no FAIL line, unexplained) and passed when repeated.

## Concurrency (local, one Node process, one 16-core laptop)
`node scripts/load-test.mjs --teams 50 --participants 3 --speed 4` against the production build and a disposable database, with `UV_THREADPOOL_SIZE=16` (now set by the lab start script): 6,100 requests in 77 s; **50/50 teams completed all five chapters; 0 invariant violations; 0 errors**; restart + re-login keeps saved scores; late submission after the deadline rejected; scores unchanged after expiry. PostgreSQL connections peak 35.

| Path | p50 | p95 | Before (default 4-thread pool, earlier run) p95 |
|---|---|---|---|
| login submit | 1.43 s | **2.00 s** | 3.5 s |
| first chapter page after the login burst | 1.9 s | 2.3 s | 3.9 s |
| correct submission | 0.42 s | 0.86 s | 1.8 s |
| background poll | 0.46 s | 1.02 s | 1.65 s |
| wrong submission (409/429 are intended rejections) | 0.26 s | 0.42 s | 0.80 s |

The 2-second p95 goal is met only marginally for login (2.00 s) and not for the first page after a simultaneous burst (2.3 s). One run per configuration: expect run-to-run variance. The pool size was chosen from a micro-benchmark (150 concurrent scrypt hashes: 1.5 s with 4 threads, 1.0 s with 8, 0.75 s with 16). Page rendering still runs on one Node main thread; a multi-process setup would help further and was not built. The harness does **not** exercise Round 2 (cheap polling endpoint); no Round 2 load test was run.

## LAN-style smoke (lab scripts, final build)
`prepare-lab.ps1`, `start-lab.ps1` (binds 0.0.0.0, port 3400, database `ghost404_lab_unified`, thread pool = CPU count), `lan-smoke.mjs` over `127.0.0.1` and this laptop's `192.168.56.1` (a virtual adapter, **not** a real LAN): team and organizer sign-in, cookies HttpOnly + SameSite=Strict, refresh keeps the session, team cannot open organizer pages, organizer API returns 401 to teams, cross-origin POST returns 403: **PASS** for LAB-01, LAB-02 (on rerun), LAB-03, LAB-04. The served landing page references no external host. `stop-lab.ps1` stopped the server cleanly.

## Security checks performed
Organizer routes/APIs reject team and anonymous sessions (401) and hostile origins (403); Round 2 legacy endpoints return 410; the production client bundle contains neither the answer key nor chapter text (bundle guard test); unknown-team and wrong-code logins return the same message; window state in `sessionStorage` holds no evidence or answers (asserted); no `.env*` or credentials are committed (`.env.lab` and `private/` are git-ignored).

## Not tested / limitations
- **No real college LAN, second physical device, Ubuntu server, projector hardware or real lab PCs.** Ubuntu commands in the runbook are untested.
- No Round 2 load test; no player playtest of the new interactions or of reading time.
- Keyboard-only and screen-reader use verified by automation only (axe + keyboard tests), not by a person.
- Screenshots reviewed by eye: dashboard, login, landing, Trail, Inbox, Insider, Containment, Round 2 chapters 1-4 (laptop/desktop). Files: `D:\Ghost404-TestWorkspace\shots\u-base\` (before pass 1), `...\p2-base\` (start of pass 2), `...\p2-new\`, `...\p2-dash\`, `...\p2-layout\` (18 routes x 6 viewports). Phone screenshots of the new tools were not individually inspected beyond the automated overflow/stacking checks.
- Projector page was not redesigned; it was checked for overflow/console errors only.
- Legacy Round 2 specs not run; legacy tables/code remain in the repo.
