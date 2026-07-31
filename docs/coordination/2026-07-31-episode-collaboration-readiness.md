# Episode collaboration beside Capture

Checkpoint: 2026-07-31 MDT

## Product outcome

An episode-bound Capture session now carries the same canonical collaboration
thread as its Nest Episode Room. The thread sits beside Manuscript and Watch in
the iPhone recorder instead of living in the obsolete standalone mobile chat
surface.

This is an episode-production conversation for writing, recording, editing,
and publishing decisions. Opening it never starts recording or playback.

## Ownership and authorization

- The client sends `projectSlug` and `episodeSlug`; the server derives the
  canonical `episode:<slug>` thread key.
- Before loading or creating the thread, the server verifies both active Nest
  access and a `StudioEpisodeProduction` with that exact project and slug.
- Owner and Editor grants can post. Viewer grants can read but cannot post.
  An outsider receives the same unavailable boundary for an existing episode
  and cannot create an invented shadow-episode thread inside another Nest.
- GET returns the canonical episode identity and the actor's effective role so
  the native composer is permission-derived rather than optimistic.
- Every new web or iPhone post carries a stable UUID. Exact retries return the
  already-persisted message; reuse for different evidence fails with `409`.
- Message provenance records the episode ID, episode slug, thread key, client
  UUID, and allowlisted client surface.

## Native behavior

- Capture exposes an **Episode thread** card only in the context of an
  episode-bound recorder session.
- The sheet presents the canonical conversation, collaborator identity,
  explicit capture/playback boundary, refresh, and an Editor-only composer.
- The app refreshes while the recorder surface is active.
- A failed send preserves both the draft and request identity for safe retry.
- Up to 200 messages are cached for 30 days in account-partitioned Application
  Support storage. The file uses complete file protection and is excluded from
  backup.
- A protected offline copy is read-only. Signing out or changing account clears
  in-memory state and protected chat caches.
- Every response must remain on the configured Nest origin.

## Operated retained QA

The signed-in local account
`quipsly-media-ms8ct81g@example.test` opened the actual Episode Room:

`/nests/home-quipsly-media-ms8ct81g-at-example-test/episodes/current-episode`

It posted this clearly labeled regression artifact:

> QA retained · Episode collaboration 2026-07-31 · Manuscript, Watch,
> recording, edit, and publish decisions stay with this exact episode.

A full navigation reload retained exactly one copy of the message. This test
identity, episode, Watch history, and chat message are intentionally retained
for longitudinal cross-surface testing. Disposable authorization fixtures and
generated release reviewers remain a separate class and are cleaned after
their acceptance runs.

## Qualification

- Focused Nest chat route tests: 7/7, including collision and concurrent-race
  behavior.
- Real PostgreSQL authorization and retry integration: 3/3.
- Complete Quipsly Jest: 189 active suites / 952 tests.
- Cross-surface release contracts: 168/168.
- Quipsly Capture App Store static checks: 955/955.
- Quipsly TypeScript 7 typecheck passed.
- Optimized Next.js production build passed for all 150 routes.
- Quipsly Capture built successfully for the iPhone 17 Pro / iOS 26.3
  simulator.
- The focused episode-thread XCUITest passed and proved the thread is
  reachable beside the recorder, both collaborators render, preview authoring
  stays disabled, and opening chat does not start capture.
- The complete serialized deterministic iPhone and Share Extension suite
  passes 46/46 with zero failures.
- Exact committed release source
  `d410e03e14ed723ff4b1f66c50e1c620ab65cb9f` passed an independent 46/46
  serialized iPhone and Share Extension run, signed archive/export, strict
  nested-signature inspection, distribution provisioning, entitlement,
  privacy-manifest, version, and packaged-purpose-string checks.
- The upload-bound 21,027,646-byte IPA has SHA-256
  `20c4b689ffae7a50396f4ef31202395081367d1ac45ca3884ecb4137aee64502`.
  Apple processed it as Quipsly Capture 1.0 (20), build ID
  `34176ece-cbb8-4e64-9440-dc0a3e02ae77`.
- Independent App Store Connect readback reports Build 20 `VALID`,
  beta-review `APPROVED`, externally `IN_BETA_TESTING`, and included in
  **Quipsly Capture Rehearsal**. The uncached public page returns the exact
  open Quipsly Capture handoff for up to 100 testers. The complete focused
  App Store/TestFlight automation suite passes 34/34.
- Production is 100% on ready Cloud Run revision `studio-00470-has`, exact
  source `d410e03e14ed723ff4b1f66c50e1c620ab65cb9f`, from successful Cloud
  Build `1a9872c0-05aa-48ed-81e0-f8aeecd88dea`, pinned to immutable digest
  `sha256:5f2a5b2381ba2523bcfb1c0898873ce1c4e8a1ddbb5757cdf749d71fc7e38fad`.
- Signed-in production QA used `codex@dev.test` and the canonical
  `home-codex-at-dev-test / release-smoke` episode to post the retained,
  clearly labeled message
  `QA retained · production episode collaboration 2026-07-31 · exact Build 20 backend boundary.`
  Exact retry returned the same message ID
  `chat_dcb98d25a20a411ea6178fdfce76d458` with
  `idempotentReplay: true`; a fresh read returned exactly one copy.
- Git whitespace validation passed.

## Release boundary

This checkpoint now proves production deployment, retained production
episode-chat operation, and approved external TestFlight delivery of Build 20.
It still does not claim physical-iPhone installation, notification receipt,
genuine two-person consent/capture, upload/playback/alignment on real devices,
or a completed High Ground Odyssey episode or coaching session. Those remain
human-operated acceptance boundaries, not facts inferred from provider state.
