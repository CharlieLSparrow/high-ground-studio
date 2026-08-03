# Coaching note candidate review

Status: implemented and locally verified on 2026-08-03.

## Product contract

Transcript-derived coaching notes are suggestions until one authenticated actor explicitly accepts one. Each candidate now supports the same four decisions as transcript-derived tasks and goals:

| Decision | Canonical note | Review receipt | Playback review required |
| --- | --- | --- | --- |
| `EDIT` | No | Yes | No |
| `DEFER` | No | Yes | No |
| `REJECT` | No | Yes | No |
| `ACCEPT` | Exactly one | Yes | Yes, for every segment in the evidence span |

Editing preserves a reviewed draft of the title, body, purpose, and audience. Rejecting or deferring preserves the candidate and the decision. None of those decisions creates a task, goal, reminder, calendar event, message, delivery, Studio edit, or publication.

## Evidence and concurrency boundary

Every decision rechecks, inside one serializable transaction:

- current Session mutation access and production-team note authority;
- current packet summary, packet build, transcript job, recording asset, and lane candidate;
- the provider-processing release gate;
- the packet template and complete transcript snapshot;
- the immutable multi-segment evidence span and provider hashes; and
- protected playback availability.

The packet source is protected by the transcript-packet advisory lock and a row lock. A successful acceptance creates the revisioned canonical note and appends its review receipt in the same transaction. A repeated exact acceptance returns the original note; a changed acceptance conflicts instead of silently mutating it.

## Privacy boundary

Review receipts are append-only packet evidence, but the note-candidate projection selects receipts only when `reviewedByUserId` matches the current actor. Another collaborator's private edit, rejection, or deferral cannot become the current actor's candidate state. Canonical note visibility remains an explicit choice: author private, Session shared, client safe, or project team where the actor has the required role.

## Verification evidence

- Focused API, projection, request-model, and UI suites: 61 passing tests.
- Full Nest Jest run: 244 passing suites and 1,296 passing tests (37 suites and 108 tests intentionally skipped by their existing gates).
- Cross-surface Quipsly contracts: 254/254 passing.
- Strict Quipsly TypeScript check: passing.
- Optimized Next.js production build: 163/163 pages generated with an explicit 8 GB Node heap. The default 4 GB heap compiled successfully but exhausted memory during its TypeScript phase.
- Coverage includes provider-only refinement without materialization, multi-segment acceptance, actor-isolated receipt projection, accepted-note receipt binding, stale packet refusal, and edited-draft UI behavior.

The retained local Nest was also operated through the rendered UI with the test-only retained coach account. Quipsly built a packet from synthetic coaching media, saved an edited client-follow-up draft, and read the exact title/body back. PostgreSQL readback showed one `EDIT` receipt for the actor and zero canonical notes for that candidate. Because the complete source span was not yet playback-reviewed, the rendered canonical-save control remained disabled.

## Compiled iPhone materialization acceptance

The follow-through operator now continues that evidence through the complete
human-reviewed path. It clones the immutable retained recording, current
consent, transcript, and release evidence into one newly labelled local Session,
verifies the source bytes by SHA-256, and installs the exact source into the
authenticated simulator partition through the DEBUG-only XCTest bridge.

On iPhone 17 Pro / iOS 26.3.1, the compiled app then:

1. played all three immutable segments in the complete source thought;
2. appended and read back three playback-verification receipts;
3. rebuilt the stale packet as a new append-only snapshot;
4. edited the client-follow-up note title and body without materializing work;
5. re-opened and verified that exact draft from Nest;
6. separately accepted it as one source-linked canonical Session note;
7. separately created the exact-source goal; and
8. returned to Today and read the same canonical goal.

The retained Session is
`qa-reviewed-packet-1785763000931-7bd17dfb`. The XCTest artifact is
`/private/tmp/quipsly-reviewed-packet-materialization-1785763001284-54730.xcresult`
and reports 1/1 passed. Independent packet and PostgreSQL readback proved:

- 3 playback receipts bound to `qa-reviewed-packet-1785763000931-7bd17dfb-asset`
  and reaching their immutable segment ends;
- canonical note `transcript-note-7e260abebc56933893911d6e` with the exact
  edited draft and complete three-segment source identity;
- canonical goal `transcript-goal-5b7abc40f149e6617a545e9d`;
- 0 tasks and 0 calendar links; and
- the accepted note/goal packet projections resolving to those same canonical
  IDs.

The operator's first post-XCTest GET encountered a transient local `EPIPE` even
though Nest remained healthy and every mutation had returned 200. Independent
bounded-retry readback immediately passed. The operator now retries only safe
GET requests three times; it never retries a potentially ambiguous POST.

## Defects found by doing the work

- Canonical candidate IDs exceeded XCTest's 128-character identifier limit.
  Capture now hashes the full canonical identity into a stable bounded UI key
  while preserving the full ID for API and persistence identity.
- The runtime test looked for the note lane with an imprecise substring and
  could select the wrong candidate. It now matches the exact lane prefix plus
  source text.
- A shared swipe helper selected the hidden Record scroll view below the pushed
  Transcript screen. It now prioritizes the visible, hittable Transcript review
  surface.
- The compact-screen edit form could leave the title keyboard covering the note
  body. The form now dismisses on scroll, provides Title-to-Note focus, and
  exposes a dedicated keyboard Done control.
- XCTest's Command-A/Delete can leave SwiftUI text intact, and long multiline
  accessibility values can arrive in truncated chunks. The operator now proves
  the live binding is empty and clears bounded chunks before entering replacement
  text, preventing accidental prefix/append corruption.
- `AVAudioPlayer` can end playback between the enabled-state render and a human
  confirmation tap. Capture now retains a per-anchor verified terminal position
  for the active recording generation and submits that stable evidence.

## Final verification for this slice

- note and packet route tests: 22/22 passed;
- cross-product contract suite: 257/257 passed;
- mobile Capture source contract: passed;
- retained operator static contract: passed;
- Quipsly strict TypeScript: passed;
- generic iOS Simulator build-for-testing: passed;
- compiled retained note-and-goal operation: 1/1 passed;
- focused note-review preview journey: 1/1 passed in
  `/private/tmp/quipsly-packet-note-preview-final-1785763300.xcresult`;
- shell syntax and `git diff --check`: passed.

No production database, Cloud Build, Cloud Run revision, TestFlight build,
App Store record, physical iPhone, Google provider, invitation, message,
delivery, Studio source, or publication was mutated.
