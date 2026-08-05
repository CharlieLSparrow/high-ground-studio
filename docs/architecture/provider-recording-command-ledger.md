# Optional provider recording command ledger

Status: implemented locally; production configuration, migration, real LiveKit
egress, authenticated webhook, and release readback remain acceptance gates

Last reviewed: 2026-08-05

## Product boundary

LiveKit room-composite recording is an optional witness and recovery rail. It
is useful when a protected participant source is missing, when an operator
wants to compare what the room heard, or when another waveform improves sync
review. It is not the Session clock, the required master, or automatic
transcription authority.

The authoritative take remains the server-owned `CallRoom.captureGroupId` plus
each protected source's device clock samples, durable START receipt, original
bytes, and reviewed waveform/drift alignment. Provider recording can therefore
remain off without changing capture, upload, alignment, transcript, or editor
handoff.

## Command lifecycle

Every provider START and STOP requires a client-generated UUID `requestId`.
`ProviderRecordingCommand.requestId` is unique and is bound to a hash of the
actor, room, action, and command schema. A replay of the same intent converges;
reuse for a different intent fails closed.

Before an external START, Quipsly:

1. serializes room commands with a PostgreSQL transaction advisory lock;
2. re-reads the room, current non-observer participants, current-policy audio
   and video consent, coaching payment evidence, provider selection, and room
   status;
3. rechecks the consent version after queueing and immediately before first
   dispatch;
4. reserves a held `SERVER_MIX` asset at a deterministic GCS object path;
5. inspects active LiveKit egress for a path match or conflict; and
6. records `dispatchedAt` before the network request.

If START returns an ambiguous transport result, Quipsly never sends START
again blindly. It searches active LiveKit egress by the exact durable object
path and probes the exact object when credentialed. A match reconciles the
original command; an unknown outcome becomes `RECONCILE_REQUIRED` and remains
visible to operators.

STOP is a distinct idempotent command bound to the active egress ID. A lost
STOP response is reconciled against the active provider list. Provider STOP or
END changes an asset only to `UPLOADED`; exact object metadata and bytes still
must pass the existing storage reconciliation before `VERIFIED` or transcript
release.

## Authenticated provider evidence

Each egress asks LiveKit to deliver signed events to
`/api/providers/livekit/webhook`. The route reads the raw body, enforces a
bounded payload, verifies the LiveKit JWT with the official server SDK, and
then writes an append-only `ProviderRecordingEventReceipt` keyed by provider
event ID. Webhook retry therefore converges before room or asset state changes.

`egress_started` and `egress_updated` can bind a lost-response START by exact
egress ID or deterministic output path. `egress_ended` closes the active
provider marker and retains error evidence when present. None of these events
can promote a provider file to verified source media by themselves.

## Operator UX

The canonical Live Session displays conversation transport, retained local
capture, and provider safety copy as separate states. It says explicitly that
turning the provider copy off cannot change synchronization. Staff get a
review-then-start action, a persistent recording indicator, a stop action, and
a visible `needs-review` state. The browser retains one request UUID across an
ambiguous network failure so a retry cannot create a second command.

Joining or leaving a call never starts or stops provider recording.

## Deployment interlocks

START requires all of the following and remains deliberately disabled without
them:

- `LIVEKIT_EGRESS_ENABLED=true`;
- LiveKit URL, API key, and API secret;
- the configured media-vault bucket and service-account JSON accepted by
  LiveKit's GCP upload output; and
- an HTTPS production webhook URL, either explicit or derived from the public
  Quipsly origin.

Production rollout must apply the schema migration, deploy the exact committed
context at zero traffic, exercise a real START/webhook/STOP/storage cycle in a
non-production Session, verify provider-off protected capture, and only then
promote traffic.

## Current automated evidence

The local database integration suite covers concurrent duplicate START,
response loss with active-provider recovery, unknown START hold without blind
retry, STOP replay, webhook replay, provider-off local-master preservation,
missing consent, and consent revocation after queueing but before dispatch.
SDK tests verify signed raw webhook acceptance, tamper rejection, and exact
output-path matching. Component tests verify that the sync boundary remains
visible and an ambiguous UI retry reuses the same request UUID.

A retained rendered operation creates and opens a real local Session with the
provider deliberately unavailable, waits for the authenticated provider-status
readback, verifies the complete synchronization explanation, and proves by
database readback that simply opening the call created neither a command nor a
provider asset.
