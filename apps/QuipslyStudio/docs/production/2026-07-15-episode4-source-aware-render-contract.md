# Episode 4 Source-Aware Render Contract

Date: 2026-07-15

## Decision

Episode 4 branch renders now use the canonical equal-clock editorial stem manifest directly:

`/Volumes/My Passport/Quipsly Media Vault/audio/episode-4/v015-editorial-stems/manifest.json`

The old conformed-master approval path is no longer the default render authority. A combined mix is a derived delivery artifact. Charlie, Homer, and reference stems remain editorial truth.

## Verified audio truth

- Charlie: `charlie-contribution-gated.wav`
- Homer: `homer-dji-treated-parity.wav`
- Reference clip: `reference-contribution-controlled.wav`
- All three are 6,799.943 seconds, 48 kHz, stereo PCM.
- All three SHA-256 checksums match the canonical manifest.
- Originals were not modified.

## Verified whole-source picture truth

- Charlie primary camera: 6 recording segments in one source family.
- Homer primary camera: 2 recording segments in one source family.
- Watched source: `ArtShow.mp4`.
- All nine paths and all nine proxy paths resolve.
- Recording segments are not modeled as separate cameras.

## Proof render

Run:

`/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/20260715-episode4-source-aware-proof-v009`

Outputs:

- Video: `main-45-60/episode-4-main-45-60-16x9-v001.mp4`
- Podcast audio: `main-45-60/episode-4-main-45-60-podcast-audio-v001.m4a`
- Manifest: `main-45-60/manifest.json`

Validation:

- 35.021-second 1920x1080 H.264/AAC video.
- 35.021-second 48 kHz stereo AAC podcast audio.
- Video and audio start at sequence zero in the proof output.
- Manifest says source-aware stems were used and a mastered spine alone was not used.
- Measured proof loudness: -14.34 LUFS, -1.47 dBTP, 7.0 LU LRA.
- Source contribution at source time 670-705 seconds:
  - Charlie mean -40.5 dB, peak -18.2 dB.
  - Homer mean -38.6 dB, peak -17.1 dB.
  - Reference is silent at -91 dB, as expected outside the watched clip.

## Efficiency repair

Proof renders now build the delivery mix only through the latest source time needed by the proof. A 35-second output beginning at source time 670 seconds therefore prepares 705 seconds of aligned audio instead of processing the full 113-minute clock.

## Remaining production gap

The proof validates media and audio architecture, not editorial quality. The current long-form branch still uses coarse transcript ranges and mechanical source selection. The next production pass must replace that selector with explicit source decisions informed by speaker activity, reactions, clip context, and the active Studio branch.
