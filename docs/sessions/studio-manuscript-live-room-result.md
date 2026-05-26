# Studio Manuscript Live Room Result

Date: 2026-05-25

## Summary

Added the first production shared-editing surface for the private Studio
manuscript workflow.

The new route is:

```text
/manuscript/live
```

It creates authenticated live manuscript rooms backed by Cloud SQL-stored Yjs
updates. Charlie and Homer can open the same room URL when both accounts have
Studio access, edit one shared text surface, see active presence, copy the
current text, and save the current room as a manual Manuscript Desk snapshot.

## Implementation

- Added Prisma models:
  - `StudioManuscriptLiveRoom`
  - `StudioManuscriptLiveRoomUpdate`
  - `StudioManuscriptLivePresence`
- Added authenticated Studio API routes:
  - `GET/POST /api/manuscript/live-rooms`
  - `GET /api/manuscript/live-rooms/[roomId]`
  - `GET/POST /api/manuscript/live-rooms/[roomId]/updates`
  - `GET/POST /api/manuscript/live-rooms/[roomId]/presence`
- Added `/manuscript/live` UI with:
  - room creation
  - recent room list
  - shareable room URL
  - Yjs-backed textarea editing
  - update polling
  - presence heartbeat
  - copy text
  - manual snapshot checkpoint
- Added pure live-room model tests.
- Added `Live Room` to Studio navigation.

## Boundary

This is a text-room collaboration surface. It does not replace the full
Manuscript Desk editor and does not preserve rich author marks, quote review
metadata, structure regions, or publishing readiness metadata while editing.

Manual snapshots convert the live text into paragraph blocks so the session can
be checkpointed into the existing Manuscript Desk recovery path.

No public content is written and no episode page is published.

## Validation

Passed:

```bash
pnpm db:generate
pnpm studio:manuscript:live-room:test
pnpm studio:cloudrun:test
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

The first local Studio build attempt hit the known Turbopack sandbox
port-binding error. Rerunning the same build outside the sandbox passed.

## Deployment Notes

The schema change is additive and requires a Prisma `db push` before the live
route can create rooms in production.

Deploy Studio after the schema is synced.

## Live Deployment

Merged through PR #25:

```text
main commit: 330f466
```

Built one-off Prisma db-push image:

```text
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-db-push:330f466
Cloud Build: c5b00e97-0bda-498c-9f6a-55af9dd4bb71
```

Applied the additive schema to the live Studio Cloud SQL database:

```text
job: studio-db-push-330f466
execution: studio-db-push-330f466-4lntn
database secret: studio-database-url
```

The job completed successfully and Prisma reported:

```text
Your database is now in sync with your Prisma schema.
```

Deployed Studio:

```text
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:330f466
Cloud Build: e7d0f864-6207-49ff-9d84-50f67f5ee964
revision: studio-00049-lt2
url: https://studio-hm2odnvjga-uc.a.run.app
```

Smokes passed:

- `/api/health`
- `/content-studio`
- `/manuscript/live` direct Cloud Run URL returns `HTTP 200`
- `/api/manuscript/live-rooms` direct Cloud Run URL returns the expected
  unauthenticated `401`

The `studio.highgroundodyssey.com` hostname did not resolve during this smoke,
so use the direct Cloud Run Studio URL until a Studio custom domain is wired.

Rollback:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00048-hs4=100
```

## Shared-Link Fix Deployment

Follow-up PR #27 fixed live-room access so any authenticated Studio-access user
with the room URL can join the room. Recent room listing remains creator-scoped.

```text
main commit: 9e46ce6
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:9e46ce6
Cloud Build: 010fcd7a-a46a-4352-901f-a96f9f9be94b
revision: studio-00051-zl8
url: https://studio-hm2odnvjga-uc.a.run.app
```

Smokes passed:

- `/api/health`
- `/content-studio`
- `/manuscript/live` direct Cloud Run URL returns `HTTP 200`
- `/api/manuscript/live-rooms` direct Cloud Run URL returns the expected
  unauthenticated `401`

Rollback from this final deployed revision:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00049-lt2=100
```

## Snapshot Start Follow-Up

The next live-room slice lets Charlie start a room from the latest saved
Manuscript Library snapshot instead of pasting text manually. Room creation
stores the selected manuscript id when present, and `Save manual snapshot`
writes the live-room checkpoint back under that same manuscript.

The live editor still uses plain text. Loading from a Manuscript Desk snapshot
extracts headings, paragraphs, and list items into readable text blocks; rich
marks, quote reviews, structure regions, and publication metadata remain in the
manual snapshot system rather than the live textarea.

## Snapshot Start Deployment

Merged through PR #29:

```text
main commit: 533151c
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:533151c
Cloud Build: 2a62f5bd-2a9a-4cc5-8c28-8c1a85033bb0
revision: studio-00053-rfn
url: https://studio-hm2odnvjga-uc.a.run.app
```

Deploy validation passed:

- `pnpm --filter studio typecheck`
- `pnpm studio:cloudrun:test`
- Docker image build with `pnpm --filter studio build`
- deploy-script smokes for `/api/health` and `/content-studio`
- direct smoke: `/manuscript/live` returned `HTTP 200`
- direct smoke: `/api/manuscript/live-rooms` returned the expected
  unauthenticated `401`

Rollback from this deployed revision:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00051-zl8=100
```

