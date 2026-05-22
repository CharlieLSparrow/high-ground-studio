# Studio Cut Firestore Collaboration Rules Draft

Date: 2026-05-22

This is a rules and data-shape draft for Studio Cut collaboration. It is not a
deployed security policy and should not be described as production-safe until it
is reviewed, tested against the Firebase project, and deployed intentionally.

## Collections

Studio Cut collaboration is scoped by project and branch:

```text
studioCutProjects/{projectId}
studioCutProjects/{projectId}/branches/{branchId}
studioCutProjects/{projectId}/branches/{branchId}/decisionEvents/{eventId}
studioCutProjects/{projectId}/branches/{branchId}/presence/{sessionId}
```

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

Firestore must not store full-resolution media, local proxy media, object URLs,
personal recordings, local filesystem paths, service accounts, credentials, or
generated renders.

Each collaborator loads their own local source-monitor proxy in the browser.
The shared layer stores only semantic decision events, branch metadata, presence,
comments later, and other lightweight project metadata.

## Auth Assumptions

The deployed web app currently allows Google sign-in for:

- exact emails in `VITE_STUDIO_CUT_ALLOWED_EMAILS`
- email domains in `VITE_STUDIO_CUT_ALLOWED_EMAIL_DOMAINS`, currently intended
  for `highgroundodyssey.com`

Firestore rules should independently enforce the same internal-only posture.
Do not rely only on client-side checks before private collaboration data enters
Firestore.

## Draft Rule Shape

The following is illustrative only:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null && request.auth.token.email is string;
    }

    function highGroundEmail() {
      return signedIn() &&
        request.auth.token.email.matches('(?i)^.+@highgroundodyssey\\.com$');
    }

    match /studioCutProjects/{projectId}/branches/{branchId}/decisionEvents/{eventId} {
      allow read: if highGroundEmail();
      allow create, update: if highGroundEmail()
        && request.resource.data.projectId == projectId
        && request.resource.data.branchId == branchId
        && request.resource.data.id == eventId;
      allow delete: if false;
    }

    match /studioCutProjects/{projectId}/branches/{branchId}/presence/{sessionId} {
      allow read: if highGroundEmail();
      allow create, update: if highGroundEmail()
        && request.resource.data.sessionId == sessionId
        && request.resource.data.userEmail == request.auth.token.email;
      allow delete: if false;
    }
  }
}
```

Before deploying rules:

1. Confirm the Firebase project is `high-ground-odyssey`.
2. Confirm Google sign-in emits verified email claims for the intended accounts.
3. Decide whether outside-domain collaborators need explicit email allowlist
   support in rules, custom claims, or a separate membership document.
4. Add emulator or rules-unit coverage.
5. Deploy rules separately from Hosting with an explicit operator command.

## Current Risks

- Client-side allowed-domain config is useful UX, not a complete security
  boundary for Firestore.
- Branch/project permissions are not modeled beyond path convention yet.
- Tombstones preserve explainability but are not a full audit log.
- Presence is best-effort and should not be used as authority for locks.
