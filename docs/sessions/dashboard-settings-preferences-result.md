# Dashboard Settings Preferences Result

Date: 2026-04-28

What changed:
- added a protected settings page at `apps/web/src/app/dashboard/settings/page.tsx`
- added a server action at `apps/web/src/app/dashboard/settings/actions.ts`
- added a small entry link from `apps/web/src/app/dashboard/page.tsx` to `/dashboard/settings`

How it works:
- `/dashboard/settings` uses the repo’s existing dashboard auth flow:
  - `auth()`
  - `buildSignInHref()`
  - `redirectToWelcomeIfNeeded()`
- current preference values are read from the real `User` record via Prisma
- the form writes only:
  - `newsletterOptIn`
  - `announcementsOptIn`
- the server action calls:
  - `revalidatePath("/dashboard")`
  - `revalidatePath("/dashboard/settings")`

What was intentionally not changed:
- no billing section
- no avatar or identity changes
- no Google auth/account-linking changes
- no Stripe, appointments, memberships, or scheduling work

Build verification:
- `pnpm --filter web build` passed
- `pnpm --filter web exec next build --webpack` passed

Verification note:
- the first webpack attempt failed only because it was launched in parallel with another `next build` and hit the `.next/lock`
- a clean sequential webpack rerun passed
