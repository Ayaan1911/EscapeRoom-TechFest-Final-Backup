# GHOST_404 hybrid UI: final audit (branch `feat/ghost404-hybrid-ui-redesign`)

Evidence: `scripts/final-shots.mjs <label>` builds a disposable local database with a team for every state, starts a local dev server, and for each screen at 375 / 768 / 1366 px (1920 for the projector) saves a full-page screenshot, measures horizontal overflow, console errors, and runs axe-core (WCAG 2 A/AA). Output: `D:\Ghost404-TestWorkspace\shots\<label>\`.

| Screen | Status (verified in a browser) | Notes |
|---|---|---|
| Login, Round 1 waiting | complete, no axe findings | |
| Dashboard `/play` | complete | map, ring, next action |
| Inbox | improved: auth dots in list, records grouped (Delivery trail / Identity logs / Data exports), no clipped rail, wrapping tabs, smaller subject heading; relationship chain shows only the team's own picks | the three-pane layout already existed |
| Trail | interactive timeline (lanes by event type, outcome markers, session line, pinned ring, table fallback) | axe contrast fixed (alert badge) |
| Insider | active dossier verified with a seeded unlocked team: timeline by record type, pinned line, suspect highlight | sealed state also captured |
| Containment | stage rail; duplicate text chain removed | long event cards unchanged |
| Verdict | case-reconstruction chain of the team's own picks, evidence-category bar, completed-case presentation (already existed) | chain hidden when the server shows the case closed |
| Round 2 Part A / B / finished | existing command centre kept; Part B cyan identity, urgent timer | no new layouts (see limits) |
| Organizer, qualification, projector | unchanged logic; axe fixes (scroll regions focusable, projector `role=img`) | |

## Accessibility fixes from the axe run
`definition-list` (timer `role` on `dd`) on every chapter; `scrollable-region-focusable` (tables, dossier list, evidence list, chain, Round 2 map); `color-contrast` (alert badge on selected row); `aria-prohibited-attr` (projector progress dots).

## Known limits (current)
- Round 2: Part A/B keep their existing per-incident visuals (connection map, dependency chain, hypothesis matrix, intel board, brief preview); this sprint added the whole-round timeline and the tribunal record comparison only.
- Copy reduction is a modest pass (see the before/after table), not a rewrite; rules, attempt notes and clues were kept.
- Phone: the six Evidence Wall profile cards are tall; the chapter map is sticky only in the page flow.
- No 20-team concurrency claim.

## Sprint 3 additions (2026-11-22)
- **Round 2 whole-round timeline** (`src/components/round2/briefing.tsx`, `RoundTimeline`): the 50-minute round on one bar with the four incident releases (I1-I4) and Part B at minute 25, a "now" marker, each node's state (not released with countdown / available / partially scored / completed / closed, with earned/max) and the next scheduled event. Read-only; every value comes from the existing server clock and status. Countdowns render only after hydration (a hydration mismatch found and fixed during verification).
- **Digital Tribunal "Compare two records"** (`ComparePanel`, Part B only): pick any two records already released to the team; shows them side by side with source, time and detail, and states only facts (same/different source, time gap). It never says which record is right.
- **Console errors classified**: `404 GET /api/round2/results` on the finished screen is the intentional "results not published yet" response, handled by the UI ("private until the organizers publish"). `409 GET /api/round2/admin?view=qualification` appears only with the seeded fixture that has finalists but no confirmed Round 1 qualification snapshot; the organizer page shows the server's message in an alert. No missing asset or route. No hydration warnings remain (run with `HYD=1`).
- **Urgent timer**: removed the opacity pulse (axe measured a transient contrast failure mid-animation); the red colour and the "closing soon" text remain.
- **Organizer exact-ties "baseline failure" explained**: the spec needs `GHOST_P5_SEED=1` as well as `GHOST_P5_FINISHED=1`; earlier runs omitted it, so the fixture never seeded ties. With both set it passes.
- Containment event cards use two columns at 1100 px and above; Trail/Insider timeline lane labels are wider on phones.

## Copy review (before and after, meaning preserved)
| Where | Before | After |
|---|---|---|
| Every Round 1 and Round 2 task list | "Submit each one when ready. Points are saved per task." | "Scored one by one" |
| Insider Evidence Wall | "Staff profiles. Selecting one only filters records; it is not a verdict." | "Selecting a profile only filters records. It is not a verdict." |
| Round 2 waiting room | "The round starts when an organizer starts it. This page updates by itself: no refresh needed, and your clock is the server's." | "Starts when an organizer starts it. This page updates itself; the clock is the server's." |
| Round 2 finished | "All submissions are closed. You can still review every released record and your answers below." | "Submissions are closed. Released records and your answers stay readable." |
| Containment | duplicate "Response stages" text chain plus rail | rail only |
Not shortened (rules and clues): attempt/best-score notes, cooldown text, hints cost, scenario and evidence text, task prompts (server content). This is a modest copy pass, not a full rewrite.

## Verification run (disposable local database)
`tsc`, `eslint .`, `npm run build` clean. Vitest 417 passed / 1 skipped. Round 1 chain 10+7+6+1+6+1+5+2 = 38 passed; journey 1; unlock/continue 3; Round 2 + organizer + visual 23 passed (41 skipped by design); Phase 2 19 passed; best-v1 attempt caps 3; organizer ties 1 (with `GHOST_P5_SEED=1`). Full-state harness (`HYD=1 node scripts/final-shots.mjs v4`): all 21 states at 375/768/1366 px: no horizontal overflow, axe WCAG2 A/AA none on every screen, no hydration warnings.

## Sprint 4: visual system v2 and Organizer Demo Mode (2026-11-22)
- **Organizer Demo Mode**: see `docs/demo-mode.md`. `tests/demo-mode.spec.ts` (3 tests): access control, full walkthrough with zero `/api` requests and byte-identical competition tables, normal play unaffected.
- **Visual system v2** (`src/app/ghost.css`, loaded last): midnight-blue palette (`#071521` / `#102638` / `#173448`), cyan for actions and evidence, mint for verified, amber for mission branding only, coral for urgency; layered panels with hairline highlights; desktop command rail replacing the top bar (brand mark + log out); dashboard rebuilt as mission operations (hero with clock and score ring, vertical case path with chapter glyphs, sticky side panel with next action and mission brief); chapter header banner with per-chapter glyph and accent; console captions on Inbox/Trail/Insider; coral real "Start round" button so it is never confused with the cyan demo button; restyled login aside, Round 2 mission bar and docket, organizer command center, projector.
- **Regression found by the test run and fixed**: the rail's log-out button sat where the Next dev-overlay badge floats, so Playwright clicks were intercepted (5 Round 1 tests failed in dev mode); the button now sits under the brand mark. Another failure was a demo spec that clicked an already-open Compare panel shut; the spec was corrected (the panel is open by default in Part B).
- **Axe**: found `.r2-sev` contrast (coral badge, white text) and a scrollable `.r2-rail`; fixed (dark text, `tabIndex`).

### Results
`tsc` and `eslint .` clean; `npm run build` passes; Vitest 417 passed / 1 skipped; Round 1 chain 38 passed; journey 1; unlock + projector + demo specs 8 passed; Round 2 + organizer + visual 23 passed; Phase 2 19 passed; best-v1 attempt caps 3; organizer ties 1 (with `GHOST_P5_SEED=1`).

### Not done (be exact)
- Per-chapter interiors keep their earlier layouts apart from the new frame/captions: Containment has no new decision-flow workspace, Verdict has no new competing-explanation comparison surface, Part A/B have no additional layouts beyond the timeline and compare panel.
- Copy reduction remains the small pass listed above plus a shorter dashboard; no full rewrite.
- No before/after screenshot pair was captured; old screenshots exist in `D:\Ghost404-TestWorkspace\shots\base` (previous release) and new ones in `shots\v5`.
- Demo mode has no persisted state and no locked/partial/complete switcher beyond an illustrative strip.
