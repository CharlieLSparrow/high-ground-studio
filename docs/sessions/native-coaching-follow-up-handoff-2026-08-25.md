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

## Native file-sharing parity

The same checkpoint continued into the next independent lane after the initial handoff commit. Capture now prepares the exact client-safe snapshot as a protected Markdown file and exposes the standard iPhone share sheet to both the coach and intended client. The file carries the recipient label, immutable revision, content SHA-256, selected notes, goals, commitments, next-Session focus, and permitted exact-source ranges. It explicitly states that private notes and unreviewed transcript candidates are excluded.

The system share completion is separate from Quipsly delivery claims. Canceling changes no source record and writes no receipt. A completed system share records one deterministic, idempotent `EXPORT` receipt bound to the actor, output, revision, and content hash; Quipsly still does not claim who received the file. If Nest is unavailable, the protected local file remains shareable and the UI accurately reports that its receipt is pending.

Verification after this addition:

- universal unsigned iOS Simulator build — passed for arm64 and x86_64;
- Capture App Store static smoke — 1,183 of 1,183 checks passed;
- retained coach authoring/revision/release XCTest — passed;
- retained distinct-client exact readback/open XCTest — passed and found the exact `Share follow-up file` action;
- coach result bundle: `/private/tmp/quipsly-native-coach-follow-up-20260825T070018091Z-29095.xcresult`;
- client result bundle: `/private/tmp/quipsly-native-client-follow-up-20260825T070018091Z-29095.xcresult`;
- operation cleanup again removed the exact QA output and restored the baseline.

The automation deliberately did not choose a destination in the system share sheet. A physical-device flight must still inspect the generated file in Files/Mail/Messages or another real destination and read back the `EXPORTED` receipt. Reachability and compilation are not represented as completed human sharing.

## Live work beside the immutable handoff

The next continuation connected the shared follow-up to the client's real work without turning a released report into mutable truth. The mobile Sessions response now returns a separately authorized `currentFollowThrough` projection for the same room. Nest accepts that projection only when all of these identities still agree:

- the current Session is accessible to the signed-in actor;
- the actor is the booked coach or client, not merely another project collaborator;
- the released output was created by that coach for that client;
- the output body, manifest, selected record identities, revision, and SHA-256 are valid;
- every live task still belongs to the client and project;
- every live goal still belongs to the client and project.

Capture binds the projection back to the visible follow-up's exact room, output ID, revision, and content SHA-256 before rendering it. The released title, prose, and selected-record snapshot stay unchanged. A distinct `Current progress` panel and per-row statuses show canonical work as it exists now. The intended client can open the exact task or goal in Work; the coach can see shared progress but cannot act through the client's Work controls. No duplicate task or goal is created.

### Operated proof

The retained operation passed again after this addition:

- coach created, revised, and released the exact client-safe follow-up;
- a distinct client received and automatically acknowledged the exact release;
- the client read current canonical status for the exact selected task and goal;
- the client tapped `Open current task` and reached `CaptureWorkTask_retained-follow-up-client-task-20260731`;
- revision history remained `DRAFT_CREATED`, `DRAFT_UPDATED`, `RELEASED_IN_APP`;
- no external message, provider Calendar mutation, or publication occurred;
- cleanup removed the exact QA output and restored baseline output/delivery counts.

Evidence:

- coach result bundle: `/private/tmp/quipsly-native-coach-follow-up-20260825T071620887Z-36223.xcresult`;
- client result bundle: `/private/tmp/quipsly-native-client-follow-up-20260825T071620887Z-36223.xcresult`;
- focused server projection suite: 9 of 9 tests passed, including coach/client authorization, outsider denial, hash-tamper denial, and canonical-state projection;
- Quipsly TypeScript typecheck passed;
- universal unsigned iOS Simulator build passed for arm64 and x86_64;
- Capture App Store static smoke passed 1,190 of 1,190 checks;
- `git diff --check` passed.

This remains local-service and simulator proof. It does not claim a physical iPhone, TestFlight, production Nest, weak-network, or minimally instructed human flight. Those are intentionally tracked as release-train evidence rather than reasons to stop independent product work.
