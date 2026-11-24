# Final event credentials: 32 permanent teams, portable between Render and the college LAN

**Rule #1: credential stability beats convenience.** A password is generated ONCE, printed ONCE and never changes again. Nothing in the application generates, rotates or re-seeds credentials.

## The accounts
| IDs | Role | Notes |
|---|---|---|
| `TEAM-01` … `TEAM-30` | primary teams | 10 per Insider group A / B / C (fixed once, not in team order) |
| `TEAM-31`, `TEAM-32` | reserve accounts | exist from day one, do NOT compete or rank until an organizer replaces a team |

- Login ID is exactly `TEAM-NN` (typing it in lower case still reaches the same account).
- Password format is exactly `XXX-XXX-XXX`: 9 uppercase letters, 2 hyphens, matches `^[A-Z]{3}-[A-Z]{3}-[A-Z]{3}$`. Letters I, L, O are never used (printed-card readability, 23 letters, 23^9 ≈ 1.8e12 combinations; logins are rate limited). Passwords are random (`crypto.randomInt`), unique, and unrelated to the team number. The same letters typed in lower case are accepted at login; every other credential is compared exactly as before.
- Team names are `Team 01` … `Team 32` (placeholders; rename in the database later if the teams have names).

## Architecture: one canonical encrypted bundle, any number of databases
```
generate (once)  ->  event-credentials.v1.enc   (OUTSIDE the repo, encrypted, owner-only folder)
                          |
          import (explicit, dry-run first)       import (same file, other machine)
                 v                                       v
      Render preview database                   college LAN database
   (salted hashes, same logins)              (different salts, same logins)
```
- **The bundle** (`scripts/credentials-lib.mjs`): JSON with bundle id, event id, the 32 teams (id, slot, kind, password, group, case variant) and the SIX shared Insider codes (private A/B/C, public A/B/C). Encrypted with **AES-256-GCM**, key derived from the organizer's passphrase with **scrypt** (Node's built-in crypto; no home-made scheme). Header and KDF parameters are authenticated; any altered byte or a wrong passphrase is refused.
- **Databases** hold only what the app already used: a salted scrypt hash per team (`Team.codeHash`, the application's own `hashPassword`). Two databases get different salts and therefore different hash strings, but the same printed password logs in to both. No plaintext password is ever written to a database, an audit record, a log or a client bundle (tested).
- **The group assignment, the case variants and the six shared codes are fixed inside the bundle**, so they are identical everywhere. Importing never re-randomizes anything.

## Procedure
All commands: `node scripts/credentials.mjs <command>` (or `npm run credentials -- <command>`). They never print a password, a shared code or the passphrase. Passphrase: environment variable `GHOST_CRED_PASSPHRASE` (set it for that PowerShell session only) or a hidden prompt (16+ characters).

1. **Generate once** (on the organizer's PC):
   `node scripts/credentials.mjs generate --out D:\Ghost404-Credentials\event-credentials.v1.enc`
   Refuses to overwrite, refuses any path inside the repository, restricts the folder and file to your Windows account, then proves the saved file decrypts. **Keep the passphrase and a second copy of the file in two separate safe places.** If either is lost the printed cards are the only record.
2. **Check:** `credentials check --bundle <file>` (valid, 32 teams, 10/10/10, 6 fragments).
3. **Preflight** against a database (read-only): `credentials preflight --bundle <file>` with `DATABASE_URL` pointing at the target. It shows environment, host/name, database name, teams present, round state, submissions, Insider codes present, schema/migration readiness, whether any of TEAM-01..32 exist, and a classification: `fresh`, `already-provisioned`, `partial` or `conflict`.
4. **Back up, migrate:** `pg_dump -Fc` (below), then `npx prisma migrate deploy` (required: `20261128000000_insider_shared_pairs`, `20261129000000_team_provision`). The importer refuses a database that lacks them.
5. **Import, dry run (default):** `credentials import --bundle <file>`.
6. **Import, apply:** `credentials import --bundle <file> --apply --confirm-database <exact database name>`. Single serializable transaction: creates the 32 accounts, the roster records, the six shared codes and the 30 group memberships; writes one audit line with counts only.
7. **Verify:** `credentials verify --bundle <file>`: checks every printed password against the database exactly as the login does, plus roster, groups and shared codes.
8. **Print** (below), then restart the server and log in with one card.

### Safety guarantees of the importer
- Dry-run unless `--apply` AND the exact database name is typed.
- **Never overwrites.** An existing account with a different password, case variant, roster record or group, a database that already holds different shared codes, or accounts from a different bundle is reported as a `CONFLICT` and NOTHING is written.
- **Idempotent.** Running it again on a provisioned database verifies and writes nothing: no duplicates, no new hashes, no reshuffled groups, no change to scores, progress, terminal attempts or the event state.
- Teams that are not part of the bundle (anything else in the database) are untouched.

## Render preview, then the college LAN
Render and the LAN use different PostgreSQL databases, and Git does not carry accounts. To use the same credentials in both: install the SAME bundle into each, with the steps above, using each database's own `DATABASE_URL`. Do the Render step only if you explicitly want a preview (Neon/Render are never touched automatically). For the LAN, copy `event-credentials.v1.enc` to the LAN server's protected folder (USB or direct copy; it is encrypted, but still keep it off e-mail and chat) and run steps 3-7 there. Then `credentials verify` must say VERIFIED on both. A database with correct passwords but different Insider codes is NOT a successful migration: `verify` fails in that case.

## Persistence
- A normal restart, a new Git commit, a redeploy, `prisma migrate deploy` (including re-running it) and a changed connection string do not touch accounts. No startup path creates teams or passwords (audited: the application never calls `team.create` or `hashPassword` except the login check; `db:seed` is a development tool that refuses to run in production; `scripts/lab/prepare-lab.ps1 -Teams N` adds synthetic LAB teams only when you pass `-Teams`, so **never pass it for the final event**).
- Tested: two independent databases from one bundle; re-import; `prisma migrate deploy` on a fresh database, import, then deploy again (no pending migrations, hashes unchanged); `pg_dump` / `pg_restore` into another database (same passwords work, groups and event state intact, the plain dump contains no plaintext password).

## Backup and restore (event database)
Use PostgreSQL's own tools; the dump keeps all 32 accounts and hashes, roster, groups, shared codes, scores, progress, Round 2 data and audit.
```
pg_dump -Fc -h <host> -U <user> -d <database> -f D:\Ghost404-Backups\event-<yyyymmdd-hhmm>.dump
createdb -h <host> -U <user> <new_database>
pg_restore --no-owner -h <host> -U <user> -d <new_database> D:\Ghost404-Backups\event-<...>.dump
node scripts/credentials.mjs verify --bundle <file>      (with DATABASE_URL pointing at the restored database)
```
(In the development Docker container: `docker exec ghost404-pg-test pg_dump -U postgres -Fc -d <db> > file`.) Keep backups in a private folder; they contain password HASHES and event data. `scripts/db-backup.mjs` is a smaller logical JSON backup of the core tables; prefer pg_dump for the event.

## Printing the access cards
`credentials print --bundle <file> --out D:\Ghost404-Credentials\print --include primary` writes ONE HTML file with the 30 primary cards (8 per A4 page, 2 columns); `--include reserve` writes the two reserve cards; `--include all` writes all 32. Only this command ever reveals plaintext; it is run on the organizer's PC, never through the web app. **Run `credentials verify` against the event database first.**
- Primary card: OPERATION GHOST_404 / TEAM ACCESS CARD, TEAM ID, PASSWORD, PRIVATE EVIDENCE FRAGMENT: GROUP x, PRIVATE CODE (that group's shared private code). The public A/B/C codes are never printed on a team card.
- Reserve card: dashed border, "RESERVE ACCESS CARD", fragment "NOT ASSIGNED".
- Open the file in a browser, print, then **delete the file** and empty the recycle bin. Reprinting regenerates the same values from the bundle; passwords never change.
- Passwords are never available from the web application, an organizer page, a CSV or a static file.

## Reserve accounts
- TEAM-31/32 can sign in but see "This reserve account is not active" and cannot play (server-enforced). They are excluded from Round 1 rankings, qualification, the projector and the Insider group counts.
- **Replacement** (organizer only): `/admin/credentials` → "Replace a team with a reserve": choose the reserve, the primary it replaces and a reason (audited). It is a REPLACEMENT: the primary leaves every ranking (kept as history, nothing deleted), the reserve takes that primary's Insider group so the active split stays 10/10/10, and starts with its own blank progress. Scores, terminal attempts and solved state are never transferred (a primary that already has progress needs an explicit acknowledgement). One reserve per slot, enforced by the database. The reserve's ID and password do not change.
- Afterwards print the reserve's updated card: `credentials print --include reserve --bundle <file>` with `DATABASE_URL` set shows its group and private code. Handing over a card is a manual step.
- A reserve repairs a lost or damaged card, not a database outage.

## Insider consistency
The bundle fixes: which team is in which group (10/10/10), and the six shared codes. Import installs exactly those. After import the Insider Kit's "Prepare shared fragments" button has nothing left to do (idempotent). `credentials verify` fails if a database's groups or shared codes differ from the printed bundle.

## Chapter 1
The old Chapter 1 QR evidence kit was removed from the organizer dashboard and `/admin/inbox-kit` is only a "retired" notice. Players use the in-game "Open Forensic Snapshot" button; evidence, capture IDs and scoring are unchanged.

## Tests
`tests/credentials-lib.test.ts` (generation, validation, encryption, cards), `tests/credentials-db.test.ts` (PostgreSQL: dry run, apply, idempotency, conflicts, second database, real logins on both, reserves and replacement, migrations, backup/restore, CLI end to end, no plaintext), `tests/credentials.spec.ts` (browser: login with the new format, reserve screen, organizer status page without any secret, replacement, retired kit, Forensic Snapshot).
