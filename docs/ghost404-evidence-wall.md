# Evidence Wall: one assigned group per team (Insider chapter)

**Contract:** 30 teams → 10 A / 10 B / 10 C → one private fragment per team → one matching public counterpart → dossier unlocked.

## History
1. Original: per team one private fragment (A) and one public card (B) in `InsiderAccess`; both unlocked the dossier.
2. Release 3293514 (superseded): three independent pairs per team (three folders).
3. **Now (group mode):** each team is assigned ONE group A, B or C and solves ONE pair.

## Group mode
- **Assignment** (`prepareGroups`, organizer action in `/admin/insider-kit`): teams without any pair row are shuffled with a CSPRNG (so groups do not follow team-ID order) and each goes to the currently smallest group. 30 teams always end exactly 10/10/10; a roster of any other size is balanced to within one team and labelled "Demonstration roster". It runs in one serializable transaction, is persisted (`InsiderPair`), and is idempotent: re-running, restarting the server or reprinting never changes a group or a code. A team that already holds a pair row, in any mode, is never touched. Later additions go to the smallest group.
- **Private fragment:** one `InsiderPair` row per team (`pair` = its group, `privateCode` unique, `solvedAt`).
- **Public counterpart:** one `InsiderWallCard` `match` row per team (`teamId` = that team, `pair` = its group, random `W-...` code) = 30 matching cards for 30 teams, plus 2 shared lookalike decoys per group (6). 36 cards in all. Decoys carry `variant "*"`.
- **Matching** (`solvePair`): the private code must be one of THIS team's rows; the wall code must be a `match` card whose `teamId` is this team and whose group is the team's group. Another team's fragment or card, a decoy, a card of another group, the bare letter, malformed or extra fields all give the same answer ("do not fit together"). The letter A/B/C only says where to look; it is never accepted as an answer.
- **Unlock:** the one match sets `InsiderAccess.unlockedAt`, which already gates the scored tasks and opens the WHOLE dossier. No other fragment or folder is asked for. It is server-side, persisted, and survives refresh, a new tab and re-login. The match awards no points and changes no chapter state (tested); the existing Insider scoring and unlock rules are untouched.
- **Participant UI:** "Match your Group X fragment" panel with the two inputs, then "GROUP X MATCHED - DOSSIER OPEN". The participant API exposes only the team's own letter and solved flag (`insiderGroup`); no code, card role or other team's group is in any response (tested).
- **Organizer UI** (`/admin/insider-kit`): summary (teams registered, teams prepared, Group A/B/C counts, not yet assigned, earlier three-pair teams, state line, "final split complete" only for exactly 30 teams at 10/10/10); "Prepare group assignment (all teams)" / "Prepare selected teams"; read-only views: **Private fragments** (one card per team, only its own code, group letter, "do not post"), **Public wall cards** (per group section, codes only: no team, role or private code, decoys indistinguishable), **Organizer code map** (organizer-only table of who matches what; never print or post it). The old two-fragment sheets remain under a collapsed "earlier" section for teams that never get a group.

## Data
Additive migration `20261127000000_insider_group_assignment`: `InsiderWallCard.teamId` (nullable, indexed, FK to `Team` with cascade). No other schema change: group mode reuses `InsiderPair` with exactly one row per team. Rollback: drop the column; nothing else changed. Do not apply to a live database without a backup.

## Compatibility with earlier data
| Team has | Mode | Behaviour |
|---|---|---|
| 1 `InsiderPair` row | group | as above |
| 3 `InsiderPair` rows (release 3293514) | earlier three-pair | unchanged: each solved pair opens its folder, all three open the dossier; `pairs` shape unchanged; variant-level match cards still honoured (`teamId` null) |
| 0 rows | original two-fragment | unchanged; already-unlocked teams stay unlocked |

Preparing all teams assigns groups only to teams with no rows; three-pair teams are left alone and shown as "earlier three-pair teams". Nobody is converted or made incomplete. A group team cannot use its legacy fragments as a bypass (tested).

## Physical contract (print phase is separate; nothing final is generated here)
- Private: ONE slip per team, carrying its code and the group letter, for the envelope.
- Public: per group section, that group's matching cards (10 for a 30-team event) plus 2 decoys, each carrying its own code.
- The clue artwork and wording are the owner's; the digital side checks only the codes. The wall sheet must not reveal which card is the match.
- No permanent team accounts, passwords or print pack are created here.

## Tests
`tests/evidence-wall-db.test.ts` (11): 30 teams = 10/10/10 with one slip and one card each, not a round-robin, idempotent and stable on reprint, organizer-only; correct pair opens the whole dossier with nothing else required; persistence; wrong combinations (letter only, decoys, another team's card, another group's card, someone else's fragment, garbage, extra fields); format tolerance; team isolation; sealed tasks until the match; no leakage; legacy compatibility (three-pair and two-fragment teams, selected-team preparation, demonstration roster not "final"); Demo Mode isolation. Browser: `tests/evidence-wall.spec.ts` (organizer preparation and print views, player journey at 1366x768, refresh, new tab, re-login, isolation).
