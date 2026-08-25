# Coaching local media flight result

## Outcome

The fresh two-person coaching flight now reaches a protected, usable post-call state without test-only database writes:

1. A fresh coach and client create accounts, schedule, hand off an invitation, and enter the same Session.
2. Neighboring Nests, Sessions, relationships, podcast material, and private test artifacts remain absent from both accounts.
3. Both endpoints join through the conventional lobby, grant in-room consent, chat, and retain independent participant-owned recordings.
4. Quipsly verifies and decodes both exact sources, transcribes them with participant attribution, and serves protected range-capable playback.
5. The coach downloads the mentor transcript report from the rendered interface and works with shared and private follow-through.
6. The Session supports transcript-first correction, inline light edits, a private preview, client release, recipient playback, and revocation.
7. Released audio automatically enters signal analysis. The ordinary Session reconciles completed results and refreshes its calm post-call summary without exposing the processing console.

The original source bytes and Capture manifests remain unchanged throughout transcript, playback, editing, sharing, and audio-improvement operations.

## Architecture decisions

### Local and cloud transcript evidence are separate, equally strict receipt shapes

Cloud transcript readiness still requires its manifest, result, provider, and worker receipts. A local Whisper result may satisfy the same readiness boundary only when its durable receipt proves all of the following:

- the expected local-result schema and completed state;
- the transcript job identity;
- exact source SHA-256 and generation equality;
- immutable provider evidence and a non-mutation policy;
- a checksum-addressed provider-evidence path confined to that job;
- valid processing timestamps;
- segment and word counts equal to the canonical database rows; and
- a worker build identity.

Missing or contradictory evidence remains `REVIEW_REQUIRED` or `HELD`; a completed status and nonzero segment count are not sufficient.

### Protected playback supports the local vault as a first-class source

The authenticated Session media route now recognizes the configured local Capture vault in addition to cloud objects. Before streaming, it verifies the immutable binding, source generation, byte length, content type, and checksum metadata. It supports `HEAD`, complete responses, and byte ranges while confining every path to the vault root.

### Audio analysis is an idempotent post-release consequence

Audio signal analysis queues only after an audio source is promoted and its processing disposition is `RELEASED`. Video, held media, and incomplete promotions do not queue. Queue failure does not invalidate already-verified source finalization; a repeated finalize or release request retries the idempotent scheduling boundary.

### The ordinary Session owns post-call continuity

The Session projection reconciles completed signal jobs against the exact Studio source and uses a bounded refresh window while work is genuinely in progress. The default view communicates protected sources, transcript readiness, and edit/share availability. Technical source identities and processing evidence stay collapsed under Recording details.

## Retained evidence

- Fresh flight receipt: `artifacts/coaching-acceptance/651812ca/fresh-coaching-flight-receipt.json`
- Fresh flight context: `artifacts/coaching-acceptance/651812ca/fresh-start-context.json`
- Retained audio-polish receipt: `artifacts/coaching-acceptance/5ac6e57c/session-audio-polish-receipt.json`
- Focused regression result: 77 tests across playback authorization, transcript readiness, transcript correction/report download, source journey, recording share, finishing cockpit, and automatic audio scheduling.
- Quipsly typecheck: passed after route generation.

The fresh flight also generated a 12,746-byte, two-source mentor transcript DOCX through the rendered interface and proved that release returns authorized playback before revocation and `404` afterward.

## Honest boundaries

This is strong local product automation, not final human acceptance. It used ephemeral authentication, a local invitation adapter, browser fake media, and controlled text-to-speech. It does not prove real mailbox delivery, natural-speech accuracy, human comprehension, physical iPhone behavior, human listening quality, production scale, or production deployment. Those checks remain in the validation ledger and do not block independent implementation work.

## Next continuous lanes

1. Turn the retained operation into a deliberate release candidate once cloud authorization and the release train are ready.
2. Prove the same journey on a physical iPhone and with minimally instructed people without treating that appointment as a blocker for local work.
3. Continue improving source alignment, audible-event transparency, transcript accuracy/correction, and reversible audio/video automation.
4. Keep simplifying the ordinary lobby, call, and post-call surfaces while preserving evidence and recovery under progressive disclosure.
