# Session private-playback preflight receipt

Date: 2026-08-05 America/Denver

## Outcome

Quipsly now turns the browser's private sound check into durable, reviewable
Session readiness evidence without retaining the sound-check audio.

The person still records and hears the sample only inside the current browser
tab. After the full sample plays, they choose either **Sounds clear in
headphones** or **Needs adjustment**. The server independently evaluates the
reported call-path evidence and stores a receipt tied to the exact Session,
participant, browser endpoint, selected microphone, selected output, optional
camera, and listener decision.

This closes the previous ownership gap: the private sample itself should not
survive, but collaborators need to know whether the exact endpoint was checked
and whether it needs attention.

## Product contract

- A preflight receipt is not a recording, recording consent, provider join,
  retained source, upload receipt, transcript source, or Studio attachment.
- No sound-check sample bytes are sent to Nest or written to PostgreSQL.
- The listener's decision is authoritative for audible problems that a meter
  cannot certify, including mouth noise, room sound, monitoring delay, wrong
  output routing, and perceived distortion.
- The server remains authoritative for the final readiness state. A green
  receipt requires an identified endpoint and microphone, complete playback,
  a `HEARD_CLEAR` decision, healthy audio evidence, and camera evidence when
  camera was requested.
- A `NEEDS_ADJUSTMENT` decision or non-ready meter state always produces an
  explicit attention receipt. Client code cannot paint that evidence green.
- A ready receipt is current for two hours. Changing a selected endpoint
  invalidates the tab-only sample immediately and requires a new check.
- Joining the conversation and starting retained recording remain separate
  explicit actions. Preflight does not silently do either.

## Architecture

### Durable model

`CallParticipantPreflightReceipt` is append-only evidence related to:

- `CallRoom`
- `CallParticipant`
- the human actor who made the decision
- one stable browser `clientInstanceId`

It stores bounded labels and technical evidence, the human playback decision,
issue codes, tested/expiry instants, an idempotency request ID, and a SHA-256
request binding. It does not have a blob, object path, media URL, or recording
relation.

### API

`GET /api/sessions/:roomId/preflight` returns only the signed-in actor's latest
receipt and explicit no-sample/no-recording boundaries.

`POST /api/sessions/:roomId/preflight`:

1. authenticates the actor and applies the canonical Session access boundary;
2. normalizes bounded client evidence on the server;
3. serializes first-time participant creation by Session and actor;
4. serializes request identity and rejects changed evidence under a reused ID;
5. persists the server-computed status and issue codes; and
6. returns the next corrective action plus explicit false side-effect claims.

The participant lock prevents two different simultaneous first checks from
creating duplicate participant identities. The request lock makes ambiguous
retry converge on one receipt.

### Projection and UX

Session readiness now projects the latest receipt per participant and browser
endpoint. The topology card shows:

- device, microphone, output, and requested camera;
- ready, needs-adjustment, or expired state;
- whether the complete private sample was heard;
- signal classification and receipt lifetime;
- explicit issue codes; and
- the permanent boundary: `Receipt only · sample bytes stayed in that browser
  tab`.

Negative and current receipts open by default so collaborators do not have to
hunt for a problem. A successful receipt write refreshes the current Server
Component projection without dropping the client-side room state. Ready
receipt counts remain separate from prepared join endpoints,
provider-observed presence, and retained-source counts.

## Operated local proof

The rendered local app was operated as the retained coach test identity in
Session `retained-coaching-follow-up-20260731`.

1. The long-running Nest initially failed closed because it still held the
   pre-migration Prisma client. Its log named the unknown
   `participantPreflightReceipts` field. Restarting only the local Nest job
   preserved PostgreSQL and Firebase Auth, regenerated Prisma, and restored the
   exact Session.
2. The live room enumerated the real `Shure MV7i (14ed:1024)` for microphone
   and headphones. No camera was visible in the browser during this operation.
