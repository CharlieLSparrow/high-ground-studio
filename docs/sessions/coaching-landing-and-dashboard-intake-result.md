# Coaching Landing And Dashboard Intake Result

## Files Changed
- `apps/web/src/app/coaching/actions.ts`
- `apps/web/src/app/coaching/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `docs/sessions/coaching-landing-and-dashboard-intake-result.md`

## `/coaching` Changes
- Removed the embedded public intake form.
- Refactored `/coaching` into a classic single-CTA landing page.
- Added a hero section with:
  - eyebrow: `Coaching with Scott Sparrow`
  - simplified headline and supporting copy
  - donation-supported credentialing explanation
  - one primary CTA: `Book a Session`
- Added a right-side hero image placeholder block sized and styled like a real hero asset area.

## Dashboard Changes
- Added support for `intent=coaching` and `coaching=requested` search params on `/dashboard`.
- Added a prominent coaching request panel near the top of the dashboard when the coaching intent is active.
- The dashboard coaching panel contains only:
  - preferred contact method
  - phone number (optional)
  - optional note
- Reused the existing coaching request persistence flow instead of introducing a second request-creation path.

## CTA Flow Behavior
- Signed-out users clicking `Book a Session` go to sign-in with callback:
  - `/dashboard?intent=coaching`
- Signed-in users clicking `Book a Session` go directly to:
  - `/dashboard?intent=coaching`
- Dashboard submit now redirects to:
  - `/dashboard?coaching=requested`
- The dashboard shows a success banner after submit.

## Validation Performed
- Ran `pnpm --filter web build`
- Confirmed no manuscript/book files were modified.
- Confirmed no publish episode files were modified.

## Known Limitations
- `/coaching/requested` still exists, but the main intake path now resolves through the dashboard success state instead of that public thank-you page.
- Dashboard does not yet show prior coaching request history or status cards in this pass.
- No SMS, payment, or donation processing was added.

## Recommended Next Action
Add a small dashboard coaching status card that shows the user’s most recent request state and any linked appointment so the request flow feels complete after the initial submission.
