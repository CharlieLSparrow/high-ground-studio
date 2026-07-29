# Quipsly Studio Production Audio Workflow

Audio work is a staged, source-aware pipeline. Each stage produces an inspectable derivative and receipt before the next stage starts. Original recordings remain immutable.

## Stage contract

0. **Immutable capture**
   Preserve every original host, guest, clip, and camera-audio file. Record identity, sample rate, channel layout, duration, and checksum.

1. **Sequence-clock conform**
   Place each source on the shared episode clock. Keep Charlie, Homer, clip, and room tracks separate and equal in timeline duration. Camera audio is sync evidence, not the preferred delivery source.

2. **Per-source repair**
   Process one speaker source at a time. Apply only the needed operations: denoise, de-reverb, voice isolation, de-click, EQ, or restoration. Write a new version and receipt after every material transformation.

3. **Dialogue activity and gain automation**
   Attenuate non-speaker regions, echo bleed, and park noise with reversible envelopes. Preserve laughs, breaths, reactions, and intentional overlap. Do not shorten the sequence clock.

4. **Editorial premix**
   Render the active edit from the repaired, clock-aligned stems. This is where SHOW, SKIP, clip insertion, conversation timing, fades, and host balance become audible.

5. **Measured delivery master**
   Run a measured two-pass EBU R128 master. Current podcast target: -16 LUFS integrated, true peak no higher than -1.5 dBTP. Keep the lossless WAV master and its JSON receipt.

6. **Delivery encode and verification**
   Encode the video and podcast derivatives. Measure the encoded AAC output again because codec conversion can change peaks and loudness. Verify duration, channels, sample rate, and transition speech.

7. **Versioned archive**
   Copy only validated derivatives to the release folder. Never overwrite an earlier version. Hash the archived video and podcast files and write a release manifest.

## Operating rule

If a stage fails, repair that stage and produce a new version. Do not rerun unrelated stages or tune the final output by guessing at the whole chain.