3. The selected-device test reported a very low/no-signal path rather than
   treating device enumeration as audio readiness.
4. A 5.7885-second sample was captured locally and played to completion through
   the browser control.
5. **Needs adjustment** was saved. The UI reported that no private audio was
   uploaded.
6. After a full page reload, the coach's shared topology showed the exact Shure
   input/output, full playback, `NEEDS ADJUSTMENT`, `listener needs adjustment`,
   `audio no signal`, and the receipt-only boundary.
7. Independent PostgreSQL readback found exactly one receipt with
   `privateSamplePlaybackComplete:true`, `privateSampleUploaded:false`, and
   `privateSampleBytesRetained:false`.

This is honest negative readiness proof. It does not claim that the MV7i is
currently calibrated, that the Canon is connected, that anyone joined the
provider room, or that a retained recording was created.

## Verification

- Focused behavior: 6 suites / 26 tests passed after participant-concurrency
  hardening.
- Complete Quipsly run after the final hardening: 340 active suites / 1,752
  tests passed, with 41 suites / 131 tests deliberately skipped.
- Quipsly TypeScript passed after the final hardening.
- The final production Next build completed all 181 static pages and included
  the dynamic Session preflight route.
- Local migration `20260806103000_add_call_participant_preflight_receipts`
  applied successfully; Prisma readback reported all 74 migrations current.

## Remaining gates

- Repeat the check while speaking naturally and adjust MV7i gain/distance until
  the meter and the human listener both pass.
- Reconnect the Canon R8 and prove the requested camera evidence path.
- Repeat the receipt projection with a second collaborator on physical
  hardware beside the browser endpoint.
- Deploy the additive migration and exact committed source through the guarded
  production preview lane before promoting traffic.
- Do not treat a preflight pass as source capture, upload, sync, transcript, or
  editor readiness; those remain separate acceptance gates.

## 2026-08-06 native and two-collaborator continuation

Quipsly Capture now uses the same Session preflight authority without uploading
the private sound-check recording. The iPhone sound check no longer becomes
ready from meter health alone: the person must play the complete sample and
choose **Sounds clear** or **Needs adjustment**. The app records the actual
playback output route and invalidates the evidence if that route changes.

The resulting bounded receipt is saved first to an account-partitioned,
file-protected iPhone outbox. Local capture remains available when Nest is
temporarily unreachable, while the UI states honestly that shared setup
evidence is waiting. A server acknowledgement is the only state that can make
the shared receipt current and ready. Restart, retry, authentication expiry,
request conflict, and terminal rejection remain distinguishable instead of
being reduced to one success boolean.

The server now accepts explicit `web`, `ios`, and `macos` endpoint kinds and
uses the bounded client observation time for receipt expiry. A delayed offline
receipt therefore cannot arrive three hours later and paint an endpoint fresh.
Future-skewed clocks fall back to server time rather than extending authority.

The retained local operation proved the complete contract with two real
reserved collaborator identities over the same Session:

- both collaborators wrote current iPhone receipts and read back their own
  exact receipt;
- PostgreSQL retained two distinct actor identities and two distinct endpoint
  identities;
- exact replay converged idempotently while changed evidence under the same
  request ID returned conflict;
- a three-hour-old offline receipt persisted as historical evidence but was
  not current;
- an unrelated ephemeral Firebase identity received `404` and was deleted
  after the operation;
- both private-sample upload and byte-retention fields remained false; and
- no recording was started by preflight.

Focused server tests, native model tests, Swift compilation for both simulator
architectures, and the operated readiness UI test pass. A second operated UI
test killed Capture, recovered the exact random receipt identity after relaunch,
created a different receipt under a second account partition, and recovered the
original identity after switching back. This closes the former local
second-collaborator and process-restart outbox gates. It does not replace
physical-iPhone microphone/camera operation, retained recording/upload/editor
readback, production preview deployment, or TestFlight acceptance.
