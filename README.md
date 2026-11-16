# OPERATION GHOST_404

Phase 0 foundation for a fictional TechFest cybersecurity escape room. The UI runs without a database or credentials. No live game chapter is implemented yet.

## Run locally

Requires Node.js 20.9 or newer. Run `npm install`, then `npm run dev` and open `http://localhost:3000`.

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

The `/admin` route is a public visual shell. Add authentication before attaching sensitive team or event data. PostgreSQL and Prisma belong to Phase 1, when persistence is introduced.
