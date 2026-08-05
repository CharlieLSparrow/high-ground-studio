# Podcast audio delivery artifacts

Date: 2026-08-05

## Decision

Quipsly treats mastering promotion, delivery encoding, encoded-byte listening,
output packaging, enclosure upload, and publication as different state
transitions. A promotion chooses the WAV candidate. It does not make an RSS
file. The delivery worker then creates an immutable, source-bound encoded
artifact; a person must proof-listen those actual lossy bytes before a later
output packet may select them.

The first qualified recipe is `apple-podcasts-aac-stereo-v1`:

- AAC-LC in an MP4/M4A container;
- 48 kHz, two channels, nominal 128 kb/s;
- `moov` before `mdat` (`+faststart`) for progressive playback;
- no source metadata copied into the artifact;
- complete decode after encoding;
- post-encode ITU-R BS.1770 measurement against the original mastering
  profile; and
- expected duration within 100 ms of the promoted WAV.

This profile follows Apple Podcasts' recommendation to use AAC in an MP4
container and its stereo guidance of 44.1/48 kHz and 128–256 kb/s. Apple also
specifies roughly -16 LKFS ±1 and no higher than -1 dBFS true peak. Spotify
accepts M4A uploads and its delivery specification recommends MP4 AAC-LC or
MP3 at 128 kb/s or higher. Sources:

- <https://podcasters.apple.com/support/893-audio-requirements>
- <https://podcasters.apple.com/support/823-podcast-requirements>
- <https://support.spotify.com/st-en/creators/article/publishing-audio-episodes/>
- <https://providersupport.spotify.com/article/podcast-delivery-specification-1-9>
- <https://www.ffmpeg.org/ffmpeg-codecs.html>

## Receipt chain

1. `StudioAudioMasterReviewReceipt` — a person reviewed the exact WAV preview.
2. `StudioAudioMasterPromotionReceipt` — that exact preview is the active
   delivery candidate.
3. `StudioAssetProcessingJob(type=audio-delivery)` — deterministic recipe,
   promoted-candidate binding, lease, and immutable worker result.
4. `StudioAssetVariant(kind=audio-delivery-artifact)` — private playback and
   discoverability for the verified artifact; it is not current-state
   authority.
5. `StudioAudioDeliveryReviewReceipt` — append-only approval or rejection of
   the actual encoded bytes.
6. Future `StudioOutputPacket` — episode metadata plus an approved artifact.
7. Future publish attempt/artifact — enclosure upload and destination
   readback.

Every delivery job binds the asset, mastering job, mastering review,
promotion receipt, candidate SHA-256/generation/size/duration, mastering
profile, and delivery profile. Its target locator is deterministic from asset,
candidate SHA-256, and recipe ID. Requeueing the same active promotion safely
converges on the same artifact; a different candidate gets a different path.

## Worker verification

The local worker is lease-based and restricted to the dedicated local media
root. It writes an execution-specific partial file, flushes it, atomically
renames it, and can recover an existing immutable output. Before and after
encoding it rehashes the promoted candidate. It then:

- probes codec, AAC profile, container, sample rate, channels, bitrate, and
  duration;
- parses top-level MP4 atoms and requires `moov` before `mdat`;
- fully decodes the encoded audio with FFmpeg error reporting enabled;
- records SHA-256 and byte length;
- runs a complete BS.1770 measurement on the encoded artifact;
- requires the selected mastering profile to pass after lossy encoding; and
- rehashes the output again after measurement.

Any mismatch fails closed. The source WAV, mastering review, promotion,
episode spine, and timeline remain unchanged.

## Human proof-listen boundary

The browser tracks played second-bins around the beginning, midpoint, and
ending of the encoded artifact. Approval is unavailable until all required
neighborhoods have been played and the active promotion still matches the
delivery job. Rejection requires some encoded playback plus a note. Browser
progress is only gating evidence; it cannot prove audibility, attention, or a
subjective quality judgment.

Approval still does not create an output packet, public URL, RSS enclosure,
upload request, or publication. Episode inventory projects all of those states
separately and holds a formerly approved artifact when its promotion is later
withdrawn.

## Current qualification

- Contract, parser, deterministic-target, drift, and review-coverage tests are
  present.
- A real FFmpeg test encodes an eight-second promoted-quality WAV, verifies
  AAC-LC/fast-start/full decode/post-encode loudness, preserves source SHA-256,
  and recovers the existing artifact.
- The signed-in Episode 8 browser renders the delivery stage but correctly
  withholds encoding because no human mastering approval or active promotion
  exists.
- No fake High Ground Odyssey listening, promotion, output packet, upload, or
  publication receipt was created.

The next layer is an output-packet builder that accepts only the latest exact
delivery approval, validates episode metadata and artwork, creates a durable
enclosure upload intent, and records destination readback without conflating
provider acceptance with publication visibility.
