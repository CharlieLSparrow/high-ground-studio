# Coaching Request To Appointment Result

Date: 2026-05-06

## Files Changed

- `apps/web/src/app/team/coaching-requests/actions.ts`
- `apps/web/src/app/team/coaching-requests/page.tsx`
- `docs/sessions/coaching-request-to-appointment-result.md`

## Action Behavior

- Added `convertCoachingRequestToAppointmentAction`.
- Access is gated through the existing `canManageAppointments()` scheduler permission path.
- The conversion action:
  - requires `coachingRequestId`
  - requires `coachUserId`
  - validates `scheduledStart` and `scheduledEnd`
  - validates that end is after start
  - validates the submitted IANA time zone string
  - validates that the selected coach is a real app user with the `COACH` role
  - blocks conversion if the request already has `convertedAppointmentId`
  - blocks conversion for `CLOSED` and `DECLINED` requests
  - creates an `Appointment` for the request client user
  - sets the request to `SCHEDULED`
  - stores `assignedCoachUserId`
  - stores `convertedAppointmentId`
  - appends any submitted scheduling note onto request `internalNotes`
  - stores the same scheduling note on appointment `notes`
  - revalidates `/team/coaching-requests`, `/team/appointments`, and `/dashboard`
- Added a narrow `setCoachingRequestStatusAction` for `CONTACTED`, `CLOSED`, and `DECLINED`.
- Kept `updateCoachingRequestAction` focused on assigned-coach changes and internal notes.

## UI Changes

- Reworked `/team/coaching-requests` so each request can be converted directly into an appointment.
- Added a `Schedule appointment` form when the request is not already converted and is not `CLOSED` or `DECLINED`.
- Reused the existing appointment field shape:
  - coach
  - start
  - end
  - time zone
  - location type
  - location details
  - internal scheduling note
- Added quick internal actions:
  - mark contacted
  - mark closed
  - mark declined
  - save internal notes
- When a request is already converted, the page now shows an appointment summary and a link to `/team/appointments`.
- `/dashboard` already showed converted appointment summary, coach, and appointment status, so no dashboard code change was needed.

## Validation Performed

- Ran `pnpm --filter web build`.
  - In this environment, the default Next 16 Turbopack build entered `Creating an optimized production build ...` and did not complete after an extended wait, so it was interrupted rather than reported as a false success.
- Ran `pnpm --filter web exec next build --webpack`.
  - Result: passed.
- Ran `pnpm --filter web exec tsc --noEmit`.
  - Result: passed.
- Confirmed no manuscript/book files were modified.
- Confirmed no `apps/web/content/publish` episode files were modified.

## Known Limitations

- No calendar invite/email is sent yet.
- No Google Calendar integration yet.
- No donation/payment button yet.
- No SMS notification yet.
- No direct appointment detail page exists beyond `/team/appointments`.
- The default Turbopack build path still needs separate investigation in this local environment.

## Recommended Next Action

- Keep this request-to-appointment flow as the manual scheduling source of truth, then wire notifications and calendar sync on top of the new `convertedAppointmentId` link instead of inventing a second scheduling path.
