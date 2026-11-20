# Phase 2 design direction — participant gameplay

Scope: the five Round 1 chapter workspaces and the investigation map. Organizer pages are unchanged.

## Research honesty

- **Not researched live.** No reference site was fetched during this phase. The direction below is drawn from patterns I already know from Linear (dense, quiet lists and status chips), Vercel Geist (type scale and mono for identifiers), IBM Carbon (data-table and status-indicator conventions, never colour-only), and SOC tooling in general (Defender, Elastic/Kibana Discover, Splunk search, GitHub security overview: a search bar over an event table, a side inspector, pinned evidence). Treat these as informed analogies, not citations.
- **Verified in this repo.** Existing tokens (`--bg`, `--surface`, `--line`, `--amber`, Geist Sans/Mono in `globals.css`) were reused so the redesign stays consistent with the landing and login pages.

## Theme and palette

- Dark, low-glare "incident room": near-black blue background (`#0b111a`), raised surfaces `#131e2a` / `#203042`, 1 px hairlines `#2e4157`. No glow, no gradients except a faint accent wash on the current location in the map.
- One **accent per chapter** (set with `data-chapter`): Inbox blue `#7fb2f0`, Trail teal `#6fd0c4`, Insider violet `#b9a4f0`, Containment orange `#f0a074`, Verdict amber `#e8b667`. The accent marks "where am I" and primary actions only.
- Semantic colours are separate from accents: green = earned/OK, amber = caution, red = alert/rejected. Every status also has a text label or icon glyph (✓ ✕ ●), so colour is never the only signal.

## Typography

- Geist Sans for prose and controls; Geist Mono for every identifier (record IDs, IPs, session IDs, hashes) so they can be compared character by character and can wrap safely (`overflow-wrap:anywhere`).
- Small caps-style eyebrow labels in mono for context ("ROUND 1 / SAVED INVESTIGATION RESULT"). Body 14–15 px, controls 14 px, line-height 1.5. No text below 12 px except non-essential eyebrow metadata.

## Layout and spacing

- 4 px base (`--s1…--s7`). Desktop: a 252 px **investigation map** rail plus a fluid work area; the work area is a *workbench* (evidence on one side, task panels on the other) rather than a stack of cards.
- Tablet: map collapses above the content; evidence and tasks stack.
- Phone (390 px): single column; only the first task panel is open by default, others are collapsible; evidence lists scroll inside bounded regions instead of lengthening the page.

## Navigation

- The map is the single navigation device. Each chapter shows status (Locked / Available / In progress / Complete), raw points, and a progress meter toward the next unlock (Inbox 8/15 → Trail, Trail 13/25 → Insider, Insider 13/25 → Containment, Containment 10/20 → Verdict).
- The current chapter is marked with `aria-current="page"`. Unlocked chapters are links (also reachable by URL, back/forward and keyboard); locked chapters are not links, and their URLs redirect to the dashboard.
- Unlocking is announced only when the **server** says so; the UI never claims completion or an unlock from a draft.

## Chapter patterns

| Chapter | Pattern |
| --- | --- |
| Inbox | Mailbox list, message viewer with a link/QR forensics tab, and a records rail; three tasks (entry, identity, impact). |
| Trail | Searchable, filterable authentication console with outcome badges (Allowed / Denied / Challenged), a selected-event inspector, a session path, and an evidence-pin tray. "Suspicious" is shown as an observation, never as proof of malice. |
| Insider | Sealed-gate card until both physical fragments are verified, then a suspect board plus a dossier explorer and evidence detail. The board lists people neutrally; nothing reveals the answer. |
| Containment | Incident-command layout: ordered timeline with explicit "Move up/down" controls, parallel-versus-ordered decision cards, a dependency flow of stages, evidence pins. |
| Final Verdict | A five-step causal chain (Entry → Session & impact → Insider → Evidence map → Verdict), evidence graph by role, compact hypothesis comparison, and a live report preview of the team's own drafts. |

## Evidence visualisation rules

1. Every visual is backed by a text equivalent (screen-reader list or label).
2. Relationships are drawn as ordered nodes with connectors *and* listed as text, so the diagram works by keyboard and without colour.
3. A pinned record is a team choice, not a verdict; pins are stored as drafts and only count once a task is submitted.
4. Identifiers are never truncated with an ellipsis that hides characters; they wrap.

## Reducing text overload

- Instructions live in one line under each task title; background reading is behind `<details>` ("Read the records", "Case file", "Hints", "Notes") and opens on demand.
- Task panels show points as a meter (earned/max) instead of explanatory sentences; the result strip says only "+N points" / "No new points" and the chapter's raw score.
- Hints and the Tamper Alert are folded away but their cost is shown on the button.

## Mobile behaviour

Single column, 16 px gutters, no horizontal page scroll (asserted at 1440/820/390 px in `tests/phase2-visual.spec.ts`), 44 px height on standard buttons (compact `k-btn-sm` controls are smaller and are a known limitation), collapsible task panels, bounded evidence regions.

## Accessibility requirements (implemented)

- Landmarks and headings per chapter; task panels are labelled regions; the map is a labelled navigation with `aria-current`.
- Draft status and score results use `role="status"` / `aria-live`; connection problems use `role="alert"`.
- Everything operable by keyboard; ordering uses buttons, not drag-only gestures.
- `prefers-reduced-motion` disables transitions and animation in the workspace.
- Focus is visible on all interactive elements; state is conveyed by text as well as colour.

## Remaining limitations

- Containment and Final Verdict remain long on a phone even with collapsible panels (tested heights are recorded in the Phase 2 report).
- Contrast was checked by inspection of the palette, not with an automated audit.
- The evidence "graph" is a staged list/diagram, not a free-form node canvas; that is intentional for keyboard and screen-reader use.
- No real-device (physical phone/screen reader) testing was performed; viewport emulation only.
