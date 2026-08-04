# Session collaboration activity and device-authority transparency

Date: 2026-08-04

Branch: `codex/quipsly-product-20260724`

Scope: host-visible Session access history and safe browser/iPhone join-key
transparency over the canonical collaboration and provider ledgers

## Outcome

The Session participant manager now explains what changed instead of reducing
several different systems to one participant badge. An authorized host can read
a chronological activity stream for invitation creation, exact-account
acceptance, unused-link revocation or expiry, canonical participant removal,
provider reconciliation, and restoration.

The same surface lists unexpired per-device join-key leases. It deliberately
does **not** call a lease presence: it means Quipsly recently prepared
short-lived call authority for a browser or Quipsly Capture device. Current
provider presence remains a separate provider readback concern. Provider
identities, token JTIs, credentials, and raw tokens never cross this browser
boundary.

## Architecture

`projectSessionCollaborationActivity` is a read-only projection over existing
canonical records:

- `CallRoomInvitation` supplies invitation and acceptance facts;
- `CallParticipantAccessReceipt` supplies append-only authorization and
  provider-effect facts;
- `CallParticipantProviderGrantReceipt` supplies unexpired device-authority
  leases and is deduplicated to the most recent lease per participant/device.

The projection does not create a second activity database and cannot mutate the
records it explains. `/api/sessions/<roomId>/invitations` loads it only after the
existing invitation-manager authorization boundary succeeds, returns private
no-store responses, and selects only safe actor, participant, device, issue,
expiry, action, and outcome fields.

This keeps four truths separate:

1. an invitation was created or accepted;
2. Quipsly currently authorizes the participant;
3. the media provider reconciled known identities;
4. a device has unexpired prepared authority, which is not proof of connection.

## Product relationship

Episode, coaching, research-interview, and meeting experiences use the same
Session call kernel, external-device selector, consent model, chat boundary, and
retained-source recording system. They do not collapse into the same workspace:

- an Episode Room adds manuscript, clip/watch plan, synchronized playback,
  episode thread, editor timeline, and publishing continuity;
- a coaching Session projects transcript review toward shared/private notes,
  goals, tasks, engagement history, and follow-up;
- research interviews and meetings use their own role labels and purpose copy
  while preserving the common call and evidence contract.

The access activity remains administrative evidence beside those purpose
surfaces. It does not enter or rewrite the transcript, chat, manuscript, notes,
or media timeline.

## Operated proof

`pnpm quipsly:local:session-invitation` used separate retained host and guest
accounts plus loopback PostgreSQL, Firebase Auth, Nest, and self-hosted LiveKit.
It proved:

- exact-email invitation acceptance and consumed-token replay denial;
- browser-to-browser media and persisted Session chat;
- canonical removal, provider-zero readback, and guest denial across room-token,
  chat, and Session-workspace boundaries;
- restoration without automatic provider join or recording;
- all five expected activity kinds rendered after the workflow;
- at least one unexpired safe join-key lease rendered;
- the response omitted provider identity, token JTI, access token, API key, and
  API secret fields;
- the UI stated that a join-key lease is not current-presence proof.

Focused contracts passed 11 tests, full Nest Jest passed 295 suites / 1,544
runnable tests with 38 suites / 110 tests intentionally skipped, TypeScript
passed, and the optimized 172-route production build passed.

## Remaining gates

- Repeat the workflow with deployed LiveKit Cloud and a physical iPhone while
  both browser and Capture are connected.
- Add real-time, provider-read presence as its own explicitly refreshed signal;
  never infer it from a join-key lease.
- Add production alerting for reconciliation that remains `BLOCKED` or
  `FAILED`.
- Extend the append-only projection to Nest-wide grant and role changes without
  mixing that broader authority with Session-only participant access.
