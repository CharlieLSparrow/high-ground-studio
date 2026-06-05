# Quipsly Access Readiness Plan

Date: 2026-06-04

Purpose: make Quipsly safe enough for other real people to use without turning the app into a paranoid enterprise maze.

## Current state

Quipsly already has useful pieces:

- Google sign-in via NextAuth in `apps/quipsly/src/auth.ts`.
- Canonical `User`, `UserEmail`, and `UserRole` models in Prisma.
- `Organization` and `OrganizationMember` models already exist.
- Studio access roles exist through `OWNER`, `TEAM_SCHEDULER`, and `COACH`.
- An allowlist mode exists through `STUDIO_AUTH_MODE=allowlist` and `STUDIO_ALLOWED_EMAILS`.
- The live app domain is intended to be `nest.quipsly.com`.
- `quipsly.com` is intended to remain a public marketing surface.
- Studio projects now have a shared registry at `apps/quipsly/src/lib/studio/project-registry.ts`.

The risky gaps:

- Most `/create`, `/editor`, `/recorder`, `/call`, and media API paths are not consistently gated by authenticated user access.
- `StudioWorkspace` and `StudioProject` are not yet tied to `Organization`, `User`, or membership rows.
- Project access is currently mostly URL-slug based.
- Public/private boundaries rely too much on route/domain conventions.
- Media upload, call signaling, and production JSON endpoints need explicit authorization checks before real users are invited.
- The deploy path is still blocked when local Google Cloud auth expires.

## Product posture for first outside users

Do not open this as a self-serve SaaS yet.

The first public-ish version should be a private alpha:

- Google login only.
- Invite/allowlist only.
- One organization per invited creator/team.
- Projects belong to an organization.
- Users access projects through organization membership.
- Owner/Admin can create projects.
- Editor can write/import/edit.
- Viewer can read but not mutate.
- No billing gate yet.
- Patreon/support links are allowed as external CTAs, but provider events should reconcile into app-owned membership or entitlement records later.

This keeps the door open without leaving the pantry unlocked.

## Access model

Use the existing identity spine:

- `User`: canonical human.
- `UserEmail`: aliases.
- `UserRole`: platform/staff roles.
- `Organization`: tenant/team/account.
- `OrganizationMember`: tenant membership and role.

Add a Studio ownership layer:

- `StudioWorkspace.organizationId` (maps to `Organization.id`)
- `StudioProject.createdByUserId` (optional link to `User.id`)
- `StudioProject.updatedByUserId` (optional link to `User.id`)

Recommended first migration:

- Add `organizationId` to `StudioWorkspace` (Cascade delete from `Organization`).
- Keep `StudioProject.workspaceId` as the project grouping.
- Resolve project access as `project.workspace.organization.members`.
- Add `createdByUserId` and `updatedByUserId` to `StudioProject` for creator/modifier audits.

Route Gating Safety Rule:
Broad application route gating (e.g. middleware redirections, folder layouts) must only be activated after:
1. Codex database schema migrations have successfully executed.
2. Active project/workspace rows are backfilled with corresponding organization tenants.
3. System integrity checks and local-mode smoke tests pass without lockout conflicts.

## Route protection plan

Protect app routes in layers:

1. Public marketing

- `/`
- `/waitlist`
- public docs or philosophy pages

2. Auth-required app shell

- `/create`
- `/projects`
- `/editor`
- `/recorder`
- `/call`
- `/files`
- `/notebooks`
- `/study`
- `/settings`

3. API-required authorization

- `/api/episode-production`
- `/api/episode-production/import-media`
- `/api/episode-production/ai-ingest`
- `/api/episode-production/media-analysis-jobs`
- `/api/episode-production/transcript-assist`
- `/api/call-signaling`
- `/api/upload/presigned`
- any future publish endpoints

4. Admin/staff-only areas

- internal diagnostics
- deploy/admin panels
- project repair tools
- broad data browsers

## Permission helper contract

Create one server-side helper:

