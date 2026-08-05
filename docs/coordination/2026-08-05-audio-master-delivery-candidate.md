# Audio master delivery-candidate lifecycle

Date: 2026-08-05

## Outcome

Quipsly can now carry a verified audio-mastery preview through an explicit,
reversible editorial lifecycle without confusing it with the immutable source,
episode spine, encoded delivery file, upload, or publication.

The lifecycle is:

1. complete-decode source measurement and signal diagnosis;
2. separate 48 kHz, 24-bit PCM loudness-only preview;
3. independent complete-decode verification;
4. source/preview audition with matched and delivery monitor levels;
5. append-only playback-bound approval or rejection;
6. append-only promotion of the latest exact approval as the asset's active
   delivery candidate; and
7. append-only withdrawal with a required reason.

Promotion and withdrawal never delete bytes or receipts. A historical
`audio-master-candidate` variant remains discoverable after withdrawal, while
current state comes only from the latest asset-level promotion event.

## Production invariants

- The source SHA-256, storage generation, size, attachment, and authorization
  are rechecked before review or promotion.
- The preview SHA-256 and size are rechecked inside the authorized media root.
- Promotion requires the latest completed mastering job and its latest exact
  `APPROVED` listening receipt.
- Asset-wide advisory locking and a serializable transaction prevent competing
  mastering jobs from becoming current concurrently.
- Stable client-request IDs make exact retries idempotent and changed retries
  conflict.
- One active candidate can be withdrawn without deleting its review,
  promotion, variant, or derivative bytes.
- Episode inventory exposes the active candidate but does not select it for an
  export automatically.
- No promotion operation changes timeline or spine state, creates a delivery
  encoding, uploads to a publisher, or publishes.

## Operated Episode 8 proof

The retained media operator opened the real local High Ground Odyssey Episode
8 editor through its explicit `EDITOR` grant. The retained coaching identity
was independently denied the same private editor.

On the healthy, transcript-backed `Ted Lasso Be Curious.mp4` original, the
rendered product queued and completed mastering job
`audio_mastery_66b0f5dcead14fad9f91185a110e106d` in about twenty seconds.
The receipt bound source SHA-256
`acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`
to verified preview SHA-256
`7540369d46eb5d038b3fe0ff2de7f06efa48b791a6d40d6390f929b4b71c5de6`.
The independent output verification passed.

The rendered audition desk then proved:

- both media elements reached ready state with a 254.63-second duration;
- mastered playback advanced;
- switching to the immutable source preserved the shared playback clock;
- playback paused cleanly;
- matched-loudness and delivery-level monitoring were both operable;
- deterministic channel-imbalance and near-silence observations remained
  listening candidates, not automatic repairs;
- the processing-change navigator moved the shared evidence clock;
- the 1280 by 720 dialog had no horizontal overflow; and
- approval remained disabled and promotion remained unavailable because no
  human listening claim was made.

Database readback showed the job `completed`, verification `passes: true`, and
zero promotion receipts. The source was not replaced and the Episode 8 spine
remained unset.

## Verification

- Seven focused schema/service/route/UI suites: 38 tests passed.
- Complete Quipsly regression: 312 suites and 1,630 tests passed; 40 suites
  and 123 database/operation tests remained intentionally opt-in.
- Quipsly strict TypeScript: passed.
- Prisma schema validation: passed.
- Local PostgreSQL: 66 migrations, schema current.
- Optimized Next production build: passed with 173 generated static pages and
  the promotion route present in the route manifest.
- Scoped diff checks: passed.
- Signed-in retained Episode 8 mastering and audition operation: passed.

## Remaining release boundary

- A human must genuinely listen across every evidence-selected moment in both
  versions and both monitor modes before approving a real delivery candidate.
- The candidate still needs a separate export recipe, delivery encoding,
  encoded-file measurement, proof-listen, upload receipt, and publication
  action.
- Cloud execution remains unqualified; this operation used the durable local
  worker and protected local media.
- Physical-iPhone capture, upload, synchronization, and source-to-master
  proof-listen remain required by the unified product goal.