## Manuscript Desk Launch Deployment

Merged through PR #32:

```text
main commit: bbb095f
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:bbb095f
Cloud Build: d3c9f219-4457-4581-8993-e888a9babaeb
revision: studio-00055-bgv
url: https://studio-hm2odnvjga-uc.a.run.app
```

This slice added a `Start live room` control in the Manuscript Desk server
snapshot panel. It creates a live room from the current browser-local draft,
preserves the selected named manuscript id when present, and opens the shared
live-room URL.

Deploy validation passed:

- `pnpm --filter studio typecheck`
- `pnpm studio:cloudrun:test`
- Docker image build with `pnpm --filter studio build`
- deploy-script smokes for `/api/health` and `/content-studio`
- direct smoke: `/manuscript` returned `HTTP 200`
- direct smoke: `/manuscript/live` returned `HTTP 200`
- direct smoke: `/api/manuscript/live-rooms` returned the expected
  unauthenticated `401`

Rollback from this deployed revision:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00053-rfn=100
```

## Notebook Mode Deployment

Merged through PR #34:

```text
main commit: 27af190
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:27af190
Cloud Build: e3ed3f83-84ec-4da5-943e-cd54a5e7daf0
revision: studio-00057-87h
url: https://studio-hm2odnvjga-uc.a.run.app
```

This slice makes `/manuscript/live` open in notebook mode by default. The live
room still stores and syncs one shared Yjs text document, but the editor now
splits that text into editable notebook sections, adds a section outline, and
keeps raw text mode available as an escape hatch.

Deploy validation passed:

- `pnpm studio:manuscript:live-room:test`
- `pnpm studio:cloudrun:test`
- `pnpm --filter studio typecheck`
- Docker image build with `pnpm --filter studio build`
- deploy-script smokes for `/api/health` and `/content-studio`
- direct smoke: `/manuscript` returned `HTTP 200`
- direct smoke: `/manuscript/live` returned `HTTP 200`
- direct smoke: `/api/manuscript/live-rooms` returned the expected
  unauthenticated `401`

Rollback from this deployed revision:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00055-bgv=100
```

## Notebook Section Controls Deployment

Merged through PR #36:

```text
main commit: 982150d
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:982150d
Cloud Build: a759698c-7b55-47a6-912c-e441beaa052f
revision: studio-00059-btd
url: https://studio-hm2odnvjga-uc.a.run.app
```

This slice added room-start starter templates for session notes, writing
passes, and coaching sessions. It also added notebook section controls for
adding a section below, moving sections up or down, and removing sections.

The live-room data shape remains the same: one shared Yjs text document with
blank-line-delimited notebook sections and raw-text fallback.

Deploy validation passed:

- `pnpm studio:manuscript:live-room:test`
- `pnpm studio:cloudrun:test`
- `pnpm --filter studio typecheck`
- Docker image build with `pnpm --filter studio build`
- deploy-script smokes for `/api/health` and `/content-studio`
- direct smoke: `/manuscript` returned `HTTP 200`
- direct smoke: `/manuscript/live` returned `HTTP 200`
- direct smoke: `/api/manuscript/live-rooms` returned the expected
  unauthenticated `401`

Rollback from this deployed revision:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00057-87h=100
```

## Section Presence Deployment

Merged through PR #38:

```text
main commit: 6fb0cb4
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:6fb0cb4
Cloud Build: a042bb40-8854-4523-b955-62ae888d6f59
revision: studio-00061-h7l
url: https://studio-hm2odnvjga-uc.a.run.app
```

This slice made live-room presence section-aware in notebook mode. Focused
editors now publish `editing section N` through the existing presence `mode`
string, and the notebook UI surfaces active collaborators in the outline and
matching section header.

No schema or provider changes were needed.

Deploy validation passed:

- `pnpm studio:manuscript:live-room:test`
- `pnpm studio:cloudrun:test`
- `pnpm --filter studio typecheck`
- Docker image build with `pnpm --filter studio build`
- deploy-script smokes for `/api/health` and `/content-studio`
- direct smoke: `/manuscript` returned `HTTP 200`
- direct smoke: `/manuscript/live` returned `HTTP 200`
- direct smoke: `/api/manuscript/live-rooms` returned the expected
  unauthenticated `401`

Rollback from this deployed revision:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00059-btd=100
```