`requireProjectAccess(projectSlug, action)`

It should:

- call `auth()`
- resolve the current `User`
- resolve the `StudioProject`
- resolve workspace organization membership
- allow platform staff roles as an override
- return `{ user, organization, membership, workspace, project, document }`
- throw or return a typed denial when unauthorized

Actions:

- `read`
- `write`
- `manage`
- `import-media`
- `record`
- `publish`

Role mapping:

- `OrganizationRole.OWNER`: all actions
- `OrganizationRole.ADMIN`: all except destructive owner-only admin
- `OrganizationRole.EDITOR`: read, write, import-media, record
- `OrganizationRole.VIEWER`: read
- platform `OWNER`: override all

## Project creation flow

First outside-user project flow:

1. User signs in with Google.
2. If email is not allowlisted or invited, show "Request access".
3. If accepted, ensure a personal/team organization.
4. Create default workspace for that organization.
5. Create first project and living manuscript document.
6. Route to `/create?project=<slug>`.

Do not create projects for anonymous users.

## Invite flow

Minimum viable invite system:

- `Invite` table or JSON-backed temporary version.
- email
- organizationId
- role
- invitedByUserId
- status: pending, accepted, revoked
- tokenHash
- expiresAt

First pass can be admin-created invites, not self-serve billing.

## Data safety checklist

Before inviting non-owner users:

- All mutating server actions require auth.
- All mutating APIs require project access.
- Project list only returns accessible projects.
- `?project=<slug>` cannot access another organization.
- Media imports are scoped to project and user.
- Upload presigned route requires auth and scopes object path to organization/project.
- Call signaling requires access to the project/episode.
- AI endpoints do not leak private manuscript/media context across projects.
- Publishing endpoints require explicit publish permission.
- Dangerous repair/bulk tools are staff-only or hidden behind publisher/operator mode.

## Deployment/readiness checklist

Before broader alpha:

- `nest.quipsly.com` points to the same Cloud Run service revision as the generated Studio URL.
- `quipsly.com` stays marketing-only.
- OAuth callback URLs include `https://nest.quipsly.com/api/auth/callback/google`.
- `AUTH_SECRET` or `NEXTAUTH_SECRET` is set in Cloud Run.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in Cloud Run Secret Manager.
- `DATABASE_URL` is mounted through Secret Manager.
- `GEMINI_API_KEY` is mounted through Secret Manager.
- `NEXT_PUBLIC_PATREON_URL` is optional and points to an external support page only.
- GCS bucket permissions are narrow.
- Cloud Run service account is narrow.
- Basic error logging and audit events exist for writes.
- Rollback command is known.

## First alpha definition of done

A trusted user can:

- open `nest.quipsly.com`
- sign in with Google
- see only projects they belong to
- create a project
- write in the living manuscript
- tag Chapter/Episode headings
- remove tags
- open recorder/editor for an episode
- import media into that project
- save without losing work
- refresh and recover state
- fail gracefully when unauthorized

An unauthorized user can:

- open public `quipsly.com`
- request access
- not read/write private project data

## Recommended implementation order

1. Schema migration for workspace organization ownership.
2. Backfill default tenant data and project ownership.
3. Smoke tests with owner, invited editor, viewer, and unauthorized user.
4. Route/app shell auth gate (Route gating comes after migration/backfill/smoke).
5. Project access helper.
6. Project list filtering.
7. Mutating create/editor/recorder/call API authorization.
8. Upload/import authorization and path scoping.
9. Invite/request-access flow.
10. Quipsly assistant route access and action-ledger authorization.
11. External support CTA and later Patreon provider-event reconciliation plan.
12. Deploy and smoke on `nest.quipsly.com`.

## North star

Quipsly should feel open and alive to invited creators, but structurally boring underneath:

- every user is known
- every project has an owner organization
- every write has an actor
- every media file has a project
- every production room belongs to a project
- every denial is clear

No spooky action at a distance. No magic global workspace. No slug-based trespassing.
