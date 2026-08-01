# Episode Room editor navigation production release

Date: 2026-08-01

## Outcome

Production Episode Rooms now expose the two distinct post-capture destinations
without collapsing their meanings:

- **Edit timeline** opens the production editor for the exact Nest and episode.
- **Live cut** opens the bounded live-cut surface for the same Nest and episode.
- After Shared Watch material is synchronized, **Review production timeline**
  returns directly to the same production editor.

The labels keep rehearsal control, immutable source review, timeline editing,
and publication as separate actions.

## Exact production identity

- Source: `811a29db16d1493032b2ccc285438bd5b45854ab`
- Cloud Build: `2804ad4c-3484-4b8e-816f-0e8a66d9d9f8`
- Cloud Build status: `SUCCESS`
- Artifact manifest-list digest:
  `sha256:e60bfa8c002d43e701a3cb266c60b9ca45187f244097a819c0c6a7d3d61c8cd7`
- Cloud Run revision: `studio-00486-son`
- Cloud Run platform image digest:
  `sha256:a4b015fb43779799b1159c86073e75a086d1f20ed70f9fb3f90642de3081f9be`
- Production traffic: `100% studio-00486-son`
- Previous production revision: `studio-00484-jem`

Production `/api/healthz` reads back source
`811a29db16d1493032b2ccc285438bd5b45854ab`, image tag
`sha-811a29db-20260801`, and service `studio`.

## Release proof

The preview lane materialized 1,223 files / 112.1 MiB from the exact pushed
commit. The beta manifest, upstream identity, manifest boundary, 30/30 Session
source-evidence tests, Prisma generation, strict TypeScript, optimized 150-route
build, in-image route bundles, mobile-media IAM, Firebase authority, production
recovery, and all 111 production Capture contracts passed before deployment.

Cloud Build produced the immutable image and verified six required route
bundles inside it. Cloud Run deployed `studio-00486-son` at zero traffic. The
generated reviewer then passed Firebase login, session cookie, native session,
Home Nest, project/session persistence, account switching, admin authority,
Writing Desk, editor, recorder, Research, Publishing, logout, and configured
host checks against the immutable preview. Cleanup independently removed the
generated Firebase identity, database user, membership, Home Nest, and grants.

Only then did the promotion lane route 100% to the exact revision. The
post-promotion recovery gate passed billing, Cloud SQL, revision readiness,
traffic pinning, domain/certificate routing, public routes, billing logs, and
the 111 Capture contracts.

## Rendered handoff proof

Interactive Chrome control timed out without producing a trustworthy rendered
result or mutating the page. Instead of treating that as a release pass, the
generated-reviewer contract was strengthened in pushed test-harness commit
`17f5d1a44db93b4592a5f2969cd78172612f46bc`.

The repaired production smoke created a private synthetic Home Nest and
database-backed `release-smoke` episode, requested its deployed Episode Room,
and required the rendered response to contain:

- **Edit timeline** with the exact
  `/editor?project=<home-nest>&episode=release-smoke` destination; and
- **Live cut** with the exact
  `/nests/<home-nest>/episode-editor?episode=release-smoke` destination.

It also passed the canonical Session workspace, editor, recorder, Research,
Publishing, logout, and cookie-clear boundaries. Cleanup again independently
proved the generated Firebase and database artifacts absent. The focused
pipeline suite passes 18/18 and permanently owns this rendered-navigation gate
for future releases.

## Remaining boundary

This proves production web reachability and exact editor navigation. It does
not prove physical TestFlight installation or real media capture. Quipsly
Capture Build 25 is the current public TestFlight target; physical iPhone
recording, interruption/relaunch recovery, upload, playback, alignment, and
same-ID Studio inspection remain open until CoreDevice exposes the phone.
