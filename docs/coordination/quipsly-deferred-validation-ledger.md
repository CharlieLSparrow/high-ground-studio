# Quipsly deferred validation ledger

Updated: 2026-08-24

This ledger keeps human, physical-device, live-service, and environment-bound
acceptance work visible without blocking safe independent development. An item
leaves this ledger only when the named evidence exists. Automated checks must
never be substituted for the evidence requested here.

## Capture and coaching flight

| State | Validation still required | Evidence that closes it |
| --- | --- | --- |
| Pending | A minimally instructed coach and client complete scheduling, invitation, lobby, permissions, consent, join, conversation, participant-owned recording, leave, upload, and playable Session return without developer intervention. | Timestamped two-account flight record, both participant perspectives, retained recording/source IDs, post-call playback, and observed friction. |
| Pending | The current Capture release runs the recording and recovery path on physical iPhones across interruption, background/foreground, temporary network loss, and reconnect. | Device/build identities, runtime receipts, upload reconciliation, exact-byte verification, and playable readback. |
| Pending | Fresh coach/client identities see only Home plus explicitly shared Nests, Sessions, notes, tasks, goals, transcripts, and media. | Two-account positive/negative UI checks plus direct authenticated route probes. |

## Native audio mastery review

| State | Validation still required | Evidence that closes it |
| --- | --- | --- |
| Pending | On a physical iPhone, an authorized user downloads a real verified preview, hears every server-selected moment in original and improved versions, changes Fair comparison and Final volume during playback, and confirms the audible gain follows the selected mode without discontinuity. | Build/device identity, exact mastery job and derivative SHA-256, screen/audio observation notes, and no playback/download integrity error. |
| Pending | The same user completes one approval and one rejection against disposable mastery candidates and sees the append-only decisions read back in Capture and Nest without source replacement or implicit promotion. | Review receipt IDs, actor identity, exact source/preview hashes, cross-client readback, unchanged source bytes, and separate promotion state. |
| Environment retry | The deterministic `testSourceEvidencePreviewShowsTruthBoundariesWithoutCreatingAReceipt` UI test bundle compiled, but the iOS 26.3 simulator service denied launching the XCTest runner with `FBSOpenApplicationServiceErrorDomain` / process exit 64 on 2026-08-24. | A later simulator run reaches the app and passes the named test. This is not currently evidence of an app assertion failure. |

## Release evidence

| State | Validation still required | Evidence that closes it |
| --- | --- | --- |
| Pending | A deliberately batched Nest deployment and matching TestFlight build expose the same compatible mastery review plan and receipt contract. | Deployed commit/build IDs, authenticated live smoke, TestFlight processing status, and rollback coordinates. |

