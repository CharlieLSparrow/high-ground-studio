# Native coaching follow-up handoff — 2026-08-25

## Outcome

Quipsly Capture passed a retained, local two-account simulator operation for the coaching follow-up handoff. The assigned coach created a private draft, revised it, explicitly released revision 2 in the app, and a distinct client account received the exact released snapshot. Rendering the client card automatically wrote and read back the idempotent `Viewed` receipt.

This proof also drove a production UX correction: the follow-up now appears immediately beneath the Session call controls instead of below recording-health and source-recovery detail. A stable loading/retry slot preserves the card's position while the focused follow-up request resolves.

## Command

Run from the repository root with the retained local Nest and PostgreSQL services available:

```sh
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio' \
QUIPSLY_RETAINED_COACHING_BASE_URL='http://127.0.0.1:3012' \
QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH='/private/tmp/quipsly-retained-follow-up-derived' \
pnpm quipsly:retained:native-coach-follow-up
```

## Verified boundaries

- The exact assigned coach opened the exact retained coaching Session.
- Save created immutable private revision 1.
- A second save created immutable private revision 2 rather than rewriting revision 1.
- Release required an explicit in-app action and exposed revision 2 only.
- The exact intended client received the released title and content SHA-256 `b6c1453bebb3422358b37a358ec7081ea285f2caa7e4cedc600962a5e0992ac6`.
- Private, room-shared, and unreviewed negative-control markers were absent from the client's view.
- The client read back the intended notes and goals, and the visible open state changed to `Viewed`.
- The operation recorded `DRAFT_CREATED`, `DRAFT_UPDATED`, and `RELEASED_IN_APP`.
- No email, text, publication, provider-calendar mutation, or external message was performed.
- Cleanup removed the exact QA output and restored the retained fixture baseline.
- Credentials were not printed by the operation.

## Evidence

- Coach result bundle: `/private/tmp/quipsly-native-coach-follow-up-20260825T064848217Z-23652.xcresult`
- Client result bundle: `/private/tmp/quipsly-native-client-follow-up-20260825T064848217Z-23652.xcresult`
- Coach XCTest: `CaptureRoomRuntimeSmokeTests/testAssignedCoachCreatesRevisesAndReleasesClientFollowUpInCapture` — passed
- Client XCTest: `CaptureRoomRuntimeSmokeTests/testReleasedClientFollowUpAppearsAndAutomaticallyAcknowledgesInCapture` — passed
- Capture App Store static smoke: 1,177 of 1,177 checks passed
- `git diff --check` passed

## Accessibility and testability repair

The first client run visibly reached `Viewed` and the API accepted the open receipt, but XCTest could not identify the chip. The enclosing SwiftUI row's accessibility identifier was overriding the child identifiers. The revision identity now belongs to the visible `Shared` or `Draft` chip, while the distinct `New` or `Viewed` chip owns the open-state identity. This gives assistive technology and automation two truthful, independently readable states.

## Evidence limit

This is authenticated local-service and iOS Simulator evidence. It does not claim physical-device, TestFlight, weak-network, minimally instructed coach/client, notification-delivery, or production-environment proof. Those remain release validation work, not blockers for continuing independent product development.
