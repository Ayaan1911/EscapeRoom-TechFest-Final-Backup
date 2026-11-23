# GHOST_404 architecture (unified branch)

## Stack
Next.js 16 (App Router, server components, route handlers), React 19, Prisma 6 on PostgreSQL, Vitest, Playwright. One Node process (`next start`), no websockets or SSE: the clients poll.

## Shared application shell
- `src/components/ui/os-header.tsx`: the GHOST//OS system bar used by every page (brand, application name, secure-session indicator, page actions). Server component with no data access, so it cannot reveal anything a page has not already authorized.
- `src/app/ghostos.css`: loaded last. Tokens (`--os-*`), system bar, window chrome, boot reveal, shared focus and button states. It sits on top of the earlier design layers (`globals.css`, `kit.css`, `design.css`, `ghost.css`) rather than replacing them.
- Fonts: the `geist` package (bundled with the build).

## Identity and authorization
- One session model for both rounds: `TeamSession` rows keyed by a hashed random token; cookies `ghost_team_session` / `ghost_admin_session` (HttpOnly, SameSite=Strict, Secure unless the explicit closed-LAN flag is set with a non-https origin).
- Team and organizer sessions are different roles; organizer pages and APIs check `session("admin")` on the server. Mutating routes check the request origin (`APP_ORIGIN`, or the request origin when unset).
- Login attempts are throttled in the database (`LoginAttempt`), including for unknown IDs, and failure messages are identical for unknown teams and wrong codes (covered by a browser test).

## Round 1 (digital, scored online)
- Engine and scoring in `src/lib/game/*`; per-team writes run in `teamTx` (a per-team advisory lock, read-committed). The round row is locked `FOR SHARE`, so an organizer stop waits for in-flight submissions.
- Rules preserved: five chapters, 105 points, 50% unlock threshold, hints (-3, -6), one 60-minute clock for all teams started by the organizer.
- Desks (`src/components/game/*-desk.tsx`) share `DeskFrame` (header stats, draft bar, unlock notices, safe navigation).

## Round 2 (paper, server clock)
- `src/lib/round2/paper/clock.ts`: a pure function of the persisted `R2Session.startsAt/endedAt` and the server's `now`. Windows 0-8 / 8-20 / 20-30 / 30-40 minutes, `complete` at 40:00 or when the organizer ends it.
- **Timing model: one organizer-started session shared by every enrolled team** (not per-team). Restarts and reconnects land on the same chapter because nothing is held in memory.
- `GET /api/round2/status` returns only the open chapter. Past and future chapters never appear in a response or in the rendered page. Legacy submit/draft/evidence/results routes return 410.
- Chapter content and the answer key are `server-only` modules; the key is imported only by the admin print module. A build test scans `.next/static` for key and chapter text.
- Organizer: control room, projector countdown, six printables (answer sheet, answer key, rubrics, score sheet, timing script), Demo Mode (isolated, no writes, no timers).
- Concurrent transitions: there is no transition write. The chapter is derived from the clock on every request, so racing requests cannot disagree.

## Data
No migrations were added in this branch. The five existing migrations are unchanged. Round 2 reuses `R2Session`, `R2Finalist`, `R2Audit`.

## Offline behavior
No external fonts, scripts, images, analytics or API calls. The built client contains only documentation/namespace strings (`w3.org`, `nextjs.org`, `react.dev`) that are never fetched. A browser test records every request on the landing page, login, dashboard and all five chapters and fails if any leaves the app origin.

## Window manager (`src/components/os/os-windows.tsx`)
- `<OsDesktop scope="trail">` provides a reducer-held map of windows (`x, y, w, h, open, min, z`). Chapter desks render `<ToolWindow id title icon size side>` children; closed windows render nothing, minimized ones stay mounted (scroll and inner state are kept). The dock lists the registered tools.
- **UI-only state**: nothing here touches game state, scoring, drafts or the server. Geometry and open flags are kept in `sessionStorage` (`ghostos.windows.<scope>`) so a refresh restores the layout; a test asserts no evidence or answer text is stored there.
- **Bounds**: `clampRect` keeps every window fully inside the viewport, below the 56 px system bar and above the dock, on every move/resize and on browser resize, so a window can never become unreachable.
- **Responsive**: at <1100 px (`matchMedia`) windows become full-width sheets without drag/resize; the same controls and keyboard handling apply.
- **Accessibility**: windows are non-modal `role="dialog"` with labels; title bar focusable; arrows move, Shift+arrows resize, Escape closes; dock buttons use `aria-pressed` plus text state.
- **Stacking**: windows `z-index: 1000 + focus order`, dock above all, so a window is never hidden under the Demo Mode bar or the system bar.
- Fonts and icons are bundled (`geist`, `lucide-react`); no network access at run time.

## Chapter tools (all read-only presentations of data the player can already see)
Mail compare and Link inspector (derived from the recovered mailbox), Link board (counts of dossier records by person and type), Systems map (case systems; node states mirror the team's own selections), Evidence board and Case file (Verdict), Connection map and Audit split-screen (Round 2 content). Scoring, answer validation, drafts and the Round 2 clock are unchanged.

## Known architectural limits
- Polling, not push: a Round 2 tab learns of a transition within about a second of the boundary (it refetches every second near the end of a chapter); a tab opened mid-chapter polls every ~4 s.
- A tab already open keeps the framework payload it was served in its page source after the chapter closes. It stops rendering it; nothing about later chapters is ever sent early.
- Login is CPU-bound (scrypt on libuv's thread pool, default 4 threads). The lab start script now sizes the pool to the CPU count (up to 16): in the local 50-team test login p95 went from 3.5 s to 2.1 s. Page rendering still runs on one Node main thread.
