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
- Firebase Auth / Google sign-in gate when Firebase config and allowed emails
  are provided at build time

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

Use `apps/studio-cut-web/.env.example` as the local env template. In the Vite
dev server, if Firebase env vars are absent or blank, the app shows local dev
mode and continues to work with localStorage only. Production builds should use
Firebase config and an allowed email list; if those are missing, the editor is
hidden instead of becoming a public editor.

Current non-secret local context vars:

```text
VITE_STUDIO_CUT_PROJECT_ID
VITE_STUDIO_CUT_BRANCH_ID
VITE_STUDIO_CUT_CREATED_BY
VITE_STUDIO_CUT_ALLOWED_EMAILS
```

Required production Firebase web config vars:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
```

Optional Firebase web config vars:

```text
VITE_FIREBASE_STORAGE_BUCKET
```

Firebase web config is not a service account and should not be confused with
server credentials. Do not commit service-account JSON, private keys, media,
proxy packages, or real recordings.

## Auth Gate

Studio Cut now has a first internal-only auth boundary:

- Vite dev with missing Firebase env vars: local dev mode, auth disabled, editor
  remains usable for prototype work.
- Production build with missing Firebase env vars: editor hidden with an auth
  configuration message.
- Firebase config present: Google sign-in is required.
- Signed-in email must appear in `VITE_STUDIO_CUT_ALLOWED_EMAILS`.
- Non-allowed users see a clear not-authorized message and do not see the
  editor.

`VITE_STUDIO_CUT_ALLOWED_EMAILS` is comma-separated:

```text
VITE_STUDIO_CUT_ALLOWED_EMAILS="person@example.com,another@example.com"
```

This app-level gate is not a substitute for Firestore security rules. Do not
put private podcast data, proxy package references, or real collaboration data
into Firestore until rules are scoped to approved internal users and explicit
project/branch permissions.

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
- `.firebaserc` binds the default Firebase project alias to
  `high-ground-odyssey`

Live Firebase Hosting URL:

```text
https://high-ground-odyssey.web.app
```

Deploy command that worked:

```bash
pnpm studio-cut:build
firebase deploy --project high-ground-odyssey --only hosting
```

Current safety state:

- The deployed shell has an app-level Google sign-in/allowed-email gate when
  Firebase config is supplied at build time.
- If production Firebase env vars are missing, the editor is hidden instead of
  falling back to public local mode.
- Do not enter real media paths, private podcast details, proxy package
  references, credentials, personal recordings, or production collaboration data
  until Firestore rules are in place.

Near-term internal-only task:

- Add Firestore security rules scoped to approved internal users and explicit
  project/branch permissions.
- Only then use live Firestore for real collaboration or private podcast data.

Manual Firebase Hosting path after future build-verified changes:

```bash
pnpm studio-cut:build
firebase deploy --project high-ground-odyssey --only hosting
```

Rollback command for the latest Studio Cut deployment slice:

```bash
git revert HEAD
pnpm studio-cut:build
firebase deploy --project high-ground-odyssey --only hosting
```

Do not create paid resources, enable new Firebase products, or bind unexpected
projects without clear operator confirmation.

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
