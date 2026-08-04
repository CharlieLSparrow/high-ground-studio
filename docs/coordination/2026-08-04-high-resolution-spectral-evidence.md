# High-resolution spectral evidence checkpoint

Date: 2026-08-04

## Outcome

Quipsly now has one durable high-resolution spectral evidence lane for podcast
and coaching media. A native complete decode produces a fixed-offset,
source-hashed multiresolution tile pack; authenticated Studio and Session
surfaces request only the protected tiles visible at the active zoom and move
the same playback clock used for transcript review.

This is a visibility foundation for audio mastery automation, transcription
accuracy review, and automated video-edit proposals. It deliberately creates
no edit or treatment by itself.

## Real-media operation

The retained operation completed and reverified exact source and pack hashes
for:

- High Ground Odyssey Episode 8's `Ted Lasso Be Curious.mp4`, with 1 overview,
  9 browse, and 51 detail tiles;
- the retained coaching follow-up source, with 1 overview, 3 browse, and 16
  detail tiles.

The signed-in rendered Studio operation opened the full transcript/audio desk,
operated all three pyramid levels, moved the shared playhead, and received 11
successful protected tile responses. The signed-in coach operation followed
the saved continuity evidence back to the exact Session transcript, operated
all three levels, and received 6 successful protected tile responses. Both
reported zero browser exceptions and no horizontal overflow. Client and
outsider continuity visibility remained concealed, and the operation neither
mutated the source recording nor produced external effects.

## Defects found by doing real work

Two clock/storage defects were discovered before the retained proof passed:

1. PostgreSQL could not infer the release query's timestamp parameter in every
   branch. The durable worker now casts timestamp and status parameters
   explicitly.
2. FFmpeg may emit only complete five-second frames for a fractional final
   interval. Quipsly now renders and verifies the exact partial tail separately
   instead of silently losing it or shifting the source clock.

The rendered smoke initially expected a generic binary MIME type while the
endpoint correctly returned Quipsly's explicit spectral-tile type. The smoke
was corrected to assert the stronger semantic response contract.

## Verification at checkpoint

- shared contract, max-pooling transient retention, real FFmpeg clock/frequency,
  worker source/pack binding, privacy projection, API access, transcript desk,
  and Session context tests pass;
- strict TypeScript passes for the media contract, processor, and Quipsly;
- retained data operation and both authenticated rendered workflows pass;
- the complete Quipsly suite passes with 281 suites and 1,487 tests, with 38
  suites and 110 tests intentionally skipped by their existing gates;
- the media processor bundle and the 172-route Quipsly production build pass;
- strict repository health and whitespace validation pass.
