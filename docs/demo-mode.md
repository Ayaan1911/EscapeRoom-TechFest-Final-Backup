# Organizer Demo Mode

A safe, organizer-only preview of the whole game: every Round 1 chapter and all eight Round 2 units, with no timers, no real scores and no competition writes. Use it to show the game without starting anything.

## Entry and access
- Sign in at `/organizer/login`, then press **ENTER DEMO MODE** on `/admin` (or open `/admin/demo`).
- Every demo page checks the organizer session on every request and redirects everyone else (anonymous browsers and team sessions) to `/organizer/login`. Pages are `force-dynamic`, `noindex`, `nocache`.
- Routes: `/admin/demo` (home), `/admin/demo/round1` (mission dashboard), `/admin/demo/round1/{inbox,trail,insider,containment,verdict}` (optional `?v=A|B` team variant), `/admin/demo/round2?unit=A1..A4|B1..B4`.

## What you can do
- **Round 1**: all five chapters are open (no unlock needed, Insider dossier already open). The real participant desks are used: select emails, inspect headers and attachments, click timeline markers, pin evidence, filter suspects, order containment events, link verdict evidence. Task submit buttons work and answer with `Demo input recorded. Demo only: nothing was scored, saved or counted.`
- **Round 2**: all eight units (Incidents 1-4, Challenges 1-4) released and open, with the real evidence, forms, record comparison and relationship visuals. No clock, no enrollment, no qualification.
- **Toolbar** (always visible, in normal page flow so it covers nothing): Demo home, Round 1, Round 2, Prev, Next, Jump to, Reset demo, Exit demo, and the banner `DEMO MODE - NO TIMERS - NO REAL SCORES`.
- **Reset demo** reloads the page. Preview state exists only in this tab's memory, so a reload (or refresh) clears exactly that. Nothing is persisted, so there is nothing else to reset.

## How production state is protected
1. **No demo write path exists.** There is no demo API route. Demo pages are server components that build the same participant-visible evidence the real pages use (`inboxEvidence`, `trailEvidence`, `insiderDossier`, `containmentEvidence`, `verdictEvidence`, Round 2 `units`) and a plain in-memory state object. `src/lib/demo/demo.server.ts` imports no database client.
2. **A `DemoProvider` switches the real components to local simulation**: `useChapter` (no polling, no `/api/game` calls, simulated submit/hint), `useDrafts` (no draft saves or sync), Round 2 `useRound2` (no polling or fetching), the Round 2 draft store and task card (no `PUT`/`POST`). Real player components are unchanged when no provider is present.
3. Player routes and APIs are untouched: no authorization is relaxed, no timestamps are edited, nothing is unlocked in the database.
4. Answer keys never reach the browser: only participant-visible evidence and form definitions are sent (Round 2 task `answer` fields are dropped exactly as in the real bundle).

## Verified by `tests/demo-mode.spec.ts` (disposable local database, Round 1 and Round 2 never started)
`node scripts/redesign-e2e.mjs tests/demo-mode.spec.ts`
- anonymous and team sessions are redirected from every demo route; real routes still work for teams;
- organizer walkthrough of home, Round 1 dashboard, all five chapters (with interactions and simulated submits), all eight Round 2 units, Reset, navigation, Exit;
- **zero requests to `/api/*`** during the whole walkthrough;
- a **content hash of every competition table** (teams, game and Round 2 sessions, submissions, task scores, drafts, audit, finalists, Round 2 submissions/scores/drafts/audit/tie acknowledgments; login sessions and throttle excluded) is byte-identical before and after.
- refresh behaviour: a reload clears preview edits by design.

## Not in demo mode
- No simulated "locked/partial/complete" state switcher beyond the illustrative strip on the Round 1 mission dashboard.
- Demo submissions never say whether an answer is right.
