# Native coach follow-up editor checkpoint

Date: 2026-08-01

Branch: `codex/quipsly-product-20260724`

## Outcome

Quipsly Capture now projects the same recipient-bound client follow-up workspace
used by Nest. The assigned coach can prepare a private draft on iPhone, adjust
its title, opening note, next-Session focus, and included client-safe canonical
records, save immutable revisions, inspect the exact current server snapshot,
and explicitly release that exact revision inside Quipsly.

This is not a second mobile draft model. Capture reads and mutates the canonical
`/api/sessions/:roomId/client-follow-up` boundary. The server remains responsible
for assignment, recipient, eligible-record, revision, draft-status, and
visibility checks. The phone sends stable UUID request identities, the current
output identity, and the expected revision. Exact retries converge; stale or
changed intent fails closed.

## iPhone UX and safety boundary

- Coach-only controls appear only when the server returns role `COACH`.
- A new draft starts from the complete eligible client-safe selection. Private,
  Session-shared, project-team, and unreviewed transcript records remain
  visibly ineligible.
- Saving creates or advances private Nest truth; it never implies release.
- The current server snapshot shows status, revision, recipient, complete
  selected content, next-Session focus, and SHA-256 evidence.
- Release stays disabled until the coach confirms the exact visible revision
  and recipient.
- Every multiline drafting field has an explicit keyboard `Done` action, so a
  coach can move through the long review card without fighting the keyboard.
- The interface states that save/release does not email, text, publish,
  schedule, bill, change consent, or rewrite source notes, goals, or tasks.
- The existing client surface continues to receive only a released snapshot
  and records an explicit same-hash in-app open receipt.

## Reusable operated lane

`pnpm quipsly:retained:native-coach-follow-up` is a reversible two-actor
acceptance operation. Against loopback Nest, Firebase Auth Emulator, and
PostgreSQL, it is designed to:

1. reset only Quipsly Capture's simulator app container;
2. launch as the retained assigned coach;
3. create private revision 1, save revised private revision 2, and explicitly
   release it as immutable revision 3;
4. independently verify `DRAFT_CREATED`, `DRAFT_UPDATED`, and
   `RELEASED_IN_APP` plus the no-message/no-Calendar/no-publication receipt;
5. reset the app container and launch as the separate retained client;
6. read and acknowledge the exact title and SHA-256 release;
7. independently verify `RELEASED_IN_APP` and `OPENED_IN_APP`; and
8. delete only the uniquely titled QA output, restoring baseline output and
   delivery counts while preserving both `.xcresult` bundles.

The operator refuses non-loopback Nest and PostgreSQL targets and never prints
the retained passwords.

## Verification completed

- Capture app Debug simulator build: passed for arm64 and x86_64.
- Capture UI-test `build-for-testing`: passed for arm64 and x86_64.
- App Store/static contract: 943/943 passed.
- Mobile source contract: 79/79 passed in source-only mode.
- Native coach-operation safety contract: passed.
- Existing retained native coaching and web draft-operation safety contracts:
  passed.
- Shell syntax, Node syntax, package JSON, and `git diff --check`: passed.
- Retained compiled two-actor simulator operation: passed against loopback Nest,
  Firebase Auth Emulator, and PostgreSQL. The coach created revision 1, revised
  revision 2, released immutable revision 3, and the separately authenticated
  client read and acknowledged the exact SHA-256-bound release.
- Database readback showed `DRAFT_CREATED`, `DRAFT_UPDATED`,
  `RELEASED_IN_APP`, and `OPENED_IN_APP`; it also proved no external message,
  Calendar mutation, or publication occurred and restored baseline output and
  delivery counts after deleting only the uniquely titled QA output.
- Preserved evidence:
  `/private/tmp/quipsly-native-coach-follow-up-20260801T162307614Z-28574.xcresult`
  and
  `/private/tmp/quipsly-native-client-follow-up-20260801T162307614Z-28574.xcresult`.

This remains simulator/local evidence, not physical-iPhone,
TestFlight-installed, or deployed-production proof.
