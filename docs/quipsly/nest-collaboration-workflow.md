# Quipsly Nest collaboration workflow

Last updated: 2026-08-04

Status: first working foundation

## Product shape

A Nest is the project container. Access to a Nest is stored separately from whether a person already has a full Quipsly account.

This lets us support the workflow we need:

1. Charlie creates or owns a Nest.
2. Charlie invites `Peaches_And_Milk@yahoo.com` before that account exists.
3. Quipsly stores an active `StudioProjectAccessGrant` for that email.
4. Peaches signs in later with that email.
5. The beta gate sees an active Nest grant and lets Peaches into the app.
6. The Projects hub shows shared Nests.
7. The Nest access page shows the user's role and, if allowed, invite/revoke controls.

## Current implementation

Schema:

- `StudioProjectAccessGrant`
- `StudioProjectAccessRole`
- `StudioProjectAccessStatus`

Roles:

- `OWNER`: can read, write, and manage Nest access.
- `EDITOR`: can read and write, but cannot manage access.
- `VIEWER`: can read only.

Key routes:

- `/projects`: Nest hub and collaboration overview.
- `/nests/[slug]/access`: Nest access state and invite/revoke panel.
- `/api/nest-chat?projectSlug=<slug>`: one default Nest chat thread per project, seeded with the Ted Lasso "Believe" GIF and readable from any app surface with Nest access.
- `/api/nest-chat?projectSlug=<slug>&threadKey=episode:<episodeSlug>`: an episode-scoped thread used by the canonical Episode Room.
- `/nests/<slug>/episodes/<episodeSlug>`: the collaborative Episode Room for bounded text, shared watched media, revisioned playback, timeline receipts, and episode chat.
- `/sessions/<roomId>`: the purpose-projected live Session workspace. Browser
  guests can use external microphones/cameras and a Session-only thread without
  receiving access to the surrounding Nest.
- `/api/sessions/<roomId>/invitations`: expiring, exact-email, one-time Session
  invitation ledger. Creating a link does not send it or start media.
- `/api/sessions/<roomId>/participants/<participantId>/access`: revision-guarded
  removal, restoration, and provider reconciliation for invitation-owned
  participants.
- `/fiction-tools/private/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design`: private comic packet.
- `/create?project=<slug>`: living document editor. It now requires read access before loading a project.

Key server helper:

- `apps/quipsly/src/lib/server/studio-project-access.ts`

Important behavior:

- Grants are stored by normalized email.
- Grants can exist before a `User` row exists.
- New Nests created from the Projects hub create an explicit OWNER grant for the creator.
- Invited emails pass beta access through `hasQuipslyBetaAccess`.
- Private fiction uses the same grant model, with Charlie as bootstrap owner.
- `QUIPSLY_OWNER_OVERRIDE=true` is treated as operator-owner access for local/dev recovery flows.
- `/create` mutating server actions now require `write` access for editing, tagging, block cleanup, heading cleanup, package compilation, and assistant action state changes.
- Publishing approval from `/create` requires `manage` access.
- Nest grants and Session participant access are intentionally different
  authorities. Revoking a pending link is not participant removal, and removing
  a Session participant does not silently revoke a broader booking, staff role,
  or active Nest grant.
- `CallParticipant.leftAt` remains provider-presence history. Current Session
  authority is explicit `ACTIVE`/`REMOVED` state with optimistic revisions and
  append-only access receipts.
- Accepted invitations remain immutable acceptance evidence. Removal preserves
  the participant identity plus consent, recording, transcript, chat, and
  authored-work provenance.
- Every issued browser/iPhone LiveKit credential records its scoped provider
  identity and expiry. Removal enumerates those identities plus provider
  presence, disconnects each, and requires provider readback before claiming
  convergence. Self-hosted tokens remain bounded by their recorded expiry;
  LiveKit Cloud can additionally revoke current participant tokens.
- The authorized Session manager projects a human-readable access activity
  stream from invitation and append-only access receipts. Its unexpired
  browser/Capture join-key list is device authority, not current-presence proof,
  and never exposes provider identities or credentials.

## Why this is separate from Organization membership

Organization membership is broad and account-bound. Nest collaboration needs to support narrower project sharing and pre-account invites.

The access-grant model avoids forcing every collaborator into an organization too early. Later, organization roles can provide default access, but per-Nest grants should remain the sharp tool for project-level sharing.

## What is not done yet

- No email invite delivery yet.
- No general Nest-grant accepting/declining invite flow yet. Session-only exact-
  email acceptance is implemented.
- No real-time presence or anchored inline comment threads tied to grants yet. Episode chat and the shared playback clock use short polling.
- No per-document or per-block access inside a Nest yet.
- No UI for changing an existing active grant's role; currently re-granting updates it.
- No Nest-wide collaborator activity feed yet. Session invitation and
  participant-access activity is implemented.
- Nest chat has a default project thread plus episode-scoped threads. It has no live websocket updates, typing presence, or GIF search yet. Pasted GIF URLs render inline in the default panel.

## Next hardening pass

- Add invite emails once email infrastructure is stable.
- Add role-change UI and audit copy.
- Extend the existing append-only Session activity projection to Nest grant and
  role changes without creating a second mutable access history.
- Add workspace/org default roles without replacing per-Nest grants.
- Add visible "shared with me" and "owned by me" filters.
- Add read-only UI polish so `VIEWER` users see fewer edit controls instead of discovering permissions only after a blocked save.
- Add tests or smoke coverage for owner, editor, viewer, revoked, and invited-before-account scenarios.
- Add a safe owner-transfer story before encouraging multiple OWNER grants.
- Add real-time provider presence as its own signal; do not infer connection
  from an unexpired join-key lease.
