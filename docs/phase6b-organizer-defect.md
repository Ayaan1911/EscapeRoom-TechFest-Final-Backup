# Organizer exact-tie "detaching button" investigation (Phase 6B pre-flight)

## Symptom
In the long Round 2 browser journey the organizer test hung (3 min timeout) in the exact-tie acknowledgment loop: `element was detached from the DOM, retrying` on the "Acknowledge exact tie" button or on the dialog's confirm button. It first looked like a Playwright or dev-server timing problem and had been "worked around" with `dispatchEvent("click")`.

## Investigation (what was ruled out, with evidence)
- Auto-refresh: a 50 s observation with a MutationObserver (auto-refresh ON) recorded **no** removal of the tie region or its buttons.
- Dev-server compilation of other routes (another browser context hitting never-visited routes while the page was open): the button node was **not** replaced.
- React keys/conditional rendering: `ConfirmButton` is module-level and the `<li key={rank}>` is stable; node identity of the button stayed constant (sampled six times).
- Fast ordinary-click test on a seeded finished round passed, so the control itself worked.
- Event-level instrumentation in the failing journey showed the truth: iteration 1 worked perfectly (trusted pointer events, dialog opened, confirm clicked, dialog closed) and **then the loop ran a second iteration**.

## Root cause (a real UI defect plus a racy test loop)
1. **UI defect:** `act()` announced success *before* the state refresh finished (`setMsg(ok)` first, then `await load(true)`, and the three results/qualification/audit refreshes inside `load` were fire-and-forget). For about 250 ms the page showed "Exact tie ... acknowledged" **next to the old, still-enabled "Acknowledge exact tie" button**. A user could click it again (duplicate action, a confusing 409 error) and the control then vanished under the pointer when the refresh landed.
2. **Test defect:** the loop `while (count of ack buttons) { click; confirm }` evaluated `count()` in that stale window, started a second iteration, and Playwright then waited forever for a button that was about to be removed ("detached"). The earlier `dispatchEvent` workaround only hid the symptom.
(Also found: every `ConfirmButton` dialog used the same `id="r2a-t"`, duplicate ids that break `aria-labelledby`.)

## Fix
- `act()` now awaits the complete refresh (`Promise.allSettled` of all four reads) **before** showing success; errors still refresh.
- A `Pending` context disables every confirmation trigger while any organizer action (including its refresh) is in flight, so a control can neither be used twice nor used while stale.
- Dialog titles use `useId()` (unique ids).
- Tests: no `dispatchEvent`, `force` or `noWaitAfter` anywhere. The journey loop is driven by the server's unacknowledged-tie count and asserts that success is never shown next to a still-clickable acknowledge button. New `tests/organizer-ties.spec.ts` (ordinary clicks) covers auto-refresh left running (17 s idle plus a refresh tick while the dialog is open), cancel and re-open, a browser reload while the dialog is open (nothing recorded), a 1.5 s network delay on every organizer API call (in-flight "Working…" state, no early success), audit record, no winner control, publication gating, typed-word publish.

## Evidence
- The new regression assertion **fails on the old `admin.tsx`** (`Expected: 0, Received: 1` stale buttons) and passes on the fix; 3 consecutive fresh-database runs of the ordinary-click spec passed.
- No arbitrary winner can be selected: the only organizer control records the shared rank (append-only, one acknowledgment per tie group).
