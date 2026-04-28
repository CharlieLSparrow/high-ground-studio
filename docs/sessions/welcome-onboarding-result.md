# Welcome Onboarding Result

Date: 2026-04-28

What changed:
- added `welcomeCompletedAt` to `User` in `prisma/schema.prisma`
- propagated `welcomeCompletedAt` through:
  - `apps/web/src/lib/server/user-identity.ts`
  - `apps/web/src/auth.ts`
  - `apps/web/src/types/next-auth.d.ts`
- added a small server-side welcome helper in `apps/web/src/lib/server/welcome.ts`
- added:
  - `apps/web/src/app/welcome/page.tsx`
  - `apps/web/src/app/welcome/actions.ts`
- added first-time-user welcome gating to the main app entry points:
  - `/`
  - `/library`
  - `/coaching`
  - `/coaching/success`
  - `/coaching/cancel`
  - `/dashboard`
  - `/episodes/*`
  - `/team/*` via `team/layout.tsx`

Behavior now:
- on first Google sign-in, the user record still gets created through the existing bootstrap flow
- until `welcomeCompletedAt` is set, signed-in users are redirected to `/welcome`
- `/welcome` is exempt from that gate so the user can finish onboarding
- submitting the welcome form saves:
  - `newsletterOptIn`
  - `announcementsOptIn`
  - `welcomeCompletedAt`
- after completion, the user is redirected to a sanitized internal `next` path or `/dashboard`
- completed users visiting `/welcome` again are redirected back into the app instead of being trapped there

Why this stayed small:
- no new table was introduced
- existing `User` fields for marketing preferences were reused
- Stripe, coaching checkout, appointments, and memberships were not refactored

Build verification:
- `pnpm db:generate`
- `pnpm --filter web build`
- `pnpm --filter web exec next build --webpack`

Database follow-up:
- this repo does not currently have checked-in Prisma migrations
- to apply the new nullable column locally, run:
  - `pnpm db:push`

Notes:
- the redirect gate is page/layout based, not middleware based
- the `next` redirect target is sanitized to avoid `/welcome`, `//...`, or `/api/auth...` loops
