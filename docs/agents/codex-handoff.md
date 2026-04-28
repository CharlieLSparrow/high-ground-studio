# Codex Handoff

## First Five Minutes

Read in this order:
- `AGENTS.md`
- `docs/project-context/current-state.md`
- `docs/architecture/system-overview.md`
- `docs/runbooks/local-dev.md`
- the most recent relevant file in `docs/sessions/`

## Current Repo Truths

- The main app is `apps/web`.
- Team workflows are real and Prisma-backed.
- The coaching page is a public offer page, not a live Stripe checkout funnel.
- The episodes route is stabilized with a guarded loader, not a final content architecture.
- Both current production build paths pass.
- The content tree is much larger than the current published surface.

## Files Future Agents Will Commonly Need

Auth and identity:
- `apps/web/src/auth.ts`
- `apps/web/src/lib/server/user-identity.ts`
- `apps/web/src/lib/authz.ts`
- `apps/web/src/lib/content-access.ts`

Data model:
- `prisma/schema.prisma`
- `apps/web/src/lib/prisma.ts`

Team workflows:
- `apps/web/src/app/team/clients/page.tsx`
- `apps/web/src/app/team/clients/actions.ts`
- `apps/web/src/app/team/appointments/page.tsx`
- `apps/web/src/app/team/appointments/actions.ts`

Content:
- `apps/web/src/app/episodes/[[...slug]]/page.tsx`
- `apps/web/src/lib/source.ts`
- `apps/web/source.config.ts`
- `apps/web/src/lib/site.ts`
- `apps/web/src/lib/reading.ts`

## Current Risk Areas

- The repo contains backup/artifact files that are not authoritative.
- The content directories can be mistaken for one another unless you explicitly distinguish:
  - `content/publish`
  - `content/_staging`
  - `content/_inbox`

## Default Verification Path

Use both production build paths when you need to verify a meaningful repo change:

```bash
pnpm --filter web build
```

and:

```bash
pnpm --filter web exec next build --webpack
```

If a future failure appears only in one builder, compare it against the recent episodes session notes before changing app code.

## What To Update When You Learn Something Important

If you discover a stable repo truth, update one of:
- `docs/project-context/current-state.md`
- `docs/architecture/*`
- `docs/runbooks/*`
- `docs/workflows/*`
- a new `docs/sessions/*.md` file if it is still an in-flight conclusion
