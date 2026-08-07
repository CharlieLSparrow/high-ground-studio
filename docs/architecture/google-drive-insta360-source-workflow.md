# Google Drive and Insta360 source workflow

**Status:** Implemented foundation; real-provider acceptance pending  
**Last reviewed:** 2026-08-07  
**Product surface:** Quipsly Nest Source Room, local media worker, hybrid episode editor

## Decision

Quipsly treats Google Drive as an external source vault, not as an upload
staging area:

- an INSV original remains in Drive until a creator intentionally conforms or
  exports a final production;
- the paired LRV is the default browse source;
- attaching a source records provider identity, revision, checksum,
  capabilities, and source-unit membership without copying media;
- preparing a browse copy materializes the exact selected LRV into the local
  cache, verifies it, and only then builds the collaboration proxy;
- cards, annotations, ranges, collections, and editor decisions bind to stable
  Quipsly source revisions rather than a mutable Drive URL.

This gives creators Drive's inexpensive, familiar storage while keeping
Quipsly's editorial truth, provenance, and recovery behavior deterministic.

## User workflow

1. Connect Drive from the Source Room. Drive access is separate from Quipsly
   sign-in.
2. Choose an Insta360 library or capture-batch folder.
3. Quipsly inspects direct batch folders and shows ready, incomplete, syncing,
   restricted, and ambiguous camera segments before attachment.
4. Attach the library. This stores exact metadata only.
5. Each camera segment appears as one Source Room item even when it contains
   multiple INSV originals and an LRV companion.
6. Open a segment receipt to inspect every provider file, role, size, access
   state, and local-copy state.
7. Prepare the LRV only when the segment needs playback, annotation,
   storyboarding, or editing.
8. Work from the collaboration proxy in Nest. The local editor later resolves
   the exact INSV generation for conform or export.

If Google grants the selected folder identity but does not expose its
descendants under per-file access, **Choose 360 files** is the equivalent
least-privilege path. The creator selects the matching INSV and LRV files;
Quipsly verifies each selected file, groups them by Drive parent and camera
clock, and creates the same source-unit contract.

The general **Choose other Drive files** path remains separate so research and
non-Insta360 source intake is not forced into the camera package model.

## Why per-file Drive access

Quipsly requests
`https://www.googleapis.com/auth/drive.file`, not whole-Drive read access.
Google recommends this scope with Picker because the user chooses which files
the app may access and the scope is non-sensitive:

- <https://developers.google.com/workspace/drive/api/guides/api-specific-auth>
- <https://developers.google.com/workspace/drive/picker/guides/web-picker>

Picker uses list mode because Google's current guidance warns that
least-privilege tokens might not grant thumbnail access for every browsable
file. Folder traversal is treated as a provider capability to prove, not an
assumption. Explicit multi-file selection is the reviewed fallback.

## Source topology

```text
Google Drive
  capture library
    capture batch folder
      VID_<clock>_<channel>_<segment>.insv  -> primary original
      VID_<clock>_<channel>_<segment>.insv  -> optional second original
      LRV_<clock>_<channel>_<segment>.lrv   -> browse companion

Quipsly
  StudioSourceUnit                         -> one camera-clock segment
    StudioExternalMediaReference           -> provider file identity
      StudioSourceRevision                 -> immutable observed generation
        StudioMediaSourceReplica           -> verified local LRV only
        StudioMediaDerivative              -> collaboration proxy
        StudioSourceRange                  -> time-bound creative selection
```

The source unit is the grouping authority. UI projections may choose the LRV
as the representative playable member, but they must not erase or duplicate
the original package.

## Identity and revision rules

- A Picker ID or URL is never trusted as complete file metadata.
- The server performs an authenticated Drive `files.get` before attachment.
- Provider revision, MD5, byte size, resource key, Drive identity, modification
  time, and download capabilities are recorded from the provider response.
- A camera segment slug is derived from its parent-folder identity and camera
  clock. Re-selecting the same package updates the same source unit.
- Every attached member gets an idempotent request identity derived from the
  creator's operation and provider file ID.
- Legacy `full-original` projections normalize to
  `primary-original`; new writes use the current package vocabulary.
- The source revision remains immutable. Provider drift creates a new observed
  generation or a held operation; it never silently changes an edited source.

## Materialization state machine

```text
metadata-only
  -> queued
  -> transferring (Range-resumable)
  -> provider re-read
  -> local MD5/SHA-256 verification
  -> exact local replica ready
  -> collaboration proxy queued
  -> collaboration proxy ready
```

On failure:

- a partial LRV transfer remains resumable when the provider generation still
  matches;
- changed revision, size, checksum, or resource identity invalidates the
  partial transfer;
