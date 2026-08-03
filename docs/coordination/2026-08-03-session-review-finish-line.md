# Session review finish line

Date: 2026-08-03

## Outcome

Nest and Quipsly Capture now agree on when a transcript-derived candidate has
been handled and give the reviewer an explicit way out of the review queue.
This closes a real workflow dead end without turning a deferred proposal into
canonical work.

## Corrected semantics

- `ready` and `listen-first` candidates remain open and count as remaining.
- `deferred`, `accepted`, `merged`, and `rejected` candidates count as handled.
- Decided remains the narrower accepted/merged/rejected count.
- Deferred candidates remain noncanonical. They are excluded from client
  follow-up and Studio handoff until a person revisits and decides them.
- An empty packet is labelled `No candidates`; it is not misrepresented as a
  completed review.

## Product changes

### Nest

- The Session queue reports `Candidates handled` and truthful handled/remaining
  counts.
- Once every candidate is handled, it shows a `Review queue handled` finish
  card and an explicit `Continue to Outputs` handoff.
- The completion card is ordinary semantic content rather than a live status
  region, avoiding duplicate screen-reader announcements alongside mutation
  receipts.

### Quipsly Capture

- The native review queue uses the same handled semantics and accessibility
  label as Nest.
- A completed queue explains the deferred boundary and offers `Done reviewing`
  to return to the previous surface.
- The finish action does not create a note, task, goal, message, calendar event,
  Studio edit, delivery, or publication.

## Operated local evidence

The retained local Nest app at `http://127.0.0.1:3012` was operated as a real
signed-in coach against Session `retained-coaching-follow-up-20260731`:

1. Opened the Session transcript surface.
2. Confirmed an empty packet rendered `No candidates` after the correction.
3. Built a real review packet from the retained transcript.
4. Deferred its source-linked `Next-session prep` note candidate.
5. Read back the persisted receipt stating no canonical note, task, goal,
   message, or calendar event was created.
6. Confirmed handled progress `1/1`, deferred `1`, decided `0`, and the finish
   explanation.
7. Followed `Continue to Outputs` into the same Session's real Outputs surface.

At a 390 x 844 viewport, the review surface had no horizontal overflow
(`scrollWidth` and viewport width were both 390), exposed handled progress
`1/1`, retained the deferred-exclusion explanation, and linked to the exact
Session Outputs URL. Browser console error count was zero.

The local packet build and defer receipt are intentional retained QA artifacts.
They created no canonical follow-up or external side effect.

The compiled native transcript-review journey ran on an iPhone 17 Pro simulator
with iOS 26.3.1. It operated the candidate queue plus preview, playback-review,
speaker-attribution, note, task, and goal truth boundaries and passed one test
with zero failures in 78.664 seconds. The successful result bundle is retained
at:

`/Volumes/My Passport/Quipsly QA Artifacts/Session Review Finish Line 2026-08-03/HighGroundCapture-session-review-finish-line.xcresult`

The native preview journey exercises the queue and compiles the finish state;
the exact native handled finish state is source-contract covered rather than
claimed as operated UI evidence in this checkpoint.

## Automated verification

- Focused Nest Jest: 2 suites, 47 tests passed.
- Quipsly strict TypeScript check passed.
- Mobile Capture source contract passed.
- Capture App Store static gate: 1,015 of 1,015 checks passed.
- Xcode operated UI test: 1 passed, 0 failed.
- Scoped diff check passed before documentation; the final repository diff is
  checked again before commit.

## Boundary

This is local web and simulator evidence, not physical-iPhone, TestFlight, or
production proof. No Cloud Build, deployment, production database write,
provider mutation, invitation, message, calendar mutation, Studio edit,
delivery, publication, or App Store action occurred.
