# Coaching Request Intake Flow Result

## Files Changed
- `prisma/schema.prisma`
- `apps/web/src/app/coaching/actions.ts`
- `apps/web/src/app/coaching/page.tsx`
- `apps/web/src/app/coaching/requested/page.tsx`
- `apps/web/src/app/team/coaching-requests/actions.ts`
- `apps/web/src/app/team/coaching-requests/page.tsx`
- `apps/web/src/app/team/layout.tsx`
- `docs/sessions/coaching-request-intake-flow-result.md`

## Schema Changes
- Added `ContactPreference` enum:
  - `EMAIL`
  - `PHONE_CALL`
  - `TEXT`
- Added `CoachingRequestStatus` enum:
  - `NEW`
  - `CONTACTED`
  - `SCHEDULED`
  - `CLOSED`
  - `DECLINED`
- Added `CoachingRequest` model for unscheduled intake requests.
- Added `User` relations for:
  - client-owned coaching requests
  - assigned coaching requests
- Added optional `Appointment` back-reference for a future request-to-appointment conversion.

## Routes Added / Updated
- Updated public route:
  - `/coaching`
- Added public route:
  - `/coaching/requested`
- Added internal route:
  - `/team/coaching-requests`
- Updated team navigation:
  - added `Coaching Requests` link in `/team` layout

## What the Flow Does
- Public visitors can submit a donation-supported coaching request.
- Submission validates:
  - name
  - email
  - phone when needed for phone/text contact
  - preferred contact method
  - coaching goals
  - contact consent
  - honeypot spam trap
- The action reuses the existing identity pattern through `upsertPreprovisionedUser(...)`.
- The app creates or reuses a `User` + `ClientProfile`, then creates a `CoachingRequest`.
- Team users can review requests internally, assign a coach, update status, and store internal notes.

## Validation Performed
- Ran Prisma client generation:
  - `pnpm db:generate`
- Ran app build:
  - `pnpm --filter web build`
- Confirmed no manuscript/book files were modified.
- Confirmed no publish episode files were modified.
- Confirmed no unrelated files were modified in this pass.

## Known Limitations
- No SMS notification yet.
- No donation/payment processing yet.
- No appointment conversion action yet.
- `/dashboard` was intentionally left unchanged, so coaching request status is not yet visible there.
- No production migration was applied in this pass; schema deployment still needs the normal migration/db rollout.

## Recommended Next Action
Implement Phase 2 of the funnel:
- show coaching request status on `/dashboard`
- add internal request-to-appointment conversion from `/team/coaching-requests`
- then add a truthful donation/payment destination once the business handling is decided
