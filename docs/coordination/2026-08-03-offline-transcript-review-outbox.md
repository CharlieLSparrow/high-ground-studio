# Offline transcript-review outbox — 2026-08-03

## Outcome

Quipsly Capture can now preserve a human transcript correction or an explicit
“correct as heard” confirmation when Nest is unavailable, provided the person
has played the exact retained local recording through that segment. The phone
writes the complete decision before attempting the network and does not claim a
canonical correction until Nest returns an exact safety acknowledgement.

This closes the prior product gap where protected offline transcript readback
and exact local playback worked, but the resulting human review decision had to
be discarded or repeated after reconnecting.

Implementation commit:
`3d3c40c24797e8b6c1b29c8913c130e7bac15dd1`.

## Architecture and safety boundary

- The new `TranscriptReviewDecisionOutbox` is account-partitioned and stored in
  Application Support with atomic writes and complete-until-first-unlock file
  protection. A last-known-good copy is retained; an unreadable canonical
  ledger fails closed and becomes read-only rather than being replaced by an
  empty ledger.
- Each entry binds one stable UUID-derived request identity to the room,
  segment, immutable provider text/speaker expectation, expected active overlay
  identity, exact playback position, corrected content or as-is decision, and
  capture time.
- Only one pending decision can exist for a segment. Provider evidence and
  media timing are never rewritten on the phone, and retries reuse the same
  request identity instead of creating duplicates.
- Retryable transport, rate-limit, timeout, and server failures remain queued.
  Authorization, stale-evidence, conflict, and malformed acknowledgement states
  are held for explicit review. A held decision is never silently rebased or
  merged last-write-wins.
- Removal from the phone ledger is part of acknowledgement. If Nest accepts the
  decision but protected local removal fails, synchronization is not reported
  complete; the same stable request remains visible for idempotent recovery.
- Nest acknowledgement must return immutable-provider, versioned-overlay, and
  preserved-media-time boundaries plus correction or verification content that
  exactly matches the protected phone decision. An incomplete or different
  acknowledgement is held as `ACKNOWLEDGEMENT_MISMATCH`.

## iPhone UX

- A global transcript-review card reports waiting and held decision counts.
- The exact segment reports whether its decision is queued or held, including
  the last reconciliation message. Held work exposes a deliberate review-and-
  retry action only when canonical network authority is available.
- Protected-cache copy now accurately explains that exact playback-reviewed
  transcript correction can queue while packet, task, goal, note, and AI
  proposal decisions remain locked.
- Offline actions say **Queue correct as heard** and **Queue reviewed
  correction**. Online actions retain their direct confirmation language, but
  still protect the phone decision before sending it.
- Preview data remains no-write, remote-only sources cannot be treated as
  heard, and an AI proposal remains non-authoritative.

## Verification

- Swift parse and patch hygiene: pass.
- Transcript correction server suite: 13/13.
- Nest strict TypeScript: pass.
- Mobile/Nest source and unauthenticated boundary smoke: pass, including the
  new stable-idempotency, account-partition, exact-acknowledgement, and
  local-ledger-close contract.
- Capture release-source invariants: pass at version 1.0 (27).
- Focused operated iPhone 17 Pro / iOS 26.3.1 Simulator proof: 2/2. It proves
  preview/AI truth locks and decision persistence through app termination,
  same-account recovery, different-account invisibility, and restoration after
  returning to the original account:
  `/private/tmp/quipsly-transcript-outbox-final-20260803.xcresult`.
- Complete deterministic Capture, Google-first login/account, and Share
  Extension suite: 55/55, zero failures or skips:
  `/tmp/quipsly-capture-ui-tests/438c9553c423-dirty/20260803-transcript-outbox-full/HighGroundCapture.xcresult`.

## Release and remaining proof

This is the first post-Build-27 product slice. Build 27 remains the sealed,
qualified, no-upload candidate from exact source
`56f3e85d8934bb5a50f929f019e1bd6e08a0a46a`; it does not contain this change.
No build number was changed, no IPA was produced, and no TestFlight, App Store,
cloud-build, deploy, database, or provider mutation occurred.

The next release should continue batching coherent product improvements before
qualifying Build 28. Before this offline path can satisfy the product goal, it
still needs a physical iPhone operation against a real protected cached
transcript, intentional network loss, correction and as-is decisions, process
death, reconnect, exact Nest readback, stale-overlay conflict handling, and
separate real-account privacy proof. Production Nest reachability and live cloud
cost readback also remain separate gates; current Google user and ADC tokens
must be refreshed before those read-only audits can resume.
