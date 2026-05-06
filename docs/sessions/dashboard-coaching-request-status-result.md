# Dashboard Coaching Request Status Result

## Files changed
- `apps/web/src/app/dashboard/page.tsx`
- `docs/sessions/dashboard-coaching-request-status-result.md`

## Dashboard query behavior
- The dashboard now fetches up to 5 coaching requests for the signed-in user.
- Requests are ordered newest first.
- The query includes assigned coach and converted appointment data when present.
- Existing membership and appointment queries remain intact.

## Status section behavior
- Added a permanent `Your Coaching Requests` section to the dashboard.
- If the user has no requests, the section shows a friendly empty state and a `Request Coaching` action.
- If the user has requests, the newest request is shown most prominently with:
  - friendly status label
  - requested date
  - last updated date
  - preferred contact method
  - phone if present
  - optional note when the user actually provided one
  - assigned coach when present
  - appointment summary when the request has been converted
- Older recent requests are listed in a lighter secondary area.
- Users with an existing request also see a modest `Request another session` action.

## Success state behavior
- The existing `coaching=requested` success banner remains in place.
- After a successful submit, the request form is hidden by default.
- The user lands on the success banner plus the new status section so the submitted request is immediately visible.
- The form still appears when the user explicitly visits `/dashboard?intent=coaching`.

## Validation performed
- Ran `pnpm --filter web build`.
- Confirmed no manuscript or book files were modified.
- Confirmed no publish episode files were modified.

## Known limitations
- No payment or donation button yet.
- No SMS notification yet.
- No request-to-appointment conversion UI yet.
- Coaching request status changes still happen from `/team/coaching-requests`.

## Recommended next action
- Add a lightweight appointment-conversion flow in `/team/coaching-requests` so scheduled requests can become real appointments without leaving the queue.
