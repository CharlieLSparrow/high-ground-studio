# Nest production release checkpoint

Date: 2026-07-27

## Outcome

Quipsly Nest production now serves Cloud Run revision `studio-00410-faj`,
materialized from committed source
`8db0f9842f2f723d4c8bf6fd0cfd2caf2ea02235`.

This was a preview-first release. The candidate was deployed at 0% traffic,
exercised through the tagged URL with the secure reviewer account, promoted by
immutable revision name, and exercised again through `nest.quipsly.com`.

## Immutable build evidence

- Source SHA:
  `8db0f9842f2f723d4c8bf6fd0cfd2caf2ea02235`
- Cloud Build:
  `e8288055-d340-4665-a9dc-ac4cd39fc23c`
- Image tag:
  `preview-8db0f984-20260727-1555`
- OCI image-index digest:
  `sha256:beb6b4b163d7c2e08791a49a070368bf86712162d67b2fb878f154330224e7c7`
- Cloud Run amd64 manifest digest:
  `sha256:55c6c0fa4bd25e7b387b50ab688b12c66647653e5d0b60ed1a5a208950b360a5`
- Serving revision:
  `studio-00410-faj`
- Previous rollback revision:
  `studio-00406-cog`

The bounded release context contained 1,102 files / 110.9 MiB. It passed the
exact local production build, strict TypeScript, release script checks,
production recovery preflight, Firebase-first runtime inspection, Cloud Build
route-bundle verification, and immutable image readback.

## Operated acceptance

The release-smoke journey passed against both:

- `https://quipsly-preview---studio-hm2odnvjga-uc.a.run.app` before promotion
- `https://nest.quipsly.com` after promotion

The journey used the reviewer credential from macOS Keychain and the signing
secret from Secret Manager without printing either. It proved:

- Firebase email/password login
- Quipsly session-cookie exchange
- native bearer/session authorization
- Home Nest and free-tier state
- database-backed Episode Production
- Projects, Nests, and account switching
- Writing, Editor, Recorder, Research, and Publishing
- logout and session-cookie clearing
- both configured public hosts
- revision-bound signed beta-readiness receipt

Post-promotion production recovery also proved billing, Cloud SQL, Cloud Run,
domain mapping, public/legal routes, and the 104-check production mobile
Capture contract. The serving revision had zero error-severity Cloud Run log
entries during the fresh release window.

## Rendered dogfood and schema convergence

A signed-in Chrome pass then operated the real High Ground Odyssey production
Nest rather than stopping at HTTP route markers. Episode 4 rendered its
manuscript, shared-watch lane, registered source media, timeline controls, and
episode thread. Preparing its canonical podcast Session succeeded, but opening
that Session initially failed closed with `Session review is unavailable`.

Cloud Run application logs identified the exact boundary: Prisma `P2021`
reported that `public.CoachingNoteRevision` did not exist. The application
revision was healthy, but the original authenticated smoke never opened a
database-backed Session workspace, so it could not catch the unapplied
session-note migration.

Recovery stayed inside the committed migration discipline:

- an isolated Cloud Run schema job built from pushed source
  `9e374d20431e5527b27c31af699d7c88c7d31905`
  found 25 migrations, with only
  `20260724122500_add_writing_span_notes` and
  `20260724160000_add_session_note_visibility` pending;
- a live schema diff matched those additive changes, apart from PostgreSQL's
  built-in `plpgsql` extension;
- a new on-demand Cloud SQL backup completed successfully before mutation;
- Cloud Run execution `quipsly-schema-migrate-rczqk` applied exactly those two
  migrations; and
- independent execution `quipsly-schema-status-dh72x` reported
  `Database schema is up to date!`.

The same production Session then rendered its preparation runway, project
identity, participant, and explicit not-ready consent state. A real
author-private production note named
`Episode 4 recording readiness — 2026-07-27` was created, updated to two
retained append-only revisions, and tagged with the canonical `#Episode 4` and
`#Media` vocabulary. No message, recording, provider join, calendar mutation,
client delivery, or publication action occurred.

The promotion smoke is now hardened to require
`QUIPSLY_AUTH_SMOKE_REQUIRE_SESSION_WORKSPACE=1`. It reads or safely creates an
app-owned Capture Session only when needed, opens its database-backed Prepare
workspace, and rejects the fail-closed unavailable page. The focused release
suite passes 11/11, and the complete strengthened signed promotion smoke passed
against `https://nest.quipsly.com`, including both configured public hosts and
the revision-bound readiness receipt.

## Rollback

If the production acceptance boundary regresses:

```bash
PROJECT_ID=high-ground-odyssey \
REGION=us-central1 \
scripts/release/quipsly-rollback.sh studio-00406-cog
```

After rollback, run:

```bash
PROJECT_ID=high-ground-odyssey \
REGION=us-central1 \
SERVICE_NAME=studio \
PRODUCTION_DOMAIN=nest.quipsly.com \
bash scripts/release/quipsly-production-status.sh
```

## Still open

This checkpoint proves the production web release, not full-product
qualification. Still required:

- real signed Mac camera/microphone permission, capture, watch, listen, media
  probe, hashes, acceptance receipt, and Nest/Studio readback
- physical iPhone front/rear recording, interruption/background/storage/
  thermal recovery, upload, proxy, timeline, and editor readback
- direct MV7i master input/headphone monitoring and Canon R8 internal-4K import
- authenticated LiveKit coexistence with local masters
- TestFlight upload/install/upgrade and App Store delivery readback
- the required real HGO episode, coaching, research-to-writing,
  transcript-correction, follow-through, privacy, portability, and
  accessibility acceptance matrix
