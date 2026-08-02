# Episode 8 collaboration proxy operation — 2026-08-02

## Outcome

Quipsly generated, registered, and played an app-owned collaboration proxy for
the retained Episode 8 `Ted Lasso Be Curious.mp4` source through the rendered
local editor. The immutable original remains the render/provenance source. The
proxy is a distinct asset, source, variant, byte receipt, and playback URL.

This closes the local browser-editor proxy lifecycle. It does not prove the
cloud worker, production deployment, physical iPhone, portable media restore,
or the full active product goal.

## Canonical identities

- Nest: `high-ground-odyssey` / `cmqj2938z0001208ofvtg3i6p`
- Episode: `episode-8-i-wasnt-born-a-leader` / `cmsc3mz4r003bazxl4yepdf8h`
- Original asset: `cmsc3rlcy003hazxlo5n5yn0w`
- Original source: `cmsc3rlcn003gazxloqz9sfio`
- Durable workflow job: `cmsc3rldn003jazxli2vye83j`
- Registered proxy asset: `cmsc6834k0007hexlrmu1p8zu`
- Registered proxy source: `cmsc6834g0006hexlt2ibd861`
- Registered variant: `cmsc6834o0009hexl94xzlxgm`

## Source and derivative evidence

The 19,100,059-byte original retained SHA-256
`acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`
before and after the operation.

The 24,599,184-byte derivative has SHA-256
`d265827f7d90caf160bb0bbaee2f952c0ed881beb32f0c07013e9edce52bf6e3`.
Independent inspection reported:

- duration `254.63` seconds;
- H.264 video and AAC audio;
- `1280x638`, `23.976023976` fps, and `yuv420p`;
- audio present; and
- MP4 fast-start true.

The completed job stores both hashes, the deterministic target, worker
execution evidence, and `originalRemainsSourceTruth=true`. Its registered
playback URL is `/api/ingest/media/cmsc6834g0006hexlt2ibd861`.

## Real-app operation

1. Started Quipsly through the owned local lifecycle. Nest, Firebase Auth,
   PostgreSQL, and `com.quipsly.local.media-worker` passed the doctor.
2. Created and mailbox-verified isolated local account
   `milestone-runway-20260802@local.test`, then granted only HGO `EDITOR`
   access for this operation.
3. Opened the exact Episode 8 editor and clicked `Build collaboration proxy`.
4. The durable worker leased the existing job, generated an atomic partial,
   flushed it, renamed it, and saved an output receipt.
5. The authorized API independently re-hashed the original and derivative,
   verified fast-start, registered distinct canonical source/asset/variant
   rows, and patched the Episode production projection.
6. Reloaded the editor. Both raw and proxy media decoded with `readyState=4`;
   the program/edit monitor selected the proxy source.
7. Rendered `Cue in`, `Play active edit`, and `Pause`. Proxy playback advanced
   to `13.308` seconds and stopped; the raw monitor remained untouched at zero.

Two repeated authorized queue requests returned HTTP 200 with the same job,
proxy asset, and playback URL. No duplicate derivative identity was created.
An isolated ungranted account received exact HTTP 403
`episode-production-access-denied` before source inspection or queue mutation.

## Defects found by operation

The operation found and repaired three defects that the narrower tests did not:

1. PostgreSQL inferred one failure-release parameter as both text and timestamp.
   The worker now casts the lease-release timestamp explicitly.
2. The atomic partial filename placed its marker after `.mp4`, so FFmpeg could
   not infer a muxer. The partial now remains an `.mp4` and is still atomically
   renamed.
3. macOS exposed the same authorized source as `/var/...` and canonical
   `/private/var/...`. Registration now compares local authority only after the
   configured-root resolver canonicalizes both paths.

The rendered editor also exposed legacy `proxy.status=ready` metadata that
pointed to the original. Readiness now requires a distinct proxy URL plus
asset, source, variant, immutable-object, and original-preservation evidence.
New uploads are saved as `not-queued`; they no longer create a pretend-complete
proxy job or call raw playback a proxy.

## Verification

- Quipsly and media-processor strict TypeScript: pass.
- Worker contract/recovery tests: 5/5.
- Collaboration proxy API authorization tests: 6/6.
- Local lifecycle contract tests: 8/8.
- Cloud-cost/release guard tests remained 15/15 in the preceding bounded pass.
- Owned local lifecycle and doctor: pass.
- Real authorized operation, idempotent replay, outsider denial, database
  readback, SHA-256 readback, independent media inspection, decode, play, and
  pause: pass.

## Exact remaining boundary

The episode collaboration contract is provider-neutral, but this checkpoint's
worker and reconciler intentionally accept local ingest only. Before a
production release can claim the same behavior, connect the GCS provider lane
to the immutable cloud media processor, qualify it against a real versioned
object, and run zero-traffic authenticated preview acceptance. Do not restore
the old fake-ready import metadata while that lane is incomplete.

No Cloud Build, Cloud Run deployment, production database write, message,
invitation, calendar-provider write, publication, TestFlight action, or
physical-device mutation occurred in this checkpoint.
