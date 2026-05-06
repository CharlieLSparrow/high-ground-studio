# SMS Opt-In Terms Page Result

## Files changed
- `apps/web/src/app/sms-opt-in/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `docs/sessions/sms-opt-in-terms-page-result.md`

## New route
- Added public route `/sms-opt-in`.
- The page explains text message opt-in, frequency, rates, opt-out, help, privacy, and the current High Ground coaching opt-in flow.
- Added direct links back to `/coaching` and `/dashboard?intent=coaching`.

## Dashboard disclosure behavior
- Added a compact disclosure block to the dashboard coaching request form.
- The disclosure appears near the preferred contact method and phone fields.
- It explains text consent, message/data rates, STOP/HELP language, and carrier disclaimer.
- It includes a link to `Text Message Opt-In Terms` at `/sms-opt-in`.

## Validation performed
- Ran `pnpm --filter web build`.
- Confirmed no manuscript or book files were modified.
- Confirmed no publish episode files were modified.

## Known limitations
- Not reviewed by a lawyer.
- No SMS sending yet.
- No stored SMS consent timestamp beyond the existing coaching request record.
- No STOP/HELP webhook handling yet.

## Recommended next action
- Once Twilio sending is active, review the exact consent copy and webhook behavior against the chosen Twilio messaging product and final operational workflow.
