# Quipsly Capture Build 28 qualified candidate

Date: 2026-08-05

Status: exact-source signed candidate uploaded and in external beta testing; no physical-iPhone claim

> Release update, 2026-08-05: Apple reports Build 28 as `VALID` and
> `IN_BETA_TESTING`, App Store Connect build ID
> `ed68117d-5604-45c3-b9f7-239e7cd2af4f`, from exact released source
> `ab1b167a39749909797177e1304bd9283c558484`. The public rehearsal group
> includes it and the public installation page is open. The sealed
> `c9daa075...` no-upload qualification below remains useful historical
> evidence; physical Episode 9 acceptance is still open.

## Outcome

Quipsly Capture `1.0 (28)` was first sealed as a no-upload candidate from exact
pushed source `c9daa075a4b4824f52df8d656d085ab3ac497c74`. At that qualification
checkpoint, the public TestFlight ledger remained pinned to Build 27 pending a
matching Nest readback and an independent App Store Connect build receipt. The
release update above records the later, distinct released-source qualification
and Apple receipt; the physical browser/iPhone recording drill remains open.

The candidate contains the current canonical Session capture group, browser and
iPhone source rendezvous, protected-master versus optional-provider-witness
handoff, offline transcript review, Work/Today/calendar/tagging/follow-through,
Episode manuscript/thread/Shared Watch, Google-first login, portability, and
Share Capture source-provenance work.

## Release defects found and repaired

The first exact-source candidate pass was not accepted. It exposed:

- an App Store static verifier that still required the retired
  `durableCommandLedgerImplemented: false` provider-recording interlock;
- a LiveKit nonisolated data callback reading an immutable chat topic that
  inherited main-actor isolation; and
- one serialized Studio-handoff assertion still expecting generic `sources`
  copy after the product correctly distinguished protected `masters` from
  optional provider witnesses.

The verifier now requires the production architecture: shared media-vault
bucket authority, explicit `LIVEKIT_EGRESS_ENABLED` activation, complete
provider configuration, durable START/STOP command routing, advisory-lock
serialization, authenticated webhook receipts, and visible
`RECONCILE_REQUIRED` ambiguity. The immutable topic is explicitly nonisolated;
decode and published UI state remain main-actor work. Ready, partial-retry, and
complete Studio UI assertions now enforce the protected-master language.

The failed first run remains retained as diagnostic evidence. It executed 62
journeys with one expected-copy failure and never produced a candidate archive.

## Exact qualification

The replacement detached-source lane passed:

- 62 of 62 serialized iPhone, login, and Share Capture journeys with no skips
  or failures;
- 1,046 App Store/capture static invariants;
- release-source identity, privacy, permission, background-mode, bundle,
  extension, build-number, and dependency checks;
- a clean signed Release archive and App Store IPA export;
- strict nested signatures for the app and Share Capture extension;
- Apple Distribution signing and App Store profiles for team `585GUXMY5M`;
- distribution-safe entitlements and iPhone-only packaged metadata;
- packaged privacy manifests, bounded camera/microphone purpose strings,
  `ITSAppUsesNonExemptEncryption=false`, audio background mode, and CallKit
  provider-room background mode; and
- independent IPA byte count and SHA-256 readback.

Candidate identity:

- version/build: `1.0 (28)`;
- IPA bytes: `23,797,648`;
- IPA SHA-256:
  `27938d4df0dc743ca663538cf44c569fe67f1aedc1b3e04e9901ef221ea80a30`;
- receipt mode: `0600`;
- `candidateQualified=true`;
- `deterministicUITestPerformed=true`;
- `uploadAttempted=false`;
- `uploadOutcome=not-attempted`; and
- `physicalTestFlightInstallReadbackPerformed=false`.

Durable evidence, excluding reproducible DerivedData, is retained at:

`/Users/wall-e/Dev/Quipsly QA Artifacts/Capture Build 28/c9daa075a4b4/20260805T103229Z-22380`

It contains the signed archive, exported IPA, owner-only release receipt,
App Store export evidence, and the 364 MB `.xcresult`. The original `/tmp`
evidence remains present as well.

## Release boundaries still open

- The matching Nest application source has not been promoted. Its exact
  0%-traffic preview was deferred by the normal 72-hour Cloud Build spend
  cadence; production schema migration and zero-drift proof are complete.
- Provider room recording remains deliberately off. Protected-master grouping,
  upload, and synchronization do not depend on it.
- The physical iPhone remains absent from USB inventory, CoreDevice, and
  Instruments. Simulator qualification does not satisfy physical capture,
  interruption, thermal, route-change, background, or camera-switch acceptance.
- No App Store Connect API credential is mounted in the current environment,
  so no fresh Apple provider readback or upload was attempted.
- Final screenshots, App Privacy publication, DSA status, production account
  deletion, separate-account physical privacy, and App Review submission remain
  exact-build gates.

## Next acceptance

After the ordinary Nest release window opens, deploy the exact backend source
to a zero-traffic preview, run authenticated mobile and Session smoke, promote
only after immutable source readback, and rerun the production mobile contract.
Then operate one physical browser+iPhone Session with independent masters,
interruption/reconnect, exact-byte uploads, opening-cue waveform correlation,
late-take drift review, and assembled Studio playback. Build 28 can be uploaded
only if that candidate remains the intended source after those gates.
