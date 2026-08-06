# Session source exit readiness

Date: 2026-08-06

Status: implemented, tested, and operated in the authenticated local Nest

## Outcome

The Session **Takes** and **Recording room** topology now answers the first half
of a deceptively dangerous production question: which server-observed masters
are actually retained, and which capture evidence is still waiting for media?

The projection deliberately refuses to answer the second half until Quipsly has
endpoint-owned drain receipts. A complete server copy does not prove that every
browser and iPhone finished or reconciled its local upload queue. The interface
therefore distinguishes:

- `Do not close recording devices yet`;
- `Server copy complete · check each recording device`; and
- the still-false global claim `Safe to leave every endpoint`.

This is the first production slice of the Episode and Session Finishing Cockpit
recommended by the depth portfolio in
`docs/research/2026-08-06-quipsly-obvious-depth-feature-portfolio.md`.

## Architecture

`buildSessionReadinessTopology` remains a read projection over canonical
records. It does not add a mutable readiness table. Each retained source now
combines:

1. `RecordingAsset` status and exact-byte verification;
2. a finalization receipt matched by `recordingAssetId` only;
3. processing and transcription dispositions;
4. upload-session identity and finalization time; and
5. pending START/STOP evidence that has no RecordingAsset yet.

Provider safety mixes remain useful witnesses but do not count as required
local masters. An asset with verified bytes but no matching finalization receipt
is explicitly incomplete. Ambiguous `captureId` matching is not accepted as a
substitute for the canonical recording-asset relationship.

The derived `exitReadiness` state exposes exact required/source-safe counts and
keeps both `allEndpointQueuesConfirmedEmpty` and `safeToLeaveAllEndpoints`
false. That is a contract, not placeholder copy: the next slice must add
endpoint-owned drain receipts before either value can become true.

## Runtime repair found by operating the UI

The first authenticated render failed safely as `Session review is
unavailable`. Server evidence showed that the page was selecting
`governedActionId` from `CallRoomEpisodeBindingReceipt`, a model that does not
own that field. It belongs to `CallParticipantPreflightReceipt`.

The query now selects governance evidence from the correct preflight relation.
A page-level regression inspects the real Prisma selection so typechecking or a
mocked component cannot silently reintroduce the wrong-model projection.

## Authenticated local operation

A disposable, verified Firebase-emulator identity
`quipsly.finishing.cockpit.qa@local.test` received bounded local EDITOR access
to retained QA projects. No production identity, provider, message, calendar,
publication, or deployment was touched.

Two existing retained Sessions exercised both meaningful states:

### Pending local media

Session `retained-session-topology-20260805` rendered:

- `0/1 server-safe masters`;
- one iPhone START/STOP trail awaiting retained media;
- no RecordingAsset presented as uploaded media; and
- `Safe to leave every endpoint: no`.

The same state was operated at a 390 x 844 iPhone viewport. The recovery region
remained uniquely reachable and exposed the full warning through the
accessibility tree. Mobile title size and header padding were tightened after
visual inspection so operational evidence reaches the viewport sooner.

### Server copy complete, device confirmation still required

Session `retained-coaching-follow-up-20260731` rendered:

- `4/4 server-safe masters`;
- exact verified bytes plus released finalization receipts for every
  server-observed required source;
- a clear request to check each recording device; and
- `Safe to leave every endpoint: no` because endpoint-local drain confirmation
  does not yet exist centrally.

The existing local test artifacts remain intentionally retained for ongoing
dogfood.

## Verification

- 4 focused Jest suites passed, 50 tests total.
- Quipsly Next route generation and TypeScript typecheck passed.
- `git diff --check` passed.
- Authenticated rendered operation passed for both pending-media and
  server-copy-complete states.
- Visual inspection passed at normal desktop and 390 x 844 mobile viewport.

## Next acceptance slice

Add an append-only endpoint drain receipt owned by the browser/iPhone client
installation and bound to the Session capture group. It must prove:

1. no protected local capture remains in preparing, recording, finalizing, or
   failed-recovery state;
2. every completed local source is linked to a released server finalization;
3. the client performed a fresh reconciliation after the latest local queue
   mutation;
4. a stale, missing, or different-installation receipt cannot clear another
   endpoint; and
5. only when every required endpoint and every required server master agree may
   Quipsly render `Safe to leave`.

After that boundary is real, the Finishing Cockpit can rank recovery problems,
transcript/audio attention, assembly decisions, and mastered outputs without
building trust on top of an unsafe capture exit.
