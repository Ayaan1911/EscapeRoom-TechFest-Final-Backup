# GHOST_404 unified branch: implementation ledger

Branch `feat/ghost404-unified-ghost-os`. Pass 1 ended at `52d08fb` (shared system bar, offline fonts, docs). Pass 2 (this ledger) started from `52d08fb`. Evidence for every claim is in `docs/ghost404-verification.md`.

## Branch reconnaissance
| Branch | Head | Relationship |
|---|---|---|
| `test/ghost404-lab-lan` | `3327e506` | Phase 1 LAN baseline. **Untouched.** |
| `feat/ghost404-hybrid-ui-redesign` | `129c32f` | Already an ancestor of `85eef4e1`; nothing to merge. |
| `feat/ghost404-round2-paper` | `85eef4e1` | Paper Round 2, the base of this branch. **Untouched.** |
| `main`, Render-tracked branches | n/a | Not touched. |

## Pass 2 commits (all on this branch)
| SHA | What |
|---|---|
| `60be423` | **GHOST//OS window manager** + dock; Trail rebuilt (overview + Event console / inspector / records windows); time-range filter (unit-tested) |
| `ec904da` | Inbox: mailbox + reader by default; Evidence explorer, **Mail compare**, **Link inspector** windows |
| `a0b230f` | Insider: Evidence Wall + **Link board** (staff x record type); Dossier explorer window |
| `747f10c` | Containment: **systems map** (topology from the case's own systems; node states mirror the team's plan literally, never grade it) |
| `f8267c1` | Verdict: Evidence board + Case file windows; chapter-tools browser suite |
| `babf87c` | Round 2: Kill Switch **connection map**; Audit the AI **split screen** with searchable record |
| `a78912f` | Containment: option wording behind "Details" |
| `4cdb0c0` | Perf: libuv thread pool sized to the CPU count in the lab start script |
| `1d317d6` | Dashboard: mission path strip |
| `78ff570` | Landing: atmospheric network backdrop, shorter copy, details behind disclosure |
| `487dd30` | Organizer: event pipeline (Round 1 -> qualification -> Round 2) |
| `d381d15` | Round 2 hand-off transition (waiting screen only); phone overflow fix; layout/console journey |
The branch head is whatever `git log -1` shows; the last full regression (`docs/ghost404-verification.md`) ran on code identical to `d381d15`, and every later commit is documentation only.

## Definition-of-done checklist (honest)
| Item | Status |
|---|---|
| Landing redesigned | **Done** (atmosphere, shorter copy, boot reveal; not a long cinematic by design) |
| Login redesigned | **Partly**: window chrome + pending state from pass 1; no new success animation |
| Team dashboard redesigned | **Done** (mission path + next action; cards kept as navigation) |
| Desktop shell | **Done**: system bar + dock + windows |
| Window manager | **Done**: open, close, focus/stack, drag, resize, minimize, restore, viewport clamping, keyboard, phone/tablet sheet fallback, layout restore on refresh |
| Functional investigation applications | **Done** where the game has the data: Event console/inspector, Case records, Evidence explorer, Mail compare, Link inspector, Dossier explorer, Link board, Evidence board, Case file, Systems map. Not built (no supporting data): standalone "Network Analysis" and "Incident Timeline" apps |
| Inbox / Trail / Insider / Containment / Verdict redesigned | **Done** as described above. Verdict's reasoning step and Containment's task panels keep their existing form-style panels (scoring contract unchanged) |
| Round 1 text audit | **Done and measured** (`docs/ghost404-text-audit.md`). Containment remains the densest screen |
| Default log walls replaced | **Done** for Trail (25 table rows -> 0 on arrival, 42 % fewer words) and Insider (26 records -> 0) |
| Round 1 scoring and progression preserved | Verified by the existing Round 1 chain (31 tests) |
| Round 2 Ch1 console | Existing alert console kept (tabs, chat, options); no new work |
| Kill Switch topology | **Done** |
| Audit the AI comparison | **Done** |
| Three Calls command center | **Existing** situation board + three call cards kept; no per-call consequence animation (answers are on paper, and consequences would reveal answers) |
| Round 2 shared-clock timing | Unchanged engine; re-verified by the paper DB and browser suites |
| Organizer interface redesigned | **Partly**: event pipeline + system bar; the existing cards/sections are unchanged |
| Projector polished | **Not changed** this pass (checked at 6 viewports for overflow/console only) |
| Round transitions | **Partly**: Round 2 hand-off on the waiting screen; Round 1 completion screen is the pre-existing one |
| Motion + reduced motion | Boot reveal, window open, dock, path pulse, landing backdrop; all off under `prefers-reduced-motion` |
| Target desktop layouts verified | **Done**: 18 routes x 6 viewports (1920x1080, 1440x900, 1366x768, 1280x720, tablet, phone) |
| Browser journeys | A (Round 1), B (Round 2 incl. live boundaries), C (windows), D (organizer), E (security), F (layout) all have browser tests; see verification |
| Local LAN smoke | Run on this build (see verification) |
| Real college LAN | **Not done; cannot be done from this laptop** |

