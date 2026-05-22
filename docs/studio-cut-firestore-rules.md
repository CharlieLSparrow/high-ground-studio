# Studio Cut Firestore Collaboration Rules Draft

Date: 2026-05-22

This is the rules and data-shape draft for Studio Cut collaboration. It is not a
deployed security policy and should not be described as production-safe until the
emulator tests pass and the rules are deployed intentionally.

Draft scaffold files exist at repo root:

```text
firestore.rules
storage.rules
```

They are wired into `firebase.json` for emulator tests and explicit rules
deploys. The normal Studio Cut Hosting deploy remains separate because Codex and
operators use:

```bash
firebase deploy --project high-ground-odyssey --only hosting
```

Rules deploy is intentionally explicit:

```bash
firebase deploy --project high-ground-odyssey --only firestore:rules,storage
```

Do not deploy rules until `pnpm studio-cut:rules-test` passes against the
emulators.

## Collections

Studio Cut collaboration is scoped by project and branch:

```text
studioCutProjects/{projectId}
studioCutProjects/{projectId}/branches/{branchId}
studioCutProjects/{projectId}/branches/{branchId}/room/meta
studioCutProjects/{projectId}/branches/{branchId}/decisionEvents/{eventId}
studioCutProjects/{projectId}/branches/{branchId}/presence/{sessionId}
```

`room/meta` contains lightweight shared-room metadata:

- `projectId`
- `branchId`
- `title`
- `manifest`
- `sourceMonitorProxyStoragePath`
- `sourceMonitorProxyFileName`
- `sourceMonitorProxyContentType`
- `sourceMonitorProxySizeBytes`
- optional `packageKind`, currently `prepared_proxy` or
  `rescue_sync_generated`
- optional `syncJobId`
- optional `manifestStoragePath`
- optional `syncMapStoragePath`
- optional `syncReportStoragePath`
- optional `generatedByWorkerVersion`
- optional `packageCreatedAt`
- `createdBy`
- `createdAt`
- `updatedAt`
- optional `notes`

The manifest may include source labels and pane rectangles. It must not include
local filesystem paths, object URLs, full-resolution media paths, credentials,
or generated render paths.

Generated Rescue Sync packages keep the browser proxy under the shared room
source-monitor path and store generated JSON artifacts under
`studioCutSyncJobs/{syncJobId}/outputs/{fileName}`. Room metadata points to
those Storage paths and should never include local original paths.

`decisionEvents` contain semantic edit events over source time. The first
multiplayer version uses append/upsert and tombstone updates:

- `id`
- `projectId`
- `branchId`
- `sourceTimeMs`
- `state`
- `createdBy`
- `createdAt`
- `clientId`
- `operation`
- optional `note`
- optional `removedAt`
- optional `removedBy`

Tombstoned decisions are ignored by derived segments and Program Playback, but
they remain explainable shared history. `Cut` remains a semantic inactive span,
not deletion.

`presence` documents are ephemeral room signals:

- `sessionId`
- `userEmail`
- `currentSourceTimeMs`
- `updatedAt`
- optional `currentState`
- optional `appVersion`

Presence is allowed to become stale. The first version does not depend on
perfect disconnect cleanup.

## Media Boundary

Firestore must not store full-resolution media, local proxy object URLs,
personal recordings, local filesystem paths, service accounts, credentials, or
generated renders.

Firebase Storage may store only lightweight source-monitor proxy packages under:

```text
studioCutProjects/{projectId}/branches/{branchId}/source-monitor-proxy/{fileName}
```

Rescue Sync raw intake may also store operator-uploaded assets and worker
outputs under:

```text
studioCutSyncJobs/{syncJobId}/uploads/{role}/{fileName}
studioCutSyncJobs/{syncJobId}/outputs/{fileName}
```

The shared layer stores only room metadata, semantic decision events, branch
metadata, presence, comments later, sync job metadata, uploaded intake assets,
worker output manifests/reports/proxies, and lightweight proxy packages.
Full-res final render media remains local.

## Auth Assumptions

The deployed web app currently allows Google sign-in for:

- exact emails in `VITE_STUDIO_CUT_ALLOWED_EMAILS`
- email domains in `VITE_STUDIO_CUT_ALLOWED_EMAIL_DOMAINS`, currently intended
  for `highgroundodyssey.com`

Firestore and Storage rules should independently enforce verified signed-in
emails on the High Ground Odyssey domain. Do not rely only on client-side checks
before private collaboration data enters Firestore or Storage.

## Rule Shape

