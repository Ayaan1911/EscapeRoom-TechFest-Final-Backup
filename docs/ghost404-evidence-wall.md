# Evidence Wall: three public/private pairs (Insider chapter)

## Before
Per team, one private envelope fragment (A) and one public wall card (B), both random codes in `InsiderAccess`; entering both unlocked the whole dossier. The wall card was labelled with the team ID, so "matching" was a lookup.

## Now
Three independent pairs per team. A **private slip** (team-specific code, in the team's envelope) fits exactly one **public wall card** of the team's variant. A solved pair opens its own evidence folder; all three set `InsiderAccess.unlockedAt` ("fully open"), which is the existing flag that gates the scored tasks. Existing scoring, the 50% chapter rule and Round 1 totals are untouched; solving a pair awards no points.

| Pair | Opens | Existing records used |
|---|---|---|
| A | Access and custody | `access`, `custody` |
| B | Policy changes and approvals | `policy`, `approval` |
| C | Messages and timeline | `message`, `timeline` |
The folders partition the dossier (tested for variants A, B, C). Staff profiles open with the first solved pair. Nothing new is invented; the three tasks (suspect, action, corroboration) need evidence from all three folders.

## Participant flow (`/play/insider`)
Reconstruction panel "Reconstruct the evidence set - n/3" with three folder cards (Sealed / Open), two inputs (private slip code, wall card code) and "Match fragments". Feedback: "Match confirmed: Evidence X is open." / "These two fragments do not fit together..." / "EVIDENCE SET RECONSTRUCTED - 3/3". Tasks appear at 3/3. Attempts are spaced 3 s apart by the server (existing rule). A refresh keeps progress (server state).

## Data (additive migration `20261126000000_insider_wall_pairs`)
- `InsiderPair(teamId, pair A|B|C, privateCode unique, solvedAt)`, cascade on team delete.
- `InsiderWallCard(code, variant, pair, role match|decoy)`: shared per variant, 1 match + 2 decoys per pair = 27 cards for 3 variants.
- Codes are random per event database (`P-XXXXXX-XXXXXX-XXXXXX-XXXXXX`, `W-...`), created by the organizer ("Prepare pair code sheets" in `/admin/insider-kit`) and never regenerated on reprint. **The pairing exists only in the database, never in source or any participant response.**
- Validation (`solvePair`): the slip must be one of THIS team's three; the card must be a `match` of the same pair AND the team's own variant. Any failure is the same answer (no hint which half was wrong). Another team's slip, a decoy, another variant's card, malformed or extra fields all fail.
- Compatibility: a team with **no** `InsiderPair` rows keeps the legacy two-fragment unlock and an already-unlocked team stays unlocked (no backfill, no data change). A team with pair rows cannot use the legacy fragments (tested). Rollback: the migration only adds two tables and one relation; dropping them restores the previous behaviour; no existing column changed.

## Physical contract (for the later print phase; no final pack is generated here)
- Private: 3 slips per team (150 for 50 teams), each carrying its private code and a clue. The code does NOT say which pair it is.
- Public: per variant, 3 intended cards + 6 lookalike decoys (27 cards total), printed once and duplicated at stations as needed; each carries its wall code and a clue.
- Relationship: a slip and its card share an identifier the participant must compare (decoys differ from it in a detail). The clue text comes from the existing case story and is the owner's to write; the digital side only checks the codes. The organizer-only code sheet lists each team's slips and each card's pair and role: keep it organizer-only.

## Tests
`tests/evidence-wall-db.test.ts` (15): code sheets and stability, folder partition, A/B/C pairs, wrong combinations (A+B, A+C, B+A, decoys, other variant, garbage), repeat, refresh, team isolation, simultaneous teams, sealed tasks until 3/3, no score or chapter change, completion, direct access, no leakage, legacy compatibility, Demo Mode isolation. `tests/evidence-wall.spec.ts`: full player journey in the browser (1366x768). Both passed on 2026-11-24 before the disk filled.
