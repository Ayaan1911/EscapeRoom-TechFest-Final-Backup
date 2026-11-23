# GHOST_404 unified branch: verification report

Developer laptop (Windows 11, Node 25.2.1), 23 Nov 2026. Disposable local PostgreSQL 15 in Docker (`ghost404-pg-test`, port 55432) for every test; no hosted database, Render, Neon or Vercel was touched. Results below are what was actually executed on the final code (`feat/ghost404-unified-ghost-os`), apart from the notes.

## Static and unit checks
| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean (0 errors, 0 warnings) |
| `npx next build` (production) | succeeds; local fonts, no network |
| `GHOST_DB_TEST=1 npx vitest run` | **444 passed, 19 skipped** (28 files passed, 2 skipped). The 19 skips are the 16 legacy 8-unit Round 2 DB tests (scoped behind `GHOST_R2_LEGACY=1`, retired UI) plus 3 pre-existing opt-in skips. Includes the paper clock boundary tests (0, 7:59, 8:00, 19:59, 20:00, 29:59, 30:00, 39:59, 40:00, early stop), the 19-test paper DB suite (auth, only-open-chapter payloads, no reopening, restart with fresh modules, 410 legacy endpoints, nothing written) and the bundle/key isolation guards. |

## Browser (Playwright, disposable database, real production-style flows)
| Suite | Result |
|---|---|
| `scripts/phase5-e2e.mjs tests/phase5-paper.spec.ts` (Round 2: organizer start from UI, read-only chapters, bypass attempts, refresh/reconnect/device clock +-3 h, live 8:00 and 40:00 transitions, printables, Demo isolation, overflow + axe at 375/768/1366) | 9 passed |
| `scripts/phase5-e2e.mjs tests/phase5-ghostos-shell.spec.ts` (system bar on every screen, bar never covers content, **no third-party request on any page**, boot reveal non-blocking and off under reduced motion, identical login failure text, axe) | 6 passed |
| `npm run test:e2e:verdict` (Round 1 chain: inbox, trail, insider, containment, verdict stages incl. scoring, unlock, Continue, back navigation, drafts) | 31 passed in 6 stages, 0 failed |
| `npm run test:e2e:journey` | 1 passed |
| `scripts/redesign-e2e.mjs` (Demo Mode isolation, unlock, projector) | 3 passed |
| `scripts/phase2-e2e.mjs` (all specs enabled for that harness) | 19 passed, 0 failed, 46 skipped (specs gated to other phase flags) |
| Legacy Round 2 specs (`phase4-round2`, `phase5-round2`, `phase5-visual`, `organizer-ties`) | **not run**: they exercise the retired 8-unit UI; excluded in `playwright.config.ts` unless `GHOST_R2_LEGACY=1` |

## Concurrency (local, one Node process, one laptop)
`node scripts/load-test.mjs --teams 50 --participants 3 --speed 4` against the production build and a disposable database: 6,241 requests in 81 s; **50/50 teams completed all five chapters; 0 invariant violations; 0 errors**; restart + re-login keeps saved scores; late submission after deadline rejected; scores unchanged after expiry. PostgreSQL connections peak 35.

| Path | p50 | p95 |
|---|---|---|
| login submit (CPU-bound password hashing, whole burst at once) | 1.4 s | 3.5 s |
| first chapter page right after the login burst | 3.0 s | 3.5 s |
| correct submission | 0.68 s | 1.8 s |
| background poll | 0.41 s | 1.65 s |
| wrong submission (409/429 are the intended rejections) | 0.30 s | 0.80 s |

Notes: the 2 s p95 goal is **not** met for login or for the first page load in a simultaneous burst of 50 teams on this one core (server CPU was busy about 80 % of the 76 s). The first-page figure is queueing behind the login burst, not a slow page: later chapter pages are 0.1-0.15 s p50. A staggered start would be better; real teams do not log in within the same second. The harness does not exercise Round 2 (a read-only, cheap polling endpoint); no Round 2 load test was run.

## LAN-style smoke (unchanged Phase 1 scripts)
`prepare-lab.ps1 -Teams 10`, `start-lab.ps1` (binds 0.0.0.0, port 3400, database `ghost404_lab_unified`), then `lan-smoke.mjs` over `127.0.0.1` and this laptop's LAN-interface address `192.168.56.1`: team and organizer sign-in, cookies HttpOnly + SameSite=Strict, refresh keeps session, team cannot open the organizer dashboard or Demo Mode, organizer API returns 401 to teams, cross-origin POST returns 403. **Observed once:** the first smoke run had 1 FAIL ("team session cannot open the organizer dashboard": the redirect to the organizer login did not complete inside the script's 5 s window on the first cold request); two further runs with different teams passed all checks. Treated as a slow first request, not proven to be only that. `stop-lab.ps1` stopped the server cleanly.
Note: that address is a virtual adapter (192.168.56.x), not a real LAN with other PCs.

## Security checks performed
Organizer routes and APIs reject team and anonymous sessions (401) and hostile origins (403); Round 2 legacy endpoints return 410; the production client bundle contains neither the answer key nor chapter text; the key module is imported only by the admin-gated print module; unknown-team and wrong-code logins return the same message; no credential or `.env*` file is committed (`.env.lab` and `private/` are git-ignored).

## Not tested / limitations
- **No real college LAN, no second physical device, no Ubuntu server, no projector hardware, no real lab PCs.** The Ubuntu commands in the runbook are untested.
- No Round 2 load test; no test with 50 teams on a LAN.
- Chapter text for Round 1 was not rewritten; no window manager, sound or topology map (see progress doc).
- Legacy Round 2 specs not run (see above). Legacy tables/code remain in the repo.
- Keyboard-only and screen-reader use were not manually verified beyond automated axe scans.
- Screenshots reviewed manually: dashboard, login, Inbox (after the shell change). Files: `D:\Ghost404-TestWorkspace\shots\u-base\` (before) and `...\u-os\` (after).
