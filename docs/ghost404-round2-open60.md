# Round 2 · GHOST RETURNS (the only format)

**Decision (owner):** one Round 2, four open injects, 60 minutes, four terminal attempts, 60 total points. The earlier 40-minute sequential format is retired.
Sources: "Round 2 Part A: Injects 1, 3 and 4 and Inject 2 prompt" and "Round 2 Part A: Inject 2 – Kill Switch" (8 pages). Answers are **not** in this repository (it is public); they live in the git-ignored `private/round2-key-v2.json`.

## Format
* One organizer-started, server-authoritative 60-minute clock. The organizer presses **Start Round 2**; there is no format choice anywhere (UI or API: a `format` field is rejected with 400).
* All four injects are readable from the start until pens down; teams move between them freely. Suggested pacing (not enforced): Inject 1 10 min, Inject 2 12, Inject 3 25, Inject 4 10, buffer 3.
* At 60:00 (or an organizer early end with a reason): injects close, the Kill Switch terminal locks, PENS DOWN shows; history and scores are kept.
* Only Inject 2 takes typed commands. Everything else is written on paper. No external AI assistance. No Part B is launched.

## Retired 40-minute format (data safety)
* Removed: the sequential clock and chapter locking, the original chapter content and its key, the sequential participant shell and desks, the format selector, the 40-minute demo and printables, and the dual-mode tests.
* Not removed: database tables and rows. `R2Session.format` stays; a row with `format` NULL or `"paper-40"` and a start time is a **historical** session: participants see "Round 2 is closed", the organizer sees "Historical session", the terminal stays locked, and `Start Round 2` refuses with 409. Nothing is rewritten or deleted.
* **Migration plan** if an event database already holds such a row: run Round 2 on a fresh event database (recommended), or, with separate organizer approval, back up the database, export the row and its audit trail, and only then clear it manually. No code path does this automatically.

## Kill Switch (Inject 2)
**Evidence** (participant-visible, `content-v2.server.ts`): snapshot 02:50; the ten connection records exactly as in the approved document (IP, process, country, sent, received, time), each with its inspect description and ticket reference; the eight IT tickets with the footer "Standard laptop software needs no ticket: mail-sync.exe." No field carries a classification; nodes and rows look identical until the team itself blocks one.

**Terminal policy** (`terminal.server.ts`, `GET/POST /api/round2/terminal`; simulation only, no shell/firewall/network call exists):

| Input | Response | Attempt used |
|---|---|---|
| `help` / `clear` | help text / clears the screen only (browser side; server history untouched) | no |
| unknown command (e.g. `BLOK …`) | `Unknown command. Usage: BLOCK <ip address>` | no |
| `BLOCK` | `Missing IP address. Usage: BLOCK <ip address>` | no |
| bad IP | `Invalid IP address format.` | no |
| two IPs | `Too many arguments. Usage: BLOCK <ip address>` | no |
| IP not on the monitor | `Not a connection on this list.` | no |
| IP already blocked by the team | `Already blocked.` | no |
| any command after lock | `Terminal locked.` | no |
| attacker connection | `[OK] <ip> BLOCKED. Suspicious traffic stopped. N of 2 threats contained.` | yes |
| legitimate connection | `[BLOCKED] <ip>.` + that connection's disruption line (from the private key, sent only after the committed attempt) | yes |
| both contained | `[OK] Both threats contained. Terminal locked.` (locks at once) | — |
| fourth attempt used without both | `[FAIL] Out of attempts. Terminal locked. See a volunteer.` + `CALL THE VOLUNTEERS . ASAP , IT IS EATING THE DATABASE !!` | — |

* Four attempts per team per session: serializable transaction + unique `(team, session start, seq)` with `seq` 1–4 (tested with parallel requests, tabs, reloads, re-login). Rate limit: 6 commands per team per 10 s (single-process LAN server; a refused command changes nothing).
* The browser receives only the team's own attempts and the message each earned; never the target list. The ~1 s "BLOCKING…" sequence is cosmetic and starts after the request is already sent.

## Scoring (60 points)
| Inject | Points | How |
|---|---|---|
| 1 Alert at 2:14 AM | 15 | paper, jury |
| 2 Kill Switch | 15 | **portal**: +5 per attacker connection blocked, +5 if no legitimate connection blocked, −2 per legitimate block, clamped 0–15; derived from the stored attempts on every read (cannot drift or be farmed). Paper reasoning is checked by volunteers and adds no points. |
| 3 Audit the AI | 15 | paper, jury |
| 4 The Three Calls | 15 | paper, jury |

