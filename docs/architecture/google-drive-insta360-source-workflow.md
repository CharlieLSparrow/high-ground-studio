# Google Drive and Insta360 source workflow

**Status:** Implemented durable intake foundation; real-provider acceptance pending

**Last reviewed:** 2026-08-08

**Product surface:** Quipsly Nest Source Room, local media worker, hybrid episode editor

## Decision

Quipsly treats Google Drive as an external source vault, not as an upload
staging area:

- an INSV original remains in Drive until a creator explicitly approves the
  final-render preflight for that camera package;
- the paired LRV is the default browse source;
- an LRV is treated as an unstitched dual-fisheye camera preview unless its
  exact revision carries verified stitched equirectangular evidence; a 2:1
  canvas alone is not sufficient;
- attaching a source records provider identity, revision, checksum,
  capabilities, and source-unit membership without copying media;
- preparing a browse copy materializes the exact selected LRV into the local
  cache, verifies it, and only then builds the collaboration proxy;
- final conform shows exact remaining bytes, the active Mac's safety reserve,
  and per-member transfer state before it queues any INSV download;
- once every required member is checksum-bound locally, Quipsly creates one
  immutable render-ready source set without changing the Drive originals;
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
5. The chosen folder becomes a **followed library** with a safe inventory
   fingerprint, refresh history, and ready/held/not-observed health.
6. Refresh the library when Drive finishes syncing or new camera files arrive.
   A complete scan can add or revise observations. A missing file becomes
   `not-observed`; it never deletes source revisions, ranges, cards, or boards.
7. Each camera segment appears as one Source Room item even when it contains
   multiple INSV originals and an LRV companion.
8. Open a segment receipt to inspect every provider file, role, size, access
   state, and local-copy state.
9. Prepare the LRV only when the segment needs playback, annotation,
   storyboarding, or editing.
10. Work from the collaboration proxy in Nest.
   Unstitched camera pixels use a normal video viewer for timing and ranges;
   spatial look-around activates only after a stitched equirectangular
   derivative is verified.
11. Open **Final render preflight** when a selected segment is ready to finish.
   Inspection is metadata-only; it does not download media.
12. Review exact bytes remaining and safe Mac capacity, then explicitly choose
    **Prepare … on this Mac**.
13. Transfers resume by byte range and bind MD5 plus SHA-256 before the package
    becomes render-ready. Nest and the local editor then resolve the same
    immutable source-set identity.

### Episode assembly from Story selects

The canonical Episode collaboration editor owns a lazy **Story source bin**.
Opening it reads the existing Source Story projection; it does not copy Drive
media or create a second library. A creator can browse board sections, inspect
the exact retained range, collaboration-proxy state, and 360 framing recipe,
then place a card on V1–V9 at the shared playhead.

Placement uses the Episode's current timeline fingerprint and the exact board,
board-placement, card, and source-range identities. If a collaborator changes
the timeline first, the API returns a conflict, the bin refreshes, and the
creator must deliberately place again. Quipsly never retries at a stale time.
An already-active card becomes **Cue** rather than **Add**, preventing an easy
accidental duplicate. The editor can always return to the exact Story card.

This is one composition model across browser and native rendering:

- Story owns selection, notes, organization, and retained source clocks;
- the Episode timeline owns editorial placement and trim decisions;
- the collaboration proxy supports browser review;
- final conform resolves the immutable original revision on a capable worker.

The bin is lazy so a large followed Drive library does not inflate every
Episode-editor request. The existing Source Story API remains the mutation
boundary; the Episode editor only refreshes its canonical projection after a
successful placement.

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
  StudioExternalMediaLibrary               -> followed provider folder
    StudioExternalMediaLibraryItem         -> present/not-observed inventory
    StudioExternalMediaLibraryOperation    -> append-only attach/refresh receipt
  StudioSourceUnit                         -> one camera-clock segment
    StudioExternalMediaReference           -> provider file identity
      StudioSourceRevision                 -> immutable observed generation
        StudioMediaSourceReplica           -> verified exact LRV or INSV bytes
        StudioMediaDerivative              -> collaboration proxy
        StudioSourceRange                  -> time-bound creative selection
    StudioMediaSourceSet                   -> render-ready complete camera take
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
- Paired INSV files receive stable `primary-original` and
  `secondary-original` roles based on their camera channel; a single-file X4
  segment remains a valid primary-only package.
- Drive video duration and dimensions are retained when Google has finished
  indexing them. Proxy decode fills missing clock metadata without trusting a
  filename or browser estimate.
- The source revision remains immutable. Provider drift creates a new observed
  generation or a held operation; it never silently changes an edited source.
- A full selected-folder listing is the correctness baseline. Drive change
  tokens may later reduce polling cost, but they cannot replace complete
  reconciliation or become deletion authority.
- Refresh records added, changed, restored, unchanged, and not-observed counts
  plus a deterministic inventory fingerprint. Provider file and resource-key
  identities remain server-only.
- An unexpectedly empty refresh for a previously non-empty library is
  inconclusive. Quipsly preserves the last successful inventory and performs
  no source mutation.

## Materialization state machine

```text
metadata-only
  -> explicit browse or conform intent
  -> queued
  -> transferring (Range-resumable)
  -> provider re-read
  -> local MD5/SHA-256 verification
  -> exact local replica ready
  -> browse member: collaboration proxy queued -> proxy ready
  -> original member: exact replica retained, no proxy invented
  -> all members exact + browse clock measured
  -> immutable render-ready source set
```

On failure:

- a partial LRV transfer remains resumable when the provider generation still
  matches;
- changed revision, size, checksum, or resource identity invalidates the
  partial transfer;
- retry uses the same immutable job contract and never substitutes another
  file with a similar name;
