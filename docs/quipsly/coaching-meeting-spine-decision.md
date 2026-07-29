# Quipsly coaching and capture meeting spine decision

Date: 2026-07-04
Status: decision v1, implementation not complete

## Decision

Use a provider-neutral Quipsly `CallRoom` as the product source of truth, with LiveKit as the first preferred real-time meeting provider when we move beyond local-only capture.

The durable spine is:

1. Quipsly creates the booking, call room, participants, and consent records.
2. The iOS app joins a Quipsly room, not a provider room directly.
3. Quipsly mints short-lived provider tokens only after access and consent state are understood.
4. LiveKit carries the real-time audio/video room when provider calls are enabled.
5. LiveKit Egress records the room or selected tracks into cloud storage when configured and explicitly started.
6. iOS local segmented recording remains the fallback and field-capture path.
7. Quipsly ingests recording assets, verifies uploads, queues transcript jobs, creates transcript segments, and builds coaching or podcast packets.

This keeps Quipsly as the spine and providers as replaceable evidence/transport layers.

## Why LiveKit first

LiveKit supports room, participant, track, and web egress models. Its docs describe room/track export and livestream output, including RoomComposite, Participant, TrackComposite, and Track egress. It also supports GCP upload targets through the egress API.

That maps cleanly to Quipsly:

- a coaching call can be recorded as a simple room composite
- a podcast/interview can preserve separate participant tracks for later editing
- a research conversation can record audio-only
- egress can land in our media bucket instead of trapping media in the provider console
- Quipsly can keep `CallRoom`, `RecordingConsent`, `RecordingAsset`, `TranscriptJob`, and `CoachingPacket` as app-owned truth

LiveKit also has a Swift client ecosystem, which matters because the capture app is native iOS.

## Why not Twilio Video first

Twilio Video is credible and has strong recording/composition concepts. Its docs describe recording participant media tracks separately, then using Compositions to produce playable MP4/WebM outputs. Twilio also notes that compositions come from one source room, which is good for sync.

The drawback for Quipsly v1 is product gravity:

- Twilio’s post-flight composition model can make provider composition feel like the edit truth.
- Some composition limitations, such as no text/image overlays and no dynamic layout in Twilio’s documented unsupported list, push advanced creator workflows back into Quipsly anyway.
- For our first coaching/podcast spine, we want raw/track evidence and Quipsly-owned downstream editing/packaging, not provider-owned media decisions.

Twilio remains a fallback candidate if LiveKit cost, reliability, telephony, or compliance needs push us there.

## Apple/App Store constraints that shape the design

Apple guideline 2.5.14 requires explicit consent plus clear visual or audible indication when recording microphone, camera, screen, or user input. Quipsly must therefore make consent and recording state first-class, not hidden implementation details.

Apple guideline 3.1.3(d) allows non-IAP payments for real-time person-to-person services between two individuals. It does not cover one-to-few, one-to-many, SaaS access, courses, content libraries, or general digital goods. That is why Stripe remains scoped to eligible one-to-one coaching evidence.

Apple privacy rules require accessible privacy policy, retention/deletion explanation, consent withdrawal, and purpose strings. The capture app must not treat recording consent as permanent or coerced.

If Quipsly supports incoming VoIP-style calls later, iOS PushKit/CallKit expectations apply. For v1, avoid inbound-call complexity unless needed. Start with scheduled room join from inside the app.

## V1 product contract

### Room states

Use the app-owned `CallRoom.status` lifecycle:

- `PLANNED`: booking exists, room not open
- `OPEN`: participants may join
- `RECORDING`: recording has been explicitly started
- `ENDED`: session completed
- `CANCELED`: session canceled
- `FAILED`: provider or capture failure that needs review

Provider state reconciles into this lifecycle. It does not replace it.

### Recording paths

V1 should support two recording paths:

- Local fallback: iOS segmented `.m4a` recording uploaded as chunks, already aligned with the current capture app direction.
- Provider egress: LiveKit server-side recording into cloud storage after explicit room consent and visible recording state.

Both paths create `RecordingAsset` records. Both paths can queue `TranscriptJob`. Both paths can feed coaching packets and podcast assets.

### Consent policy

Default policy is all-party consent.

The app must support:

- grant
- decline
- revoke

Decline and revoke are real states. They are not missing checkbox values.

If consent is revoked during local recording, the app stops local recording. If provider egress is active, Quipsly must stop or exclude recording according to the room policy before claiming capture is compliant.

### Transcription policy

Transcription starts only after recording evidence exists and the asset is verified or explicitly held for a provider-side fetch.

Transcript output is reviewable:

- source recording is preserved
- transcript segments are timestamped
- speaker labels can be corrected
- notes and action items are candidate artifacts until reviewed

## Implementation slices

### Slice A: Provider-neutral room join remains the API surface

Keep `/api/mobile/capture/rooms/join` as the mobile entry point.

It should return:

- Quipsly room ID
- participant ID
- consent state
- provider name
- provider room name
- provider token when configured
- provider status
- next action copy

If LiveKit is not configured, return calm `planned` state instead of fake joining.

### Slice B: Add LiveKit token minting

Server-side only:

- read `LIVEKIT_URL`
- read `LIVEKIT_API_KEY`
- read `LIVEKIT_API_SECRET`
- mint short-lived tokens for authorized participants
- include room join grants only for the specific room
- never expose API secret to iOS