Participants never see the terminal score. Organizers and volunteers see it in the control room ("Kill Switch · terminal review") and on the printable terminal results and score sheet.

**Flagged edge case (organizer decision):** the formula as written gives an **untouched terminal 5 points** (no legitimate block). This is implemented literally and marked "untouched" in the review; decide whether to keep it.

## Jury marking and publication (`/admin/round2`, organizer only)
- **Marking sheet** ("Round 2 marking"): one row per active finalist, in seed order. The jury types whole-number marks 0–15 for Injects 1, 3 and 4 and a marker name/initials. Inject 2 is shown read-only from the terminal; there is no field, API action or parameter that writes it.
- Stored in `R2PaperMark` (team, session start, inject), migration `20261125000000_round2_paper_marks` (additive). A database CHECK limits inject to 1/3/4 and score to 0–15. Every save or clear is written to `R2Audit` (`paper-mark`) with the previous value, the new value and the marker.
- **Pending is never zero:** an empty mark stays "pending". The terminal part is "live · may change" until pens down. A total exists only when all four parts exist after pens down; a mark of 0 is a real mark.
- **Publish results** needs pens down, every active finalist fully marked, a reason and a two-step confirmation. It happens once, sets `R2Session.resultsPublishedAt`, writes `publish-results` with the ranking to `R2Audit`, and locks all marks (409 afterwards).
- **Ties:** equal totals share a rank. No Round 2 tie-break has been approved, so none is invented (owner decision).
- Marks are keyed to the session start, so a mark can never carry over to a different session.

## Projector and publication
`/admin/projector` (organizer sign-in on the projector PC, no controls on screen) shows one scene chosen by the server: standby, Round 1 live (countdown to the server deadline), Round 1 closed, intermission, Round 2 waiting, Round 2 live (one shared countdown, all four injects open), pens down, results. `/admin/round2/projector` redirects there.
- Round 2 results appear only after publication.
- Round 1 standings and Round 2 finalist names are hidden until the organizer switches them on from `/admin/leaderboard` (reason plus confirmation; each switch is an `AuditLog` entry `broadcast-<key>-on|off`). Finalist names need a confirmed qualification.
- The countdown is hidden ("CLOCK PAUSED · RECONNECTING") if the server has not answered for 15 s.

## Volunteer fallback
After OUT OF ATTEMPTS the terminal stays locked. The team calls a volunteer, who hands over one printed correct-IP slip (`/admin/round2/print/slips`, organizer only) and ticks it on the answer sheet. Revealed IPs earn no terminal credit (the score already counts only what the team blocked). No extra numeric penalty. There is **no** digital reveal and **no** reset endpoint; a reset would need a separately approved, audited procedure.

## Answer key file
`private/round2-key-v2.json` (git-ignored; `GHOST_R2_KEY_FILE` overrides the path; the build does not trace it). Without it the terminal shows "awaiting the organizer's approved answer set" and uses no attempt. Shape (validated in `private-key.server.ts`; placeholders only):

```json
{ "version": "case-v2",
  "inject1": { "answer": "", "rationale": "", "evidence": [""], "decoys": [""], "split": "" },
  "inject2": { "status": "approved | provisional", "source": "", "malicious": ["IPv4"], "cleared": ["IPv4"], "wrongMessages": { "IPv4": "line" }, "split": "", "hints": "" },
  "inject3": { "claims": [{ "n": 0, "verdict": "TRUE | FALSE | NOT ENOUGH EVIDENCE", "reason": "" }], "planted": "", "split": "" },
  "inject4": { "calls": [{ "n": 0, "correct": "A-D", "flaws": { "X": "" } }], "statements": { "good": [0, 0], "bad": [{ "n": 0, "why": "" }] }, "split": "" } }
```
Copy the file to the event server's `private/` folder before the event. Tests use `tests/fixtures/round2-key-fixture.json`, whose targets are synthetic.

## Printables (`/admin/round2/print`, organizer only)
Team answer sheet · answer key and rubric · Kill Switch correct-IP slips · Kill Switch terminal results · Round 2 score sheet (60) · 60-minute timing script.

## Open items for the owner
1. Untouched-terminal +5 (see above). The marking sheet and terminal review label it "final · no attempts" / "literal rule (owner decision)"; the scoring engine is unchanged.
5. Round 2 tie-break: none approved; equal totals share a rank.
6. Who may mark: any organizer session (there is no separate judge role); the marker name is recorded for every change.
2. Public-statement sentences and chat transcript wording were reconstructed from the specification's summaries: compare with the PDF.
3. Any terminal reset procedure (none exists).
4. The retired format's old answer key is in the public git history.
