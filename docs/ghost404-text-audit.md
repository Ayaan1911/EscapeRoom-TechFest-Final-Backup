# Round 1 / Round 2 text-reduction audit (before vs after)

**Method.** A probe (Playwright, Demo Mode, 1440x900, reduced motion) opens each screen in its default state and counts **rendered** text (`innerText` of the live `main` element, so text inside closed disclosures and closed tabs is not counted; the demo bar is excluded), visible table rows, visible record items, and how many screens of scrolling the page needs. "Before" is commit `52d08fb` (end of pass 1) built in a separate worktree; "after" is the final branch head. Same probe, same data. Everything removed from the default view is one click away in a window, a disclosure or a tab; nothing was deleted.
(An earlier version of this probe counted text inside closed `<details>` and overstated some reductions, notably Verdict; the figures below replace it.)

| Screen | Words | Table rows | Records visible | Screens of scrolling |
|---|---|---|---|---|
| R1 Inbox | 490 -> 443 | 0 -> 0 | 6 -> 6 | 2.8 -> 2.9 |
| R1 Trail | **633 -> 367** | **25 -> 0** | 0 -> 0 | **4.8 -> 2.8** |
| R1 Insider | 670 -> 522 | 0 -> 6* | **26 -> 0** | 3.6 -> 3.4 |
| R1 Containment | 1185 -> 972 | 0 -> 0 | 0 -> 0 | 7.0 -> 6.8 |
| R1 Verdict | 295 -> 291 | 0 -> 0 | 0 -> 0 | 1.7 -> 1.7 |
| R2 Alert | 238 -> 238 | 7 -> 7 | 0 -> 0 | 1.6 -> 1.6 |
| R2 Kill Switch | 261 -> 292 | 10 -> 10 | 10 -> 10 | 1.3 -> 1.9 |
| R2 Audit the AI | 372 -> 310 | 0 -> 0 | 0 -> 10** | 1.5 -> 1.4 |
| R2 Three Calls | 323 -> 323 | 0 -> 0 | 0 -> 0 | 1.7 -> 1.7 |

\* the 6 rows are the Link board (one row per staff member: counts), not log records. \*\* the probe counts timeline entries in the new split screen; before, the same entries were in a list the probe's selectors did not match.
**Round 1 total on arrival: 3,273 -> 2,595 rendered words (-21 %).**

## What this shows, honestly
- **Real reductions**: Trail (the log wall: 25 visible event rows gone, 42 % fewer words, two fewer screens of scrolling), Insider (26 dossier records no longer on screen at arrival, 22 % fewer words), Containment (option paragraphs behind "Details", 18 % fewer words), Inbox (10 %).
- **No change**: Verdict (295 -> 291). The record grid was already only on the Evidence-map step, so the arrival screen is unchanged; the move to a window helps on that step only. Round 2 Alert and Three Calls were already short and are unchanged.
- **Still dense**: Containment is the densest screen (972 words, 6.8 screens): five task panels plus seven event cards.
- **Round 2** gained a visual: the Kill Switch map adds about a screen of scrolling and 31 words.
- The text was not rewritten line by line this pass: puzzle facts, evidence IDs and answers are unchanged, and briefing sentences were already one line each. The measured gain comes from progressive disclosure.

## Initial-screen text, per chapter (what a player now meets first)
| Chapter | Before (on arrival) | After (on arrival) | Moved to deeper evidence | Preserved |
|---|---|---|---|---|
| Inbox | mailbox + reader + a right rail of 6+ records, each with facts | mailbox + reader; QR snapshot link under the list | records rail -> **Evidence explorer** window; new **Mail compare** and **Link inspector** (plain values) | all emails, headers, attachments, records, pins, scoring |
| Trail | timeline + 6 filters + a 25-row table + inspector + a records section | timeline + filters (now incl. time range) + counts | table -> **Event console**; inspector -> **Event inspector** (opens when you pick an event); records -> **Case records** | all 144 events, CSV, session path, pins |
| Insider | staff cards + filters + timeline + record list + record viewer | staff cards + **Link board** + filters + timeline | list + viewer -> **Dossier explorer** | all 26 records, pins, fragment unlock |
| Containment | badges + 5 long task panels (each option with a full paragraph) | badges + **Systems map** + task panels (option titles only) | option paragraphs -> per-option **Details** | every option text, ordering and scoring |
| Verdict | collapsible case file + chain stepper; on the Evidence-map step a grid of ~25 record cards | same arrival screen; the Evidence-map step shows the role map and an "Open evidence board" button | case file -> **Case file** window; record grid -> **Evidence board** window | all records, roles, hypotheses, scoring |

## Landing page
Hero body: "NEXUS Corp has been breached. A figure calling themselves GHOST_404 claims responsibility, but the trail does not add up. Assemble your three-person response team and work one case across five linked investigations." -> "NEXUS Corp has been breached. GHOST_404 claims it, but the trail does not add up. Three people, five linked investigations, one case." The long chapter descriptions and the six-rule list are now behind disclosures ("What you will do", "All Round 1 rules") with a one-line rule summary visible.

## Not done
No line-by-line copy rewrite of chapter briefings; Containment remains text-heavy; no player playtest was run to confirm the reading-time effect (the numbers above are measurements of what is on screen, not of enjoyment).
