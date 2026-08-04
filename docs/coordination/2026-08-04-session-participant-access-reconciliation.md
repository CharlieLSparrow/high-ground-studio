# Session participant access reconciliation

Date: 2026-08-04

Branch: `codex/quipsly-product-20260724`

Scope: accepted Session participant removal, provider reconciliation, denial,
and reversible restoration across Nest, browser LiveKit, and Quipsly Capture

## Outcome

Quipsly can now remove an accepted, invitation-owned participant from a Session
without rewriting history or pretending that revoking a consumed link removes
a connected person.

The model separates four facts that had previously been conflated:

1. `CallRoomInvitation.status = ACCEPTED` is immutable acceptance evidence.
2. `CallParticipant.accessStatus` and `accessRevision` are current canonical
   Quipsly authorization.
3. `joinedAt` and `leftAt` remain provider-presence history.
4. `providerAccessStatus` is the effect/readback state for disconnecting known
   LiveKit identities after canonical access has already been removed.

Removal is permitted only when the participant was created by an accepted
Session invitation. Quipsly refuses the operation when another access source
remains, including Session creator, booked coach/client, staff role, or active
Nest grant. Those authorities must be changed at their owning source.

## Durable ledgers

`CallParticipantAccessReceipt` records every remove, restore, and provider
reconciliation request with a stable UUID request identity, before/after state,
revision, actor, provider outcome, and safety boundary. Replaying the same
request identity is idempotent.

`CallParticipantProviderGrantReceipt` records every room-scoped credential
prepared for browser or Capture, including token JTI, exact provider identity,
client/device identity, issue time, and expiry. The receipt never stores the
credential itself. A token is not claimed as returned before the response
boundary completes.

Historical participant rows remain in consent, transcript, recording, and
processing projections. Only current authorization, readiness, active-roster,
and current collaboration queries filter for `accessStatus = ACTIVE`. This is
the preservation invariant that prevents removal from erasing evidence.

## Provider effect

Canonical Quipsly access is removed transactionally before any provider call.
Provider failure therefore fails closed: the participant cannot render the
Session, read/write its thread, mint another room token, or use Capture while a
host retries reconciliation.

For LiveKit, Quipsly combines issued-grant identities with current provider
presence, calls `RemoveParticipant` for every exact participant/device identity,
and lists the room again. It claims `CONVERGED` only when readback reports zero
matching identities. Raw provider errors and credentials are not persisted.

LiveKit documents `RemoveParticipant` as a room-admin operation that forcibly
disconnects a participant. LiveKit Cloud also invalidates the participant's
current token; Quipsly does not overclaim this for self-hosted LiveKit and shows
the latest recorded token expiry instead:

- https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/
- https://docs.livekit.io/reference/other/roomservice-api/

Restoration is held until provider state is `CONVERGED` or `NOT_REQUIRED`, then
increments the same canonical revision and appends a receipt. It does not
connect LiveKit, mint a credential, send chat, or change recording.

## Host UX

The invitation manager now distinguishes:

- **Revoke pending link**: makes an unused link unacceptable; no participant was
  removed.
- **Remove Session access**: two-step confirmation preserving consent, media,
  transcript, and authored work while attempting every known LiveKit device.
- **Retry provider reconciliation**: available when canonical access is removed
  but provider readback is blocked or failed.
- **Restore Session access**: restores authorization only and keeps media off.

## Operated local proof

`pnpm quipsly:local:session-invitation` uses loopback PostgreSQL, Firebase Auth,
Nest, and LiveKit plus two separate rendered browser contexts. It now proved:

- exact-email acceptance and wrong-account denial;
- one-time token deletion and consumed-link replay denial;
- two browser participants connected through LiveKit;
- persisted Session chat round trip;
- connected guest canonical removal and immediate provider-zero readback;
- removed guest live-room token denial;
- removed guest Session-thread denial;
- removed guest Session workspace HTTP 404;
- participant state `REMOVED`, provider state `CONVERGED`, and append-only remove
  plus provider reconciliation receipts;
- at least one provider-grant receipt for the removed participant;
- restoration to revision 2 without automatic provider join or recording;
- no external invitation, retained-source recording, or provider recording.

The fixture uses a dedicated private Nest where the guest deliberately has no
project grant. This both proves the Session-only boundary and preserves the
separate refusal path for participants whose booking or Nest authority remains.

## Remaining gates

- Repeat removal/reconciliation across a deployed LiveKit Cloud environment and
  read back token invalidation with real project credentials.
- Repeat browser-to-physical-iPhone removal while Capture has an active room
  connection and while it holds an unexpired but disconnected token.
- Add a user-facing access activity projection over the append-only receipts.
- Add production alerts for provider reconciliation states that remain
  `BLOCKED` or `FAILED`; never restore access automatically.
- Complete the broader physical-device, real podcast, real coaching, playback,
  portability, and delivery gates in the unified product goal.
