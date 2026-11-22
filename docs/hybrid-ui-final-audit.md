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

## Known limits (not done)
- No new Round 2 evidence-comparison or incident-timeline components: the existing layouts (connection map, brief preview, evidence browser, incident navigator) were inspected and left as they are.
- Copy reduction is limited to the repeated "Tasks" sub-heading and removing the duplicate Containment chain; task rules (attempts, best score), clues and evidence text are untouched.
- No 20-team concurrency claim.
