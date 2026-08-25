# Fresh Session Conversation proof — 2026-08-24

## Outcome

The retained fresh coaching Session now has clean, exact-source evidence for its ordinary browser Conversation workflow and its iPhone presentation. The browser operation used separate coach and client accounts at phone width. The iPhone simulator test proved the Conversation surface remains distinct from Notes, Work, and recording controls.

This is automated local evidence. It does not claim that two minimally instructed humans used the thread on physical phones or that a production/TestFlight build read these exact messages.

## Exact source and artifacts

- Committed source: `d903fa30dd531b67ed5b146759895981f9a047fa`
- Session: `cmt85591s00c2nxxllzv8y81g`
- Coach: `cmt85564v00binxxlz9k2jble`
- Client: `cmt85591300bwnxxltxasorhf`
- Browser receipt: `artifacts/coaching-acceptance/8c3c105e/session-conversation-receipt.json`
- Browser receipt mode: `0600`
- Native result bundle: `/tmp/quipsly-session-conversation-20260825T050845Z-80883.xcresult`
- Native destination: iPhone 17 Pro simulator, iOS 26.3.1
- Native result: 1 passed, 0 failed, 0 skipped, 0 unexpected failures

## Browser operation

At a 390×844 viewport, the rendered product flow proved:

- the coach sent a persisted Session message;
- the client read the exact message from a separate authenticated context;
- the client could reply but could not edit the coach's message;
- the coach read the reply and corrected the original message;
- the client read the corrected revision;
- two concurrent requests with one client request ID converged on one message ID and one canonical row;
- the client removed their own reply and both accounts read the durable tombstone;
- the database retained immutable edit and removal revisions;
- coach and client retained separate read cursors;
- an authenticated client direct request to an unrelated retained room returned `404 NOT_FOUND` without a messages collection; and
- neither rendered phone-width surface overflowed horizontally.

No email, push, SMS, task creation, delivery, recording, or other external side effect was triggered.

## Reliability and identity repairs

The API now recovers a deterministic-message `P2002` race caused when a retry overlaps the original commit. It reads back the winning row, validates that room, body, and reply target are identical, and returns the same message as an idempotent replay. A conflicting reuse of the request ID still fails closed.

Message bodies over 6,000 characters are rejected instead of silently truncated.

The shared Session access helpers now return an unsatisfiable predicate when a runtime caller omits the canonical actor ID. This closes a defensive gap where Prisma could omit `undefined` fields even though TypeScript normally prevents such a caller. Staff status or a valid project email cannot bypass the missing-ID denial.

## iPhone proof

`CaptureExperienceUITests/testSessionThreadKeepsTakeCoordinationSeparateFromEpisodeWork` compiled the current native client and passed on the booted simulator. It proved that a projectless Capture Session exposes Conversation beside the recorder, opens the conventional thread, explains the Notes/Work boundary, keeps a read-only composer and refresh disabled in deterministic preview, hides unavailable message actions, and does not start recording when Conversation opens.

The native implementation uses the same room-bound API, preserves failed-send request identity, supports replies/corrections/removal, stores a file-protected account-bound offline cache, and treats LiveKit data only as a refetch hint. Those code paths compile here; authenticated cross-device native message readback remains deferred validation.

## Reproduce

With retained local Nest, PostgreSQL, and Firebase emulator services running from a clean tracked worktree:

```bash
QUIPSLY_COACHING_ACCEPTANCE_CONTEXT="$PWD/artifacts/coaching-acceptance/8c3c105e/fresh-start-context.json" \
  pnpm quipsly:fresh:session-conversation
```

Focused server and browser tests:

```bash
pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  "$PWD/apps/quipsly/src/lib/server/session-access.test.ts" \
  "$PWD/apps/quipsly/src/app/api/sessions/[roomId]/conversation/route.test.ts" \
  "$PWD/apps/quipsly/src/app/(app)/sessions/[roomId]/session-conversation-thread.test.tsx"
pnpm --filter quipsly typecheck
```

## Remaining acceptance

- Read and send the exact thread from an authenticated physical iPhone.
- Confirm browser-to-iPhone and iPhone-to-browser readback with two minimally instructed people.
- Observe account switching and protected offline-cache isolation on a physical device.
- Confirm the Conversation/Notes/Work distinction is obvious without explanation.
- Qualify and deliberately release the exact source through Nest and TestFlight release trains.