The checked-in Firestore rule scaffold follows this shape:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null && request.auth.token.email is string;
    }

    function highGroundEmail() {
      return signedIn()
        && request.auth.token.email_verified == true
        && request.auth.token.email.matches('^.+@highgroundodyssey\\.com$');
    }

    match /studioCutProjects/{projectId}/branches/{branchId}/decisionEvents/{eventId} {
      allow read: if highGroundEmail();
      allow create, update: if highGroundEmail()
        && request.resource.data.projectId == projectId
        && request.resource.data.branchId == branchId
        && request.resource.data.id == eventId;
      allow delete: if false;
    }

    match /studioCutProjects/{projectId}/branches/{branchId}/room/meta {
      allow read: if highGroundEmail();
      allow create, update: if highGroundEmail()
        && request.resource.data.projectId == projectId
        && request.resource.data.branchId == branchId;
      allow delete: if false;
    }

    match /studioCutProjects/{projectId}/branches/{branchId}/presence/{sessionId} {
      allow read: if highGroundEmail();
      allow create, update: if highGroundEmail()
        && request.resource.data.sessionId == sessionId
        && request.resource.data.userEmail == request.auth.token.email;
      allow delete: if false;
    }

    match /studioCutSyncJobs/{syncJobId} {
      allow read: if highGroundEmail();
      allow create, update: if highGroundEmail()
        && request.resource.data.syncJobId == syncJobId
        && request.resource.data.createdBy == request.auth.token.email;
      allow delete: if false;
    }
  }
}
```

The checked-in Storage rule scaffold follows this shape:

```text
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() {
      return request.auth != null && request.auth.token.email is string;
    }

    function highGroundEmail() {
      return signedIn()
        && request.auth.token.email_verified == true
        && request.auth.token.email.matches('^.+@highgroundodyssey\\.com$');
    }

    match /studioCutProjects/{projectId}/branches/{branchId}/source-monitor-proxy/{fileName} {
      allow read: if highGroundEmail();
      allow write: if highGroundEmail()
        && request.resource.size < 1024 * 1024 * 1024
        && request.resource.contentType.matches('video/.*');
      allow delete: if false;
    }

    match /studioCutSyncJobs/{syncJobId}/uploads/{role}/{fileName} {
      allow read: if highGroundEmail();
      allow write: if highGroundEmail()
        && role.matches('homerVideo|charlieVideo|homerAudio|charlieAudio|phoneReferenceAudio|clipVideo|other')
        && request.resource.size < 20 * 1024 * 1024 * 1024
        && request.resource.contentType.matches('(video/.*|audio/.*|application/json)');
      allow delete: if false;
    }

    match /studioCutSyncJobs/{syncJobId}/outputs/{fileName} {
      allow read: if highGroundEmail();
      allow write: if highGroundEmail()
        && request.resource.size < 1024 * 1024 * 1024
        && request.resource.contentType.matches('(video/.*|application/json)');
      allow delete: if false;
    }
  }
}
```

The size limit is intentionally generous for a lightweight proxy but should be
reviewed against real proxy export sizes and raw intake sizes before production
collaboration. Raw intake upload limits are intentionally broad scaffolds, not a
final security/cost policy.

## Rules Tests

Static config checks run inside the normal verifier:

```bash
pnpm studio-cut:rules-config-test
pnpm studio-cut:verify
```

Full rules tests run under the Firebase Emulator Suite:

```bash
pnpm studio-cut:rules-test
```

The emulator test covers:

- approved `@highgroundodyssey.com` users can read/write room metadata
- approved users can read/write decision events and tombstone updates
- approved users can read/write their own presence
- approved users can upload/read source-monitor proxy files under the intended
  Storage path
- approved users can create/update Rescue Sync job documents
- approved users can upload/read Rescue Sync raw intake files and worker outputs
- anonymous users are denied
- non-HighGroundOdyssey users are denied
- deletes are denied
- wrong project/branch/document data is denied where practical

The Firebase emulators require Java on the local machine. If Java is missing,
install a JRE/JDK, then rerun `pnpm studio-cut:rules-test`.

Before deploying rules:

1. Confirm the Firebase project is `high-ground-odyssey`.
2. Confirm Google sign-in emits verified email claims for the intended accounts.
3. Decide whether outside-domain collaborators need explicit email allowlist
   support in rules, custom claims, or a separate membership document.
4. Run `pnpm studio-cut:rules-test`.
5. Deploy rules separately from Hosting with:

```bash
firebase deploy --project high-ground-odyssey --only firestore:rules,storage
```

## Current Risks

- Client-side allowed-domain config is useful UX, not a complete security
  boundary for Firestore or Storage.
- Branch/project permissions are not modeled beyond path convention yet.
- Storage upload size/content-type checks do not prove a file is safe or
  lightweight.
- Raw intake can involve large files and needs lifecycle cleanup, quotas, and a
  narrower production policy before sensitive footage.
- Tombstones preserve explainability but are not a full audit log.
- Presence is best-effort and should not be used as authority for locks.