## Not done / known gaps
- Sound design (optional): not built.
- React Bits / Motion / shadcn: not adopted. A small CSS + reducer implementation covers the need; only `lucide-react` (icons) and `geist` (fonts) were added.
- "Network Analysis" and "Incident Timeline" as separate apps: no new data exists for them; the Trail timeline and Kill Switch map cover those roles.
- Round 2 Chapter 1 and 4 structure unchanged (screenshots reviewed: they already read as an alert console and a command-center board).
- Keyboard-only and screen-reader use verified by automation (axe, keyboard tests for the window manager and map) but not by a human.
- Legacy Round 2 browser specs still excluded (`GHOST_R2_LEGACY=1`).

## Continuation instructions
1. `git worktree list`; work in `D:\Ghost404-TestWorkspace\unified` on `feat/ghost404-unified-ghost-os`.
2. `npm ci && npx prisma generate`; run the checks in `docs/ghost404-verification.md`.
3. Remaining work in priority order: (a) organizer pages beyond the pipeline strip, (b) projector visual polish, (c) Containment density, (d) Round 1 completion cinematic, (e) human accessibility pass.

## Visual rebuild (priority zero directive) - running ledger
Evidence: screenshots under `D:\Ghost404-TestWorkspace\shots\` (`base-1440` = before; `c1`, `c1full`, `c2` = 1440x900 after; `f-1366` = 1366x768; `f-390` = phone; projector at 1920x1080 in `c2`). Tooling: `scripts/ui-dev.mjs` (persistent disposable-DB session) + `scripts/shoot.mjs`. Stylesheet: `src/app/cine.css`.

| Screen | State | Notes |
|---|---|---|
| Landing | **Rebuilt, inspected** (1440, 1366, phone) | Full-bleed scene: perspective grid, radar orbit of the five chapters around the alias, boot log, live ticker, one large primary action. |
| Login | **Rebuilt, inspected** (1440) | Secure-access terminal: radar backdrop, status readout, scanning edge, mono labels. Auth logic untouched. |
| Team dashboard | **Rebuilt, inspected** (1440) | HUD clock + score; five chapter cartridges on a glowing route with per-chapter accent. |
| Demo Mode home | **Rebuilt, inspected** (1440) | Simulation launcher with launch tiles. Obsolete "Part A / Part B digital tribunal" text removed. |
| Chapter chrome (R1 x5) | **Restyled**, Inbox + Containment + Verdict inspected | Icon mission rail (expands on hover/focus), HUD header with chapter accent, illuminated panels. Inbox, Trail and Insider body layouts are the previous ones inside the new chrome (Trail/Insider were not re-inspected after the restyle). |
| Containment | **Reworked** | Operations deck: one response phase at a time instead of five stacked panels (page ~3,900 px tall, was ~6,000). Evidence snapshot block still inline; still the longest screen. |
| Final Verdict | **Partly rebuilt** | New case-reconstruction board (repeats the team's own picks, never grades). Task panels are still form-style selects. |
| Round 2 (4 chapters) | **Restyled shell, inspected** (ch 4, 2) | Scene, HUD top bar, accent rail, glass panels. Chapter body layouts unchanged. Chapters 1 and 3 not re-inspected. |
| Organizer | **Restyled, inspected** | Command-center header, glass modules, launcher tiles. No new controls. |
| Projector | **Rebuilt, inspected** (1920x1080, stand-by state only) | Radar scene, chapter bar, chapter rail with names. Running / urgent / complete states not screenshotted. |
| Completion screens, motion pass | **Not done** | Round 1 completion and Round 2 pens-down screens are unchanged; no new transitions beyond the landing/orbit/projector animations. |
| Sound | not built | |

Verification after these changes: tsc + eslint clean; phase5 suites 34 passed (incl. the 18-route x 6-viewport layout check); Round 1 chain 38 passed. Not re-run after the visual changes: Vitest, phase2/redesign harnesses, load tests.

## Phase 1: Round 1 Obsidian Signal rebuild (this pass)
Palette: `src/app/obsidian.css` (authoritative tokens; the old blue/cyan values were remapped everywhere). Layout: `src/app/workbench.css`. Audit: `docs/ghost404-round1-visual-audit.md`.

| Item | State |
|---|---|
| Obsidian Signal palette, one accent for all chapters (no per-chapter rainbow) | Done; remaining blue values swept; Round 2/organizer/projector inherit the tokens (not redesigned) |
| Shared Round 1 shell: compact HUD, mission rail, docked Findings column | Done at >= 1200 px; narrower screens keep the single-column stack |
| Dashboard | Palette + compact; mission-route/cartridge structure kept from the previous pass |
| Inbox | Mail workstation fills the viewport (list + reader scroll internally), Mail compare / Link inspector / Evidence explorer windows kept; tasks docked |
| Trail | Filters toolbar + activity timeline + Event console/inspector windows; 144 rows still in the console |
| Insider | Relationship graph + staff chips + dossier explorer window; no invented links |
| Containment | Command center (map + one active phase) |
| Final Verdict | Reconstruction board + decision slots; mechanic unchanged |
| Completion | Sealed-case-file presentation + "where this team stands" (Round 1 complete -> organizer review -> Round 2 organizer-controlled). No automatic Round 2 |
| Not done | React Bits / Motion not adopted (CSS/SVG only); no player playtest; Round 2, organizer, Demo, projector not touched in this phase beyond inherited colours; dashboard total vs landing score table not re-audited against scoring source |

## Round 2 case document v2 (open-60) - this pass
Spec, policies, key-file format and approvals: `docs/ghost404-round2-open60.md`. Answers live only in the git-ignored private key file.

| Item | State |
|---|---|
| Inject 1 data, five choices, paper workflow, incident-triage desk | Done, browser-verified |
| Inject 2 four-attempt BLOCK terminal (server-side, atomic, persistent, team-isolated, locks at pens down) | Done, DB + browser tested |
| Inject 2 target classification | **PROVISIONAL**: case document v2 lists no targets; the private key reuses the earlier approved Kill Switch classification; owner must confirm |
| Inject 3 twelve records, eight claims, click-based verification desk | Done, browser-verified |
| Inject 4 status, three calls, six statements, command center | Done; statement and chat wording reconstructed from the spec summary (VERIFY against the PDF) |
| Organizer-selected format | **Superseded**: one format only (see below) |
| 40-minute sequential format | **Retired** in the next pass (see below) |
| v2 printables, Demo format switch, projector 60-minute view | Done |
| Not done | Boardroom Verdict (out of scope); terminal attempt-reset procedure |

## Round 2 final decision: one 60-minute format + final Kill Switch (this pass)
Details: `docs/ghost404-round2-open60.md`.

| Item | State |
|---|---|
| 40-minute format retired (clock, content, key, shell, desks, selector, demo option, printables, dual-mode tests) | Done; historical rows kept and shown as closed; Start refuses on such a database |
| Organizer starts Round 2 directly, no format choice (UI and API) | Done, tested |
| Kill Switch exact data: 10 connections, inspect descriptions, 8 IT tickets + footer | Done, unit-tested against the approved document |
| Approved two-target key installed in the git-ignored private file | Done on this machine; must be copied to the event server |
| Terminal: exact parser messages, duplicates free, early success lock, exhaustion lock, server-only feedback, rate limit | Done, DB + browser tested |
| Hybrid scoring (15 terminal points, portal-computed) + organizer/volunteer review + printables | Done; untouched-terminal +5 flagged for the owner |
| Volunteer correct-IP slips (print), no digital reveal, no reset | Done |
| SOC terminal visual design (banner, cursor, BLOCKING sequence, attempt colours, flashes, reduced motion) | Done, screenshots in `D:\Ghost404-TestWorkspace\shots\ks` |

## Player-experience pass (scrolling, visualizations, motion)
Guard: `tests/phase5-scroll.spec.ts` counts independently scrolling regions per screen at 1366x768 (tool windows and the Kill Switch terminal output excluded) and wheels the mouse over the workspace. Baseline before this pass: Inbox 3 (mail list, reader, tasks), Trail 1, Insider 1, Containment 2 (snapshot, phase panel). After: 0 on all nine screens; the wheel always moves the page. Screenshots: `D:/Ghost404-TestWorkspace/shots/ux-1366`, `ux-1366f`, `ux-r2`.

| Screen | Problem | Fix |
|---|---|---|
| Inbox | three nested scrollers; unexplained auth dots | one page scroll; compact sticky mailbox that fits 768 px; SPF/DKIM/DMARC dot legend; reader is the main content |
| Trail | 144 indistinguishable dots | event explorer: activity overview (events per time slice, select to zoom, "Show the whole night"), legend with shape + colour (allowed/denied/challenged), per-lane counts, time ticks; all events kept |
| Insider | spaghetti graph | focus model: lines faint until a person or record type is selected; only its links light up with counts; link inspector lists record types with "Open N"; legend; table view kept |
| Containment | two inner scrollers | phase panel and snapshot in the page flow; phase switch animates |
| Final Verdict | unexplained dashed circles; duplicate text strip | board legend (dashed = not chosen, solid = your draft pick, VERDICT READY when all filled); every slot opens its step; duplicate strip hidden |
| R2 Inject 1 | plain tabs | evidence-source tiles with counts |
| R2 Inject 3 | eight long claim cards beside the evidence | claim navigator (8 buttons, neutral confidence) + one focused claim with previous/next |
| R2 Inject 4 | everything stacked | three calls + public statement as a fourth focused panel; status strip always visible |
| R2 shell | sticky column could become a second scroller | single page scroll; compact header |
| Motion | none purposeful | scroll-driven section reveal (no JS, no scroll-jacking), evidence/inspector fade-in, phase and claim transitions; all off under prefers-reduced-motion |

Not done in this pass: a deeper Kill Switch layout change (kept as built: map, table, inspector, tickets, terminal); per-window animation tuning; a human playtest.

## Phase 3: event control center (organizer, Demo Mode, leaderboard, projector)
Baseline screenshots: `D:/Ghost404-TestWorkspace/shots/p3-before`. Per-stage after-screenshots (seeded with `GHOST_UI_STATE=prep|r1|qual|r2wait|r2run|r2end|results node scripts/ui-dev.mjs`): `shots/p3-<stage>` (admin, r2admin, board at 1366x768 full page; projector at 1920x1080 and 1366x768). Browser-journey screenshots: `shots/p3-e2e`.

| Screen | Old problem | Now | Verified by |
|---|---|---|---|
| Command center `/admin` | stacked generic cards; qualification table overflowed sideways; 3-step strip; stale "40-minute" text | hero with live freshness stamp and server-offset clock; 7-stage pipeline (done / now / pending / blocked, word + colour, each a link); phase-aware "next action" panel; Round 1 chapter progress bars with legend; searchable/filterable/sortable team table with a detail panel (no codes); qualification decision panel; compact audit; danger zone | `phase5-event-control` (pipeline, search, details, no overflow at 1366, nothing starts), `phase5-ghostos-shell`, Round 1 chain (start/stop/override/confirm), `event-control.test.ts` |
| Round 2 control `/admin/round2` | plain cards; no marking at all | server-clock hero with progress track and stale-connection guard; four inject cards (pacing only); readiness checklist; terminal review with summary counts and attempt chips; jury marking sheet; publish gate | `phase5-event-control` (start, validation, pending, pens down, publish, lock, team 401), `phase5-open60`, `marking-db.test.ts` |
| Leaderboard `/admin/leaderboard` (new) | none (only the live projector list) | publication switches (audited, confirmed); Round 1 standings with podium and shared ranks; qualification groups; Round 2 results with provenance per part and pending states | `ui-projector`, `phase5-event-control`, `marking-db.test.ts` |
| Projector `/admin/projector` | a Round 1 list; a separate Round 2 countdown page | one broadcast, 8 server-chosen scenes, 1920x1080 typography, urgent (brass < 5 min, red < 1 min, no flashing), stale guard, reduced motion | `ui-projector`, `phase5-event-control`, `event-control.test.ts`, stage screenshots |
| Demo home `/admin/demo` | two large generic panels | mission map: Round 1 chapter path, Round 2 inject grid, answer-free scenario lines, simulation status incl. key presence (offline when missing, no fallback answers) | `demo-mode.spec`, `phase5-ghostos-layout` |

Not done: real LAN rehearsal, real projector hardware, a separate judge role, a human playtest of the organizer flow.

### Phase 3 verification status
Typecheck, lint, build: PASS. Unit + database: 482 passed, 19 skipped. Targeted browser smoke (7 tests: organizer access, Demo Mode isolation, projector publication controls, 60-minute Round 2 start, marking and publication): PASS. Exhaustive browser regression: **DEFERRED** to release-candidate verification. Full report: `docs/ghost404-phase3-event-control.md`.

## Gameplay corrections: Top 10 advancement, PDF wording, three-pair Evidence Wall
| Item | Problem | Fix | Commit | Verified |
|---|---|---|---|---|
| Top 10 -> Round 2 | confirmation only recorded a snapshot; enrollment hidden on another page; tie settled silently; no participant state | one transactional, idempotent "Confirm Top 10 and Advance to Round 2"; tie needs the organizer; participant states; readiness count. See `ghost404-qualification-workflow.md` | `b8783e8` | 11 unit + 9 DB + 2 browser, passed 2026-11-24 |
| Injects 1, 3, 4 wording | everything paraphrased (also a length cue) | restored verbatim from the PDF, UI additions removed. See `ghost404-round2-content-fidelity.md` | `294bba4` | 27/27 against the PDF; 9 pinned tests |
| Evidence Wall | one lookup pair opened everything | three private/public pairs, three folders, additive migration. See `ghost404-evidence-wall.md` | see git log | 15 DB + 1 browser journey passed 2026-11-24 |

Deferred (not run in this pass): full Playwright regression, the Round 1 chain (`npm run test:e2e:verdict` etc., whose specs were edited for the new qualification flow), load tests, a real LAN run, the three physical clue sets.

## Inject 2 (Kill Switch) completion and LAN dry-run readiness, 2026-11-25
Details: `ghost404-inject2-killswitch.md`. Corrected to the brief's wording: all ten Inspect texts, eight ticket texts and statuses, times with durations, paper lines, banner, attempt label, grey/green rows, BLOCKING only for real first-time blocks, authoritative recovery after a lost response, single [FAIL] line, free help/clear and "Terminal locked." precedence on the server. Unchanged: scoring (untouched-terminal 5 points still an owner decision), Injects 1/3/4, Round 1, qualification, Evidence Wall, design.
Dry-run smoke (disposable DB, real key, 15 steps) PASS; production-mode LAN-style probe PASS. Runbook corrected (button name, key installation, migrations, tie rule for synthetic teams). NOT tested on the real college LAN.
