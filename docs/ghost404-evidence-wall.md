# Evidence Wall: three shared pairs (Insider chapter)

**Final contract:** 30 teams → 10 per group → THREE unique private codes and THREE unique public codes (SIX unique fragments in all) → one pair required per team → dossier unlocked.

| Group | Teams | Private fragment | Public fragment |
|---|---|---|---|
| A | 10 | the SAME Private A for all 10 | the SAME Public A |
| B | 10 | the SAME Private B for all 10 | the SAME Public B |
| C | 10 | the SAME Private C for all 10 | the SAME Public C |

Team logins stay unique; only the fragment is shared within a group. There are no per-team codes, no 36 public cards and no decoys.

## History
1. Original: per team one private (A) and one public (B) code in `InsiderAccess`.
2. Release 3293514: three pairs per team (three folders). Superseded, still readable.
3. Release 89e52d4: one group per team but a unique code pair per team plus decoys. **Superseded: it misread the event design.** Still readable and convertible.
4. **Now:** three shared pairs.

## Physical contract
- Every team gets ONE access card: its unique team ID, its unique password and its group's PRIVATE fragment (printed in the later credential phase; not generated here).
- The three PUBLIC fragments are placed by the organizer at three building locations. Participants find their group's public fragment, return to the lab PC and enter both codes in Chapter 3.
- Only Chapter 3 needs participants to leave the lab. Inbox, Trail, Containment and Final Verdict are fully digital (Round 2 keeps its approved paper answer sheets).

## How it works
- **Codes** (`InsiderGroupCode`, one row per group): `P-XXXX-XXXX` (private) and `W-XXXX-XXXX` (public) from an alphabet without 0, O, 1, I, L, random, created ONCE by the organizer's preparation and never regenerated or replaced (idempotent, concurrency-safe). They live only in the event database.
- **Assignment** (`InsiderGroupMember`, one row per team): shuffled once with a CSPRNG and balanced so 30 teams end exactly 10/10/10 (any other size: within one team, labelled "Demonstration roster"). Persisted; re-running preparation, reprinting, restarting the server or logging out never changes a group or a code. Teams that already have an earlier pair row are never touched.
- **Validation** (`solvePair`, server-side, per team transaction): authenticated team → its own group → the submitted private code equals THAT group's private code AND the public code equals THAT group's public code (constant-time compares, both always evaluated). The letter alone, one half, swapped or mixed halves, another group's pair, malformed or extra fields all give the same answer. A repeat is harmless.
- **Unlock:** the one match sets `InsiderAccess.unlockedAt`, which already gates the scored tasks, and opens the WHOLE dossier. No other pair or folder is required. Persisted; survives refresh, re-login and restart. The match awards no points and changes no chapter state; Chapter 3 scoring and the unlock threshold are untouched.
- **Participant exposure:** the participant API returns only the team's own group letter and solved flag. No code (not even the team's own) and no map is ever returned; the public code is not shown anywhere in the portal.
- **Organizer** (`/admin/insider-kit`, organizer sign-in only): summary (teams per group, unique private/public/total fragments, distinction between unique definitions and physical copies), "Prepare shared fragments and groups", views: Public fragments (exactly 3 printable cards), Private fragments (3 cards), Organizer code map. A "Copies of each card" box prints extra copies of the SAME fragments. The map is organizer-only; never print or post it.

## Data and migration
Additive migration `20261128000000_insider_shared_pairs` (new tables `InsiderGroupCode`, `InsiderGroupMember`). Earlier migrations (`20261126000000_insider_wall_pairs`, `20261127000000_insider_group_assignment`) are NOT rewritten.

| Team has | Mode | Behaviour |
|---|---|---|
| an `InsiderGroupMember` row | shared pairs | as above (always wins) |
| one `InsiderPair` row + own card (89e52d4) | earlier per-team group | unchanged until converted |
| three `InsiderPair` rows (3293514) | earlier three-pair | unchanged |
| none | original two-fragment | unchanged; already-unlocked teams stay unlocked |

### Safe update of an already-prepared database
1. Take a database backup (`pg_dump`). 2. Apply the migration. 3. Open `/admin/insider-kit`; if teams still carry per-team codes, a "Convert earlier preparation" box appears: tick the backup box, type `CONVERT`, press the button. It keeps each team's group letter and solved state, deletes nothing, ignores the old rows from then on, never touches three-pair or two-fragment teams, and is audited (`insider-shared-conversion`). An already-unlocked team stays unlocked; an unsolved team uses the shared pair from then on. 4. Press "Prepare shared fragments and groups" to assign any remaining teams. Printed per-team cards from the earlier release are invalid after conversion: reprint from the new views. Nothing runs automatically on any database.

## Tests
`tests/evidence-wall-db.test.ts` (11, PostgreSQL): six unique fragments and no per-team rows or decoys; 30 teams 10/10/10, ten teams share each pair, not ID order; stable on re-prepare, reprint and a fresh module load; a match opens the whole dossier and a team-mate unlocks with the same codes; persistence; wrong matches (other groups' pairs, letter, one half, swapped, mixed, garbage, extra fields); every group with its own pair and format tolerance; sealed tasks until the match; no code in any participant response; earlier-mode compatibility and the explicit conversion (idempotent, history kept); Demo Mode isolation. Browser: `tests/evidence-wall.spec.ts` (organizer preparation, exactly three public cards, copies, player journey, two teams of one group, another group refused).

## Final event: groups and codes come from the credential bundle
For the real event the 10/10/10 assignment and the six shared codes are fixed in the encrypted credential bundle and installed by `credentials import` (`ghost404-credential-provisioning.md`), so every database (Render preview, college LAN) has identical groups and codes. After that import the Insider Kit's "Prepare shared fragments" button changes nothing. Inactive reserves and replaced primaries are excluded from the group counts; a reserve that replaces a team inherits that team's group.
