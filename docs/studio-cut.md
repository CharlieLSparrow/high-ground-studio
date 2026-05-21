# Studio Cut

Date: 2026-05-21

## Purpose

Studio Cut is an internal-first multicam podcast editor for the Charlie/Homer
recording workflow. It is not a Premiere clone and does not destructively cut
media. The full synced source timeline stays intact; editing creates semantic
decision events over source time.

Current slice:

- `apps/studio-cut-web`: Vite + React + TypeScript editor shell
- `packages/studio-cut-schema`: shared TypeScript schema for decision events and
  derived program segments
- browser `localStorage`: always-on local/offline persistence
- optional Firebase web config: enables Firestore-ready cloud persistence without
  making Firebase mandatory for local dev

## Media Boundary

Full-resolution source media stays local:

- Charlie Canon R8 video
- Homer Insta360 exported 4K video with reframing padding
- Homer DJI Mic 3 clean audio
- Charlie Shure MV7i clean audio
- iPhone call recording as backup audio and sync reference

Do not commit secrets, credentials, full media, proxy media, personal
recordings, generated render outputs, or generated caches.

The web/cloud layer should store only lightweight project metadata, proxy
references/packages, semantic decision events, branches, comments, and later
collaboration state.

## Editing Model

A `DecisionEvent` records a semantic program state at a source timestamp. That
state applies from its timestamp until the next state decision or the episode
end.

Initial states:

- `Charlie`
- `Homer`
- `Both`
- `Charlie/Clip`
- `Homer/Clip`
- `Both/Clip`
- `Cut`

`Cut` means inactive/skipped in program playback. It does not delete or modify
source media.

The same semantic edit should eventually render differently for 16:9, 9:16,
audio-only, and other profiles. Presentation choices belong in render profiles
and FX passes, not in the core decision event.

## Preview Truths

- Source monitor proxies are for seeing and timing source material in the web
  editor.
- The web Program Preview is an edit simulation from semantic state decisions.
- The local render engine remains final truth for synced full-resolution output.

The local engine should later sync source media, generate proxy packages, pull
decision branches, and render final outputs locally.

## Local Commands

Run from the repo root:

```bash
pnpm studio-cut
pnpm studio-cut:typecheck
pnpm studio-cut:build
```

The editor always persists decisions in browser storage under:

```text
high-ground-studio.studio-cut.decisions.v1
```

Use `apps/studio-cut-web/.env.example` as the local env template. If Firebase
env vars are absent or blank, the app shows `Local only` and continues to work.

Current non-secret local context vars:

```text
VITE_STUDIO_CUT_PROJECT_ID
VITE_STUDIO_CUT_BRANCH_ID
VITE_STUDIO_CUT_CREATED_BY
```

Optional Firebase web config vars:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_STORAGE_BUCKET
```

Firebase web config is not a service account and should not be confused with
server credentials. Do not commit service-account JSON, private keys, media,
proxy packages, or real recordings.

## Persistence Boundary

The web app now separates persistence from `App.tsx`:

- local browser store: `localStorage`
- cloud-ready store: Firestore adapter behind Firebase env vars
- runtime schema checks: `packages/studio-cut-schema`

When Firestore is configured, the adapter reads and upserts event documents by
event id. It does not destructively overwrite a whole branch and it does not
delete cloud events from the first shell.

Firestore decision path:

```text
studioCutProjects/{projectId}/branches/{branchId}/decisionEvents/{eventId}
```

The document body uses the shared `DecisionEvent` shape:

```text
id
projectId
branchId
sourceTimeMs
state
createdBy
createdAt
note
```

Local removal and `Clear Local` only change the current browser working set.
They are not cloud delete operations.

## JSON Handoff

The editor supports `Export JSON` and `Import JSON` for decision handoff before
live collaboration exists.

Export shape:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-05-21T00:00:00.000Z",
  "projectId": "studio-cut-local-project",
  "branchId": "local-main",
  "decisionEvents": []
}
```

Import accepts either that object shape or a raw `DecisionEvent[]`. Events are
validated against the shared schema. Valid imported events are normalized onto
the active project and branch so the current Firestore path stays coherent.

## Cloud Shape

Desired deployment shape:

- Firebase Hosting for the static Studio Cut web editor
- Firestore for decision events now, and later for branches, comments, and
  project metadata
- Cloud Storage later for lightweight proxy packages only
- Cloud Run later for Python APIs and local-engine coordination services

Checked-in scaffold:

- `firebase.json` serves `apps/studio-cut-web/dist` as a single-page app
- no `.firebaserc` or Firebase Hosting site target is checked in yet

Deployment is intentionally not tied to a checked-in Firebase project ID yet.
Do not create paid resources or bind a project from an agent session unless the
operator has explicitly confirmed the Google Cloud/Firebase project, billing,
auth, and site target.

Current local deployment blockers to resolve before first deploy:

- install or provide the Firebase CLI
- confirm the Firebase project ID and Hosting site target
- confirm Firebase Hosting is enabled for that project
- confirm billing/resource ownership before creating any new site, Firestore,
  Cloud Storage, or Cloud Run resources

Manual Firebase Hosting path once the project is confirmed:

```bash
pnpm studio-cut:build
firebase login
firebase projects:list
firebase deploy --project PROJECT_ID --only hosting
```

For the currently observed local CLI state on 2026-05-21, `gcloud` is configured
for `high-ground-odyssey`, but the Firebase CLI is not installed in PATH. The
next operator step is:

```bash
npm install -g firebase-tools
firebase login
firebase projects:list
firebase deploy --project high-ground-odyssey --only hosting
```

Run the deploy command only after confirming Firebase Hosting is enabled for
that project and the desired Hosting site/target is correct.

If the operator wants a dedicated non-default Hosting site, create the site and
target mapping first, then update `firebase.json` to use that target:

```bash
firebase hosting:sites:create SITE_ID --project PROJECT_ID
firebase target:apply hosting studio-cut SITE_ID --project PROJECT_ID
```

Then change the hosting config to include:

```json
{
  "target": "studio-cut"
}
```
