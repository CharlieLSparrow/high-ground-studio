# Coaching Current-State Sync Result

Date: 2026-05-07

## Branch And Commit

- Branch: `main`
- Base commit before sync: `bf18acfe32f637ccd99bb4ac1bcff50d07d15803`
- Commit hash after commit: recorded in the final terminal report for the commit that contains this note. A Git commit cannot contain its own final hash without changing that hash.

## Files Inspected

- `AGENTS.md`
- `docs/project-context/current-state.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/domain-model.md`
- `docs/runbooks/local-dev.md`
- `docs/agents/codex-handoff.md`
- `apps/web/src/app/coaching/actions.ts`
- `apps/web/src/app/coaching/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/team/coaching-requests/actions.ts`
- `apps/web/src/app/team/coaching-requests/page.tsx`
- `apps/web/src/app/team/appointments/actions.ts`
- `apps/web/src/app/team/appointments/page.tsx`
- `apps/web/src/lib/calendar-links.ts`
- `apps/web/src/lib/server/coaching-notifications.ts`
- `apps/web/src/lib/server/email.ts`
- `apps/web/src/lib/server/sms.ts`
- `docs/deploy/donation-and-calendar-links.md`
- `docs/deploy/email-notifications.md`
- `docs/deploy/sms-notifications.md`
- `.env.example`
- `prisma/schema.prisma`

## Docs Changed

- `AGENTS.md`
- `docs/project-context/current-state.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/domain-model.md`
- `docs/runbooks/local-dev.md`
- `docs/agents/codex-handoff.md`
- `docs/deploy/donation-and-calendar-links.md`
- `docs/deploy/sms-notifications.md`
- `docs/sessions/coaching-current-state-sync-result.md`

## Current Product Behavior

- `/coaching` is the public coaching front door. Its calls to action route signed-in users to `/dashboard?intent=coaching` and anonymous users through sign-in with that callback.
- `/dashboard?intent=coaching` is the signed-in coaching request form. It posts to `submitCoachingRequestAction`.
- Coaching request submission creates or confirms the `CLIENT` role and `ClientProfile`, creates a `CoachingRequest`, then attempts a best-effort internal Resend email notification after the database transaction commits.
- `/dashboard` shows recent coaching requests, request status, assigned coach when present, converted appointment summaries, Google Calendar links for converted appointments, and pay-what-you-can contribution links when `HGO_COACHING_DONATION_URL` and appointment data are present.
- `/team/coaching-requests` is the internal coaching request queue for status changes, coach assignment, internal notes, and appointment conversion.
- Request conversion creates an `Appointment`, marks the request `SCHEDULED`, assigns the coach, links `convertedAppointmentId`, appends scheduling notes, and revalidates `/team/coaching-requests`, `/team/appointments`, and `/dashboard`.
- `/team/appointments` supports direct appointment creation, editing, cancellation, completion, Google Calendar event-template links, and donation-link configured/missing indicators.
- Donation support is an external pay-what-you-can link controlled by `HGO_COACHING_DONATION_URL`.
- Google Calendar support is link-generation only. No OAuth/API sync is wired.
- SMS/Twilio sending is not wired into the active coaching request flow.
- Full Stripe Checkout is not active.

## Validation Performed

- `git status --short --branch`
- `git branch --show-current`
- `git pull origin main`
- `git log --oneline -n 8`
- `pnpm --filter web exec tsc --noEmit`
- `pnpm --filter web exec next build --webpack`

Validation results:
- TypeScript passed.
- Next.js webpack build passed.
- `git pull origin main` reported already up to date.

## Known Limitations

- Email notifications have no retry queue and no persisted delivery status.
- SMS/Twilio helper code exists but is dormant for the coaching flow.
- Google Calendar links require users/staff to manually create the event draft.
- Appointment changes do not update external calendars.
- `Appointment.googleEventId` exists but is not written by the link-only calendar flow.
- Donation/payment is not stored in the app and no Stripe webhook reconciliation exists.
- Full Stripe Checkout remains inactive.

## Intentionally Unchanged

- No product code was changed.
- No manuscript/book files were touched.
- No publish episode files were touched.
- No dependencies were added.
- No Prisma schema changes were made.
- No public styling or UI was modified.
- Existing untracked public image files were not staged.

## Recommended Next Action

- Keep the current manual scheduling and link-based donation/calendar flow as the source of truth, then choose one next integration slice: either persisted email delivery logging or staff-authenticated Google Calendar API sync.
