# Round 1 visual and information audit (Obsidian Signal rebuild)

Measured with `scripts/text-audit.mjs` against the running app in Demo Mode (live `main.innerText`, closed disclosures excluded; Demo Mode adds a ~120 px toolbar, so real play starts the workspace ~100 px higher). "Before" is the pass-2 audit in `docs/ghost404-text-audit.md` (1440x900, same method). Screenshots: `D:\Ghost404-TestWorkspace\shots\` (`base-1440` original, `c1`/`c2` previous pass, `o1`-`o7` this pass, `fin-<size>` final at 1920x1080, 1366x768 via `o*`, 1280x720, 768x1024, 390x844).

| Chapter | Words (before -> now) | Screens of scrolling at 1440x900 (before -> now) | Workspace top at 1366x768 (page y) | What changed |
|---|---|---|---|---|
| Inbox | 443 -> 427 | 2.9 -> 1.64 | 290 (play), was ~488 | compact HUD; mail client fills the viewport with its own scroll panes; the three scored tasks are a docked Findings column instead of a section below |
| Trail | 367 -> 351 | 2.8 -> 1.64 | 388 incl. unlock notice | filter toolbar first, activity timeline under it, tasks docked; unlock notice is one compact bar |
| Insider | 522 -> 439 | 3.4 -> 1.99 | ~230 | staff chips + a relationship graph (staff x record type, drawn from the case's own counts) replace the card wall and table; table stays as "Table view"; tasks docked |
| Containment | 972 -> 620 | 6.8 -> 1.97 | 413 | command center: systems map + inspector left, phase navigator and ONE active response phase right; security-room snapshot is a collapsible panel; page was ~3,900 px, now ~1,640 px at 1366x768 |
| Final Verdict | 291 -> 306 | 1.7 -> 1.6 | 391 | case-reconstruction board (the team's own picks, never graded), decision slots instead of plain cards; text is essentially unchanged |

Round 1 arrival text total: 2,595 -> 2,143 words (-17 %); every chapter still holds all its evidence (nothing deleted: moved behind windows, disclosures, phase tabs or the Table view).

## Honest limits
- Verdict and Trail kept their task logic and mostly their wording; Verdict's reasoning step is still select-based (restyled as decision slots, not a different mechanic).
- Demo Mode inflates scroll height slightly; real-team figures from `scripts/probe-layout.mjs` (1366x768): Inbox 1,274 px, Trail 1,432 px (page heights, was 2,545 / 2,705).
- No player playtest was run; these are measurements of what is on screen.
