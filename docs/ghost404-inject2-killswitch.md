# Round 2 · Inject 2 · Kill Switch (completion and fidelity pass)

Scope: Inject 2 only. Injects 1, 3 and 4, Round 1, qualification, the Evidence Wall, the GHOST//OS design and the 60-minute format are untouched.

## Source of truth and its limit
The case document "Round 2 Part A: Inject 2 - Kill Switch.docx" is **not present on the development machine**, so no comparison against the DOCX itself was possible. Exact content was checked against the owner's written brief for that document (reproduced in the task), which the tests pin. Compare once against the DOCX before printing anything.

## Audit (before this pass)
| Area | State | Action |
|---|---|---|
| Ten connections: IPs, processes, countries, volumes | correct | kept |
| Times | en dashes, no durations, "All night" | exact: "02:00 to 02:41 (41 min)", "all night", ... |
| Ten Inspect descriptions | paraphrased (e.g. "throughout the night", "File-server sync service") | exact wording |
| Eight IT tickets | split into bullets, reworded; "Tonight at 02:31"; "Installed; sign-off pending" | the document's single description per ticket; "Tonight 02:31"; "Installed, sign-off pending" |
| Ticket footer, snapshot 02:50 | correct | kept |
| Paper reminder | near-match | exact three lines |
| Opening banner | "BLOCK IP_ADDRESS" | "Type BLOCK <ip address> to cut a connection." |
| Attempt counter | "4 / 4" | "ATTEMPTS LEFT: 4/4" in the terminal's upper right; green at 4 and 3, amber at 2, red at 1 |
| "BLOCKING..." | shown for any `BLOCK x` | only for a monitored IP not blocked before (about 1 s, presentation only) |
| Row colour after a block | red for a legitimate service | green for a contained threat, **grey** for a legitimate service |
| Lost response | "Nothing was recorded; try again" | asks the server what it recorded; never retyped blindly |
| Exhaustion | extra line from the superseded preliminary prompt | only "[FAIL] Out of attempts. Terminal locked. See a volunteer." |
| help / clear | client only | also free on the server |
| Locked terminal | a typo returned its parse message | any command returns "Terminal locked." |
| Parser, four-attempt budget, transaction, unique (team, session, seq), 6 per 10 s rate limit, fail-closed key | correct | kept |
| Scoring, organizer review, projector, volunteer slips | correct | kept |

## Files
`src/lib/round2/paper/killswitch-text.ts` (new, client-safe wording shared by server and UI), `content-v2.server.ts` (Inject 2 block only), `types.ts` (`Ticket`), `terminal.server.ts`, `src/components/round2/paper/kill-switch.tsx`, `src/app/killswitch.css`.

## Rules implemented (server is the only authority)
- One valid BLOCK = one attempt, right or wrong; maximum four. Free: unknown command, missing/invalid IP, IP not on the list, too many arguments, duplicate, help, clear, any command on a locked terminal.
- Both attackers contained locks at once ("[OK] Both threats contained. Terminal locked."). Four attempts without containing both lock with the [FAIL] line. Both persist (database), across refresh, tabs and re-login.
- The eight angry messages and the classification live only in the private key; a message reaches the browser only after that team blocks that connection. No flags in the table, Inspect, tickets or bundles.
- Simulated only: no shell, process or firewall call exists (tested).
- Score (unchanged): +5 per attacker contained, +5 if no legitimate connection was blocked, -2 per legitimate block, clamped 0-15; computed from stored attempts; the jury sheet cannot overwrite it.

## Volunteer procedure
After OUT OF ATTEMPTS the team calls a volunteer, who hands over the printed correct-IP slip from `/admin/round2/print/slips` (organizer sign-in only; not reachable by teams, tested). Revealed IPs earn no terminal points; no extra attempts exist and there is no reset.

## Private key
`private/round2-key-v2.json` under the server's working directory (or `GHOST_R2_KEY_FILE`); re-read at most every 30 s, so installing it needs no restart. Missing or invalid: terminal offline, no attempt consumed, nothing disclosed. The eight message strings are verified by one combined hash in `tests/killswitch-fidelity.test.ts`, never reproduced in the repository. During this pass one message in the local key used a straight apostrophe where the brief has a curly one; that single character was corrected in the local, git-ignored file. **The copy in the private config repository still has the old character** and must be updated the same way before it is used.

## Owner decision still open
Under the literal formula a team that never blocks anything scores 5 (the "no legitimate block" bonus). Implemented as written, labelled "no attempts" in the organizer review, **not changed**.

## Tests (2026-11-25)
Passed: `killswitch-fidelity` (public wording incl. banner, every parser message, ten rows, ten inspects, eight tickets, paper lines, consistency with Injects 1/3/4, no shell calls, score table; private-key checks ran because the key is installed on this machine), `open60` and `open60-db` (15: free commands, wrong/duplicate/correct, early success, exhaustion, help/clear and the lock rule, 96-request concurrency, isolation, rate limit, organizer review, pens down, fail-closed key), `paper-isolation`, `marking-db`; browser: `phase5-open60` (6) and the LAN dry-run (below).
Deferred: full Playwright regression, Round 1 chain specs, load tests.
