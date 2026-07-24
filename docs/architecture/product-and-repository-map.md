# Product and repository map

Status: maintained architecture entrypoint

## Product flow

Capture preserves raw intent and media. Nest owns durable knowledge-work
records. Studio turns selected sources and decisions into production output.
High Ground Odyssey is the first public consumer.

| Boundary | Owns | Must not silently own |
| --- | --- | --- |
| Capture | offline capture, recording, upload recovery, mobile context | canonical task/project knowledge, publication |
| Nest | notes, tasks, goals, tags, projects, sessions, transcripts, research, source links | destructive media editing, App Store delivery |
| Document kernel | document identity, blocks, annotations, source-aware transforms | user accounts or deployment |
| Studio | reversible editorial decisions, timelines, render/export preparation | source truth or public publication receipts |
| HGO web | public presentation, discovery, coaching acquisition | private Nest records or editor state |
| Prisma | canonical relational persistence and migrations | local caches and external object bytes |

## Source layout

- `apps/quipsly`: Nest Next.js application and Capture-facing APIs.
- `apps/mobile-capture/HighGroundCapture`: Swift iPhone application.
- `apps/QuipslyStudio`: native macOS production application.
- `apps/web`: High Ground Odyssey public web application.
- `packages/quipsly-domain`: cross-surface Quipsly data contracts.
- `packages/quipsly-document-kernel`: document semantics.
- `packages/content-studio-domain` and `packages/studio-domain`: production
  contracts currently consumed by Nest.
- `prisma`: schema and forward migrations.
- `scripts/ci`: deterministic repository policy.
- `scripts/release`: credentialed release and readback operations.

## Release boundaries

The monorepo is retained during product convergence so Capture and Nest
contracts change atomically. CI and deployment are surface-aware:

- [`release/manifests`](../../release/manifests/README.md) is the
  machine-readable authority for each app's inputs, artifact provenance, proof
  levels, delivery target, and affected-surface behavior.
- Capture changes use the macOS/iOS workflow only.
- Nest changes validate and deploy only the Nest release slice.
- HGO web changes do not deploy Nest.
- shared package ownership follows declared workspace consumers.
- releases materialize committed, source-labeled contexts.

The staged extraction criteria and target repositories are recorded in
[Repository and release boundaries](repository-and-release-boundaries-2026-07-23.md).

## Architecture authority

1. Accepted records in `docs/decisions`.
2. Maintained entrypoints in `docs/architecture`.
3. Current runbooks in `docs/runbooks`.
4. Active plans in `docs/plans`.
5. Session and coordination notes as historical evidence, not default authority.

Conflicting documents should link to the newer authority and state that they
are historical rather than being silently deleted.
