# OPERATION GHOST_404

All five Round 1 chapters are playable: Inbox, Trail, Insider, Containment and Final Verdict, followed by saved case closure and organizer qualification review. The landing page runs without a database; authenticated investigations require Prisma and SQLite. See [the Final Verdict and qualification guide](docs/phase-6-final-verdict.md), [the Containment guide](docs/phase-5-containment.md), [the Insider Evidence Wall guide](docs/phase-4-insider.md), [the Trail guide](docs/phase-3-trail.md), [the Inbox guide](docs/phase-2-inbox.md), and [Phase 1 setup](docs/phase-1.md). Round 2 and deployment remain outside scope. Local gameplay verification does not establish production readiness.

## Run locally

Use Node.js 22.18+ LTS. Run `npm install`, configure private `.env` values from `.env.example`, then run `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, and `npm run dev`. Full setup and secure organizer bootstrap are documented in [the handoff](docs/phase-1.md).

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npx playwright install chromium` (once), then `npm run test:e2e`
- `npm run test:e2e:inbox` (all browser cases with disposable A/B/C teams)
- `npm run demo:inbox` (interactive disposable demo; prints test-only credentials)
- `npm run test:e2e:trail` (preserved Inbox regressions, then all Trail browser cases)
- `npm run demo:trail` (temporary Inbox-completed teams, ready for Trail)
- `npm run test:e2e:insider` (all earlier browser regressions, 50-team printing, Insider and a server restart)
- `npm run demo:insider` (temporary Inbox/Trail-completed teams and organizer-only printable fragments)
- `npm run test:e2e:containment` (all preserved browser suites, simulated response workflows and restart persistence)
- `npm run demo:containment` (temporary ready teams, fictional CCTV kit and inert response decisions)
- `npm run test:e2e:verdict` (all prior suites, final synthesis, case closure, qualification and restart)
- `npm run demo:verdict` (temporary A/B/C teams ready for Final Verdict; organizer review demo)

## Structure

- `src/app`: App Router pages and shared loading/error states.
- `src/components/ui`: reusable interface elements.
- `src/components/game`: investigation workspace elements.
- `src/data`: static case and chapter definitions; future fictional evidence belongs here.
- `src/types`: game-facing interfaces.
- `src/lib/game`: reserved for Phase 1 game rules and Zod validation at input boundaries.
- `src/lib/utils`: reserved for shared utilities when a real use arises.
- `tests`: fast data checks and browser route checks.
- `docs`: phase plan and operator notes.

The `/admin` route and score export require an organizer session. `/play` requires a team session and only returns that team's data. SQLite is for local development; migrate to PostgreSQL before stateless multiple-instance hosting.
