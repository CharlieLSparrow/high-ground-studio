# Nest media authorization and tag-focus release

Released: 2026-07-30 MDT / 2026-07-31 UTC

## Exact identities

- Feature commit:
  `c8f9b711eba7f42f891e592a20ac058debd19176`
- Deployed source:
  `ed3b2dc6bc746d220459b3911a53b7cfc4db4a3d`
- Cloud Build:
  `0e8a5f37-16c6-49f9-8801-1dd9b6fdfdb7`
- Cloud Run revision:
  `studio-00464-sig`
- Runtime image:
  `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio@sha256:dc4bd769ef4c12240e0cd68048b368524855c0eb6a617e59ab37c6d1c24b0cca`
- Traffic:
  `100% studio-00464-sig`
- Previous proven revision / rollback target:
  `studio-00462-luc`

## Released product behavior

- Media assets and clips now share one parent-asset authorization boundary
  across direct loading, create/update/delete, review labels, canonical tags,
  media bins, project attachment, and Studio Cut export.
- Direct project, media-bin project, and explicit project attachment all count
  as asset scope. Owner/Editor can mutate, Viewer is read-only, and outsider
  IDs disclose no record identity.
- Legacy unscoped global assets remain signed-in read-only references and
  cannot be silently appropriated.
- Exact canonical tag focus includes authorized media clips, rejects
  cross-Nest malformed tag links, and returns to the exact highlighted logger
  row with the tag-focused back path.
- Nest vocabulary management can create a reusable canonical tag without
  inventing or tagging a placeholder record.

## Qualification and operation

- Focused rendered/action/access/search tests: 47/47.
- Real PostgreSQL tag and media-access tests: 16/16.
- Complete Quipsly Jest: 189 active suites / 937 tests.
- Cross-surface release contracts: 168/168.
- Capture-to-Nest source-evidence contract: 10/10.
- Exact-commit Session evidence: 30/30.
- Quipsly TypeScript 7 and optimized 150-route production build passed locally,
  in the materialized release context, and in Cloud Build.
- Cloud Build verified six required route bundles inside the final image.
- A retained local QA identity performed the real vocabulary → clip → exact
  tag focus → highlighted logger journey. Its clearly labeled test artifacts
  remain intentionally available for regression testing.
- A generated production reviewer exercised Firebase login, first-party
  session exchange, native session check, Home Nest, Sessions, Projects,
  account switching, admin denial/authority, writing, editor, recorder,
  Research, Publishing, logout, and configured public hosts against the
  zero-traffic preview.
- Promotion reran the exact-commit preflight and signed-in reviewer. Both
  generated reviewer passes independently verified deletion of two grants,
  one Home Nest, one membership, one database actor, and one Firebase actor.
- Post-promotion production status passed billing, Cloud SQL, Cloud Run,
  domain/certificate routing, public routes, 108 mobile contract checks, and
  recent billing-error log review.
- Independent `https://nest.quipsly.com/api/health` readback reports exact
  source `ed3b2dc6bc746d220459b3911a53b7cfc4db4a3d` and revision
  `studio-00464-sig`.

## Scope boundary

No native source changed, so Quipsly Capture Build 18 remains the current
approved TestFlight build and can consume this Nest behavior without another
binary. This release does not prove a physical TestFlight install, genuine
two-person consent/capture, completed HGO or coaching workflows, or App Store
submission.
