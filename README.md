# OPERATION GHOST_404

Inbox, Trail, Insider and Containment are playable in sequence on the verified game engine for this fictional TechFest cybersecurity escape room. The landing page runs without a database; authenticated investigations require Prisma and SQLite. See [the Containment gameplay and operator guide](docs/phase-5-containment.md), [the Insider Evidence Wall guide](docs/phase-4-insider.md), [the Trail guide](docs/phase-3-trail.md), [the Inbox and QR guide](docs/phase-2-inbox.md), and [Phase 1 setup](docs/phase-1.md). Final Verdict and Round 2 remain pending. Local gameplay verification does not establish production readiness.

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
