# Capture recording to podcast editor flow

Status: active operating policy, first pass.
Updated: 2026-07-08.

## Why this exists

Quipsly Capture can create several kinds of useful audio and video evidence:

- local iPhone recordings,
- LiveKit room composites,
- participant tracks,
- imported fallback recordings from Zoom, Meet, Phone, FaceTime, or files,
- transcript jobs and follow-up packets created after capture.

The important product rule is that those files should not become a mystery pile.

The recording is first call-room evidence. Only after upload/provider evidence is verified should it become reusable podcast/editor media.

## Source of truth split

- `CallRoom` owns the human session: participants, purpose, booking, consent, room state, provider state, and follow-up context.
- `RecordingAsset` owns recording evidence: source object, upload/provider receipt, consent relationship, verification state, transcript jobs, and promotion trail.
- `StudioMediaAsset` owns reusable media-library/editor assets: raw source, proxy derivatives, thumbnails, variants, workflow jobs, and Nest attachments.
- `StudioEpisodeProduction.productionJson.importedMedia` owns episode-editor meaning: role, sync notes, proxy readiness, and whole-source timeline availability.
- Buckets hold bytes. They do not decide whether a file is a podcast spine, camera, reference clip, or b-roll.

## Promotion flow

1. A Quipsly room produces a recording with explicit consent.
2. The local upload or provider egress verifies durable storage.
3. The recording remains a `RecordingAsset` tied to the `CallRoom`.
4. A human or agent runs `/api/mobile/capture/recordings/promote`.
5. Promotion creates or reuses a `StudioMediaAsset` without copying or mutating the original object.
6. Promotion attaches that media asset to the target Nest.
7. If `episodeSlug` is known, promotion adds whole-source imported media into `StudioEpisodeProduction.productionJson.importedMedia`.
8. If the source is video, proxy work remains explicit until a registered proxy exists.
9. Transcript, packet, review, edit, export, and publication states stay separate.

## Role mapping

- `SERVER_MIX` audio: `room-mix-audio`.
- participant or device audio: `spine-audio-candidate`.
- `SERVER_MIX` video: `room-composite-video`.
- participant camera video: `participant-camera`.
- watched/source clip: `reference-clip`.
- supplemental visuals: `b-roll`.

These roles are editor hints, not destructive transformations. A promoted source should stay whole and synced; edit decisions live as metadata.

## Native app behavior

The iPhone app should make the post-capture path obvious:

- show recording evidence,
- show whether Studio media already exists,
- show whether an episode attachment exists when `episodeSlug` is known,
- offer `Attach to Studio` only when a verified recording is safe to promote,
- explain that video still needs proxy readiness before collaborative editing treats it as playback-ready.
- show a simple post-capture runway: source evidence -> Studio attachment -> transcript -> packet review.

The app must not imply that promotion publishes, uploads to a platform, charges Stripe, schedules Calendar, starts LiveKit recording, or deletes local media.

## Editor behavior

The editor should never have to infer meaning from a filename or bucket prefix.

It should ask Nest for attached `StudioMediaAsset` and `StudioEpisodeProduction` truth, then show:

- raw/source evidence,
- proxy readiness,
- role,
- episode attachment,
- transcript/waveform availability,
- review or repair actions.

## Cloud policy

Use the shared media-vault contract:

- source recordings: `media-vault/recordings/mobile/...` or `media-vault/recordings/livekit/...`,
- reusable raw/source imports: `media-vault/raw/...`,
- proxy derivatives: `media-vault/proxy/...`,
- thumbnails: `media-vault/thumb/...`,
- exports/review packets: `media-vault/exports/...`, `media-vault/review/...`, `media-vault/packets/...`.

Do not make a new bucket because a recording feels like a different product category. Make the app-owned record more explicit instead.

## Current blocker note

On 2026-07-08, bucket listing confirmed several media-adjacent buckets, but object-prefix listing under the primary media vault was blocked by GCP billing state. Do not attempt live bucket movement until billing is healthy. Use app-owned dry-run manifests first.
