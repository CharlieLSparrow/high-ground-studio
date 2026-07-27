# Capture recording to podcast editor flow

Status: active operating policy
Owner: Quipsly Capture, Nest, and Studio
Last reviewed: 2026-07-27

## Purpose

Quipsly Capture can create local iPhone audio/video, Mac microphone masters,
Canon or other camera sources, LiveKit room evidence, imported fallback
recordings, transcripts, and follow-up packets. These sources must enter the
editor without becoming a mystery pile or losing consent, ownership, or capture
identity.

The recording is first call-room evidence. Only verified, released evidence may
be promoted into reusable Studio media.

## Source-of-truth split

- `CallRoom` owns session purpose, participants, consent, booking, provider
  state, and collaboration context.
- `RecordingAsset` owns recording evidence: capture/source identity,
  START/STOP, upload/provider receipt, consent relationship, immutable storage
  verification, transcript jobs, and promotion trail.
- `StudioMediaAsset` owns reusable raw or derivative media plus variants,
  thumbnails, workflow jobs, and Nest attachments.
- `StudioEpisodeProduction.productionJson.importedMedia` owns episode-editor
  meaning: role, capture group, proxy readiness, reviewed alignment, and
  whole-source availability.
- Timeline and transcript edits are reversible metadata. They do not mutate
  source bytes.
- Buckets hold bytes; they do not decide whether a file is the spine,
  participant camera, room composite, reference clip, or b-roll.

## Promotion contract

1. Quipsly creates a capture group/session and durable consent/START evidence.
2. iPhone, Mac, provider egress, or approved import produces immutable source
   evidence.
3. Canonical finalization verifies the exact object generation, size, type, and
   checksum.
4. The verified source remains a `RecordingAsset` attached to its original
   room/session evidence.
5. An authenticated user explicitly calls
   `/api/mobile/capture/recordings/promote` for an authorized Nest and optional
   episode.
6. Promotion authorizes the exact destination before creating reusable source
   or media records.
7. Promotion creates or reuses `StudioMediaAsset` without copying or mutating
   the original.
8. If `episodeSlug` is known, promotion attaches the whole source to
   `StudioEpisodeProduction.productionJson.importedMedia`.
9. Video queues or reconciles proxy work; it is not labeled collaborative
   playback-ready until a registered proxy receipt exists.
10. Transcript, packet, alignment, edit, export, and publication remain
    independent states with separate evidence.

The app must not imply that promotion publishes, uploads to a public platform,
starts provider recording, charges a payment, schedules a calendar event, or
deletes local media.

## Role mapping

- `SERVER_MIX` audio → `room-mix-audio`
- participant/device audio → `spine-audio-candidate`
- `SERVER_MIX` video → `room-composite-video`
- participant/device camera → `participant-camera`
- watched/reaction/source clip → `reference-clip`
- supplemental visual → `b-roll`

These roles are editor hints, not destructive transformations.

Role inference may produce a reviewable suggestion, but only an authenticated
human decision should select the episode spine or approve a final alignment.

## iPhone behavior

After capture, Quipsly Capture should show one calm runway:

1. Source evidence
2. Verified upload/provider receipt
3. Studio attachment
4. Proxy/transcript readiness
5. Packet and human review

`Attach to Studio` is available only for a verified, released recording with an
authorized destination. The app shows the selected Nest/episode before the
write and reads back the resulting media/attachment identity afterward.

Local originals remain visible and preserved. Promotion is not permission to
delete them.

## Mac and camera behavior

- A Mac microphone master records a local 48 kHz/24-bit WAV with durable
  START/STOP and device-route evidence.
- A Canon R8 or other camera source is ingested as an immutable file; the
  importer records camera/container/stream metadata and hashes the final bytes.
- Mac call audio and headphones may use the Shure MV7i while the independent
  local master remains the production source.
- Each device source receives its own recording/upload identity inside a shared
  capture group. Sources are not concatenated or rewritten to pretend they were
  one device.
- Capture-clock evidence is a rough proposal. Guided Sync requires opening
  waveform correlation, later-take drift review, and explicit reversible human
  approval.

## Editor behavior

The episode editor must show:

- immutable recording/source identity and capture group;
- role and owning room/session;
- raw playback and proxy readiness separately;
- waveform/transcript readiness;
- clock proposal separately from reviewed alignment;
- authenticated reviewer, evidence, drift measurement, and undo;
- repair/relink actions that do not destroy timeline decisions.

The editor must not infer final meaning from filename, local path, or bucket
prefix.

## Cloud storage

Use the shared media-vault policy:

- mobile sources → `media-vault/recordings/mobile/...`
- provider room sources → `media-vault/recordings/livekit/...`
- imported reusable sources → `media-vault/raw/...`
- proxies → `media-vault/proxy/...`
- thumbnails → `media-vault/thumb/...`
- exports and packets → versioned `media-vault/exports/...`,
  `media-vault/review/...`, or `media-vault/packets/...`

Do not make a new bucket because a recording feels like a different product category.
Use app-owned metadata to state its role.

## Failure and recovery

- Held or revoked consent quarantines downstream projection and publishing; it
  does not erase source evidence.
- Interrupted capture closes the durable room boundary and preserves recoverable
  segments.
- Upload retry reuses one immutable request/source identity.
- Source-generation drift fails before proxying, transcription, or promotion.
- Duplicate promotion reconciles the existing media/attachment identity.
- Cross-project or cross-account destination drift fails closed; it never falls
  back to a different Home Nest.
- An undo restores the prior metadata packet. Originals and older versioned
  exports remain intact.

## Acceptance

This flow is ready only after a real source can be captured, verified, promoted,
read back in its Episode Room, proxied if video, reviewed against playback,
transcribed, attached to notes/tasks, and handed to Studio without copying or
mutating the original. Automated contracts alone do not satisfy the physical
iPhone, MV7i, Canon, TestFlight, or real-episode gates.
