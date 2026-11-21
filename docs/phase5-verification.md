# Phase 5: verification, security audit and hardening

Branch `feat/phase5-verification-hardening` from `fc5900a`. All database and browser work ran against the project's disposable `ghost404-pg-test` PostgreSQL container (127.0.0.1:55432, empty, only throw-away `ghostt_*` databases). Neon, Render, `.env.preview` and the native PostgreSQL service (port 5433, credentials unknown, not established as disposable) were never used.

## Verification ledger
| Stage | Result |
|---|---|
| 1. Migration smoke (`node scripts/r2-migration-smoke.mjs`) | **PASS 11/11**: real `prisma migrate deploy` on a fresh DB, 6 R2 tables, 4 RESTRICT FKs, 11 indexes, Prisma Client read/write of all six models, empty `prisma migrate diff` vs schema, pre-Round-2 fixture keeps every Round 1 row byte-identical |
| 2. Round 2 DB suite (`GHOST_DB_TEST=1 vitest run tests/round2-db.test.ts`) | **PASS 18/18** (first run 14/15; the one failure was a test bug, fixed; 3 new tests added: roster change after start, deadline race, hostile requests) |
| 3. Round 2 browser journey (`node scripts/phase5-e2e.mjs tests/phase5-round2.spec.ts`) | **PASS 16/16** through the real UI: qualification confirm → enroll → bad/valid promotion → waiting room/standby/outsider/withdrawn → start dialog → released-incident gameplay with partial/duplicate/overblocking → two-teammate conflict → offline → flush-on-navigate → Part A close → Tribunal → late-submit refusal → finish → results private → tie/CSV/publish → participant ranking |
| 4. Seeded visual spec (`GHOST_P5_SEED=1 ... tests/phase5-visual.spec.ts`) | **PASS 3/3** (laptop/tablet/phone: stylesheet applied, no horizontal overflow, nav clickable) |
| 5a. Round 1 browser regression (phase2 + journey + visual specs) | **PASS 15/15** (critical journeys A/B/C, 9 phase2 tests, screenshots at 3 widths) |
| 5b. Full vitest with DB (`--pool=forks --maxWorkers=1`) | 351/352 pass, 19 files; **1 FAIL** `postgres.test.ts` "50 teams in parallel" (P2034 retry exhaustion under load; passes 3/3 in isolation, see F5); `physical-and-bundle.test.ts` needed `.next/static`: failed before the build, **PASS 5/5 after it**. Default thread pool crashed Node with a segmentation fault; forks pool is stable |
| 6. Lint / typecheck | **PASS**: `eslint .` 0 problems (191 files), `tsc --noEmit` clean |
| 7. Production build | **PASS** `next build` ok in ~25 s, no C: loss observed (6.25 GB before and after); all `/round2`, `/admin/round2`, `/api/round2/*` routes dynamic; 0 source maps; client bundle scanned: no answer-key identifiers, no evidence strings, no `tasks.server` |
| Not run | remote/Neon/Render tests, 50-team load test, real-device/real-network checks |

## Findings
| # | Sev | Finding | Status |
|---|---|---|---|
| F1 | **Medium** | Challenge 3 `b3.verify` prompt and UI named INT-2, INT-4, INT-5 as the items to refute, which revealed the answers to `b3.classify` (6 pts) and the unverifiable item. Client code also hard-coded the list. | **Fixed**: teams choose which items to refute (any of 6, max 3); optional limitation; regression tests assert no prompt names an option/record id |
| F2 | Low (functional) | The server's 3 s gap is per team, but each task card kept its own countdown, so submitting a second task within 3 s showed "Slow down". | **Fixed**: shared cooldown; found by the browser journey |
| F3 | Medium (design) | Per-submission "+N points" is a per-criterion oracle: a classification grid can be probed in a few attempts (12 attempts/task cap). Inherent in partial credit, same as Round 1. | Open: accepted trade-off or reduce attempts for grid tasks (organizer decision) |
| F4 | Low | Draft PUT and status polling have no per-IP rate limit (authenticated finalists only; drafts ≤8 KB, one row per task). | Open, low risk |
| F5 | Low | Round 1 `serializable()` can exhaust 8 retries with 50 simultaneous submissions on a loaded laptop (1 failure in a full-suite run, 3/3 pass alone). Round 1 code, unchanged. | Open: re-measure on the real host |
| F6 | Info | `.env.preview` in the working tree points at Neon; `preview:*` scripts load it. Never used here; harnesses never read `.env*`. | Operational warning |
| F7 | Info | Responsive defects found by viewing screenshots (phone/tablet nav items overlapped and could not be clicked; header overlap; tiny map labels; map forced page overflow). | **Fixed**, covered by the visual spec |
No critical or high findings were open at the end. Verified negatives: anonymous and participant access to every R2/admin endpoint (401/403), wrong/missing Origin (403), oversize (413), `__proto__` (400), extra `teamId`/`score` fields (400), late submission (403), unreleased evidence absent from responses and DOM, results 404 until published, BLOCK actions are inert (no network code exists), published ranking excludes withdrawn teams.

## Visual review (screenshots in `test-results/phase5/shots`, git-ignored)
Reviewed laptop incident 1/2/3, tribunal B1, published results, organizer, phone incident 2 and tablet incident 1 after fixes. Remaining nits: edge labels on the map overlap where lines converge; the tablet top bar leaves a gap; Round 1 Containment on a phone is still ~5,070 px tall because its first task opens expanded (was ~5,500).

## Release readiness
See the verdict in the final report. Not release-ready for a real event until: the 50-team Round 1 contention flake is re-measured on the real host, F3 is decided, a rehearsal runs on the real hosting stack (Phase 6), .
