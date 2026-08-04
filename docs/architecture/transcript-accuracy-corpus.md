# Transcript accuracy corpus

Date: 2026-08-03

Status: local production-shaped implementation, provider evidence ledger, and
cross-session evidence desk; genuine corpus collection open

## Product promise

Quipsly will not present provider confidence as transcription accuracy. Accuracy
is measured only against a reference that an authorized Session reviewer
checked against the protected source. The reference is an append-only artifact;
it is not a mutable transcript field and it never rewrites provider evidence.

This is the ground-truth layer for the three premium media pillars:

1. transcription scorecards by real workflow and recording condition;
2. reversible audio mastery proposals measured against immutable source; and
3. source-backed video edit proposals whose words, speakers, and timing can be
   inspected and proof-watched.

## Canonical record

`TranscriptEvaluationWindow` freezes:

- room, transcript job, recording asset, and approving account;
- idempotent client operation ID and a stable hash over the complete window;
- podcast/coaching workload and controlled condition labels;
- exact source range, duration, SHA-256, generation, and protected playback ID;
- the complete current consent-version hash;
- measured complete-source playback coverage in one-second bins;
- reviewed reference revision, content hash, ordered words, source segments,
  and playback-review receipt IDs;
- the provider/model/request/build snapshot that produced the candidate; and
- approval timestamp and bounded review note.

Version one accepts one complete 60–180 second recording. Longer-source window
selection is deliberately deferred until the UI can prove exact in/out points
and review completeness without hidden segment truncation.

## Authority and privacy

Approval requires staff authority, Session creator, Session participant,
booking coach/client, or project owner/editor. Project viewers may read an
accessible Session but cannot approve a corpus window. An account without room
access cannot discover readiness or stored windows.

The browser projection excludes reference words, provider transcript text,
reviewer identity, raw provider payload, storage paths, and review notes. It
shows only readiness counts, classifications, dates, hashes/revisions needed
for audit, and whether a prior window differs from the current reviewed
reference.

The provider runner reads the private stored payload through an explicit,
authenticated, no-store export. Aggregate reports continue to
exclude transcript text and identity. Corpus evidence is not public training
data and reference approval invokes no provider.

Provider attempts are separate append-only records. Each freezes the source and
reference hashes, run key, provider/model/adapter/configuration, capability
boundary, policy receipt, private raw response, normalized words, server-scored
metrics, latency, cost observation, and failure evidence. Measured human
correction effort is a later receipt; it never rewrites the candidate.

## Concurrency and replay

Approval computes a stable hash over source, consent, provider, review, and
classification evidence. It then re-reads and re-hashes the complete evidence
inside a serializable transaction under a transcript-job advisory lock.

- Exact actor/operation replay returns the existing window.
- Reusing an operation ID for different evidence returns a conflict.
- A concurrent identical approval resolves to one window.
- A changed transcript review, consent version, source binding, playback
  promotion, or classification fails closed and asks the reviewer to refresh.
- Historical windows are never updated to look current; the projection marks a
  prior reviewed revision when current reference text changes.

## Reviewer UX

The Transcript desk now contains a **Private transcription lab** after audio
observability and before correction controls. It makes the sequence visible:

1. listen to the complete protected source (scrubbing does not count);
2. correct a segment or confirm it as heard;
3. identify speakers independently when evidence supports it;
4. inspect reviewed segment, word, timing, and speaker coverage;
5. classify the real recording conditions; and
6. explicitly add the exact reference to the private corpus.

Blocked states explain the missing evidence and expose no approval control.
Classification never guesses from transcript text or IDs.

The permission-scoped **Transcription evidence** desk at `/transcription`
provides the operating view across accessible Sessions. It shows the complete
six-condition podcast and six-condition coaching matrices, exact
provider/model/adapter/config comparisons, clean and difficult WER, speaker
error, word-timing drift, latency, cost, failure receipts, and measured human
correction work. Every retained Session links back to its protected transcript
desk. The projection contains no transcript text, reviewer identity, source
path, provider policy URL, or raw response and cannot invoke a provider or
change a production default.

An approved reference is now valid corpus evidence before any provider attempt
exists. The evaluator reports its coverage with an empty provider list instead
of rejecting it. This matches the durable workflow: establish human truth
first, then compare pinned candidates against the same bytes.

## Operated evidence

- Prisma schema validates and the committed migration applied to local
  PostgreSQL.
- A local database integration creates a controlled 60-second recording,
  consent, release, playback promotion, completed transcript, provider words,
  and review receipt; incomplete playback is rejected, complete approval
  persists once, exact replay creates no duplicate, changed replay conflicts,
  and a separate account is denied.
- Focused server, route, and React suites cover fail-closed readiness, public
  text exclusion, authentication, explicit mutation routing, and the visible
  condition-selection workflow.
- Focused board tests cover the cross-session 12-condition gap projection,
  exact provider evidence, correction-effort aggregation, shared Session
  authorization, and exclusion of private words, reviewer IDs, policy URLs,
  and source hashes. The evaluator suite proves candidate-free human references
  remain measurable and insufficient rather than invalid.
- Provider comparison identity is stable across source windows: it hashes the
  pinned provider settings, while the separately bound exact request receipt
  includes each window's distinct derivative bytes. This prevents one provider
  build from being fragmented into a pseudo-provider per recording.
- The live local desk was opened under a non-staff HGO editor account. It and an
  independent database count both reported 0 approved windows, 0 provider
  attempts, and 0 correction passes; no sample scores were substituted.
- The retained Episode 4 HGO 60-second source renders at 0/5 reviewed and keeps
  corpus approval unavailable. No review was fabricated: this agent cannot
  honestly substitute provider output for a person listening to that audio.

## Remaining gates

- A person must playback-review and classify the retained HGO window.
- Collect at least six windows covering every podcast condition and six covering
  every coaching condition.
- Run pinned Deepgram, OpenAI diarized, and physical-device Apple candidates or
  retain a dated exclusion decision.
- Measure clean/difficult WER, speaker error, timing drift, correction time, and
  recovery behavior before changing a production default.
- Prove the same boundary with genuine separate accounts in production and a
  physical iPhone source.
