# Quipsly Nest collaboration workflow

Last updated: 2026-06-06

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

## Why this is separate from Organization membership

Organization membership is broad and account-bound. Nest collaboration needs to support narrower project sharing and pre-account invites.

The access-grant model avoids forcing every collaborator into an organization too early. Later, organization roles can provide default access, but per-Nest grants should remain the sharp tool for project-level sharing.

## What is not done yet

- No email invite delivery yet.
- No accepting/declining invite flow yet.
- No real-time presence or comment threads tied to grants yet.
- No per-document or per-block access inside a Nest yet.
- No UI for changing an existing active grant's role; currently re-granting updates it.
- No collaborator activity feed yet.
- Nest chat is first-pass async only: one thread per Nest, no thread splitting, no live websocket updates, and no GIF search yet. Pasted GIF URLs render inline.

## Next hardening pass

- Add invite emails once email infrastructure is stable.
- Add role-change UI and audit copy.
- Add a collaborator activity ledger.
- Add workspace/org default roles without replacing per-Nest grants.
- Add visible "shared with me" and "owned by me" filters.
- Add read-only UI polish so `VIEWER` users see fewer edit controls instead of discovering permissions only after a blocked save.
- Add tests or smoke coverage for owner, editor, viewer, revoked, and invited-before-account scenarios.
- Add a safe owner-transfer story before encouraging multiple OWNER grants.
