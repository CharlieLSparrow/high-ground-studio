# Coaching cohort release acceptance

Date: 2026-08-19
Status: active release gate

## The standard

Quipsly Coaching is ready for a cohort only when a coach and client who did not
help build the product can complete the ordinary product journey with little or
no instruction. The acceptance scenario is a release to 50 coaches at once,
not a guided demonstration to one retained QA account.

Hard-coded Episode, Session, project, user, or invitation identifiers are
regression fixtures. They are useful for repeatable recovery, upgrade, and
longitudinal checks, but they cannot satisfy this release gate.

## Two distinct test lanes

### Regression lane

The retained dogfood corpus and scripted source-contract tests may:

- seed dedicated QA identities and known records;
- open a known Session or recording directly;
- preserve longitudinal artifacts between runs;
- verify data recovery, access isolation, schema compatibility, and rendering.

Those checks answer, "Did a known capability regress?" They do not answer,
"Can a new coach discover and use Quipsly?"

### Fresh-user acceptance lane

Every candidate release must also use:

- a newly provisioned coach identity with no preselected project or Session;
- a separate client identity invited through the ordinary coach UI;
- links copied from the rendered product, not assembled from database IDs;
- ordinary navigation from the coaching home;
- no direct database edits after the journey begins;
- no operator explanation beyond the invitation and a one-sentence request to
  use Quipsly for the coaching relationship.

If setup requires an administrator, that setup must be cohort-capable, visible,
idempotent, and completed before coaches receive their link. A shared password,
manual role repair per coach, or hidden test route is a release failure.

## Fresh coach and client journey

Record a pass, friction, or failure for every numbered step.

1. An administrator prepares a batch containing the fresh coach email.
2. The coach opens the supplied `/login?callbackUrl=/coaching` link and signs in
   with Google or their own Quipsly email.
3. Quipsly lands on Coaching, shows a useful empty state, and explains the next
   action without mentioning fixtures, Patreon internals, or staff repair.
4. The coach creates a client relationship and sends an invitation from the
   normal UI.
5. The client opens that exact invitation while signed out, understands who
   invited them and what access will be granted, signs in with the invited
   identity, accepts, and reaches the lobby. The invitation must not grant the
   surrounding Nest.
6. Coach or client schedules the next Session, confirms time and timezone, and
   can see the appointment in the shared space.
7. Both participants open the lobby, select and preview microphone, camera, and
   output, understand consent, and join without starting a recording silently.
8. Each participant records a local high-quality source while the real-time call
   remains usable. Disconnect, refresh, backgrounding, and delayed upload have
   visible recovery states.
9. Quipsly uploads and associates sources with one Session timeline, retains
   provenance and sync evidence, and never represents an unverified upload as
   safe.
10. The Session produces a speaker-attributed transcript with confidence or
    review visibility. A person can correct speaker assignment and text without
    changing the immutable media source.
11. Coach and client can create, edit, assign, complete, and find shared notes,
    tasks, and goals from the Session. Suggested outputs remain reviewable until
    a person accepts or edits them.
12. A permitted user can make a light edit, preview the result, and share the
    selected recording and transcript with an explicit audience. Revocation and
    privacy state must remain understandable.
13. Both users can return later from ordinary Coaching navigation and find the
    relationship, Session, recording, transcript, notes, tasks, and goals.

## Cohort-scale checks

Before inviting 50 coaches:

- provision a mixed batch of new and existing emails and verify exact created,
  refreshed, and failed counts;
- rerun the same batch and prove it is idempotent;
- prove one coach cannot discover another coach's clients or Sessions;
- prove one client cannot reach the coach's Home Nest or unrelated clients;
- exercise expired, revoked, already-used, wrong-account, and resent invites;
- verify support diagnostics identify the exact identity, access grant, Session,
  recording, upload, transcript, and share state without exposing private media;
- verify mobile layouts, VoiceOver/keyboard focus, slow-network states, and
  recovery copy on the critical journey;
- keep a rollback path and an auditable receipt for every cohort access change.

## Evidence required for a release claim

A green build or seeded script is not enough. The release note must name:

