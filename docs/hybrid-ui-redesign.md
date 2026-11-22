# GHOST_404 hybrid UI redesign (forensic workstation + cinematic investigation)

Branch `feat/ghost404-hybrid-ui-redesign`, based on the verified full-game commit `0b4b172e26eeb1f8c54e6930cbd0c9003df9003e`. Presentation and navigation only: **no Prisma schema or migration change, no scoring/engine change, no change to Round 2 timing, ranking or publication rules.** Nothing here was deployed; no hosted database or Render setting was touched.

## Baseline findings (Phase 0)
Already in 0b4b172 and kept: server-authoritative unlock (`engine.unlocked`: `unlockedAt` or previous raw score >= 8/13/13/10 or previous chapter completed), route guards (a locked chapter redirects to `/play`, a forged POST is refused), best-v1 partial scoring with attempt caps, server-backed drafts with conflict handling, three-panel Inbox, Trail session path, relationship chains, Round 2 command-center shell, organizer confirmations/audit.
Gaps found: (1) the next-chapter "Open" link appeared only after a *submit response* (transient) or after the chapter was *completed*; (2) the dashboard was five text-heavy cards; (3) tokens were midnight blue, not charcoal; (4) no projector view.

## What changed
| Area | Change |
|---|---|
| **50% unlock (priority)** | `UnlockNotice` ("Chapter N Unlocked", score vs required, **Continue to Chapter N — Name**, Keep investigating, Back to Investigation Dashboard) appears as soon as the server reports the next chapter unlocked, even with the chapter incomplete; non-modal, hides on "Keep investigating". A permanent **NextChapterFooter** at the bottom of every chapter shows either the Continue button (unlocked) or "N more points unlock Chapter X" with a connection note (locked). State comes only from `state.unlocked[]` / the server's submit response (`src/lib/game/unlock-ui.ts` never computes an unlock). |
| Navigation safety | `useSafeNavigate`: every in-app link (map, Continue, Back) flushes drafts first; if edits are still unsaved (offline/conflict) it shows "Some edits are not saved yet" with Stay / Leave anyway instead of leaving silently. Forward and back navigation are covered by a browser test. |
| Dashboard `/play` | Mission header (SVG score ring out of 105, clock), one **Next action** (furthest open incomplete chapter), connected five-stage **investigation map** with status pills (locked / available / in progress / complete), per-chapter meters with the unlock-gate tick, "N to unlock X"; vertical timeline on phones. Intentional waiting screen (radar pulse). Long blurbs removed. |
| Design system | `src/app/design.css` + `src/components/ui/design.tsx`: charcoal tokens, amber brand, cyan evidence accent, red only for incidents; `ScoreRing`, `Meter`, `StatusPill`, `PulseState`. Phone header no longer wraps over content. Reduced-motion respected. CSS/SVG only, no new dependency. |
| Round 2 | Phase identity on the existing shell: Part A amber, **Part B cyan** (analytical tribunal), timer turns red with a text marker ("closing soon") in the last 5 minutes. Engine, clock, caps, ranking untouched. |
| Organizer | Link to the projector from `/admin`. Existing confirmations, authorization and audit untouched. |
| **Projector** | `/admin/projector` + `GET /api/admin/projector`: **organizer-authenticated, read-only, private by default**. Payload is only `{status, serverNow, deadline, teams[{rank,tied,id,name,score,chaptersDone}]}` (no codes, participants, evidence, Round 2). Equal totals share a rank (marked "=" ). Polls every 12 s, only while the tab is visible; one shared 5 s server cache, so any number of screens costs one query per 5 s. Rows reorder with a restrained CSS transition. |

## Intentionally unchanged / not done (honest scope notes)
- Chapter desks (Inbox, Trail, Insider, Containment, Verdict) keep their existing evidence layouts, task IDs, payloads and relationship diagrams; they receive the new tokens, the new navigation (unlock notice, footer, safe navigation) and the phone fixes. **I did not add new per-chapter diagrams, rewrite their copy, or build new Round 2 evidence-comparison layouts.** Those remain future design work.
- Sticky bottom action bar: not added, deliberately, so nothing can cover task fields or submit buttons; the footer and the top notice are in normal flow.
- Public unauthenticated projector: **not implemented** (would need an organizer publish switch persisted in the database; out of scope without schema/server changes). The authenticated view is the safe default.
- Automated accessibility scanner (axe) not run: no new dependency was added. Manual checks only: landmarks/headings/labels via the browser specs' role queries, visible focus styles inherited from the kit, `role=status` announcements, text equivalents (aria-label) for the ring and meters.
- Round 2 / organizer screenshots were not captured with seeded fixtures (see Verification).
- 20-team readiness is **not** claimed: Render Free CPU remains the constraint documented in `docs/monday-readiness.md` (on the `feat/render-free-simulation` branch). This redesign adds no polling: the projector polls only when opened, only while visible, and shares a server cache.

