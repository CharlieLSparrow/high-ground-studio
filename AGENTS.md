# Quipsly Agent and Contributor Guide

This is the command deck for Quipsly. Read it before changing the repository.
The product and its tests are the primary record; do not create routine plan,
handoff, worklog, evidence-ledger, or status documents.

## Product mission

Quipsly is an AI work home for coaches, writers, researchers, trainers,
podcasters, and content creators who should not have to become systems experts.
The first commercial vertical is coaching.

The product should do useful internal work by default and leave results easy to
understand, edit, undo, restore, and retry. Do not turn ordinary actions into
proposals, approvals, review queues, or governance chores. Ask before external
publication or communication, spending money, irreversible destruction, or
crossing a privacy/access boundary.

## Canonical product surfaces

| Surface | Path | Responsibility |
| --- | --- | --- |
| Capture | `apps/mobile-capture/HighGroundCapture` | Native iPhone and iPad capture, calls, notes, and mobile work |
| Nest | `apps/quipsly` | Canonical signed-in web workspace and HTTP application boundary |
| Domain | `packages/quipsly-domain` | Shared domain types and behavior |
| Documents | `packages/quipsly-document-kernel` | Shared document semantics |
| Media services | `packages/quipsly-media-*`, `apps/quipsly-media-*`, `apps/quipsly-transcript-worker` | Durable media, audio, and transcript processing |
| Studio | `apps/QuipslyStudio` | Native professional production and local rendering |
| HGO | `apps/web` | High Ground Odyssey public site and legacy surfaces; it is not Quipsly Nest |
| Data | `prisma` | Shared schema and forward-only migrations |

Do not introduce a second representation of a user, membership, Nest, Session,
document, task, goal, recording, transcript, or access rule merely because a
new surface needs it. Extend the canonical model or add a documented projection.

## Product model and interface

The stable product primitives are people and relationships, Nests and access,
Sessions, notes/documents, tasks/goals/calendar, sources/media, and agent
activity. Coaching, podcasting, writing, and training are workflows composed
from those primitives rather than separate islands.

Keep global navigation small: Home, Sessions, Nests, Notes, Account, and one
obvious contextual Create/Capture action. Put chat, transcript, media, tasks,
goals, editing, research, and publishing inside the person, Nest, Session,
document, or project where the work belongs. Expert depth is welcome; expose it
progressively. Familiar call, permission, sign-in, scheduling, and sharing
behavior outranks novelty.

Web, iPhone, iPad, and Mac share data and application behavior but use
platform-native interaction and layout. Do not stretch an iPhone screen onto an
iPad or make every platform visually identical.

## Architecture boundaries

- UI code calls scoped application commands/queries; it does not invent direct
  database workflows.
- Every read and mutation is authorized for the current principal and Nest or
  resource. A valid ID is never proof of access.
- Agent tools use the same authorized application boundary as people. Never
  expose unscoped Prisma access or a hard-coded agent identity.
- Source media is immutable. Derived media, transcripts, corrections, edits,
  and generated work retain provenance and are recoverable.
- Long capture, upload, transcription, analysis, and render work is resumable,
  observable, idempotent, and safe to retry.
- Technical receipts and audit data stay unobtrusive unless they help a person
  recover, understand, edit, or undo work.
- Schema changes are allowed when they improve the canonical model. Use
  forward-only migrations, compatible rollout order, backfills where needed,
  and explicit rollback or roll-forward plans.

Large refactors are welcome when they produce a complete user outcome and a
clearer ownership boundary. Preserve customer data and proven behavior, not
obsolete file shapes. Prefer replacing a giant component behind tested seams
over indefinitely adding another conditional to it.

## Required proof

Match evidence to the claim:

- pure logic: focused unit tests;
- API/data work: authorization, tenant-isolation, persistence, and retry tests;
- web workflow: operate it in a browser with a fresh persona and reload/readback;
- native workflow: simulator automation plus physical-device proof for release
  claims involving capture, permissions, backgrounding, cameras, or audio;
- media: inspect/play the materialized artifact and verify source lineage;
- release: build from a committed SHA, deploy/upload, then read back the served
  revision or App Store Connect state.

A green build is not proof of UX, authentication, physical hardware, durable
storage, deployment, or publication. Missing human/device evidence should be
reported accurately but does not block unrelated work.

For identity or collaboration changes, test at least two accounts plus a fresh
uninvited account. Prove both intended visibility and negative isolation.

## Repository and Git

- Work from one declared integration trunk and short-lived, scoped branches.
- Build and release committed SHAs, never ambient files.
- Before editing, inspect status and preserve unrelated dirty work.
- Never mix generated media, caches, derived data, credentials, production
  exports, or private client/session content into Git.
- Avoid parallel implementations. If another branch owns the same domain or
  route, coordinate or stop before coding.
- A merge should leave one obvious source of truth and delete superseded code
  once migration/read compatibility is proved.
- Repository extraction is earned by a stable API, ownership, release cadence,
  and dependency boundary. Do not split the monorepo just to make it look tidy.

External agents and contractors receive an explicit package/route boundary,
acceptance tests, and forbidden areas. Their work is merged only after tenant
isolation, canonical-model, and workflow tests pass. Do not ask an agent to
"redesign Quipsly" in an unbounded branch.

## Start and validate

Read only the documents relevant to the work:

- `README.md`
- `CONTRIBUTING.md`
- `docs/architecture/product-and-repository-map.md`
- `docs/development/testing.md`
- the applicable runbook under `docs/runbooks/`

Common commands:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm quipsly:local:up
pnpm quipsly:local:doctor
pnpm quipsly:local:smoke
pnpm quipsly:release:local
pnpm repo:health
```

Use the narrowest existing workflow test that proves the changed outcome.
Search `package.json` before adding another root script; the repository already
has many specialized operations that should be consolidated rather than
duplicated.

## Working style

- Start with the user outcome and the canonical source of truth.
- Make useful defaults and complete vertical workflows, not isolated screens.
- Prefer visible capability and operated proof over commentary or paperwork.
- Use plain product language. Keep fixtures, internal state names, provenance
  jargon, and operational controls out of normal user navigation.
- Treat accessibility, recovery, observability, cost, supportability, and
  security as product quality rather than end-stage checklists.
- When blocked by one integration, credential, provider, device, or tester,
  retain the missing evidence briefly and advance the highest-value independent
  lane.