Current state: the Nest mobile room join route already mints short-lived LiveKit tokens when `CallRoom.provider` is `livekit` and `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are configured. The team coaching/capture runway now has a controlled `Prepare LiveKit room` action that assigns provider routing without starting recording or sending invites.

The join payload semantics now live in the shared domain contract
`packages/quipsly-domain/src/coaching-meeting-spine.ts`. Nest routes use
`buildQuipslyMeetingJoinSpine` so provider join, recording boundary, provider
recording, and local fallback language stay consistent across native capture,
reviewer diagnostics, and future Tower surfaces.

### Slice C: Add provider recording controls

Add server routes or actions for:

- start provider recording
- stop provider recording
- list provider recording state
- reconcile egress/webhook evidence into `RecordingAsset`

Quipsly must check consent before starting provider egress.

Current state: the team coaching/capture runway has start/stop provider recording controls backed by `apps/web/src/lib/server/coaching/livekit-egress.ts`.

The Nest provider-recording route still prepares receipt-slot evidence only,
but its manifest now comes from `buildQuipslyProviderRecordingReceiptSlotManifest`
in the shared meeting-spine contract. This keeps receipt slots visibly separate
from started provider egress and prevents receipt placeholders from becoming
transcript media by accident.

The Nest provider-recording route also exposes staff-only provider commands:

- `START_EGRESS`
- `STOP_EGRESS`
- `RECONCILE_PROVIDER_FILE`

These call `apps/quipsly/src/lib/server/coaching-livekit-egress.ts`, which is
the Nest-owned equivalent of the HGO team runway helper. This moves operational
provider recording truth toward Nest while HGO remains a doorway/reviewer
surface. `START_EGRESS` is payment- and consent-gated. `STOP_EGRESS` and
`RECONCILE_PROVIDER_FILE` are operator-only controls so Quipsly can stop an
active recording or verify storage evidence without pretending native capture is
ready to expose server egress directly.

Behavior:

- Start requires `CallRoom.provider = livekit`.
- Start refuses closed rooms.
- Start refuses rooms without attached participants.
- Start refuses rooms unless every attached participant has granted recording consent.
- Start refuses duplicate active server-mix egress.
- Missing LiveKit/media-vault/storage-credential configuration creates a held `RecordingAsset` with a clear reason instead of fake success.
- Start also requires `LIVEKIT_EGRESS_ENABLED=true`. This is an operator approval gate: configured provider credentials mean Quipsly can start egress, but the app must not start external server recording until that explicit flag is enabled.
- Successful start creates a `SERVER_MIX` `RecordingAsset` in `UPLOADING` state and stores the LiveKit `egressId` in `localManifestJson`.
- Stop looks for the active server-mix egress ID and calls LiveKit `StopEgress`.
- Successful stop marks the asset `UPLOADED`, not `VERIFIED`. Verification and transcript queueing are still separate steps.

Storage boundary:

- LiveKit egress writes room-composite recordings into the shared Quipsly media vault under `media-vault/recordings/livekit/...`.
- The configured bucket may come from any shared media-vault bucket env, including `QUIPSLY_MEDIA_BUCKET`, not only old LiveKit-specific bucket names.
- Buckets store bytes. `CallRoom`, `RecordingAsset`, `TranscriptJob`, packets, and receipts own meaning, access, review, attachment, and publishing truth.

Important truth boundary:

`UPLOADED` means provider egress said it stopped and should have written an object. It does not prove the object exists, has audio, has usable duration, or is transcript-ready. A future reconciliation worker must inspect cloud storage, update byte/duration evidence, mark `VERIFIED`, and then queue `TranscriptJob`.

### Slice D: Keep local recording fallback

Local capture remains important because:

- provider egress can fail
- field notes do not need a live room
- podcasts may need source-safe redundancy
- network conditions vary

The app should make fallback status calm and visible.

Current state: the iOS capture board now shows provider readiness language for planned/local fallback versus LiveKit-ready sessions. Preparing a room join response is remembered on the current selection and cleared when the user switches sessions.

The mobile sessions endpoint now returns provider readiness directly:

- `providerRoomId`
- `providerCanJoin`
- `providerReadiness`
- `providerNextAction`

The session list is the calm overview. The room join route remains the token-minting step.

### Slice E: App Store readiness

Before submission:

- privacy/deletion routes must be reachable
- microphone purpose string must match actual behavior
- recording consent and indicator must be obvious
- test account must have at least one planned capture session
- reviewer notes must explain local fallback and provider egress
- no Stripe link should imply payment for SaaS/digital goods

## Research sources

- LiveKit Egress overview: https://docs.livekit.io/transport/media/ingress-egress/egress/
- LiveKit Egress API: https://docs.livekit.io/reference/other/egress/api/
- Twilio Video overview: https://www.twilio.com/docs/video/overview
- Twilio recordings and compositions: https://www.twilio.com/docs/video/tutorials/understanding-video-recordings-and-compositions
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple App Review overview: https://developer.apple.com/distribute/app-review/
- Apple PushKit VoIP notification docs: https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit
- Apple CallKit docs: https://developer.apple.com/documentation/callkit

## Current next action

Provider egress reconciliation now has a first implementation:

- `reconcileLiveKitEgressRecording` inspects the configured storage object.
- Missing bucket/object path holds the asset.
- Missing object holds the asset and asks for retry.
- Zero-byte object holds the asset and asks for retry.
- Storage/API failure marks the asset failed with error evidence.
- Nonzero object marks the asset verified, captures object metadata, and queues a transcript job if one does not already exist.
- The team runway exposes this as `Verify provider file` on server-mix recording assets.

Next improve reconciliation with media probing:

- capture duration
- confirm audio stream presence
- capture codec/container evidence
- mark video-only or corrupt files as held before transcript
- move long-running verification into a background worker
