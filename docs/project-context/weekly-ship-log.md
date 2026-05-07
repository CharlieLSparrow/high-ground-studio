# Weekly Ship Log

This is a lightweight proof-of-progress artifact Chuck can show Homer.

It should make the week visible without turning progress into a parade float.

Use it to answer:
- Book / Episode Progress
- Revenue Progress
- Content Engine Progress
- Decisions Needed From Homer
- What Shipped
- What Remains Manual
- Next Week's Focus

Priority rule:
- Every week should show visible movement in Book & Episodes unless a true emergency blocks it.
- Content-engine work must explain how it helps writing, episode prep, publishing, recording, or revenue.

## Weekly Template

```md
## Week Of YYYY-MM-DD

### Headline

One plain sentence about the week.

### Book / Episode Progress

- What moved in book writing, episode prep, recording, publishing, or story decisions.
- If nothing moved, say why and name the blocker.

### Revenue Progress

- Coaching, offers, donation, merch, memberships, paid content, or audience-to-revenue progress.

### Content Engine Progress

- Tooling or workflow work, with one sentence explaining how it serves writing, episode prep, publishing, recording, or revenue.

### Decisions Needed From Homer

- One to three decisions or reviews.

### What Shipped

- Thing shipped: why it matters. Commit: `<hash or link>`

### What Remains Manual

- Honest list of work still done by people or external tools.

### Blocked Or Waiting

- Decisions, credentials, production setup, review, or content approval.

### Next Week Focus

- The likely next useful slice.
```

## Week Of 2026-05-04

### Headline

The coaching path moved from "promising front door" to a clearer, documented operating workflow with manual scheduling, contribution links, and safer handoffs.

### Book / Episode Progress

- Episode 6 recording checkpoint captured after recording started and paused for camera battery; full reconciliation waits until recording is complete.
- Story Map view added so Homer can see his book's stories as planning cards.
- Story Candidate terminology introduced to bridge chapters and episodes.
- Episode 7 Story Candidates can now be reviewed outside the Playground sequence without becoming manuscript blocks.
- Story Candidate layer defined as the natural unit between chapters and episodes.
- Playground language updated so virtual chunks appear as Story Candidates, not canonical blocks.
- Book-wide Story Candidate map created to guide future episode splits from Homer's manuscript.
- Episode 7 virtual chunk cards added to Playground so Chapter Three can be planned before splitting manuscript prose.
- Episode cards and Playground now show readable Homer/book text previews so arranging starts from the book instead of metadata.
- Oversized block cues added so large Homer sections are easier to identify before splitting.
- Episode 7 / Chapter Three virtual split plan created without changing manuscript prose.
- Future episode seed map created to flag oversized Homer blocks and guide Playground/manual split work.
- Episode 7+ brainstorm cards seeded from Homer chapter/ending blocks so future Episode Playground work starts from book text instead of stale low-confidence splits.
- Episode View now includes a non-canonical Playground subview so Chuck can test and copy possible episode sequences without writing manuscript, arrangement, production-state, publish, or public page files.
- Episode 5 recorded-draft review created from the clean `values-toolkit` Draft View.
- Episode 5 show-note prep packet created without publishing or promoting parked research/clips.
- Episode 6 post-recording reconciliation scout created to prepare the next production-state update without prematurely normalizing Episode 6.
- Episode 5 Draft View state now aligns with the clean `values-toolkit` sequence while intake/research/clip/production questions remain in Everything View and unresolved decisions.
- Episode 5 `values-toolkit` candidate arrangement added and Episode 5 production state now points at the clean internal sequence while broad `values` remains for Episode 6/later Chapter Two work.
- Episode 5 arrangement plan created to prepare a clean `values-toolkit` candidate sequence after narrow Charlie normalization.
- Episode 5 narrow normalization added four approved Charlie/reflection blocks while preserving Homer baseline prose and leaving research, clips, production notes, arrangements, and Episode 6 untouched.
- Episode 5 approval matrix created so Homer/Charlie can approve, park, revise, or reject proposed blocks before canonical manuscript edits.
- Episode 5 normalization dry run created so the next manuscript edit can be scoped and reviewed before canonical changes.
- Episode 5 review packet created from the hardened cockpit and structured intake; it prepares the next manuscript normalization pass without changing canonical manuscript truth yet.
- The internal Learning to Lead viewer now has the first read-only Episode production cockpit slice: file-backed Season One state, lifecycle badges, episode selection, Everything/Draft subviews, source/intake references, unresolved decisions, warnings, and YAML-selected draft items.
- Episode 5 is the first full fixture because it is recorded and classified; Episode 6 is visible as pre-recording/pending post-recording review rather than being treated as final.
- This moves Book & Episodes by making production truth visible for prep and normalization decisions. It does not mean Episode 5 was normalized into the living manuscript, and it does not publish public episode pages.
- Episode View now has a documented production-cockpit design: Everything View for all candidates, Draft View for curated episode drafts, and lifecycle stages from Brainstorm through Live.
- This is Book & Episodes architecture work that supports episode prep and publishing. It is not a substitute for actual writing, recording, editing, or Episode 5 normalization.
- The latest raw OneNote exports for Episodes 1-6 are now inventoried as tracked staging truth under `_inbox`.
- Episode 5 and Episode 6 have structured intake classification files that separate Homer baseline candidates, Charlie material, research/field notes, clip candidates, production notes, and unresolved decisions.
- Episode 5 is now the next clean living-manuscript normalization candidate if Homer/Charlie accept the classification; Episode 6 should be reviewed after recording before final normalization.
- Production truth was corrected again using the real Season One state: Episodes 1-5 are recorded, and Episode 6 is prepped for recording on 2026-05-08.
- Repo state now needs OneNote reconciliation for Episodes 5-6, plus an Episode 4 review to confirm recorded/prepped cues did not drift beyond the incorporated living-manuscript blocks.
- This prevents the content engine from optimizing against stale production data or polishing future episode splits that may need to be rebuilt.
- No direct book-writing or podcast episode-prep artifact shipped in this slice.
- That is the important warning from this addendum: coaching and infrastructure made progress, but next week should show visible Book & Episodes movement unless a true emergency blocks it.
- Likely next move: choose the next book or episode production artifact and make one concrete writing/prep commit before pulling more infrastructure work.
- Follow-up verification found Chapter One is already split into reusable Early Days Homer blocks and arranged for book/podcast use; no duplicate split was made. This is structural production readiness, not a polished chapter or recorded episode.
- The next clean Book & Episodes move is Episode 5 intake incorporation using the Episode 4 pattern.

### Revenue Progress

- Coaching now has a clearer request-to-appointment operating path.
- Donation-supported coaching has an external contribution-link path via `HGO_COACHING_DONATION_URL`.
- Company family support now has a public request/contribution surface.
- Internal Resend notifications help the team respond to revenue-adjacent requests without blocking the user path.

### Content Engine Progress

- The coaching/docs sync made the repo memory safer, but this is supporting work, not the main event.
- Future content-engine work should be justified by how it helps write books, prepare episodes, publish/record, or create revenue.

### Decisions Needed From Homer

- Review whether the public coaching language feels like Homer.
- Decide whether the next integration priority is email delivery logging, Google Calendar sync, or SMS/Twilio.
- Pick the next Book & Episodes slice that should visibly move next week.

### What Shipped

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

### Next Week Focus

- Move one concrete Book & Episodes artifact first, then choose one narrow revenue-supporting integration slice only if the writing/episode lane is not being starved.
