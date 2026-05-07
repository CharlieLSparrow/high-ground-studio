# Donation And Calendar Link Result

Date: 2026-05-06

## Files Changed

- `.env.example`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/app/team/appointments/page.tsx`
- `apps/web/src/app/team/coaching-requests/page.tsx`
- `apps/web/src/lib/calendar-links.ts`
- `docs/deploy/donation-and-calendar-links.md`
- `docs/runbooks/local-dev.md`
- `docs/sessions/donation-and-calendar-link-result.md`

## Donation CTA Behavior

- Added `HGO_COACHING_DONATION_URL` as the lightweight contribution-link configuration surface.
- `/dashboard` now shows `Make a Pay-What-You-Can Contribution` when:
  - the env var is configured
  - and the client has a converted coaching appointment or another scheduled/completed appointment available in the current dashboard data
- The donation CTA opens in a new tab.
- If the env var is missing, the client-facing donation button is hidden.
- `/team/coaching-requests` shows whether the donation link is configured near converted appointment summaries.
- `/team/appointments` surfaces a small configured/missing donation indicator next to each appointment card.

## Calendar Link Behavior

- Added `buildGoogleCalendarEventUrl()` in `apps/web/src/lib/calendar-links.ts`.
- The helper generates a Google Calendar event-template URL with:
  - `text`
  - `dates`
  - `details`
  - `location`
  - optional `add` guest email
- `/dashboard` now shows `Add to Google Calendar` for:
  - converted coaching appointments in the coaching request section
  - appointment cards in the appointments section
- `/team/coaching-requests` now shows `Add to Google Calendar` for converted appointments.
- `/team/appointments` now shows `Add to Google Calendar` on each appointment card.
- This is link generation only. No Google API calls occur.

## Validation Performed

- Ran `pnpm --filter web exec tsc --noEmit`.
  - Result: passed.
- Ran `pnpm --filter web exec next build --webpack`.
  - Result: passed.
- Ran `pnpm --filter web build`.
  - Result: the local Turbopack build remained at `Creating an optimized production build ...` after a bounded wait and was interrupted, so it is documented as inconclusive rather than treated as a pass.
- Confirmed no manuscript/book files were modified.
- Confirmed no `apps/web/content/publish` files were modified.

## Known Limitations

- No payment records are stored.
- No Stripe webhooks are implemented.
- No Google Calendar OAuth or API sync exists.
- No automatic calendar updates or cancellations exist.
- Users must click the calendar link manually.

## Recommended Next Action

- Keep the donation link and calendar link flows as the lightweight production path for now, then add staff-authenticated Google Calendar API sync only after the manual link flow proves stable and useful in real scheduling work.
