# OPERATION GHOST_404

Phase 1 source for a fictional TechFest cybersecurity escape room. The landing page runs without a database; authenticated dashboards require Prisma and the local SQLite setup. No investigation chapter content is implemented yet. See [Phase 1 setup, limitations and verification](docs/phase-1.md).

## Run locally

Use Node.js 22.18+ LTS. Run `npm install`, configure private `.env` values from `.env.example`, then run `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, and `npm run dev`. Full setup and secure organizer bootstrap are documented in [the handoff](docs/phase-1.md).

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npx playwright install chromium` (once), then `npm run test:e2e`

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
