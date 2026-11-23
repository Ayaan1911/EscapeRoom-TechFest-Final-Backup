# Round 2 · Case document v2 ("open-60" format)

Source: the owner's document "OPERATION GHOST_404 – Round 2 Part A: Injects 1, 3 and 4 and Inject 2 prompt". The PDF itself was not available in the repository; the content was implemented from the detailed specification supplied with the task. Items marked **VERIFY** must be checked against the PDF.

## Two formats, side by side (nothing was overwritten)

| | `paper-40` (**current default**) | `open-60` (case document v2) |
|---|---|---|
| Duration | 40 min | 60 min |
| Access | Chapters 1→4 open one at a time (0, 8, 20, 30 min); a closed chapter never reopens | All four injects readable from the start until pens down |
| Pacing | Enforced | Suggested only: 10 / 12 / 25 / 10 + 3-minute buffer |
| Content | Original chapters (unchanged) | Case document v2 injects |
| Typing | None | Only Inject 2: `BLOCK <IP>`, 4 attempts per team |
| Answers | Paper | Paper (terminal attempts are not the official score) |
| Key | `src/lib/round2/paper/key.server.ts` (already public in git history) | `private/round2-key-v2.json` (git-ignored, never committed) |

* The organizer picks the format on **Start investigation** in `/admin/round2`. It is written to `R2Session.format` and audited; a started session cannot be restarted or switched (`409`). Participants cannot choose or see a choice.
* `NULL` / unknown = `paper-40`, so every existing session and test behaves exactly as before.
* Part B (Boardroom Verdict) is not launched by either format.

## Inject content (participant-visible, `src/lib/round2/paper/content-v2.server.ts`)
* **Inject 1**: alert ALR-0214 on FIN-LAP-07 / ravi.k; 13-row process snapshot (02:14), 5 login rows, 8 network rows (incl. Server X 203.0.113.250 at 02:14:00 and every 60 s, FS-02 session at 02:15), 5 mail/download rows, recorded chat with the deliberate contradictions, options A–E. Nothing is pre-marked.
* **Inject 2**: the approved ten-connection Kill Switch evidence (unchanged) + the terminal.
* **Inject 3**: 10 IST timeline entries, R-1…R-12 (R-9 in **UTC**, R-11's FS-20 / HR-PC-30 decoys, R-6's planted line shown as untrusted evidence), 8 claims with their confidence badges. Click-based navigation; no search box (only Inject 2 takes typing).
* **Inject 4**: 6 status facts, 3 CEO calls with options A–D, 6 public-statement sentences.
* **VERIFY**: the six public-statement sentences and the chat transcript lines were written from the specification's summary of each sentence/line; compare the wording with the PDF before printing.

## Inject 2 terminal (`src/lib/round2/paper/terminal.server.ts`, `POST/GET /api/round2/terminal`)
* Only command: `BLOCK <IPv4>` (keyword case-insensitive). Simulation only: no shell, no `eval`, no network or firewall call exists anywhere in the code path.
* **Attempt policy** (enforced on the server):
  * malformed command → syntax help, **no attempt used**;
  * valid IPv4 that is **not on the monitor** → "No live connection", **no attempt used** (typo protection; reveals nothing);
  * any monitor IP → **one attempt**: `caught` (attacker) → `CAUGHT and BLOCKED!!`; any other monitor IP → `WHY THE HECK DID YOU BLOCKED ME ??? Connecting CEO`; already attempted → "ALREADY ATTEMPTED", still counts;
  * 4 attempts per team per session (`R2BlockAttempt`, unique `(team, sessionStart, seq)`, `seq` 1–4, serializable transaction): concurrent tabs, reloads and re-logins cannot exceed it (tested with 9 parallel requests);
  * locked when attempts are 0, when every attacker IP is caught, at pens down, after an early end, or when no approved key is installed;
  * out of attempts with targets left → `CALL THE VOLUNTEERS . ASAP , IT IS EATING THE DATABASE !!`.
* The target list never leaves the server; responses contain only the team's own attempts and a boolean `allCaught`.
* Volunteers: hints and any deduction are handled on paper; the case document gives no amount and none was invented. There is **no** reset endpoint; a reset would need a documented organizer procedure (not built).

## Answer key (`private/round2-key-v2.json`)
The repository is **public**, so the v2 key is loaded at runtime from a git-ignored file (`GHOST_R2_KEY_FILE` overrides the path). Copy it to the event server's `private/` folder before the event. Without it the terminal shows "awaiting the organizer's approved answer set" and the v2 key printout says it is missing. Shape (validated with zod in `private-key.server.ts`):

```json
{ "version": "case-v2",
  "inject1": { "answer": "", "rationale": "", "evidence": [""], "decoys": [""], "split": "" },
  "inject2": { "status": "approved | provisional", "source": "", "malicious": ["IPv4"], "cleared": ["IPv4"], "split": "", "hints": "" },
  "inject3": { "claims": [{ "n": 1, "verdict": "TRUE | FALSE | NOT ENOUGH EVIDENCE", "reason": "" }], "planted": "", "split": "" },
  "inject4": { "calls": [{ "n": 1, "correct": "A-D", "flaws": { "B": "" } }], "statements": { "good": [0, 0], "bad": [{ "n": 0, "why": "" }] }, "split": "" } }
```

The Inject 1, 3 and 4 answers in the private file follow the organizer section of the case document. They are deliberately not repeated here because this repository is public.

**Inject 2 targets are PROVISIONAL.** The case document v2 does not list them. The private key reuses the only previously approved Kill Switch classification in the repository (the earlier paper-format key) and is marked `"status": "provisional"`. The owner must confirm the target list (then set `"status": "approved"`) and the Inject 2 marking rubric; the provisional rubric text reuses the old paper rule and is labelled as such.

## Printables (`/admin/round2/print`)
`v2-answer-sheet` (team sheet for all four injects, incl. blocked IPs, volunteer notes, deductions), `v2-key` (organizer only, rendered from the private file), `v2-script` (60-minute pacing script). The 40-minute documents are unchanged.

## Demo Mode
`/admin/demo/round2?format=open-60&unit=N` (organizer only). The demo terminal asks an organizer-only endpoint to classify one IP and keeps its history in the browser tab; nothing is stored and "Reset demo terminal" clears it.

## Needs organizer / owner approval
1. Inject 2 target list and Inject 2 rubric (currently provisional, see above).
2. Whether `open-60` should replace `paper-40` as the default (it does not today).
3. Exact wording of the six public-statement sentences and the chat transcript (VERIFY against the PDF).
4. The old 40-minute answer key is already in the public git history; rotate that case content if that matters.
5. Any procedure for resetting a team's terminal attempts (none exists).
