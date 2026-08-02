# Versioned transcript evidence spans — 2026-08-02

## Outcome

Quipsly coaching and podcast packets now reason over bounded, deterministic
thought spans instead of assuming every provider transcript segment is a
complete thought. A goal, note, or action suggestion can reference multiple
ordered immutable segments while retaining the first segment as its stable
playback deep link.

The change repaired a defect found by operating the retained synthetic
coaching Session: the previous packet proposed a goal ending in `and` because
the provider split one sentence across three segments. Packet v4 now presents
the complete 00:06–00:17 sentence and discloses that it spans three immutable
transcript segments.

## Architecture and safety boundary

- Thought joining is deterministic and bounded to one speaker, a 1.5-second
  maximum gap, 6 segments, 45 seconds, and 1,600 characters. Terminal
  punctuation closes a thought unless the text still has an explicit
  connective boundary.
- Every span carries ordered segment IDs, the complete effective text,
  SHA-256 of that text, the union time range, and a versioned
  `quipsly-transcript-source-span-v1` receipt.
- Each constituent receipt retains provider text SHA-256, provider and
  effective speaker labels, effective text, timing, review status, and the
  accepted correction/review identities when present.
- Goal, note, and task acceptance re-read every constituent segment under the
  existing transcript-job advisory lock. Missing, reordered, reworded, or
  re-hashed evidence fails closed before canonical work is written.
- Legacy single-segment anchors remain readable. Exact idempotent replay of an
  old single-segment goal that predates additive evidence fields returns the
  existing goal without creating or mutating work; new writes use the complete
  receipt.
- Packet v3 remains inspectable. Its template is stale at every decision
  boundary, so rebuilding appends a distinct v4 packet rather than rewriting
  history.
- A packet build still creates review material only. It does not create a
  canonical note, goal, task, assignment, target date, calendar event,
  reminder, message, delivery, or publication.

## UX

Nest and Quipsly Capture show `Complete thought · N immutable transcript
segments` on multi-segment note, goal, and task candidates. Nest also provides
an exact-source link on action candidates. The first segment remains the
playback focus while the displayed time range and wording cover the complete
thought.

The shared iPhone model decodes the additive source-span receipt without
breaking older payloads. Accepted work can therefore return to the same
evidence from Capture, Today, Work, Schedule, and the Session workspace.

## Retained local operation

The signed-in retained Session
`qa-retained-coaching-next-session-20260807` initially showed its v3 packet as
stale. The rendered **Build current packet** control created a separate v4
packet. UI and database readback proved:

- the original v3 packet still exists;
- the v4 packet is `READY_FOR_REVIEW`;
- 5 raw source segments deterministically produce 3 thought spans;
- the goal candidate covers 00:06–00:17 and contains all three stable segment
  IDs;
- the complete text SHA-256 is
  `6654f955ab11ab7c6394eeaea244d46c15e22f6071e123c3d0ad1dd89a2e77bf`;
- the UI visibly reports `Complete thought · 3 immutable transcript segments`;
- an unauthenticated browser cannot read the workspace;
- 0 packet-created canonical notes, 0 tasks, and 0 goals exist after the build.

The transcript still has 0/5 playback-reviewed segments. No human review,
candidate acceptance, client release, or external effect is claimed.

## Verification

- Focused domain, packet, materialization, and Session UI coverage: 8 suites / 92 tests.
- Direct goal compatibility and packet goal coverage: 2 suites / 11 tests.
- Full Nest Jest suite: 240 suites / 1,261 tests passed; 37 suites / 107 tests
  remained intentionally skipped by existing environment gates.
- Shared-domain and Nest TypeScript passed.
- The optimized Nest production build passed and generated 160 static pages.
- Quipsly Capture compiled successfully for the iOS simulator, including the
  embedded Share extension.
- Capture Nest source-evidence contract: 10/10.
- Mobile Capture source contract passed after following the current calendar
  cancellation operation-service boundary.
- Full repository Quipsly contract gate: 245/245.

No cloud build, deploy, production write, physical-device claim, transcript
approval, invitation, provider-calendar mutation, message, delivery, or
publication occurred.