- the candidate commit and environment;
- the fresh coach and client QA identities (never their passwords);
- the UI-created relationship, invitation, and Session receipts;
- call/capture duration, source count, upload verification, and sync result;
- transcript attribution and correction result;
- notes, tasks, goals, light-edit, and share readback;
- privacy negative tests;
- every remaining friction point and its severity.

The retained regression lane should continue to run. It complements this gate;
it never replaces it.

## Implementation checkpoint — 2026-08-19

- Ordinary Coaching and Session surfaces no longer name retained people,
  retained Episodes, or the `.dev.test` reviewer preset.
- Unsigned coaching and Session links preserve the exact destination through
  sign-in; Session invitation review is outside the general beta gate.
- Active Session or coaching-engagement grants can enter their narrow product
  surface without a Patreon or broad Nest grant. Route-level authorization
  continues to enforce the actual Session and relationship boundary.
- Administrators can prepare up to 100 coach identities in one idempotent batch
  without creating shared passwords. A dedicated admin-only test-login card
  remains separate from this cohort path.
- First-time coach setup is first on narrow screens, detects the device timezone,
  and does not require a price or Stripe configuration.
- The full optimized Quipsly production build passed after repairing the Nest
  settings page to await Next.js 16 route parameters.
- The generated coaching API regression now begins as a non-staff user, uses
  the ordinary self-service coach setup action, labels itself
  `api-regression`, and reports `humanAcceptanceSatisfied: false`. It no longer
  elevates its generated coach to OWNER or silently stands in for this gate.
- That regression exposed and repaired a cohort-blocking role leak: `COACH`
  had been included in the broad Studio authority helper, which made every
  coach `isStaff` and exposed cross-coach runway data. Product entry is now
  intentionally broader than Studio/staff authority. A coach can enter
  Quipsly, while only OWNER and TEAM_SCHEDULER retain the global Studio bypass.
- A local canonical-data run passed for an ordinary generated coach and a
  separate client: self-service setup, hold/release, booking conversion,
  client visibility, payment hold, private calendar export, consent
  decline/grant, recording unlock, reschedule, cancel, and exact generated
  artifact cleanup. The runner also has a narrowly validated interrupted-run
  recovery command for eight-character generated suffixes.

This checkpoint proves source, route, and build readiness. It does not yet claim
the fresh coach/client journey or real call/capture/share journey has passed;
those still require the operated evidence listed above.

## Rendered UI automation checkpoint — 2026-08-19

Test lane: `ui-automation`

Human acceptance satisfied: **no**

An isolated ordinary coach and separate client were created with generated,
verified credentials and operated through the rendered local product. No staff
role, known Session ID, retained project, database mutation, or QA login shortcut
was used after sign-in.

The operated run proved:

- the new coach signed in through the ordinary coaching callback;
- coach setup was completed from the rendered first-run form;
- the coach scheduled a real coaching Session for the separate client;
- Quipsly returned the exact private Session handoff and both identities could
  open the same room without surrounding staff or Nest authority;
- the live room now places microphone/camera/call controls first, keeps iPhone
  handoff visible, and collapses source-retention diagnostics behind an explicit
  troubleshooting disclosure;
- the client created a Session-shared task and goal through the rendered Work
  surface;
- the coach read the same task as work created by another participant and could
  not open it as if they owned it;
- the coach created a client-safe note and the client read the same canonical
  note as read-only with the coach attribution intact;
- ordinary accounts no longer see staff test lanes, Admin Users, or auth
  diagnostics on the account-switch surface.

The operation also found and repaired first-run friction that contract tests did
not reveal: Quipsly now pre-fills the known coach identity, proposes a useful
next-day Session time, treats payment as optional rather than a mandatory-looking
journey step, and keeps the appointment controls ahead of diagnostics on narrow
screens.

This is stronger evidence than an API smoke but still does not satisfy the
novice-human gate. It did not prove invitation-token acceptance, a two-endpoint
media call, local high-quality capture, upload/sync, transcript generation and
correction, light editing, sharing/revocation, accessibility, or 50-coach load.