## Quick Sections Deployment

Merged through PR #40:

```text
main commit: 20afe3d
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:20afe3d
Cloud Build: 4e9826fb-479d-4877-96c7-a267414ff09e
revision: studio-00063-982
url: https://studio-hm2odnvjga-uc.a.run.app
```

This slice added quick-insert notebook sections for notes, decisions, action
items, questions, and source notes. The notebook model now infers section kind
from the first line and displays that kind in the outline and section header.

The live-room data shape remains the same: one shared Yjs text document with
blank-line-delimited notebook sections and raw-text fallback.

Deploy validation passed:

- `pnpm studio:manuscript:live-room:test`
- `pnpm studio:cloudrun:test`
- `pnpm --filter studio typecheck`
- Docker image build with `pnpm --filter studio build`
- deploy-script smokes for `/api/health` and `/content-studio`
- direct smoke: `/manuscript` returned `HTTP 200`
- direct smoke: `/manuscript/live` returned `HTTP 200`
- direct smoke: `/api/manuscript/live-rooms` returned the expected
  unauthenticated `401`

Rollback from this deployed revision:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00061-h7l=100
```

## Session Recap Deployment

Merged through PR #42:

```text
main commit: d7e73b1
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:d7e73b1
Cloud Build: 1a368379-6da6-4ed8-9ef0-d6f02b5def07
revision: studio-00065-sjh
url: https://studio-hm2odnvjga-uc.a.run.app
```

This slice added a computed session recap for live rooms. The recap extracts
decisions, action items, open questions, and source notes from matching notebook
sections, displays counts in the live room, and exposes `Copy recap` for a
plain-text handoff.

The live-room data shape remains the same: one shared Yjs text document with
blank-line-delimited notebook sections and raw-text fallback.

Deploy validation passed:

- `pnpm studio:manuscript:live-room:test`
- `pnpm studio:cloudrun:test`
- `pnpm --filter studio typecheck`
- Docker image build with `pnpm --filter studio build`
- deploy-script smokes for `/api/health` and `/content-studio`
- direct smoke: `/manuscript` returned `HTTP 200`
- direct smoke: `/manuscript/live` returned `HTTP 200`
- direct smoke: `/api/manuscript/live-rooms` returned the expected
  unauthenticated `401`

Rollback from this deployed revision:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00063-982=100
```

## Recap Snapshot Deployment

Merged through PR #44:

```text
main commit: 8e96a23
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:8e96a23
Cloud Build: fdb8bb65-d33e-430d-95b1-f1cf617055ce
revision: studio-00067-h6z
url: https://studio-hm2odnvjga-uc.a.run.app
```

This slice carries the live-room session recap into manual Manuscript Desk
snapshot descriptions. The description uses the existing snapshot metadata
field and stores a compact digest of decisions, action items, open questions,
and source notes so checkpoints remain useful after the live session ends.

No schema, provider, public publishing, or episode-route changes were needed.

Deploy validation passed:

- `pnpm studio:manuscript:live-room:test`
- `pnpm studio:cloudrun:test`
- `pnpm --filter studio typecheck`
- Docker image build with `pnpm --filter studio build`
- deploy-script smokes for `/api/health` and `/content-studio`
- direct smoke: `/manuscript` returned `HTTP 200`
- direct smoke: `/manuscript/live` returned `HTTP 200`
- direct smoke: `/api/manuscript/live-rooms` returned the expected
  unauthenticated `401`

The remote Docker build emitted the known Yjs duplicate-import warning during
static generation, but the production build completed successfully.

Rollback from this deployed revision:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00065-sjh=100
```

## Section Kind Controls Deployment

Merged through PR #46:

```text
main commit: 36c4c2e
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:36c4c2e
Cloud Build: 49bbd56a-7342-4b36-ba5d-bb3dab88c3d3
revision: studio-00069-c9k
url: https://studio-hm2odnvjga-uc.a.run.app
```

This slice added per-section kind controls in notebook mode. Existing notebook
sections can now be marked as notes, decisions, actions, questions, or source
notes from the UI without deleting their body text. The live-room data shape
remains the same shared Yjs text document.

No schema, provider, public publishing, or episode-route changes were needed.

Deploy validation passed:

- `pnpm studio:manuscript:live-room:test`
- `pnpm studio:cloudrun:test`
- `pnpm --filter studio typecheck`
- Docker image build with `pnpm --filter studio build`
- deploy-script smokes for `/api/health` and `/content-studio`
- direct smoke: `/manuscript` returned `HTTP 200`
- direct smoke: `/manuscript/live` returned `HTTP 200`
- direct smoke: `/api/manuscript/live-rooms` returned the expected
  unauthenticated `401`

The remote Docker build emitted the known Yjs duplicate-import warning during
static generation, but the production build completed successfully.

Rollback from this deployed revision:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00067-h6z=100
```
