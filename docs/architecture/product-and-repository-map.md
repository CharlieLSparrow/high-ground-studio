# Product and repository map

Status: maintained architecture entrypoint. Revised 2026-09-06.

## Product flow

Quipsly is a shared work home, not a suite of separate feature demos. A person
can speak or import material, work alone or with others, and turn that material
into a coaching outcome, document, episode, lesson, or published work.

The web app and Capture must both support complete everyday workflows. Studio
adds professional editing and local compute; it is not a required handoff for
basic trimming, transcript correction, notes, tasks, or sharing. These are
client surfaces over shared application services, not separate product silos.

| Boundary | Owns | Must not silently own |
| --- | --- | --- |
| Capture | native capture, calls, writing, shared spaces, everyday editing and delivery | independent copies of server identity or access rules |
| Nest web | browser workflows and the current HTTP application boundary | direct UI-specific database policy or a second mobile data model |
| Shared application services | identity, membership, spaces, conversation, notes, tasks, sessions, source links, commands and jobs | browser-only state or platform-specific UI |
| Document kernel | document identity, blocks, annotations, source-aware transforms | user accounts or deployment |
| Studio | professional editing, local processing/rendering, shared timeline operations | a competing canonical timeline or required basic-editing handoff |
| HGO web | public presentation, discovery, coaching acquisition | private Nest records or editor state |
| Prisma | canonical relational persistence and migrations | local caches and external object bytes |

Nest knowledge-work recovery follows the owner-operated
[Nest portability contract](quipsly-nest-portability.md). It is an inspectable,
no-overwrite package boundary, not a database dump or media archive.

## Shared-work foundation

The target is one collaboration model. This is a replacement direction, not a
claim that the current schema already implements it. Details and tradeoffs are
in [Shared spaces and conversations](../decisions/0002-shared-work-foundation.md).

```text
Person (stable identity; multiple verified login methods)
  Membership → Nest (personal home or team/business home)
                 Space (client relationship, episode, book, course)
                   Conversation + linked work
                   Sessions, documents, tasks, sources, timelines, outputs
```

Spaces are ongoing places to work, not aliases for calls. A call belongs to a
space and its discussion remains available before and after the call. Threads
can reference a note, transcript range, task, clip, or edit without copying it
into a second source of truth. A course can later organize the same documents,
media, sessions, and assignments; it does not need a parallel user system.

Membership controls audience. A client invited to their space must not gain
access to other clients or private coach notes. The UI makes the current space,
people, and visibility understandable without permission questionnaires.
Personal work starts immediately in a personal home; organizing or inviting
someone must not be a prerequisite to writing or recording.

Conversation is a first-class collaboration tool, not the only way to work.
Documents, timelines, boards, and calendars remain direct-manipulation surfaces.
AI can create and revise those actual objects through the same commands as a
person, with source links, ordinary editing, and undo; not a queue of proposals.

## Technology position

Retain Swift for native clients, TypeScript for the web/application boundary,
PostgreSQL for relational records, and object storage for media for this first
replacement slice. Retain Next.js as a web host, not as the owner of business
rules. Existing LiveKit, document-collaboration, and media-worker integrations
are reuse candidates that still require workflow proof.

These choices are revisable. Replace a technology when an observed constraint
justifies its cost: a measured failure, an unsupported required capability,
operating cost, or an ownership/deployment problem. Changing the web framework
does not itself unify membership, conversation, or documents. Start there.

The intended server shape is a modular monolith with separate long-running
media/realtime processes where their workloads require it. Avoid a microservice
per feature. Extract commands/queries from routes into application modules with
explicit actor and resource scope; native, web, and agent clients use those
same contracts.

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
