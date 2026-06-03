# Current State Exploration

Date: 2026-05-30

## Summary

This pass explored the current `main` checkout after the large Quipsly/QuipLore
and Studio rebrand work.

The product direction is strong: Quipsly is becoming the private creative
operating system for manuscript, media, publishing, research, and capture work;
QuipLore is becoming the public discovery and learning surface; and the older
Studio manuscript/collaboration work has mostly moved under `apps/quipsly`.

The technical state needs stabilization before more feature work piles on.
Several scripts, tests, docs, and deploy paths still point at deleted
`apps/studio` files. Current validation is red in multiple important lanes.

## Current Git State

- Checkout: `/Users/wall-e/Dev/high-ground-studio`
- Branch: `main`
- Relation: aligned with `origin/main` at `e1a8aa0`
- Latest commit: `e1a8aa0 chore: rebrand studio to quipsly and unify workflows`
- Working tree: dirty

Important local changes to preserve:

- Quipsly visual/navigation pass:
  - `apps/quipsly/src/app/layout.tsx`
  - `apps/quipsly/src/components/SidebarLayout.tsx`
  - new pages under `apps/quipsly/src/app/{assets,coaching,create,dashboard,research,schedule}`
- Video Segment Desk work:
  - `apps/quipsly/src/app/editor/VideoSegmentDesk.tsx`
  - `apps/quipsly/src/app/editor/segment-actions.ts`
  - `apps/quipsly/src/app/mobile-segmenter/*`
  - `apps/quipsly/src/app/api/ingest/mobile/route.ts`
  - new Prisma models: `StudioVideoSource`, `StudioVideoSegment`,
    `StudioSegmentList`, `StudioSegmentListItem`
- QuipLore video/feed direction:
  - `apps/quiplore/src/app/actions/feed-actions.ts`
  - `apps/quiplore/src/app/video-stream/page.tsx`
  - `apps/quiplore/src/components/VideoSwipeFeed.tsx`
  - `apps/quiplore/src/components/ConsumerViewer360.tsx`
- Studio Cut package change:
  - `apps/studio-cut-web/package.json`
- Nested mobile capture repo changes:
  - `apps/mobile-capture/HighGroundCapture/HighGroundCapture/ContentView.swift`
  - `CameraManager.swift`
  - `CameraPreview.swift`
  - `NotesFetcher.swift`
  - `RecordingView.swift`
  - `UploadManager.swift`

## What Changed Architecturally

- `apps/studio` was removed in the rebrand commit.
- The previous Studio app code now largely exists under `apps/quipsly`.
- Root scripts still use `pnpm --filter studio`, which currently matches no
  package.
- Studio deploy and Cloud Build files still point at `apps/studio/Dockerfile`.
- Many tests and smoke scripts still import from `../apps/studio/...`.
- Current docs still describe `apps/studio` as the live private app path.

This is the highest-priority technical debt because it makes validation and
deploy confidence misleading.

## Validation Results

Passed:

- `pnpm db:generate`
- `pnpm --filter quipsly-api typecheck`
- `pnpm --filter @high-ground/quipsly-domain typecheck`

Failed:

- `pnpm --filter studio typecheck`
  - No projects matched the `studio` filter.
- `pnpm studio:manuscript:test`
  - Imports deleted `apps/studio` files.
- `pnpm --filter quipsly typecheck`
  - Fails on Next route handler signatures, missing/default Prisma imports,
    Timeline/Remotion type mismatches, missing new Prisma model access from
    the app-local Prisma client, and a mobile segmenter `summary` argument that
    is not accepted by `createVideoSegment`.
- `pnpm --filter quiplore typecheck`
  - Fails in `ConsumerViewer360.tsx` due `startMs`/`endMs` variable names and
    React Three Fiber JSX typing.
- `pnpm --filter web exec next build --webpack`
  - Fails because new web routes import `getPrismaClient` from
    `@/lib/prisma`, but that module currently exports `prisma`.
- `pnpm --filter studio-cut-web build`
  - Fails because `apps/studio-cut-web/package.json` removed
    `@high-ground/studio-cut-schema` and `firebase`, while the app still
    imports them.
- `git diff --check`
  - Fails on trailing whitespace in `apps/quiplore/src/app/page.tsx` and
    `prisma/schema.prisma`.

Cloud state could not be verified because local `gcloud` needs reauthentication
and cannot prompt in this session.

## Goal Restatement

The shared vision is still coherent:

- Make Quipsly the private creative OS: manuscript editing, co-editing,
  source-aware marking, video/podcast production, publishing prep, research,
  capture, and agent-assisted workflows.
- Make the manuscript a source-preserving home surface, not a disposable export.
  Durable block IDs, author/source marks, semantic marks, structure markers,
  citations, snapshots, and review state must stay separate.
- Make co-editing feel as natural as Apple Notes or OneNote, but without losing
  explicit rollback/checkpoint safety.
- Make QuipLore the public quote/lesson discovery product: source-aware,
  trustworthy, warm, and visually distinct.
- Keep WorldHub/web as the business, client, coaching, monetization, and public
  HGO operating layer.
- Build toward media capture and segmenting: phone capture, 360-aware segment
  marking, knowledge nodes, Lorelists, and QuipStream style playback.

## Recommended Next Sprint Order

1. Stabilize the repo after the rebrand.
   - Decide whether the package should be named `quipsly` only, or whether
     legacy `studio:*` scripts remain as aliases.
   - Update root scripts, deploy scripts, Cloud Build files, Dockerfiles, and
     tests from `apps/studio` to `apps/quipsly`.
   - Update docs enough that future agents open the right files.

2. Restore validation.
   - Make `pnpm studio:manuscript:test` or its renamed equivalent pass again.
   - Make `pnpm --filter quipsly typecheck` pass.
   - Make `pnpm --filter quiplore typecheck` pass.
   - Make `pnpm --filter web exec next build --webpack` pass again.
   - Make `pnpm --filter studio-cut-web build` pass or intentionally isolate it.
   - Make `git diff --check` pass.

3. Normalize Prisma usage.
   - Reuse app-level Prisma helpers instead of ad hoc `new PrismaClient()` in
     server actions/routes.
   - Confirm the generated client path works for Quipsly and QuipLore under the
     current pnpm workspace layout.
   - Do not run `db:push` for the new segment models until the schema and
     validation are reviewed.

4. Protect the active WIP before refactoring.
   - Commit or branch the mobile capture nested repo work.
   - Preserve the Segment Desk and QuipLore feed work, but fix it in a
     stabilization branch before adding more UX.
   - Revert only accidental dependency removals, not user feature work.

5. Then resume product sprinting.
   - Co-editing polish remains the top manuscript goal.
   - Segment Desk and mobile capture are the next media-production frontier.
   - QuipLore feed/list playback can become the first public proof of the
     capture-to-knowledge-node loop once the data path is safe.

## Immediate Stop Conditions

Stop and ask before:

- applying the new Prisma segment schema to any live database
- deploying Quipsly/Studio while deploy scripts still point at `apps/studio`
- deleting or resetting the nested mobile capture repository work
- treating the current red validation state as deployable
- overwriting Studio Cut dependencies without confirming the Firebase/schema
  migration plan
