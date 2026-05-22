# HGO Staged Artifact Store Lab

Date: 2026-05-22

## Position

The Store Lab is a browser-session simulator for a future private staged
artifact store. It is not persistence, not local storage, not a server route,
and not publishing.

The lab exists to prove lifecycle behavior before any Prisma model, API route,
Cloud SQL mutation, or public route promotion is designed around it.

## Current Surface

Route:

- `/projection-stage/store-lab`

Pure contract helpers:

- `apps/web/src/lib/hgo/staged-artifact-store-lab.ts`

Focused test command:

- `pnpm hgo:store-lab:test`

The route accepts pasted `hgo-staged-artifact-v1` JSON, validates it with the
artifact import validator, and imports valid packets into React session state
only.

## Session-Only Boundary

The Store Lab deliberately does not:

- persist artifact JSON
- write localStorage or sessionStorage
- call an API or server action
- write content files
- mutate Prisma or Cloud SQL
- publish or create public routes
- replace public `/episodes`

The embedded browser artifact remains unchanged. Its safety flags continue to
say:

- `persisted: false`
- `published: false`
- `containsRealContent: "unknown"`

Store Lab metadata may say the browser session is holding a record, but that
metadata sits outside the artifact packet and disappears when the page session
is gone.

## Modeled Lifecycle

The lab models these future private-store concepts:

- import a validated artifact
- reject invalid or unsafe artifacts
- reject duplicate active artifact ids
- mark a record `human-review`
- mark a record `approved-for-future-staging`
- create a simulated promotion candidate only when eligible
- archive a record instead of deleting it
- maintain an event log for each record

Promotion readiness is modeled as:

- `blocked`
- `review-needed`
- `candidate`
- `archived`

Creating a promotion candidate is simulated only. It does not publish, does not
create a public route, and does not produce canonical public content.

## Future Persistence Requirements

Real persistence remains blocked until there is an explicit operator-approved
schema and access-control plan. The future private store still needs:

- access control for private staged artifacts
- schema review and migration plan
- rollback and archive policy
- server-side validation using the same artifact contract
- separate persistence metadata outside the submitted artifact packet
- separate promotion workflow for public pages
- real-content handling rules and public-safety review

## Automation

The no-auth HGO browser smoke now exercises the Store Lab lifecycle by creating
a synthetic artifact in `/projection-stage/import`, importing it into
`/projection-stage/store-lab`, marking review states, attempting a simulated
promotion candidate, archiving it, and confirming no real-content markers appear.

The no-auth visual smoke captures Store Lab screenshots for:

- empty state
- imported state
- reviewed state
- archived state

Generated reports and screenshots remain under ignored `artifacts/` paths.
