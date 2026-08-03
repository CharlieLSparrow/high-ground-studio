# Coaching continuity with exact task evidence

Date: 2026-08-03

## Outcome

Quipsly now carries a coach's reviewed transcript evidence forward from one
coaching Session to the next without copying or rewriting canonical work. A
saved actor-private continuity brief retains the exact append-only task receipt,
effective speaker and words, transcript segment, time range, recording asset,
and protected playback source. Nest and Quipsly Capture can both return the
authorized coach to that exact source.

The continuity projection does not change the task's title, detail, owner,
status, dates, tags, goal links, reminder, recurrence, or project identity. It
does not copy the private brief into the next Session, generate text with AI, or
perform an external side effect.

## Canonical and privacy boundaries

`ActionItemEvidenceReceipt` remains the canonical append-only evidence ledger.
The continuity service reads only the latest valid
`TRANSCRIPT_CANDIDATE_MERGED` receipt through the shared domain parser. Before
projecting it, the service rechecks that the actor can still access the source
Session. Saved-brief readback verifies:

- actor, source Session, schema, visibility, and no-side-effect claims;
- exact JSON-serializable snapshot SHA-256 and rendered-body SHA-256;
- a valid transcript-derived task source shape; and
- current actor access to every evidence Session.

If any check fails, the evidence link is omitted. The private brief itself is
selected only for its original actor. A client and collaborating room producer
can open the shared Session while still seeing no coach-private brief.

The portable Nest bundle now exports task evidence receipts and restores them
once. A second restore reuses the task and creates zero additional receipts.
The local PostgreSQL restore proof read the exact transcript evidence back from
the restored canonical task.

## Cross-surface UX

Nest shows reviewed evidence beneath both the current task and the saved prior
brief. The control is a discoverable, keyboard-focusable 44-point action named
for its exact media range, such as **Return to 1:03–1:11**. It opens the source
Session in transcript mode at the exact segment and states that the evidence is
append-only.

Quipsly Capture projects the same receipt in the next Session's continuity
card. It resolves an eligible retained local recording only when room and
recording-asset identities both match, then opens the transcript review at the
exact segment. Missing local bytes degrade to review-only source context rather
than substituting another recording.

The client-side Capture journey separately opens the canonical follow-through
task and goal in Work and reads the retained 75% progress evidence. Coach and
client therefore see the information appropriate to their roles without a
second task or goal being invented.

## Consent, release, and exact local media

The retained fixture now models the complete production boundary instead of
hand-waving playback:

- every audible non-observer participant has current explicit audio-recording
  and transcription consent;
- the immutable upload binding retains Session, capture, SHA-256, bucket,
  object, and byte-count identity;
- processing and transcription dispositions are explicitly `RELEASED`;
- `RecordingAsset`, `StudioVideoSource`, `StudioMediaAsset`, project
  attachment, transcript job, and finalization receipt all agree on identity;
  and
- the recording manifest points to the exact promoted source and protected
  playback URL.

The local-only source is an 80-second, 8 kHz mono PCM WAV with a quiet 220 Hz
tone only from 60–75 seconds. It is 1,280,044 bytes with SHA-256
`273d094bb7b38a672df5cf16eb37ace6c6c53852ebd7207e66150b0d492b6a3e`.
It contains no real speech and is materialized mode 0600 beneath the allowed
local ingest root.

## Rendered browser operation

The rendered operation proved four distinct identities:

- coach: private prior brief visible, exact evidence link visible, and a
  `bytes=0-43` range request returned `206`, `audio/wav`, the exact
  `Content-Range`, and `RIFF`/`WAVE` headers;
- client: shared next Session visible and coach-private brief concealed;
- collaborating producer: shared next Session visible and coach-private brief
  concealed; and
- separate-account privacy outsider: no project, booking, room, participant,
  or grant; a guessed stable playback-source ID returned no readable bytes.

The fourth identity uses a freshly generated owner-only temporary credential
directory. The directory and every credential file are checked for ownership,
mode, regular-file type, and symlink refusal; secrets are never printed. The
ordinary three-account retained run continues to use macOS Keychain and reports
when the separate-account boundary was not part of that invocation.

PostgreSQL readback proved the brief stayed in the prior Session, no brief was
copied into the next Session, the canonical task definition was unchanged, the
exact evidence receipt remained attached, and AI/external-side-effect flags
were false.

## Compiled iPhone operation

A fresh compiled iPhone 17 Pro simulator operation used current local Nest,
the Firebase emulator, PostgreSQL, and the exact WAV source. It passed two
product journeys:

1. the coach opened the next Session, inspected actor-private continuity,
   selected the exact task evidence, opened the prior transcript at the exact
   segment with the matching retained recording, and returned to the prior
   Session; and
2. the client opened canonical Work and read the exact retained task, goal,
   and 75% progress evidence.

The preserved result bundles are:

- `/private/tmp/quipsly-retained-native-coaching-continuity-1785779704680-36280.xcresult`
- `/private/tmp/quipsly-retained-native-coaching-continuity-1785779704680-36280-client-work.xcresult`

The operation reported 59 authoritative Sessions, two passing journeys, exact
source installation, no printed credentials, and no external side effects.

## Verification and open gates

Bounded verification passed:

- focused continuity unit and database integration suites;
- Nest portability unit and local PostgreSQL restore suites, 8/8 tests;
- strict Quipsly TypeScript;
- mobile/Nest contract and retained-operation source contracts;
- deterministic seed/source contracts;
- rendered three-account Keychain and four-account privacy operations; and
- the two compiled Capture simulator journeys above.

This is local Simulator and local-service evidence. It does not satisfy the
physical-iPhone, production Nest, genuine coaching-session, production
separate-account, TestFlight, provider-delivery, or App Store acceptance gates.
No Cloud Build, cloud deployment, production database write, TestFlight upload,
external message, or provider mutation occurred.