- INSV originals are ineligible for the browse action and require the explicit
  package conform action;
- storage-pressure checks preserve a configured free-space reserve;
- the Mac heartbeat reports safe capacity without exposing its local path;
- each source member is independently resumable, while the package does not
  claim render readiness until every required member is exact;
- disconnecting Drive removes the encrypted refresh credential and holds new
  provider work without deleting source cards or editorial decisions.

## Storage and cost roles

| Layer                | Default location                                                   | Purpose                                               |
| -------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| INSV original        | User's Google Drive                                                | Canonical camera source                               |
| LRV original         | User's Google Drive                                                | Canonical browse companion                            |
| Exact LRV replica    | Local media cache                                                  | Resume, verify, proxy input                           |
| Exact INSV replica   | Local media cache, only after explicit conform                     | Reviewed stitch and final render input                |
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
- Followed-library health is project-visible, but only the connection owner can
  refresh it. Collaborative responses omit root IDs, file IDs, resource keys,
  and account credentials.
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

After an administrator creates the Google Auth Platform **Web application**
client, install the downloaded JSON through the repository boundary:

```bash
pnpm quipsly:drive:oauth:install -- \
  --credentials /absolute/path/to/client_secret.json \
  --dry-run

pnpm quipsly:drive:oauth:install -- \
  --credentials /absolute/path/to/client_secret.json

pnpm quipsly:local:up
```

The installer requires the exact production/local JavaScript-origin and
callback sets before it will write anything. It checks the four existing
Picker/state/encryption prerequisites, creates or rotates only the client ID
and client-secret versions, and records only a SHA-256 client fingerprint plus
the non-secret project selection in the machine-wide lifecycle directory. An
exact replay adds no new Secret Manager version. The downloaded source file is
never copied into the repository and is not deleted automatically.

Google's IAM OAuth-client CLI is not a substitute for this client: that API is
for Google Cloud/IAM scopes. Google user-data OAuth clients such as
`drive.file` still require explicit creation in Google Auth Platform. See
[Google OAuth best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
and the
[Google Workspace credential guide](https://developers.google.com/workspace/guides/create-credentials).

The preview deployment requires
`ENABLE_GOOGLE_DRIVE_OAUTH=1`. The release script fails closed unless all six
secret versions exist and pass private shape validation.

## Important implementation entry points

- Picker and intake UX:
  `apps/quipsly/src/app/(app)/nests/[slug]/story/GoogleDriveSourcePicker.tsx`
- Provider verification and package attachment:
  `apps/quipsly/src/lib/server/google-drive-source.ts`
- Followed-library reconciliation and safe projection:
  `apps/quipsly/src/lib/server/external-media-library.ts`
- Camera filename/package planner:
  `apps/quipsly/src/lib/google-drive-media-package.ts`
- Exact LRV materialization request:
  `apps/quipsly/src/lib/server/google-drive-source-materialization.ts`
- Package conform planner and immutable source-set creation:
  `apps/quipsly/src/lib/server/google-drive-source-conform.ts`
- Resumable worker:
  `apps/quipsly-media-processor/src/local-google-drive-source-materialization-worker.ts`
- Provider-neutral local exact-source resolver:
  `apps/quipsly/src/lib/spatial-exact-source.ts`
- Source Room grouping:
  `apps/quipsly/src/lib/source-library-projection.ts`
- Shared Episode Story source bin:
  `apps/quipsly/src/app/(app)/nests/[slug]/episode-editor/EpisodeStoryBin.tsx`
- Fingerprint-checked Source Story placement boundary:
  `apps/quipsly/src/app/api/nests/[slug]/source-story/route.ts`
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
6. Add or finish a file in Drive, refresh the followed library, and prove the
   safe diff appears without duplicate source units.
7. Temporarily move one observed file outside the selected folder, refresh,
   and prove it becomes `not-observed` without deleting source, range, card,
   board, or revision history. Restore it and prove the observation recovers.
8. Start one real LRV transfer, interrupt it after measurable progress, and
   resume without restarting from zero.
9. Re-read provider revision, MD5, and size after transfer.
10. Verify local MD5 and SHA-256 before admitting the replica.
11. Build and play the collaboration proxy.
12. Confirm that the Source Room shows one camera segment with an inspectable
    member receipt.
13. Create a time range and story card from playback.
14. Inspect final conform and prove it reports actual bytes and safe Mac
    capacity without starting a download.
15. Explicitly conform one real segment, interrupt an INSV transfer, resume it,
    and prove the complete package becomes one immutable source set.
16. Export and visually review a full 5.7K stitched master from the exact Drive
    replicas, register its receipt, then render one saved spatial selection.
17. Open the same decision and output in the episode editor and local Studio
    handoff.
18. Prove a second Quipsly account cannot use the connection or fetch the
    source.
19. Disconnect and reconnect Drive without losing source identities,
    annotations, cards, or the verified derivative ledger.

The current loop-back trigger is successful Google Cloud reauthentication for
the project-owning account, followed by OAuth client creation/configuration for
the local and production callback URLs.

## Retained local source-navigation operation

While provider OAuth is pending, local product work stays source-addressed and
replayable rather than depending on a “latest source” heuristic:

```bash
pnpm quipsly:retained:episode5-source-visual-overview
pnpm quipsly:retained:episode5-source-audio-navigation
pnpm quipsly:retained:episode5-insta360-source-story
```

The first two commands target the stable Episode 5 capture key. Their generic
forms accept either `--capture-key` or `--source-set`, never both. This keeps a
new import, another collaborator, or a replay from silently moving expensive
analysis to a different take. The final command proves those derivatives at
the authenticated product boundary without publishing or mutating originals.
