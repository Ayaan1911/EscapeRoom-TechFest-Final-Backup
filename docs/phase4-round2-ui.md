# Phase 4: Round 2 participant and organizer UI

Branch `feat/phase4-round2-ui` (from Phase 3 HEAD `d518c42`). Implemented and statically checked; **browser and database behaviour is NOT verified** (see the end).

## Routes
| Route | Who | Behaviour |
|---|---|---|
| `/round2` | team session | Server-side gate (`finalistAccess`): anonymous → `/login?next=/round2`; non-finalist, standby, withdrawn → access/standby message with **no** content; active finalist → command center. The initial HTML contains only status (clock, scores, task titles). |
| `/admin/round2` | organizer session | Control room (qualification, enrollment/promotion, readiness, live control, scores, audit, results, publication, solutions on demand). |
| `/login` | unchanged except `/round2` was added to the `next` allow-list (the only Round 1 edit besides one link on `/admin`). |

Phases inside `/round2`: waiting room (not started) → command center with Part A / Part B → finished panel (own score; the published ranking only after organizer publication, 404 otherwise).

## Component architecture (`src/components/round2/`)
`shell.tsx` (command center: top bar, nav with 6 states, schedule, notes, banners) · `unit-view.tsx` (per-unit layout + specialised visuals) · `task-card.tsx` (score header, form, submit, draft status, conflict resolution) · `fields.tsx` (typed controls: single, multi, classification grid, ordering with ↑/↓ buttons + optional drag, keyed evidence, text) · `visuals.tsx` (network map, AI-report panel, forensic lanes, hypothesis matrix, intel board, report preview, dependency chain) · `evidence.tsx` (search/filter browser) · `states.tsx` (restricted, waiting room, finished/results) · `use-round2.ts` (status + released bundle + clock) · `use-draft-store.tsx` (drafts) · `api.ts`, `types.ts` · `admin.tsx` (organizer). Pure, unit-tested logic lives in `src/lib/round2/form-types.ts` and `client-clock.ts`. No new dependencies; the network map is plain SVG.

## Form schemas
Backend change (narrow, additive): `r2Bundle` now sends per task `{id, prompt, max, availability, fields}`; `fields` come from `src/lib/round2/forms.server.ts`, derived from the existing option lists. A field is `{kind: single|multi|order|text|keyed, path, label, options, min, max, ref, optional}`; `path` says where the value lives in the answer object. The answer is built **only** from declared fields (`buildAnswer`), so strict server schemas never receive extra keys. The free-text `lists` and `answer` strings were dropped from the bundle. No grading rule, key or schema changed. A test proves that for all 26 tasks the form rebuilds the exact perfect answer, which the server schemas score at the task maximum. Metadata never says which option is right.

## Drafts
One store (`DraftProvider`) for all tasks (the network map edits the same drafts as the task forms). Debounced (900 ms) `PUT /api/round2/drafts` per task with `baseVersion`; status text is derived from server confirmations only ("Draft saved" appears after a 200). Restored after refresh or re-login from `GET` (initial drafts are loaded server-side for the page). A 409 never overwrites: the task shows both choices (use teammate's copy / keep mine, which explicitly re-saves on top). Offline/error keeps edits in memory and retries on the next change or flush. Over-8 KB drafts are refused locally. Flush runs before switching incidents and before submitting; `beforeunload` warns on unsaved work. Ordering is a draft value only once the participant sets it (the shuffled starting pile is not an answer). Drafts award nothing; locked after phase close.

## Clock and releases
The server clock is authoritative. `useRound2` measures an offset from `serverNow` (request midpoint), shows `now()` as an estimate, re-asks the server just after each scheduled boundary (`nextEvent`), every 20 s while visible, on `online` and on tab focus. All of that is GET. Evidence is fetched only for units the server has released, and refetched when the released set or phase changes. The local clock can only **disable** controls early (`effectiveAvailability`); enabling always requires the server's `availability`, and the server re-checks every submission. Releases are announced in a live region without moving the participant.

## Submission feedback
Maps duplicate, +points, no new points, 400, 401, 403 (not released / closed), 409, 429 (`retryAfter` countdown or attempt cap), network loss (honest "could not confirm; resending is safe") and 5xx. Scores update from the server response only. No criterion ids or explanations are ever shown.

## Organizer UI
Every mutation (`enroll`, `promote`, `start`, `end`, `publish`) is a POST from one `act()` helper behind a confirmation dialog; end and publish require typing a word; publish states it is irreversible. Loading and the optional 15 s auto-refresh are read-only GETs. Real server errors are shown, nothing is simulated. CSV export is a GET link. Ties are flagged and no winner is implied.

## Security boundaries
Client code imports no `.server` module (static test). Evidence text is rendered only as React text (no `dangerouslySetInnerHTML`, static test). Team id never comes from the client; all routes are the Phase 3 authenticated routes. Organizer explanations are only in the organizer view (on demand). No localStorage is used for scores or answers. Results are hidden until published; publication is explicit.

## Responsive and accessible
Phone: sticky horizontal incident navigator, single-column units, evidence panels collapse (`<details>`), full-width submit. Keyboard: native controls, labeled ↑/↓ reordering, focus-visible outlines. Status via `role=status/alert`, timer `role=timer`. Statuses use text plus symbols, not color alone. The network map is `aria-hidden` and has a complete table with the same controls as its accessible alternative. Reduced-motion respected (no persistent animation).

## Known limitations
Layouts were never viewed in a browser (no screenshots). Drag-and-drop is a convenience only. Teammates editing the same task concurrently are handled by conflict choice, not live merge. `/admin/round2` "Start" is disabled until readiness reports ready (a spec step must enroll first). Part B1 shows source clocks but intentionally not normalized times. Single case for all teams (Phase 3 limit).

## Verification status
Executed: `tsc --noEmit` clean; eslint on all new/changed source and tests clean; vitest `round2.test.ts` (25), `round2-ui.test.ts` (form/schema round-trip for all 26 tasks, no key leakage, clock helpers, outcome mapping, adapters), `round2-render.test.ts` (server-render of all 8 units with fixtures: inputs, submit buttons, map table, AI panel, closed state, keyboard controls, restricted/waiting states): **54 tests passed**. Static migration check: `prisma migrate diff` between the Phase 2 schema and the current schema equals the committed migration (15 statements, none touch Round 1 tables destructively); **no database was used**.
**Not executed:** database suite `tests/round2-db.test.ts`, browser spec `tests/phase4-round2.spec.ts` (run with `GHOST_PHASE4=1` on a disposable DB), production build, visual/responsive review, real-browser autosave/conflict flows, organizer flows against a database.
