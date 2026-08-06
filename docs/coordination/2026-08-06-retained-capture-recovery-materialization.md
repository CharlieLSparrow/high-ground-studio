# Retained Capture recovery and episode materialization

Date: 2026-08-06

This operation proved that a failed retained Capture source can be replaced
without mutating or deleting the original recording, then transcribed and
materialized into the canonical Episode timeline from exact protected bytes.
It is local product evidence, not a production-deployment or physical-iPhone
claim.

## Boundary repaired

The first recovery implementation bound a replacement RecordingAsset to the
generic local import vault. That was sufficient for local preview but not for
the Capture-owned transcript worker, which correctly requires a released,
generation-pinned, exact-byte source. Recovery now promotes verified backup
bytes into the deterministic Capture recording namespace before creating the
replacement RecordingAsset.

- Local promotion copies from an already verified file without buffering the
  complete recording in the request, uses exclusive creation, mode `0600`,
  flushes it to disk, and rechecks size and SHA-256.
- Production promotion uses a generation-pinned GCS server-side copy with
  `ifGenerationMatch=0`, then rereads generation, size, content type, and
  SHA-256 metadata.
- The recovery receipt preserves the imported source identity, records the
  durable storage binding, and projects exact-byte verification plus protected
  playback promotion. Idempotent replay repairs legacy storage binding while
  retaining the prior binding as provenance.
- Original silent sources remain append-only superseded evidence. No source
  row, upload receipt, or media object was overwritten.

## Operated retained take

- Room: `cmsfpfwrt000db9xld8ppuon4`
- Capture group: `967f72b2-f762-4535-a337-e69b5676cad1`
- Episode: `capture-sync-rendezvous-qa-20260805`
- Recovered microphone SHA-256:
  `806d8555cabcca2e4ce5300fe7288cfa6ca4b9aa7b0311c75808cca4d5cd24fc`
- Recovered delayed backup SHA-256:
  `48438ca5d6aaff8c10360e526073844b4ce4af7ee745db7c2a3bf5981cec6633`
- Exact-source alignment: `-1.249917s`, opening correlation `0.842679`,
  later correlation `0.849029`, measured residual `0ms` over the retained
  comparison interval.

The two promoted local objects use the Capture recovery namespace under
`media-vault/recordings/recovery/...` with retained generations
`1786056141026` and `1786056158772`. The imported originals remain unchanged.

## Transcript and episode evidence

Local Whisper `large-v3-turbo` completed job
`cmsi382hw000wlqxlez2w0a46` from generation `1786056141026`. The provider
evidence is immutable and retains 47 timed words in three turns. Participant
authorization comes from the finalization-time captured-participant snapshot;
later room collaborators cannot retroactively block a one-person source, while
a missing or revoked captured participant still blocks it.

The provider rendered the product name as `Quipsley` with lower first-word
confidence. That word has **not** been silently corrected and no human-listening
claim has been recorded. Source playback review must precede an accepted
`Quipsly` correction overlay.

The rendered editor materialized the retained take into:

- four total clips;
- recovered microphone audio on A2;
- delayed backup audio on A3 with `1.25s` source trim;
- three source-bound transcript turns;
- exact source hashes, storage generations, signal receipts, transcript job,
  and alignment-review identity in the materialization receipt;
- no guessed speaker-camera mapping and no publication side effect.

Actual operation also exposed a post-materialization UX race: the editor could
briefly label its own canonical write as a collaborator conflict. The handoff
now adopts the response's canonical fingerprint, timeline/transcript payload,
and update time atomically in client state and does not trigger a redundant
reload.

## Reproduce

```bash
QUIPSLY_RETAINED_CAPTURE_RECOVERY_STORAGE_OPERATION=1 \
node scripts/quipsly-retained-capture-recovery-storage-operation.mjs

node --test scripts/dev/quipsly-local-transcript-worker.test.mjs

pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  src/lib/server/mobile-capture-local-vault.test.ts \
  src/app/api/episode-production/capture-takes/route.test.ts \
  src/lib/episode-production/capture-take-materialization.test.ts

pnpm --filter quipsly typecheck
```

The retained operation is loopback-only, requires the explicit guard above,
reads its QA password from Keychain service
`com.quipsly.qa.retained-product`, prints no credential, and reuses the exact
retained recovery assets idempotently.

## Remaining acceptance

1. Reopen the materialized timeline in a clean rendered editor and confirm the
   self-conflict notice does not recur.
2. Proof-listen the exact protected source while reviewing the three transcript
   turns and record any correction as an overlay, never as a provider rewrite.
3. Play the assembled A2/A3 take and verify the delayed backup stays aligned at
   both the opening and later event.
4. Render and probe a versioned rough cut before treating the Episode as an
   editorial deliverable.
5. Repeat recovery from a physical iPhone and from deployed Nest before making
   a release-readiness claim.
