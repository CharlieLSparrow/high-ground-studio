# Transcript provider policy checkpoint

**Date:** 2026-08-02
**Scope:** Quipsly Capture background transcript manifests and worker receipts
**External provider writes performed:** none

## Decision

New Quipsly batch transcript jobs use Deepgram Nova-3 with batch diarizer `v2`.
The complete provider request remains immutable inside the generation-bound
transcript manifest. A retry or reconciliation run uses the stored request;
it does not rebuild provider truth from current environment defaults.

Existing valid manifests remain authoritative, including jobs created with
`diarize_model=latest`, `v1`, or the legacy `diarize=true` request. The route
still rejects any change to the job, actor, recording object, object generation,
byte size, checksum, content type, Session, or RecordingAsset binding.

This is a reproducibility decision. Deepgram currently recommends
`diarize_model=latest` when automatic diarizer upgrades are desired, and its
May 2026 batch API also supports explicit `v2`. Quipsly instead pins a measured
revision so the same private evaluation corpus can explain changes in word
error, speaker confusion, correction time, and cost. A future policy change
creates a new transcript version; it never mutates an existing manifest.

Official references:

- [Deepgram speaker diarization](https://developers.deepgram.com/docs/diarization)
- [Deepgram May 2026 diarization v2 release](https://developers.deepgram.com/changelog/2026/5/14)
- [OpenAI audio transcription API](https://platform.openai.com/docs/api-reference/audio/createTranscription)

## Why OpenAI diarization is not enabled yet

`gpt-4o-transcribe-diarize` now returns speaker annotations through
`diarized_json` and requires an explicit chunking strategy for inputs longer
than 30 seconds. The same current API contract does not expose word timestamp
granularity for that diarized model. Quipsly's canonical `TranscriptWord`,
playback selection, correction overlays, evidence anchors, tasks, goals, and
Studio handoff all depend on stable word-level media time.

Enabling the model now would therefore require one of three unacceptable
shortcuts: discarding word anchors, inventing word times inside a segment, or
silently combining results without a versioned alignment receipt. None is a
production adapter.

Before adding a second provider, Quipsly must:

1. run Deepgram v2 and OpenAI diarized transcription over the same consented,
   private High Ground clean/difficult corpus;
2. measure WER, speaker-confusion error, critical-name error, correction time,
   latency, provider cost, retention/data controls, and failure recovery;
3. define a versioned normalization/alignment receipt if word timing and
   speaker turns come from separate model passes;
4. keep the raw provider response create-once and bind every normalized result
   to source generation, checksum, provider request, worker build, and model;
5. require an explicit policy/version choice for each new transcript job.

## Retry and migration invariant

The former queue path compared an already-stored manifest with a newly built
request using today's environment model and diarizer defaults. That could make
a safe retry fail after an operator changed `DEEPGRAM_MODEL` or the default
diarizer, even though the stored source and provider receipt were valid.

The corrected boundary distinguishes two cases:

- a manifest created in this operation must exactly match the requested source
  and provider policy;
- a pre-existing manifest must exactly match immutable identity/source binding,
  while its already-recorded provider request remains authoritative.

The worker still normalizes and validates the raw response against that stored
manifest, and create-once provider/result objects continue preventing duplicate
billable calls after ambiguous execution failures.

## Verification

- focused manifest-policy tests cover provider-default drift, new-manifest
  exactness, and immutable recording mismatch;
- worker tests cover pinned v2 requests, legacy request replay, provider-receipt
  reuse, transient retry, source-generation failure, and dead lettering;
- the mobile contract smoke requires v2 for newly authored manifests while
  retaining the worker's legacy replay branch;
- the cloud fixture authors v2 without making a provider request unless its
  separate explicit consent and cloud-operation gates are supplied.
