# Phase 0 handoff

The site contains a landing page (`/`), participant portal shell (`/play`), and admin dashboard shell (`/admin`). All case text and visual telemetry are fictional placeholders. The four chapter links, evidence stream, verdict, scoring, team registration, and Round 2 controls are deliberately inactive.

Phase 1 should add database-backed teams and sessions, authentication and authorization, Zod input schemas, chapter state and evidence, verdict submission, and scoring. Keep chapter data in `src/data`, rule and validation code in `src/lib/game`, and interactive workspace components in `src/components/game`. Protect `/admin` before it shows actual records.