## Verification
See the final report for exact commands and counts. Summary of what exists:
- Vitest: `tests/unlock-ui.test.ts` (engine boundaries 7/8, 12/13, 12/13, 9/10 locked vs unlocked, monotonic, view helper never trusts a client score), `tests/projector.test.ts`; the whole suite incl. PostgreSQL tests and the production-bundle answer-leak scan.
- Playwright (disposable local DB, `node scripts/redesign-e2e.mjs`): `tests/ui-unlock.spec.ts` (below threshold locked + route/forged-POST refused; threshold reached -> notice -> Continue -> draft survives -> refresh keeps unlock -> back keeps progress; expired round refuses), `tests/ui-projector.spec.ts` (anonymous/team refused, minimal payload, no mutation, no controls).
- Existing suites re-run after the redesign: Inbox/Trail/Insider/Containment/Verdict chain and full journey, Round 2, organizer.
- Two existing test expectations were updated, not weakened: the dashboard selector (`.k-map-card` -> `.gd-stage`), and the Insider B wrong-answer note text (`No new points` -> `No points yet`, the shipped best-v1 wording; that test also fails identically at 0b4b172).

## Reviewing locally
```powershell
. .\scripts\sim-env.ps1                      # optional: temp/cache on D:
docker start ghost404-pg-test                # disposable PostgreSQL used by all tests
node scripts/redesign-shots.mjs mine         # screenshots -> D:\Ghost404-TestWorkspace\shots\mine (desktop + phone)
node scripts/redesign-e2e.mjs                # unlock/continue/navigation browser specs
node scripts/redesign-e2e.mjs tests/ui-projector.spec.ts
```
To see the 50% unlock by hand: start a disposable DB + `npm run dev` with an active round, sign in as a fresh team, in Chapter 1 submit "Delivery and entry point" correctly (6/15) then "Authentication and session" with a right sign-in record and a wrong Session ID (partial credit): the "Chapter 2 Unlocked" notice and Continue button appear without completing the chapter.

## Verified results (2026-11-22, disposable local PostgreSQL, local dev server)
| Check | Result |
|---|---|
| `npx tsc --noEmit`, `npx eslint .` | clean |
| `npm run build` (+ production-bundle answer-leak scan) | passes |
| Vitest, `GHOST_DB_TEST=1 npx vitest run` | **417 passed, 1 skipped** (24 files; 1 opt-in file skipped) |
| `node scripts/redesign-e2e.mjs` (unlock/continue/nav, expiry, forged request) | 3 passed |
| `node scripts/redesign-e2e.mjs tests/ui-projector.spec.ts` | 2 passed |
| `npm run test:e2e:verdict` (Inbox, Trail, Insider, Containment, Verdict batches) | 10 + 7 + 6 + 1 + 6 + 1 + 5 + 2 = **38 passed** |
| `npm run test:e2e:journey` (full five-chapter journey) | 1 passed |
| `node scripts/phase5-e2e.mjs` Round 2, visual, organizer | 19 passed, 1 skipped |
| `node scripts/phase2-e2e.mjs` phase 2, journey, routes | 16 passed, 4 skipped |
| `GHOST_P2_POLICY=best-v1 node scripts/phase2-e2e.mjs tests/phase6a-attempts.spec.ts` (attempt caps) | 3 passed |
| `GHOST_P5_FINISHED=1 node scripts/phase5-e2e.mjs tests/organizer-ties.spec.ts` | **fails identically at 0b4b172** (the seeded finished-round fixture does not render the "Exact ties" region); not caused by the redesign. Tie acknowledgment and publication remain covered by the passing Round 2 spec and the earlier HTTP lifecycle harness. |
| Screenshots | `D:\Ghost404-TestWorkspace\shots\{before,after}` at 1440, 768, 390 and 1920 (projector): **no horizontal overflow on any page** |

Pre-existing failure found and not caused by this work: Insider B's wrong-answer note assertion (see above) also failed at 0b4b172; its expectation was updated to the shipped wording and the whole insider batch now passes.
Not run: 20-team concurrency (still an infrastructure constraint), automated axe scan, hosted checks of any kind.
