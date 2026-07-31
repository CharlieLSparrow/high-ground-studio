# Client-safe Session follow-up

Checkpoint: 2026-07-31 MDT

## Outcome

Quipsly now supports an explicit, revisioned handoff from a coach to the
assigned client inside the canonical Session. The coach deliberately drafts
and releases a snapshot; the client reads the same content in Nest or Quipsly
Capture; the client can confirm that exact snapshot was opened; and the coach
can see the matching receipt.

This is intentionally narrower than messaging, task completion, calendar
delivery, publication, or proof that the client acted on a commitment.

## Product and ethics contract

The design follows two external constraints:

- The ICF Code of Ethics requires clear agreements, confidentiality, secure
  record handling, and clarity about information exchange. Quipsly therefore
  treats client follow-up as a deliberate release transaction rather than
  assuming every Session-visible record is client-safe.
  <https://coachingfederation.org/credentialing/coaching-ethics/icf-code-of-ethics/>
- OWASP recommends deny-by-default authorization and validating permissions on
  every request, including relationship-based access. Every read or mutation
  revalidates the signed-in actor against the exact Session's assigned
  coach/client relationship; an inaccessible real Session is concealed like a
  missing one.
  <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>

## Canonical model

- `SessionOutput` owns the current snapshot, recipient, lifecycle, revision,
  stable content hash, and source manifest.
- `SessionOutputRevision` preserves each immutable snapshot and the actor who
  created it.
- `DeliveryEvent` records idempotent release, open, revoke, or export events
  against the exact output and SHA-256.
- The first supported kind is `CLIENT_FOLLOW_UP`; the lifecycle is `DRAFT` →
  `RELEASED` → optional `REVOKED`.
- Release and revoke require the expected revision. Retry identities prevent a
  network retry from creating a second receipt.

The output body is a projection over existing canonical notes, goals, and
tasks. It does not replace or mutate them.

## Visibility contract

Eligible content:

- Session notes explicitly marked `CLIENT_SAFE`;
- goals owned by the assigned client; and
- tasks owned by the assigned client that are not unreviewed
  transcript-derived candidates.

Ineligible content:

- `PRIVATE` notes;
- ordinary room-shared notes, because room visibility is not release consent;
- coach-owned work;
- unreviewed transcript action candidates; and
- records from any other Session, user, or project.

Only the assigned coach can create, revise, release, or revoke. Only the
assigned client sees the released snapshot and can acknowledge it. Drafts are
not client-visible. Revocation removes future in-app visibility but preserves
the source records, revision history, and delivery ledger.

All HTTP responses use `private, no-store` and vary by authorization/cookie.
No operation sends email/text, mutates a provider calendar, publishes, bills,
changes recording consent, or marks a source task/goal complete.

## Retained operation

Reserved local-only identities:

- coach: `quipsly-coach-retained-20260731@example.test`
- client: `quipsly-client-retained-20260731@example.test`
- outsider: `quipsly-followup-outsider-retained-20260731@example.test`
- Session: `retained-coaching-follow-up-20260731`

The seed script is
`scripts/quipsly-retained-coaching-follow-up-seed.mjs`. It refuses non-loopback
targets and retains the stable `.test` identities and source corpus for
longitudinal regression. Its portable default writes mode-`0600` credential
packets below the operating-system temporary directory. Explicit macOS
Keychain mode instead reuses exact, device-local generic-password items under
service `com.quipsly.qa.retained-coaching`; generated passwords never appear in
arguments, receipts, or Git.

The Keychain-backed longitudinal login proof was run twice. All three items
were reused (`keychainItemCreated: false`), each stored password was 38 bytes,
the retained Session remained at two outputs, and no secret or external side
effect was reported. A separate real-boundary smoke then proved:

1. coach, client, and outsider all signed into the local Firebase emulator;
2. all three tokens exchanged for their exact local Nest identity;
3. the coach received the eligible coach projection;
4. the client received only the released snapshot; and
5. the retained producer/outsider received a private, non-cacheable concealed
   `404`, with private, room-shared, and unreviewed markers absent.

The repeatable command and credential boundary are documented in
`docs/runbooks/quipsly-retained-dogfood.md`.

The second retained released snapshot is:

- output:
  `client-follow-up-7d7754a9f7e6201dfa577b6de08f1afeaf2fd22c`
- revision: `2`
- content SHA-256:
  `af31f60567488d5ada4a34abf6e2cc688c7b5e54254cde41c1526ff233bfa6cb`

Rendered Nest operation proved:

1. the coach could draft and release only the eligible records;
2. the assigned client could read and acknowledge the exact released hash;
3. the coach then saw “Recipient-confirmed open receipt exists for this
   content hash”; and
4. the retained outsider received concealed/empty behavior and no private
   content.

The iPhone 17 Pro / iOS 26.3.1 simulator then signed in through the real native
Firebase flow, selected the exact canonical Session, rendered the title,
client-safe note, goal, task, and SHA-256, asserted that all three retained
private/shared/unreviewed markers were absent, tapped the explicit open
confirmation, and read back the disabled `Open confirmed` state.

Selected XCTest:
`CaptureRoomRuntimeSmokeTests/testReleasedClientFollowUpAppearsAndAcknowledgesInCapture`

Result bundle:
`/tmp/quipsly-client-follow-up-ui-20260731-retry14.xcresult`

Result: 1 passed, 0 failed, 0 skipped.

Database readback contains exactly one `RELEASED_IN_APP` and one
`OPENED_IN_APP` event for the second output. Both are `CONFIRMED` and carry the
same content SHA-256 as revision 2.

## Verification

- Quipsly TypeScript typecheck: pass
- focused route, projection, and rendered-card tests: 25/25
- real PostgreSQL follow-up lifecycle/privacy test: 1/1
- real PostgreSQL mobile Session projection tests: 4/4
- reachable native/App Store static contract after recorder cleanup: 902/902
- native retained client follow-up journey: 1/1
- retained Keychain adapter unit tests: 7/7
- two-run Keychain credential reuse and stable-corpus proof: pass
- real coach/client/outsider Firebase-to-Nest Keychain smoke: 3/3
- repository-wide Quipsly contract sweep after stale-contract repair: 168/168
- full iPhone simulator compile with LiveKit linked: pass
- serialized Capture, login, and Share extension UI journeys: 46/46

## Architecture cleanup

`CapturePhoneShell` is the single production phone entry point. Repository-wide
call-site inspection found that the older recorder, reviewer digest, provider
room, action-packet, lifecycle, and post-capture runway roots in
`QuipslyMobileComponents` had no consumer outside their own disconnected tree.
The file is now reduced from 4,330 lines to 651 and keeps only the shared
background, local-first Session context, released client follow-up, and their
direct dependencies.

The App Store static contract now checks controls and copy reachable from
`CapturePhoneShell`; it also fails if a disconnected legacy recorder/reviewer
root returns. A real two-architecture simulator compile and all 46 serialized
UI journeys pass after the removal.

## Truth boundary

This checkpoint is local rendered-web, real-local-database, and iPhone
simulator proof. The schema migration has not been deployed to production, and
this source has not been shipped in a new TestFlight build. It does not claim a
physical-device acknowledgement, a genuine coach/client session, external
message delivery, calendar delivery, completion of any commitment, or App
Store submission.
