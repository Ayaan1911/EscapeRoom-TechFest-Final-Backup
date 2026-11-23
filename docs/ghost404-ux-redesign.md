# GHOST//OS UX redesign: what changed, per screen

Design goal from player feedback: *too much text, too many logs, weak visuals, not interactive enough.* The rule applied everywhere: **raw material stays reachable but is no longer the default view.** Every tool below works on the case's real data; none shows a verdict.

## The shell (all screens)
- **System bar** (every page): GHOST//OS chip, current application, secure-session indicator, page actions.
- **Dock + windows** (Round 1 chapters): each chapter registers its evidence tools as windows. Click a dock button to open; click again to minimize; restore from the dock; drag by the title bar, resize by the corner grip; arrow keys move a focused window, Shift+arrows resize, Escape closes. Windows are clamped to the viewport (below the bar, above the dock) so they cannot be lost. "Reset" closes all. Layout (geometry and open flags only) is restored after a refresh. On phones and tablets each window is a full-width sheet with the same controls.
- Motion: boot reveal (CSS, ~1.4 s, never blocks input), window open, dock hover, path pulse, landing backdrop. Everything is off under `prefers-reduced-motion`.

## Landing / login / dashboard / organizer
| Screen | Change |
|---|---|
| Landing | Atmospheric network backdrop (decorative); one-sentence mission; chapter descriptions and the rules behind "What you will do" / "All Round 1 rules" disclosures instead of two text sections |
| Login | Window chrome; "Authenticating…" pending state; identical failure text for unknown teams and wrong codes (tested) |
| Dashboard | **Mission path** strip (complete / current / open / locked with scores) above the chapter cards; "Next action" card unchanged |
| Organizer | **Event pipeline** (Round 1 -> qualification -> Round 2) with real state at the top of the control center; the existing sections and confirmations are unchanged |

## Round 1 chapters
| Chapter | Default view now | Tools (dock) | Not changed |
|---|---|---|---|
| 1 Inbox | Mailbox + reader (auth dots, headers/attachments tabs); QR snapshot link | **Evidence explorer** (records, pins), **Mail compare** (any two messages side by side: name, address, domain, headers; no verdicts), **Link inspector** (scheme/host/path/query of every link; never fetched) | Tasks, scoring |
| 2 Trail | Activity timeline + filters (user, IP, outcome, type, session, **time range**) | **Event console** (the 144 raw rows, paging, CSV), **Event inspector** (opens when you pick a marker or row), **Case records** | Tasks, scoring, CSV |
| 3 Insider | Evidence Wall (staff cards) + **Link board** (who appears in which record type; cells open the dossier filtered) + timeline | **Dossier explorer** (record list + viewer) | Fragment unlock, tasks |
| 4 Containment | **Systems map**: the systems the case names (mail gateway, device, identity provider, export service, evidence store, incident lead, admin console, support jobs) with the case path; each node lists "from the case record" and "in your plan" | none (the map is on the desk) | Option wording now behind "Details"; ordering/choice tasks and scoring |
| 5 Verdict | Chain stepper + report preview | **Evidence board** (records, search, chapter filter, role assignment), **Case file** | Scoring, completion screen |

The Containment map deliberately does not grade: node states are the literal wording of what the team selected, so it cannot be used as an oracle around the attempt limits (browser test asserts no verdict language).

## Round 2 (paper) chapters
| Chapter | Now |
|---|---|
| 1 Alert | Unchanged: alert card, tabbed evidence, chat with Ravi, options |
| 2 Kill Switch | **Connection map** (hub-and-spoke of the ten connections; node size = data sent, line weight = active time; nothing is coloured by suspicion) sharing one selection with the table and inspector |
| 3 Audit the AI | **Split screen**: SENTINEL-AI's claims on the left, searchable Night timeline / Case file extracts on the right; "I have checked this claim" ticks are a local reminder (nothing stored or sent) |
| 4 Three Calls | Unchanged: situation board, three calls, six statements |
| All | Standing "write on paper" reminder; Round 2 hand-off transition on the waiting screen only, so it can never cost investigation time |

## Accessibility and layout
Automated: axe (WCAG A/AA) on landing, login, dashboard and Round 2 chapters at 375/768/1366; window manager keyboard tests; layout journey on **18 routes x 6 viewports** (1920x1080, 1440x900, 1366x768, 1280x720, tablet, phone) for overflow, console errors, failed requests and system-bar stacking. Not done: manual screen-reader and keyboard-only pass by a person.
