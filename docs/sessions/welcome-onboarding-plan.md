# Welcome Onboarding Plan

Date: 2026-04-28

Scope:
- inspect the current Google sign-in bootstrap, JWT session shaping, and `User` model
- add the minimum durable user field needed to mark welcome completion
- add a `/welcome` page and a server action to save newsletter and announcements preferences
- add a signed-in first-time-user redirect gate without introducing redirect loops

Current repo facts:
- `User` already has `newsletterOptIn` and `announcementsOptIn`
- user creation and session shaping already flow through:
  - `apps/web/src/auth.ts`
  - `apps/web/src/lib/server/user-identity.ts`
- the app currently has no first-time onboarding gate
- Prisma migrations are not currently checked into `prisma/migrations`, so this pass should include schema change plus minimal `db push` guidance

Planned implementation:
- add `welcomeCompletedAt DateTime?` to `User`
- propagate `welcomeCompletedAt` through app user identity and NextAuth JWT/session types
- add a small server-side helper to redirect signed-in incomplete users to `/welcome`
- gate the current signed-in/public entry pages that matter:
  - `/`
  - `/library`
  - `/coaching`
  - `/dashboard`
  - `/episodes/*`
  - `/team/*`
- add `/welcome` with a simple form and server action
- redirect completed users away from `/welcome` and back into the app cleanly

Verification:
- run Prisma generate if needed for type sync
- run the relevant web build after changes