- retry uses the same immutable job contract and never substitutes another
  file with a similar name;
- INSV originals are ineligible for the browse-materialization action;
- storage-pressure checks preserve a configured free-space reserve;
- disconnecting Drive removes the encrypted refresh credential and holds new
  provider work without deleting source cards or editorial decisions.

## Storage and cost roles

| Layer                | Default location                                                   | Purpose                                               |
| -------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| INSV original        | User's Google Drive                                                | Canonical camera source                               |
| LRV original         | User's Google Drive                                                | Canonical browse companion                            |
| Exact LRV replica    | Local media cache                                                  | Resume, verify, proxy input                           |
| Collaboration proxy  | Local during development; managed derivative storage in production | Browser playback and review                           |
| Edit decisions       | Quipsly database                                                   | Durable, small, shareable editorial truth             |
| Final conform/render | QuipslyStudio/local renderer initially                             | Resolve exact originals without routine cloud compute |

Drive is not a CDN. Browser playback uses Quipsly derivatives, not uncontrolled
Drive download links. Production proxy retention and cache eviction must be
explicit and recoverable because every derivative can be regenerated from the
recorded provider generation while access remains valid.

## Security boundaries

- OAuth refresh tokens use AES-256-GCM with a dedicated Drive encryption key.
- OAuth state uses a dedicated signing secret and a short-lived secure cookie.
- Picker browser keys are restricted by API and origin.
- OAuth credentials, Picker configuration, and encryption keys live in Secret
  Manager in deployed environments.
- Local durable children retrieve configured secrets at process start without
  writing values into Git, the shared environment file, lifecycle state, or
  launchd's submitted environment.
- Connections are user-owned. A project collaborator cannot use another
  creator's Drive credential merely because both can see a Nest.
- API routes repeat project membership and connection ownership checks at the
  server boundary.

## Runtime configuration

The Nest runtime requires:

```text
GOOGLE_DRIVE_OAUTH_CLIENT_ID
GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
GOOGLE_DRIVE_OAUTH_STATE_SECRET
GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY
GOOGLE_DRIVE_PICKER_API_KEY
GOOGLE_DRIVE_PICKER_APP_ID
```

Local development can opt into Secret Manager retrieval with:

```bash
QUIPSLY_LOCAL_GOOGLE_DRIVE_SECRET_PROJECT=high-ground-odyssey \
  pnpm quipsly:local:up
```

The preview deployment requires
`ENABLE_GOOGLE_DRIVE_OAUTH=1`. The release script fails closed unless all six
secret versions exist and pass private shape validation.

## Important implementation entry points

- Picker and intake UX:
  `apps/quipsly/src/app/(app)/nests/[slug]/story/GoogleDriveSourcePicker.tsx`
- Provider verification and package attachment:
  `apps/quipsly/src/lib/server/google-drive-source.ts`
- Camera filename/package planner:
  `apps/quipsly/src/lib/google-drive-media-package.ts`
- Exact LRV materialization request:
  `apps/quipsly/src/lib/server/google-drive-source-materialization.ts`
- Resumable worker:
  `apps/quipsly-media-processor/src/local-google-drive-source-materialization-worker.ts`
- Source Room grouping:
  `apps/quipsly/src/lib/source-library-projection.ts`
- Local lifecycle:
  `scripts/dev/quipsly-local-up.sh`
- Preview release gate:
  `scripts/release/quipsly-deploy-preview.sh`

## Real-provider acceptance gate

Do not call the Drive workflow production-ready until one retained real
Insta360 operation proves all of the following:

1. Connect a non-test Google account using only `drive.file`.
2. Select the real capture-library folder.
3. Record whether Drive exposes direct child folders and their files.
4. If it does not, select an INSV/LRV pair through **Choose 360 files** and
   prove the same grouped source unit.
5. Attach metadata without transferring any source bytes.
6. Start one real LRV transfer, interrupt it after measurable progress, and
   resume without restarting from zero.
7. Re-read provider revision, MD5, and size after transfer.
8. Verify local MD5 and SHA-256 before admitting the replica.
9. Build and play the collaboration proxy.
10. Confirm that the Source Room shows one camera segment with an inspectable
    member receipt.
11. Create a time range and story card from playback.
12. Open the same decision in the episode editor and local Studio handoff.
13. Prove a second Quipsly account cannot use the connection or fetch the
    source.
14. Disconnect and reconnect Drive without losing source identities,
    annotations, cards, or the verified derivative ledger.

The current loop-back trigger is successful Google Cloud reauthentication for
the project-owning account, followed by OAuth client creation/configuration for
the local and production callback URLs.
