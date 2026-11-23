# GHOST//OS UX redesign: what changed and what did not

This documents the state of the unified branch honestly. The product was already a polished cyan/charcoal investigation workstation (earlier "hybrid redesign" work, inherited). This branch adds the shared GHOST//OS shell on top and fixes defects found on the way. It does **not** contain a complete rewrite of every chapter.

## Added in this branch
| Screen | Change |
|---|---|
| Every page | One **system bar** (`GHOST//OS` chip, current application name, secure-session indicator, page actions). It replaces the desktop left rail and 14 separate headers, so the product reads as one system and content gets the full width. Sticky, 56 px, glass effect only where the browser supports it. |
| Landing | Case-file panel is now a window with title bar (`case-404.ghost`); ~1.4 s CSS-only boot reveal ("GHOST//OS secure forensic shell"). The reveal never intercepts clicks and is removed for reduced-motion users and print. |
| Login | "Secure access" window chrome; the Sign in button shows `Authenticating…` while the server verifies the code; failure text is identical for unknown teams and wrong codes. |
| Round 2 player | Standing reminder under every chapter title: write every answer on the paper sheet, nothing is typed here. |
| Fonts | Bundled locally (`geist`, SIL OFL). Previously fetched from Google at build time, which would break an offline build. |
| Focus/buttons | One focus ring and one pressed/hover transition across the system; all motion off under `prefers-reduced-motion`. |

## Inherited and verified working (not rewritten this session)
How the player feedback ("too much text, tedious logs, weak visuals, not interactive") was already addressed by earlier work, which this branch re-tested:
- **Inbox**: mailbox list with authentication dots, selected-message reader with Message / Headers / Attachments tabs, evidence records grouped (delivery trail, identity logs, data exports) with pin stars, QR snapshot opened on demand, answer chain tray.
- **Trail**: 144 events behind a timeline strip, filters (user, IP, outcome, event type, session), event inspector, "session path", pinning, CSV; the raw table remains available. No event is pre-labelled as the attacker (outcome only: allowed/denied/challenged).
- **Insider / Containment / Verdict**: evidence wall and suspect profiles, response stage rail, case reconstruction with counter-evidence.
- Tasks are scored one at a time, drafts are saved, hints cost points, the next chapter unlocks at 50 %.

## Known design gaps (not done)
- No per-chapter **copy audit/rewrite**. Briefings were not shortened further this session; puzzle facts, IDs and answers are unchanged.
- No draggable/resizable **window manager**; no sound.
- Kill Switch is a sortable table with sparklines and an inspector, not a topology map. The Three Calls shows context tiles, not animated consequences.
- Organizer pages only gained the shared system bar.
- No new cinematic Round 1 -> Round 2 transition.

## Accessibility and layout checks
Automated axe scans (WCAG 2 A/AA): landing, login and dashboard at 1366 px; all four Round 2 chapters at 375, 768 and 1366 px. All pass. The system bar is checked to sit above content with no horizontal scroll at 1366, 1920 and 390 px (dashboard). I personally reviewed screenshots of the dashboard (desktop), login (desktop and phone) and the Inbox chapter (desktop) after the shell change; the other chapters were not re-reviewed visually after it. Keyboard use and screen readers were not manually tested beyond axe.
