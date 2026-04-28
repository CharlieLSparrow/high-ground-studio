# Repo Audit

Date: 2026-04-27

## Scope

This audit is grounded in the repo as it exists now, plus the recent stabilization notes under `docs/sessions/`.

## What Is Already Strong

1. The core app shape is understandable.
   - `apps/web` is the clear center of gravity.
   - auth, Prisma access, UI routes, and server actions are easy to trace.

2. The Prisma schema is already meaningful.
   - users
   - alias emails
   - roles
   - client profiles
   - membership plans
   - memberships
   - appointments

3. Google sign-in is integrated with app identity instead of living as a separate auth island.
   - `ensureAppUserFromGoogle()` and alias-email lookup are real strengths.

4. Team operations are not aspirational; they are implemented.
   - `/team/clients`
   - `/team/appointments`
   - server actions for creation/update/status changes

5. The client dashboard is small but honest.
   - it surfaces real membership and appointment data instead of marketing placeholders

6. The public coaching page is stable in its current scope.
   - it works as a front door without pretending checkout is finished

7. The library/index layer is simple and robust.
   - `src/lib/site.ts`
   - `src/lib/reading.ts`
   - clear curated discovery surface

8. The motion subsystem is isolated.
   - `apps/motion-lab` and `packages/motion-engine` are separated from the web app enough to reason about independently

## What Is Still Fragile

1. The episodes content pipeline is not fully settled.
   - the route is live
   - the Fumadocs loader is guarded
   - recent stabilization history centered on this area

2. Build confidence is better, but the content/build history is still recent.
   - both current production builds pass
   - recent session notes show this area was unstable very recently

3. Commercialization is intentionally incomplete.
   - Stripe checkout/webhooks are rolled back
   - cart UI remains present but not integrated into the coaching path

4. Local setup knowledge is still mostly implicit.
   - required env vars are discoverable from code, but no `.env.example` exists

5. Repo hygiene is uneven.
   - `page.backup.tsx`
   - `pnpm-workspace.yaml.save`
   - `prisma.config.ts.bak`
   - many `.DS_Store` files

6. Content inventory is much larger than the active published surface.
   - `_inbox` and `_staging` are large
   - `content/publish` is comparatively small
   - future agents could easily mistake raw or staged content for live content
   - published route content and curated discovery metadata are also split across different source files

7. The new durable docs layer exists, but it is still fresh and needs upkeep to stay useful.

## Knowledge That Was Living In Chat Or Session Notes

This knowledge should now be treated as durable repo memory:

- Stripe checkout was intentionally backed out to a clean non-broken state.
- The public coaching page is a front door, not a finished payment funnel.
- The invalid NextAuth catch-all nesting was the Stripe-specific route failure.
- The episodes route depends on a guarded Fumadocs loader path.
- `ENABLE_EPISODES_FUMADOCS=1` is the explicit opt-in for the guarded loader.
- Both `pnpm --filter web build` and `pnpm --filter web exec next build --webpack` currently pass.
- The earlier Turbopack/PostCSS instability is part of repo history and still useful context if that area regresses.

## Recurring Tasks That Should Become Reusable Workflows

1. Repo analysis and orientation for a new Codex agent
2. Local dev setup and verification
3. New feature kickoff with current-state validation first
4. Auth/role-aware workflow changes
5. Team console changes touching Prisma and server actions
6. Content pipeline investigation for episodes/MDX/Fumadocs
7. Session-note promotion into durable docs

## Top 10 Next Steps

1. Add a checked-in `.env.example`.
   - Rationale: local setup is currently inferred from code, which slows every fresh machine and every agent turn.

2. Keep the new build-history distinction current as future sessions add more stabilization notes.
   - Rationale: future agents should not mistake old session failures for current repo truth.

3. Decide the near-term strategy for the episodes route.
   - Rationale: the current loader guard is stabilizing, not final architecture.

4. Add a short content-pipeline map for `_inbox`, `_staging`, and `publish`.
   - Rationale: content source-of-truth confusion is one of the biggest future-agent risks.

5. Remove or quarantine obvious backup/scratch artifacts after review.
   - Rationale: `page.backup.tsx` and config backups increase accidental-change risk.

6. Add a narrow test/verification layer around auth bootstrap and team server actions.
   - Rationale: these flows are real production logic and now worth protecting.

7. Decide whether the floating cart should be removed, hidden, or documented as intentionally dormant.
   - Rationale: it currently signals a commerce path that the repo explicitly rolled back.

8. Add a build/runbook entry for environment-sensitive failures.
   - Rationale: future agents need a fast path for distinguishing repo bugs from sandbox/process restrictions.

9. Create a durable release of current membership plan conventions and internal ops assumptions.
   - Rationale: plan slugs and operational meaning currently live mostly in code.

10. Revisit Stripe only after the content/build path and local setup are less fragile.
   - Rationale: commercialization should not be reintroduced on top of unstable repo memory and build ambiguity.

## Bottom Line

This repo already has a credible operational core:
- real auth
- real data model
- real team workflows
- real client dashboard

The weakest area is not the business model or the team console. It is the combination of:
- content-pipeline ambiguity
- recently stabilized build/content behavior
- missing durable repo memory

That is exactly what this command-deck setup should address.
