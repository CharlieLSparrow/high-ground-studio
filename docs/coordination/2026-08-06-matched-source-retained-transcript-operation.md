# Matched-source retained transcript operation

Date: 2026-08-06

## User promise

An authorized producer can deliberately start transcription for one exact,
released RecordingAsset, follow the durable local job to completion, and inspect
the result in its Session without creating downstream work or overstating model
accuracy.

This is a retained QA artifact. It is not a production-user transcript, a
publication action, or a human-verified reference transcript.

## Operated source

- Session: `cmsfpfwrt000db9xld8ppuon4`
- RecordingAsset: `cmsi2v4l4000rlqxl78h1w8t3`
- File: `dji-backup-delayed.wav`
- Kind and state: verified `LOCAL_AUDIO`, explicitly released for transcription
- Duration: 18.395458 seconds
- Size: 2,649,048 bytes
- TranscriptJob: `cmsi6pqf7000uazxlrp1ytaea`
- Provider: launcher-owned `openai-whisper-local`; no cloud-provider cost

The operation requires an explicit mutation guard, accepts only loopback Nest,
Firebase Emulator, and PostgreSQL origins, obtains the retained test operator's
password from Keychain, and prints no credential.

## Result and honest quality boundary

The completed job contains four immutable segments and 47 words, covering about
1.00 through 18.24 seconds. Exact-source HTTP readback selected that same job and
the same segment count.

For a deterministic consistency signal, the operation compares the result with
the existing transcript from the independently captured microphone source. The
Levenshtein word error rate was 1 / 47, or 2.1277%. The microphone transcript
rendered the product name as `Quipsley`; the DJI backup rendered it as
`Quipsly`.

That comparison answers whether two recordings of the same short performance
produced materially consistent text. It does **not** establish human-verified
accuracy, speaker correctness, punctuation quality, or semantic truth. No
correction overlay was invented and no playback review is claimed.

## Downstream safety and integration finding

Before and after counts prove the operation created:

- one durable source-bound transcript version on the first run and zero on a
  replay;
- zero Notes;
- zero Tasks;
- zero Goals;
- zero publication actions.

The read-only source journey then updated without a special migration: both
recovered masters gained complete Transcript checkpoints. Before an explicit
editor update, both Editor checkpoints were `CURRENT`, not `COMPLETE`, because
the canonical assembly had moved to `READY_TO_MATERIALIZE`. After the separately
operated rendered update, both Editor checkpoints became complete and the
assembly converged to `MATERIALIZED_MEDIA`. Its next action still asks the
producer to resolve speaker/camera review warnings before an automated camera
assembly. This is the intended conflict-safe boundary: new evidence can make an
edit stale, but cannot silently rewrite it.

## Reproduction and verification

Run from the repository root against the local retained stack:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
  pnpm quipsly:retained:session-transcript-quality
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
  pnpm quipsly:retained:session-transcript-source-focus
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
  pnpm quipsly:retained:session-source-journey
node --test scripts/quipsly-retained-session-transcript-quality-operation.test.mjs
node --test scripts/quipsly-retained-session-source-journey-operation.test.mjs
pnpm --filter quipsly typecheck
git diff --check
```

Replaying the first command must reuse the completed source-bound job rather
than create another version. Read-only packet and journey operations must not
change durable counts.
