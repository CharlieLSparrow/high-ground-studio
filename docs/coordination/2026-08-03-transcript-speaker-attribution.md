# Transcript speaker attribution

Status: implemented and locally verified on 2026-08-03. Production schema migration and release remain deliberately deferred to the normal Quipsly release train.

## Product contract

A person can now listen to one to three protected playback samples for a provider diarization cluster, select a real Session participant, and identify that voice once for the current transcript job. Nest projects the identity across the cluster; Capture consumes the same effective identity and displays its provenance.

Speaker identity is intentionally separate from transcript word review:

- provider segments, words, labels, timestamps, and media remain immutable;
- a cluster attribution does not create a `TranscriptCorrection`;
- a cluster attribution does not create a `TranscriptSegmentVerification` or mark words human-reviewed;
- a segment-specific accepted correction remains authoritative above a session-wide mapping; and
- AI output cannot create or accept a speaker attribution.

The Nest desk labels this action `Identify a voice once`, requires an actual Session participant, protected playback, a selected sample, and an explicit recognition acknowledgement. Every mapped segment states that the displayed identity does not claim its words were playback-reviewed. The iPhone shows the same `Voice identified from Session samples` boundary when it reads the canonical Session transcript.

## Storage and concurrency boundary

`TranscriptSpeakerAttribution` is an append-preserving audit model, not another correction shape. An active row binds:

- Session, transcript job, and immutable recording asset;
- provider speaker label and the SHA-256 snapshot of every segment in that cluster;
- canonical participant identity plus durable user, display-name, and email snapshots;
- one to three exact segment/playback-position samples;
- reviewer, review time, protected playback source, request ID, and review note.

A partial unique index permits exactly one active attribution for each transcript-job/provider-label pair. Reassignment supersedes the prior row instead of rewriting it. Reviewer/request identity is unique for replay safety.

The mutation is serializable and takes the same transcript-packet source lock used by corrections plus a speaker-cluster lock. After both locks it rechecks the complete provider cluster, current participant, recording/finalization/consent release gate, and active attribution. Stale source evidence, changed intent under one request ID, withdrawn release authority, or a competing assignment fails closed.

No 1,000-segment evidence cap remains on this boundary. Packet projection independently recomputes the complete provider-cluster hash and ignores an attribution if its reviewed snapshot no longer matches.

## Packet and downstream behavior

The effective packet speaker order is:

1. accepted segment-specific correction;
2. current playback-reviewed cluster attribution;
3. immutable provider speaker label.

The packet snapshot records `acceptedSpeakerAttributionId`, so a new or changed mapping makes prior notes, goals, and task candidates stale. Existing packet artifacts remain inspectable but locked until the actor builds a new append-only packet. The attribution never changes `acceptedReviewId`, `reviewStatus`, or the human-reviewed segment count.

Every packet build, stale check, Session-note materialization, task decision, and goal decision now reads the active attribution set. A stale or mismatched attribution is ignored rather than projected.

## Operated local acceptance

The retained local Nest was migrated and operated against the real playback-backed Episode 4 transcript fixture through the rendered product as the retained media operator.

- Played the protected audio sample at 3.692 seconds.
- Assigned provider cluster `Speaker` to participant `Charlie` through the visible Nest control.
- Replayed the exact request ID and received the same attribution ID without another row.
- PostgreSQL readback found exactly one active attribution.
- All five provider segments and their hashes remained unchanged.
- Transcript-correction and segment-verification counts remained unchanged.
- Existing packet-note count remained unchanged.
- The prior packet became `TRANSCRIPT_REVIEW_CHANGED` and could no longer materialize stale candidates.
- A separate retained outsider received HTTP 404 and no Session title, participant label, or transcript text.
- The rendered desktop surface had no horizontal overflow and raised no browser exception.
- The operation created no task, goal, note, Calendar event, message, delivery, publication, or other external side effect.

The repeatable operator is `pnpm quipsly:retained:transcript-speaker-attribution`. It accepts only loopback Nest and PostgreSQL, reads fixed QA credentials from macOS Keychain, clears rendered sessions, and prints no credentials.

## Verification evidence

- Focused attribution, packet, and rendered-component suites: 41/41 passing.
- Full Nest Jest run: 244 passing suites and 1,306 passing tests; 37 suites and 108 tests remain intentionally skipped by their existing gates.
- Cross-surface Quipsly contract suites: 257/257 passing.
- Strict Quipsly TypeScript check: passing.
- Prisma schema validation and local migration status: passing; 44/44 local migrations current.
- Strict repository health: healthy.
- Unsigned iOS Simulator build: `BUILD SUCCEEDED`.
- Optimized Next.js production build: 163/163 pages generated with the established 8 GB Node heap. The default 4 GB heap compiled successfully and then exhausted memory during Next's TypeScript phase.

No production database, Cloud Run service, TestFlight build, real collaborator account, provider Calendar, or external delivery system was changed in this slice.
