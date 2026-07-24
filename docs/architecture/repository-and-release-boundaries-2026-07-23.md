# Quipsly repository and release boundaries

Status: accepted migration architecture
Date: 2026-07-23

## Decision

Quipsly will remain a focused product monorepo, but the current
`high-ground-studio` repository will not remain the permanent container for
every product, media experiment, generated report, and deployment target.

The target source-control topology is:

1. `quipsly-platform`
   - Nest web app
   - iPhone Capture
   - Quipsly Mac companion and local engine
   - document kernel and Quipsly domain packages
   - shared Prisma schema and migrations
   - Quipsly release and environment automation
2. `quipsly-studio`
   - native macOS production editor
   - source-aware audio and video editing code
   - deterministic test fixtures small enough for Git
   - no source recordings, renders, derived media, model environments, or
     generated investigation reports
3. `high-ground-odyssey-web`
   - public High Ground Odyssey site and coaching acquisition surfaces
   - its domain package and deployment pipeline
   - a versioned client for Quipsly contracts instead of workspace imports
4. archived prototypes
   - Quiplore and hub prototypes are inventoried, then either folded into a
     supported product or preserved in read-only archive repositories

This is a staged extraction, not an immediate directory move. The active
worktree must first be preserved and integrated in reviewable slices.

## Why the current repository feels unmanageable

Measurements on 2026-07-23:

| Boundary | Current measurement |
| --- | ---: |
| `.git` directory | about 1.1 GiB |
| loose Git objects | about 807 MiB |
| tracked working-tree content | about 454 MiB |
| tracked PNG content | about 404 MiB |
| physical `apps/` directory | about 10.7 GiB |
| pending paths under QuipslyStudio | more than 500 |
| pending paths under Nest | more than 230 |
| original Cloud Build upload | about 1.55 GiB |
| upload after ignore-only repair | about 262 MiB |

The application source is not the main size problem. Binary artwork,
duplicated assets, generated production evidence, virtual environments, build
products, and media tooling are sharing the same physical and Git boundaries.

The root build context is also a correctness problem. Both Docker and Cloud
Build treat the selected context as the universe a build may access. A root
context made release contents dependent on a long and fragile exclusion list.

## Immediate enforceable boundary

Quipsly releases are materialized from a single committed SHA by
`scripts/release/quipsly-build-context.sh`.

The release context is an allowlist containing only:

- Nest source and public runtime assets;
- the four workspace packages Nest imports;
- three HGO starter-episode packets that Nest currently imports directly,
  until they move into a versioned contract package;
- Prisma schema and configuration;
- package-manager manifests and lockfile;
- the Quipsly Docker and Cloud Build definitions;
- the small release scripts and beta manifest used by the build.

The context:

- cannot contain untracked or unstaged files;
- excludes Studio, the public HGO app, Capture source, local dependencies,
  media, and agent scratch data;
- records its source commit and inventory digest;
- normalizes every file and directory timestamp to
  `2000-01-01T00:00:00Z`, then repeats normalization inside Cloud Build after
  its source-extraction boundary;
- fails above 300 MiB;
- is checked in pull-request CI;
- is the only source accepted by the preview deployment script.

A dirty development checkout is therefore visible but no longer release input.
Production provenance is the commit SHA embedded in the image and Cloud Run
metadata.

The preview-capable Cloud Build publishes only its explicit immutable image
tag. It must not update `studio:latest`, because a no-traffic validation build
is not production. The GitHub production workflow may publish the compatibility
`latest` alias only while it is building the same explicitly promoted SHA.

Cloud Build uses the Google-supported Docker builder, pinned by digest, with a
version-pinned BuildKit `docker-container` worker. Its registry cache is a
separate `studio-build-cache:main` image exported in `mode=max`, so intermediate
dependency stages can be reused without coupling a preview to a mutable runtime
tag. The obsolete Kaniko builder is not a Quipsly release dependency.

Remote seed/repeat proof on 2026-07-24 showed every Dockerfile layer as
`CACHED` on the repeat, including `pnpm install` and the Next.js production
build. The repeat's worker time was 59.8 seconds and its create-to-finish time
was 120.0 seconds. Both runs independently verified the pushed digest and all
six required route bundles. A third build from the next committed source SHA
then showed the intended incremental boundary: all dependency layers through
`pnpm install` were cached, while the source copy and Next.js build reran.
That cross-commit build passed digest readback and the same six-route check in
5 minutes 24 seconds of worker time.

## Asset boundary

The 300 MiB cap is a migration ceiling, not a healthy steady-state target.
Most of the remaining context is runtime artwork.

The asset migration is:

1. Hash and inventory every current public asset and every code reference.
2. Choose one canonical copy for duplicate images.
3. Generate web-sized derivatives in an asset pipeline.
4. Upload immutable, content-addressed derivatives to Cloud Storage behind the
   Quipsly asset domain/CDN.
5. Replace bundled URLs with manifest-backed asset URLs.
6. Keep only tiny boot-critical assets in the application repository.
7. Ratchet the release-context ceiling down to 100 MiB, then 50 MiB.

Git LFS may be used for small numbers of versioned binary design sources, but
it is not the runtime CDN and not the home for recordings or generated media.

## Migration phases and gates

### Phase 0: stop contamination

- Release only committed, source-labeled contexts.
- Block oversized contexts.
- Reject tracked dependency/build caches, interpreter bytecode, local
  databases, runtime PID files, editor backups, and operating-system metadata
  across the complete tree.
- Keep local media and generated artifacts ignored and outside application
  directories.
- Remove the obsolete duplicate deployment workflow after confirming the
  Cloud Run workflow owns both services.

Exit gate: a preview image can be rebuilt from a SHA in a clean temporary clone
and has the same release inventory digest.

### Phase 1: recover reviewable Git

- Preserve all current tracked and untracked work by explicit product slices.
- Integrate Nest/Capture release work first.
- Integrate or archive Studio work in bounded feature groups.
- Remove stale remote branches only after reachability and owner review.
- Do not rewrite history while unintegrated work depends on it.

Exit gate: `main` is the deployable source of truth, product work happens in
short-lived branches, and no product has hundreds of pending paths.

### Phase 2: remove binary and generated weight

- Complete the asset manifest/CDN migration.
- Move generated reports to dated release artifacts or object storage.
- Move recordings, renders, caches, models, virtual environments, and local
  databases outside the repository.
- Add CI ratchets preventing new large binaries and generated directories.

Exit gate: a normal clone is source-only, and Quipsly release context is below
100 MiB.

### Phase 3: extract repositories

- Extract QuipslyStudio with history after its WIP is integrated.
- Extract HGO web with history and replace shared workspace imports with a
  versioned Quipsly contract package or API schema.
- Rename the remaining focused repository to `quipsly-platform`.
- Archive superseded prototypes.

Exit gate: each repository has one product owner, one primary release pipeline,
and independently reviewable changes.

### Phase 4: optional history compaction

After verified mirrors and tags exist, evaluate a coordinated history rewrite
to remove obsolete binary blobs. This is optional and disruptive: every clone
must be replaced or carefully reconciled. It is not a prerequisite for
TestFlight or for safe Quipsly web releases.

## Operating rules

- Source control stores source, migrations, small deterministic fixtures, and
  human-authored documentation.
- Object storage stores media, generated evidence, models, and large design
  sources.
- A release is built from an immutable commit, never ambient disk state.
- Every deploy has one pipeline. Preview, smoke, migration, promotion, and
  rollback remain separate gates.
- iPhone, Nest, and the shared contract stay together until their schema and
  release cadence genuinely diverge.
- Repository extraction follows product boundaries, not directory size alone.
