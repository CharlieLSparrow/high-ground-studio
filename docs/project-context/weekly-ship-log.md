# Weekly Ship Log

This is a lightweight proof-of-progress artifact Chuck can show Homer.

It should make the week visible without turning progress into a parade float.

Use it to answer:
- what shipped
- what changed
- what is safer now
- what remains manual
- what is blocked
- what help or decision is needed from Homer
- what next week is for

## Weekly Template

```md
## Week Of YYYY-MM-DD

### Headline

One plain sentence about the week.

### Shipped

- Thing shipped: why it matters. Commit: `<hash or link>`

### What Changed

- Product, docs, workflow, or operational changes that are now true.

### What Is Safer Now

- Build stability, clearer docs, reduced ambiguity, better fallback behavior, or safer handoff.

### What Remains Manual

- Honest list of work still done by people or external tools.

### Blocked Or Waiting

- Decisions, credentials, production setup, review, or content approval.

### Help Needed From Homer

- One to three decisions or reviews.

### Next Week Focus

- The likely next useful slice.
```

## Week Of 2026-05-04

### Headline

The coaching path moved from "promising front door" to a clearer, documented operating workflow with manual scheduling, contribution links, and safer handoffs.

### Shipped

- Synced coaching workflow docs to match current code truth: request flow, dashboard status, internal queue, appointment conversion, donation links, calendar links, Resend email, dormant SMS, and inactive Stripe Checkout. Commit: [`85d6f88`](https://github.com/CharlieLSparrow/high-ground-studio/commit/85d6f885d9652feaf1db64c657ffc2d6dbdde1d2)
- Added the company family support page with request capture and best-effort internal email notification. Commit: [`bf18acf`](https://github.com/CharlieLSparrow/high-ground-studio/commit/bf18acfe32f637ccd99bb4ac1bcff50d07d15803)
- Finished a coaching page copy pass centered on Homer, a simpler request path, and donation-supported coaching language. Commit: [`1129068`](https://github.com/CharlieLSparrow/high-ground-studio/commit/1129068d16c7e96aef6e2a5d00fa83e7d6fc2059)
- Added lightweight coaching donation and Google Calendar links without pretending full payment or calendar sync exists. Commit: [`47d2c1b`](https://github.com/CharlieLSparrow/high-ground-studio/commit/47d2c1b7e815fc90ffedd1649486f1242cff600d)
- Added request-to-appointment conversion so internal team users can turn a coaching request into a scheduled appointment. Commit: [`27f5032`](https://github.com/CharlieLSparrow/high-ground-studio/commit/27f5032b3cde4aec8c498ada74b6119a28ac758c)

### What Changed

- `/coaching` is a public front door and sign-in handoff.
- Signed-in users request coaching from `/dashboard?intent=coaching`.
- `/dashboard` shows recent coaching requests and converted appointment summaries.
- `/team/coaching-requests` is the internal request queue and conversion surface.
- `/team/appointments` remains the general appointment management screen.
- Donation support is an external pay-what-you-can link controlled by `HGO_COACHING_DONATION_URL`.
- Google Calendar support is generated event-template links only.
- Internal email notifications use Resend and do not block request creation.

### What Is Safer Now

- Docs now state clearly that full Stripe Checkout is not active.
- Docs now state clearly that SMS/Twilio is not wired into the current coaching flow.
- Calendar behavior is documented as link-only, not API sync.
- New agent handoff docs point future Codex work toward the right files and risks.
- Recent validation showed TypeScript and the Next.js webpack build passing for the coaching docs sync.

### What Remains Manual

- Homer or the team still follows up personally after a coaching request.
- Calendar events are created manually from generated Google Calendar links.
- Donations happen through an external contribution link.
- Email delivery has no persisted log or retry queue.
- SMS sending, STOP/HELP handling, and Twilio production behavior are not active.
- Stripe Checkout and webhook reconciliation are not active.

### Blocked Or Waiting

- Production environment values still need to be managed outside docs.
- Google Calendar API sync needs an explicit decision before account/OAuth work begins.
- SMS/Twilio needs an explicit operational decision before wiring.
- Public field-guide docs need review before any website route is created.

### Help Needed From Homer

- Review whether the public coaching language feels like Homer.
- Decide whether the next integration priority is email delivery logging, Google Calendar sync, or SMS/Twilio.
- Confirm whether the donation-supported wording is clear enough for real visitors.

### Next Week Focus

- Turn the documentation and kanban model into a practical weekly rhythm, then choose one narrow integration slice to make the coaching workflow safer.
