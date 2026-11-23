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
