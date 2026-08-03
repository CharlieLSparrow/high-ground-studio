# Client follow-up Today attention — 2026-08-03

## Outcome

A newly released coaching follow-up now appears as a read-only attention card
for its exact client on both Nest Today and Quipsly Capture Today. The card
opens the canonical Session and leaves acknowledgement as a separate,
content-hash-bound action inside that Session.

Opening the card does not acknowledge delivery, complete a task or goal,
schedule anything, send a message, or mutate recording, transcript, source, or
provider state.

## Projection and authorization boundary

`loadClientFollowUpAttention` searches only released `CLIENT_FOLLOW_UP`
outputs addressed to the current user. A candidate projects only when all of
these identities and receipts still agree:

- output recipient and booking client are the current actor;
- output author and booking coach are the same person;
- output body and manifest use the canonical follow-up schemas;
- manifest, body Session, and output all identify the same room;
- persisted body hash matches the released content hash;
- every selected note, goal, and task appears exactly once in both body and
  manifest and has the expected record hash; and
- no confirmed `OPENED_IN_APP` receipt exists for the same output, room,
  recipient, actor, and content hash.

Malformed, stale, cross-recipient, cross-coach, duplicate, opened, or
hash-mismatched candidates fail closed. The loader considers the newest 25
released candidates so one invalid row cannot hide an older valid unopened
follow-up.

## Canonical JSON correction

The retained database operation exposed a real digest defect. Optional
`sourceSpan: undefined` fields were serialized as the literal token
`undefined` by the old stable canonicalizer. PostgreSQL JSON correctly omitted
those fields, so a later readback could not reproduce the release manifest
digest.

New writes now use JSON-compatible canonicalization:

- undefined object properties are omitted; and
- undefined array elements become `null`.

Readback accepts the narrowly defined historical digest form so already
released artifacts are not silently invalidated. New and legacy hashes still
must match the complete selected-record snapshot. Follow-through comparison
also includes the current transcript source anchor, preventing source-provenance
changes from being mislabeled as unchanged work.

## UX

Nest Today shows one calm **Coaching follow-up** card with coach, Session,
revision, release time, selected-record count, and **Open follow-up**. The
destination is the exact Session output anchor.

Capture Today decodes the same projection and opens the exact cached Session
by stable room ID. If that Session is not present, Capture asks for a Sessions
refresh and does not fall back to a different room. Copy on both surfaces says
that opening is not acknowledgement and does not complete a commitment.

## Real rendered operation

The retained coach released revision 4 of:

- output: `client-follow-up-eb32f5abad8d76ff57a101f07d11964f123525ba`
- room: `retained-coaching-follow-up-20260731`
- title: `iPhone follow-up proof — Retained coaching rehearsal`
- content SHA-256:
  `d4fddd6ace5c072b49826e94b06d56c9cd3d24dda8b68962ef7dff7a16a96dfb`

A separate retained client session then operated the real local product:

1. Today showed the exact new follow-up.
2. **Open follow-up** reached the matching Session without acknowledging it.
3. The Session still offered the explicit confirmation action.
4. Confirmation wrote the exact-content open receipt.
5. Today no longer projected that follow-up.

Independent readback confirmed no task, goal, calendar, release, or content
mutation during the client journey. Evidence is preserved at:

`/Volumes/My Passport/Quipsly QA Artifacts/Client Follow-up Today Attention 2026-08-03/20260803T214635379Z`

That directory contains the operation receipt and screenshots of Today,
Session before confirmation, Session after confirmation, and Today after
confirmation.

## Compiled iPhone acceptance

The focused iPhone 17 Pro / iOS 26.3.1 Simulator journey passed 1/1. It showed
the attention card, opened the exact preview Session, and reached the matching
client follow-up while acknowledgement remained separate.

Result bundle:

`/Volumes/My Passport/Quipsly QA Artifacts/Client Follow-up Today Attention 2026-08-03/HighGroundCapture-today-client-follow-up-20260803T2154Z.xcresult`

## Verification

- focused Nest unit tests: 49/49;
- local PostgreSQL follow-up lifecycle: 1/1;
- retained rendered client operation: passed;
- compiled iPhone simulator operation: 1/1;
- Quipsly route generation and strict TypeScript: passed;
- Swift parse: passed;
- mobile Capture source contracts: 97/97;
- App Store/static checks: 1,021/1,021;
- retained operation script tests: 2/2;
- local doctor: Nest, workers, Firebase emulator, Docker, and PostgreSQL pass;
- patch hygiene: passed.

The PostgreSQL test intentionally exercises a concurrent release conflict. The
logged Prisma write-conflict message is expected; the test passes only when one
writer wins and the other fails safely.

## Explicitly not proven here

- a physical-iPhone run;
- TestFlight or App Store delivery of this post-Build-27 source;
- production Nest authorization and separate-account readback;
- genuine coaching use by Charlie and Scott; or
- external delivery, notification, calendar, provider, or cloud mutation.

This is a local active-goal checkpoint, not a distribution or completion
claim. No cloud build, deployment, production database write, TestFlight
action, billing change, invitation, message, or provider mutation occurred.
