# Session recording-plan confidence — 2026-08-06

## Outcome

Quipsly now keeps two different recovery claims separate:

1. every retained source Nest observed has verified, released server bytes; and
2. every source the recording team intended to retain actually arrived.

The first claim cannot satisfy the second. A browser audio upload can no longer
make a missing iPhone video or audio master disappear from the Session exit
decision.

## Architecture

`CallExpectedSource` is the current Session recording-plan projection. It owns
the intended person, source kind, retention role, endpoint/device hint, exact
bound `RecordingAsset`, and optimistic revision. It remains visible even if a
device never started and therefore produced no capture or asset evidence.

`CallExpectedSourceRevision` is append-only evidence for create, bind, unbind,
waive, restore, and cancel decisions. Request UUID plus request hash makes
retries idempotent, advisory room locking serializes concurrent mutations, and
the expected revision rejects stale decisions. Required-master waivers and all
cancellations require a reason. A provider mix may be a witness or backup but
cannot be declared as the required high-quality master.

The existing `RecordingAsset` remains the durable retained-byte authority.
Expected sources do not duplicate or weaken asset verification, finalization,
capture receipts, endpoint queue receipts, or provider presence. The Session
topology joins those facts into explicit fulfillment states:

- fulfilled;
- bound source pending or invalid;
- compatible candidate requiring exact human binding;
- missing;
- waived; or
- canceled.

Global **Safe to leave** now requires all three independent conditions:

- every active required planned source is fulfilled;
- every server-observed required source is byte-verified and released; and
- every known recording installation's latest durable local queue receipt is
  drained and covers the exact endpoint-owned source set.

## Product operation

The signed-in local retained coach operated Session
`retained-coaching-follow-up-20260731` through the rendered Recordings UI.

1. Declared `QA Retained · Coach browser audio master` as a required source.
2. Reviewed three compatible retained candidates and bound one exact verified,
   released source.
3. Read back `Safe to leave every endpoint: YES` with four of four observed
   masters server-safe and one of one installation queues drained.
4. Declared `QA Retained · Client iPhone audio master` for the retained client.
5. Confirmed the absent client source remained **Missing**, changed plan
   confidence to one of two required masters, and changed global exit safety to
   **No** despite all observed sources remaining safe.
6. Waived that item with a reason, observed revision 2 and restored safety,
   then restored the requirement, observed revision 3, and confirmed the
   missing-source block returned.
7. Read PostgreSQL back independently. The coach source is active, bound, and
   has CREATE/BIND revisions. The client source is active, unbound, and has
   CREATE/WAIVE/RESTORE revisions.

The unresolved client source is intentionally retained as longitudinal QA
state rather than deleted after the test.

## Verification

- Prisma schema format and validation: passed.
- Prisma client generation: passed.
- Local migration `20260806230000_add_call_expected_sources`: applied to the
  loopback `high_ground_studio` database; all 78 local migrations current.
- Focused Session topology, UI, and API tests: 19 passed.
- Retained Keychain helper tests: 7 passed.
- Quipsly TypeScript check: passed.
- Optimized Quipsly production build: passed, including the new
  `/api/sessions/[roomId]/source-expectations` route.
- Local lifecycle doctor: Nest, PostgreSQL, Firebase Auth emulator, transcript
  worker, media worker, source-worktree identity, and no-owner-override checks
  passed.
- Retained coach/client/outsider auth smoke: coach and client reads passed;
  unrelated outsider received concealed 404.

## Honest remaining boundaries

- This proves the browser-operated local Session and durable recovery model. It
  does not prove a new physical-iPhone recording, a TestFlight build, or a
  production database migration.
- Capture still needs to publish its own intended source-plan items before a
  take, then bind its uploaded assets automatically after exact verification.
  Until that native integration exists, a producer declares and binds the plan
  in the Session Recordings workspace.
- The next real multi-device rehearsal should declare every intended phone,
  browser, camera, isolated audio, screen/clip, provider witness, and backup
  before record; end-of-session recovery should use this plan as its checklist.

## Capture finalization follow-on

The server contract now accepts the phone's immutable `captureId` when the
expected source is declared. Released mobile resumable finalization reconciles
that identity inside the same serializable transaction that preserves the
verified `RecordingAsset` and finalization receipt.

Automatic binding occurs only when exactly one active expectation matches the
room and capture ID and its person and audio/video kind agree. No declaration
is a harmless no-op. Duplicate declarations remain ambiguous, and conflicting
kind, participant, or prior bindings fail closed. The successful binding
advances the plan revision and appends a deterministic BIND receipt attributed
to the uploading actor. Held uploads never bind.

This completes the server half of Capture-native plan reconciliation. The next
native slice is a protected iPhone outbox that durably declares the generated
capture ID alongside its local START receipt, retries without blocking healthy
local recording, and projects the acknowledged plan item in Capture recovery.
