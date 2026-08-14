# Episode master promotion & GCS portable custody

Date: 2026-08-08

## Overview

This step implements the approval-bound portable promotion boundary for reviewed 4K master candidates and canonical delivery output packaging:

1. **Explicit Master Approval Binding**:
   - Master candidates rendered by the local Mac worker must be explicitly reviewed and `APPROVED` via `StudioEpisodeMasterReviewReceipt`.
   - Promotion jobs (`quipsly-episode-master-promotion-job-v1`) are created only for approved master candidates. Unapproved candidates or superseded master revisions fail closed.

2. **Mac Worker GCS Stream Upload**:
   - `LocalEpisodeMasterPromotionWorker` claims promotion jobs bound to its node and storage scope.
   - Pre-flight validation checks exact file size and calculates local SHA-256 before streaming.
   - Streams the 4K master candidate to Google Cloud Storage (`media-vault/masters/[project]/[episode]/master-promoted-[jobId].mp4`) with resumable upload and SHA-256 validation.
   - Emits `quipsly-episode-master-promotion-result-v1` receipt with custody state `portable-gcs`.

3. **Canonical Delivery Output Packaging**:
   - `quipsly-episode-delivery-package-manifest-v1` bundles the promoted GCS master locator, transcript caption assets (SRT/VTT), chapter markers, and checksum manifest into `StudioEpisodeDeliveryPackageReceipt`.

4. **Storyboard Source Cards Surface**:
   - Scrivener & StudioBinder style index cards view in Advanced Studio and Nest workspace (`StoryBinderView.tsx`), linking Drive files and Insta360 camera segments with titles, synopses, notes, transcript snippets, and 360 reframing keyframes (pan/tilt/roll/FOV).

## Verification

- `packages/quipsly-media-processing`: Contract unit tests for master promotion (`episode-master-promotion.test.ts`) and delivery packages (`episode-delivery-package.test.ts`) passed.
- `apps/quipsly-media-processor`: Worker unit tests (`local-episode-master-promotion-worker.test.ts`) passed and `tsc --noEmit` passed.
- `apps/quipsly`: Server unit tests (`episode-master-promotion.test.ts` & `episode-delivery-package.test.ts`) passed.
- Prisma schema validation (`npx prisma validate`) and client generation (`pnpm db:generate`) passed.
- Repository worktree health (`pnpm repo:health`) verified CLEAN.
