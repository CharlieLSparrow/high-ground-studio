# Coaching certification launch slice

## Outcome

Make the existing Quipsly coaching architecture operable as one calm journey for a coach and client:

1. Create a coaching relationship and scheduled Session.
2. Copy or system-share one client entry link.
3. Let the invited, verified email open the private engagement and exact live Session from browser or iPhone.
4. Capture independent high-quality local sources while the real-time room carries conversation.
5. Verify and align uploaded sources before transcription.
6. Review speaker attribution and transcript-derived notes, goals, and commitments.
7. Release a client-safe follow-up and shareable recording artifact without exposing private coach material.

This is a vertical integration slice over the canonical `CoachingEngagement`, `CoachingBooking`, `CallRoom`, participant, consent, recording, transcript, note, goal, task, output, and delivery records. It must not introduce a second coaching database or a mock recording system.

## Product boundary decision

Ship coaching as a first-class, phone-complete workspace inside **Quipsly Capture** now. Do not fork a duplicate Coaching app or codebase during this launch slice.

- A coach can discover and complete the full workflow from a dedicated Coaching home: set up, invite, schedule, call, capture, review, share, and follow through.
- A client uses the same application with a quieter role-aware surface: their coach, next Session, consent, join/record, shared notes, goals, tasks, and released recordings. Operator and private-coach controls stay absent.
- Native recording, identity, Session, upload, transcript, task, goal, notification, and design-system code should move behind shared feature/domain seams as it is touched. A future Quipsly Coaching target can therefore be a thin product shell instead of a fork.
- Create a separate App Store product only after coaching has materially different acquisition, onboarding, navigation, positioning, and release economics. Until then, a second near-identical bundle would split reviews, TestFlight, support, analytics, deep links, and engineering attention without improving the user's job.

The phone is not a companion remote. It is a complete coaching endpoint; browser and Mac surfaces add screen space, external-device control, and heavier editing, but must not be required to finish the core loop.

## Phone-only information architecture

1. **Today** — next Session, readiness, unresolved upload, commitments due, and one obvious continue action.
2. **Coaching** — clients, scheduling, invitations, engagement history, and client-safe follow-through.
3. **Record** — consent, sound/camera check, call transport, independent local master, upload safety, markers, and recovery.
4. **Work** — transcript, speaker correction, proposed notes/goals/tasks, playback, trim, release, and share.
5. **Account** — identity, devices, storage, calendar, privacy, support, and deletion/export controls.

The existing Library can remain while these workflows are integrated, but it must not become the place users need to understand database object types. The primary navigation should describe jobs, not implementation nouns.

## Today-critical acceptance path

- A signed-in coach can create a manual/free coaching appointment with client email, name, title, date, time, duration, and timezone.
- Creation returns the exact engagement and Session identities plus a client entry path.
- The UI immediately offers Copy and system Share for that path and explains that the verified invited email is the authorization boundary.
- The client can sign in with Google or a verified Quipsly email and see only their engagement, Sessions, shared goals/tasks, client-safe notes, and thread.
- Either party can open the same LiveKit Session lobby; joining never starts recording.
- Each participating browser/iPhone can retain its own source, upload resumably, and expose checksum/verification/sync evidence.
- Transcription remains gated on consent and verified source evidence and exposes speaker labels for correction.
- Transcript-generated notes, goals, and tasks remain proposals until explicitly accepted or edited.
- A released client follow-up is visible to the intended client and private coach notes remain excluded.

## Product priorities

### P0: invitation and scheduling handoff

- Collapse booking, engagement continuity, Session creation, and the client entry link into one result.
- Keep Google Calendar sync and email delivery optional. A failed provider action must never roll back the canonical appointment.
- Make client entry recoverable from every upcoming-booking card, not only immediately after creation.

### P0: recording truth

- Treat the call transport, independent local sources, and optional provider recording as different evidence.
- Never call a take safe until its local copy or server verification state is visible.
- Keep one source per participant/device and clock samples needed for alignment.

### P0: usable follow-through

- Put transcript, notes, goals, commitments, and client-safe output in the same Session/engagement journey.
- Prefer a small number of obvious actions and progressive disclosure over the existing operator-heavy runway.

### P1: recording share/export

- Provide a private playback/download surface backed by exact media identity and an access-checked delivery receipt.
- Start with source/master sharing and a simple trimmed range; preserve the non-destructive edit graph for richer edits.

### P1: instructor cohort

- Model certification instructor/student sharing as a scoped cohort or reviewer membership above engagements, not as broad Nest access.
- Ship only after the one coach/one client boundary is operated end-to-end.

## Release proof

A release is not ready because it builds. Before inviting the first certification cohort, retain evidence for:

- coach and client account creation/sign-in;
- invitation/link handoff and access isolation;
- two-device join and consent;
- simultaneous independent local sources of meaningful duration;
- interrupted upload recovery and exact verification;
- source alignment and audible sync review;
- speaker-attributed transcript correction;
- candidate note/task acceptance and editing;
- client-safe follow-up visibility and private-note exclusion;
- mobile-width usability and a physical iPhone run.
