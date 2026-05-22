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

## Scrub Vs Playback

Studio Cut separates source scrubbing from program playback:

- Source Scrub: the slider, time input, event jumps, and manual time controls
  always use canonical source time. They show the full source timeline,
  including `Cut` / inactive spans.
- Program Playback: the Play button uses the same source-time clock but
  simulates final program playback. When playback reaches a segment whose state
  is `Cut`, it jumps to the next non-`Cut` segment start. If there is no next
  active segment, playback stops.

This does not create destructive cuts or a new source timeline. Source time
remains canonical; playback skipping is only a preview behavior for inactive
ranges.

## Episode Manifest

Studio Cut can import an Episode Manifest JSON file for the temporary
Premiere-synced bootstrap workflow. The manifest records:

- episode id, title, and source duration
- Homer, Charlie, optional Clip, and Program source labels
- source-monitor proxy URL or local placeholder path
- pane rectangles for Homer, Charlie, and optional Clip
- Premiere XML/EDL bootstrap notes

The web app uses the manifest duration as the source timeline length and
displays the source-monitor proxy metadata. It does not require full-res media.
A placeholder-only sample lives at:

```text
docs/studio-cut-episode-manifest.sample.json
```

Do not put real media paths, private podcast details, proxy package URLs, or
personal recordings in checked-in manifest files.

## Local Proxy Playback

Studio Cut can play a local source-monitor proxy video in the browser without
uploading it anywhere. Use `Load Local Proxy Video` in the Episode Manifest
panel and choose a local `.mp4`, `.mov`, or `.m4v` file from the operator's
machine.

Important boundaries:

- the selected file is read only by the current browser tab
- the app uses an in-memory `URL.createObjectURL()` URL
- the file and object URL are not saved to localStorage
- the file and object URL are not written to Firestore decision events
- the file is not uploaded to Firebase Hosting, Cloud Storage, Firestore, or
  any other service
- the object URL is revoked when the video is replaced, cleared, or the app
  unloads

The source-time slider seeks the local proxy video. Program Playback uses the
same video but keeps the semantic preview behavior: when playback reaches a
`Cut` span, it seeks the video to the next non-`Cut` segment start. Manual
scrubbing, event jumps, and time edits still show the full source timeline,
including inactive spans.

The current player shows the source-monitor proxy as one composite video. It
uses the manifest's Homer, Charlie, and Clip pane rectangles as visible metadata
only; individual pane cropping is intentionally deferred.

## Premiere Bootstrap Workflow

Use Premiere only to create the temporary synced source truth:

1. Sync the episode sources in Premiere.
2. Export a lightweight source-monitor proxy that shows the Homer, Charlie, and
   optional Clip panes.
3. Export XML/EDL from Premiere if available.
4. Create a Studio Cut Episode Manifest JSON with placeholder-safe source names,
   duration, proxy metadata, pane rectangles, and XML file name.
5. Import the manifest in Studio Cut.
6. Load the local source-monitor proxy video from the operator's machine.
7. Tag semantic decisions in Studio Cut against source time.
8. Export Studio Cut decision JSON.

Tonight's usable workflow is:

```text
Premiere sync -> proxy export -> manifest import -> local proxy load -> semantic tagging -> decision JSON export
```

Tonight's boundary: Premiere owns temporary source sync. Studio Cut owns the
semantic decision layer. The later local render engine should consume the
Premiere-derived sync reference plus Studio Cut decisions and render full-res
output locally.

## Preview Truths

- Source monitor proxies are for seeing and timing source material in the web
  editor. Local proxy playback is browser-only and ephemeral.
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

Current Firebase Web App:

```text
Display name: studio-cut-web
App ID: 1:659427658635:web:6a29892c9e4fba8dcebd8e
Project: high-ground-odyssey
```

Do not create another Firebase Web App for Studio Cut unless the existing app
has been intentionally deleted.

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

Firebase Auth provider setup is still an operator step in the Firebase Console:

1. Open Firebase Console for `high-ground-odyssey`.
2. Go to Authentication -> Sign-in method.
3. Enable Google as a provider.
4. Confirm the authorized domain includes `high-ground-odyssey.web.app`.

Without the Google provider enabled, the deployed app can render the auth gate
but Google sign-in will fail.

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

Production env workflow:

1. Confirm the Firebase Web App exists:

```bash
firebase apps:list --project high-ground-odyssey
```

Expected existing Web App:

```text
studio-cut-web
1:659427658635:web:6a29892c9e4fba8dcebd8e
```

2. Only if the app is missing and the CLI confirms the project is
   `high-ground-odyssey`, create it:

```bash
firebase apps:create WEB studio-cut-web --project high-ground-odyssey
```

3. Fetch the SDK config for the existing app:

```bash
firebase apps:sdkconfig WEB 1:659427658635:web:6a29892c9e4fba8dcebd8e --project high-ground-odyssey
```

4. Create `apps/studio-cut-web/.env.production.local` from that output:

```bash
VITE_STUDIO_CUT_PROJECT_ID=studio-cut-local-project
VITE_STUDIO_CUT_BRANCH_ID=local-main
VITE_STUDIO_CUT_CREATED_BY=local-web-editor
VITE_STUDIO_CUT_ALLOWED_EMAILS=charlie@highgroundodyssey.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=high-ground-odyssey.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=high-ground-odyssey
VITE_FIREBASE_APP_ID=1:659427658635:web:6a29892c9e4fba8dcebd8e
VITE_FIREBASE_STORAGE_BUCKET=high-ground-odyssey.firebasestorage.app
```

`apps/studio-cut-web/.env.production.local` is ignored by git. Do not commit
real Firebase config values, service-account files, private keys, media,
proxies, or private podcast data.

5. Build and deploy:

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
