# GHOST_404 unified branch: implementation progress

Branch `feat/ghost404-unified-ghost-os`, started from `85eef4e1` (Round 2 paper edition). Updated as work lands; see `docs/ghost404-verification.md` for evidence.

## Branch reconnaissance (Phase A)
| Branch | Head | Relationship |
|---|---|---|
| `test/ghost404-lab-lan` | `3327e506` | Phase 1 LAN baseline. Ancestor of the Round 2 branch. **Untouched.** |
| `feat/ghost404-hybrid-ui-redesign` | `129c32f` | Earlier visual redesign. **Already an ancestor** of `85eef4e1` (`git merge-base` = `129c32f`), so nothing needed merging or cherry-picking. |
| `feat/ghost404-round2-paper` | `85eef4e1` | Four-chapter paper Round 2. Chosen as the integration base because it contains all of the above. |
| `main`, Render-tracked branches | n/a | Not touched. |

Because the base already contains Round 1, the hybrid redesign and the paper Round 2, "integration" was a verification exercise, not a merge. There were no conflicts to resolve.

## Done in this branch
- [x] Worktree `D:\Ghost404-TestWorkspace\unified`, disposable local PostgreSQL only.
- [x] **GHOST//OS system bar** (`OsHeader`) on every screen: landing, login, player dashboard, five Round 1 chapters, forensic snapshot, Round 2, organizer pages, organizer login, Demo Mode. Replaces the desktop command rail and 14 hand-written headers.
- [x] Window-chrome treatment for the landing case file and the login portal; CSS-only boot reveal (~1.4 s, never blocks input, off for reduced motion/print).
- [x] Sign-in button with a real pending state (`useFormStatus`).
- [x] Fonts now ship with the build (`geist` package, SIL OFL) instead of `next/font/google`: no request to Google at build or run time.
- [x] Round 2 player screen: standing "write every answer on paper" reminder.
- [x] Bug fixed: intermittent page-wide horizontal overflow on Kill Switch (`.rp-sr` absolutely positioned outside the scroll wrapper). It failed the a11y/overflow test about half the time.
- [x] New browser suite `tests/phase5-ghostos-shell.spec.ts` (6 tests).
- [x] LAN smoke with the unchanged Phase 1 scripts against a separate `ghost404_lab_unified` database (see runbook).
- [x] 50-team Round 1 load test repeated on this build.
- [x] Documentation set (this file, architecture, UX, LAN runbook, verification, release checklist).

## Already present and verified (inherited, not rebuilt)
- Round 1: five chapters, task scoring, 50% unlock threshold, Continue to next chapter, draft preservation, back navigation, hints, Tamper Alert bonus, server clock.
- Round 1 interactive tools from the hybrid redesign: Inbox evidence grouping/mail authentication, Trail activity timeline + filters + session path, Insider evidence wall, Containment response stage rail, Verdict case reconstruction.
- Round 2: 8/12/10/10 server-clock chapters, no backtracking, no digital answers, organizer control room, projector countdown, printables, Demo Mode.

## Not done (honest list)
- [ ] **Window manager** (drag, resize, minimize/restore of panels). Not built: the chapters are single-purpose workspaces and decorative windows would not help solve them. The window chrome on landing/login is styling only.
- [ ] Optional sound design. Not built.
- [ ] React Bits / Motion / shadcn / Lucide were **not adopted**. The existing CSS/SVG system and the system bar cover the need; adding them would be dependency weight without a gameplay benefit this session.
- [ ] **Per-chapter text audit and rewrite of Round 1.** Not performed. The earlier hybrid redesign already moved logs behind filters/inspectors and this session did not re-author chapter copy.
- [ ] Round 2 Kill Switch is a sortable monitor table with sparklines and an inspector, **not** a topology/connection map. Chapter 4 gives context tiles, not per-option consequence animations.
- [ ] Cinematic Round 1 → Round 2 transition. The existing qualification board and organizer enrollment gate remain; no new animation.
- [ ] Organizer pages other than the shared system bar were not visually redesigned.
- [ ] Real multi-device college-LAN test. Only localhost and this laptop's own LAN-interface address were tested.
- [ ] Legacy Round 2 browser specs (`phase4-round2`, `phase5-round2`, `phase5-visual`, `organizer-ties`) still excluded unless `GHOST_R2_LEGACY=1` (they test the retired 8-unit UI).

## Continuation instructions
1. `git worktree list` and check out `feat/ghost404-unified-ghost-os` in `D:\Ghost404-TestWorkspace\unified`.
2. `npm ci`, `npx prisma generate`, then run the checks in `docs/ghost404-verification.md`.
3. Remaining work in priority order: Round 1 copy audit (Part 4 of the directive), Round 2 Kill Switch topology view, organizer page redesign, window manager (only if it proves useful in playtests).
