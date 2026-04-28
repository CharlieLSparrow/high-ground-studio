# Dashboard Settings Preferences Plan

Date: 2026-04-28

Scope:
- inspect the current dashboard page, auth flow, and existing `User` preference fields
- add a dedicated protected page at `/dashboard/settings`
- add a server action that updates only:
  - `newsletterOptIn`
  - `announcementsOptIn`

Current repo facts:
- the source of truth for these preferences is already the `User` record
- `newsletterOptIn` and `announcementsOptIn` are already present on `User`
- dashboard auth currently uses `auth()`, `buildSignInHref()`, Prisma, and the welcome gate helper
- welcome onboarding already writes the same two fields and sets `welcomeCompletedAt`

Planned implementation:
- create `apps/web/src/app/dashboard/settings/page.tsx`
- create `apps/web/src/app/dashboard/settings/actions.ts`
- read current values from Prisma by authenticated user id
- use a server action to update only the two preference booleans
- call `revalidatePath("/dashboard")` and `revalidatePath("/dashboard/settings")`
- add a small dashboard link to the new settings page so the surface is discoverable

Constraints:
- no billing section
- no identity/account-linking changes
- no Stripe, appointments, memberships, or scheduling refactors
- keep the UI aligned with the current welcome/dashboard visual system
