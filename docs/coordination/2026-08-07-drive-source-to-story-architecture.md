# Drive-backed source-to-story architecture · 2026-08-07

## Product outcome

Quipsly should let a creator discover media, understand it, mark useful moments, write around those moments, arrange them into a story, and promote the result into an Episode, short, lesson, research packet, or other production without first copying every original into Quipsly storage.

The browser owns organization and edit intent. Originals may remain in Google Drive or another source vault. Lightweight derivatives make collaboration immediate. A capable Mac or cloud executor resolves the frozen original revision only when source-heavy work is requested.

This is one product kernel with project-specific lenses—not separate editors for podcasts, courses, coaching, and social video.

## Interaction model

The strongest patterns from the reference products combine cleanly:

- [Insta360](https://onlinemanual.insta360.com/studio/en-us/operation-guide/edit-function/keyframe) treats keyframes as source-time camera/view instructions and supports direct `.insv` processing, proxies, stitching, stabilization, and reframing in its [Premiere integration](https://onlinemanual.insta360.com/studio/en-us/operation-guide/plugin-features/reframe-pr).
- [StudioBinder](https://www.studiobinder.com/shot-list-storyboard/) moves between media library, shot list, and storyboard views.
- [Scrivener](https://www.literatureandlatte.com/scrivener/overview) makes every section an index card whose synopsis, metadata, and order remain connected to the underlying work.

Quipsly's unit is a **source-backed story card**:

- optional immutable source range with source/revision identity and in/out time;
- title, synopsis, notes, tags, people, project, status, and story purpose;
- thumbnail, transcript excerpt, waveform summary, and source-health state;
- optional 360 reframe recipe with projection, aspect ratio, pan/tilt/roll/FOV keyframes, interpolation, stabilization, and horizon policy;
- zero or more placements in boards, outlines, documents, or timelines;
- placements can move without mutating the source range or original bytes.

The same cards have four views:

1. **Library** — browse connected vaults, dates, cameras, people, tags, transcript, and source health.
2. **Viewer** — inspect one long source, scrub a proxy, mark ranges, annotate, transcribe, and add 360 reframe intent.
3. **Board / outline** — arrange cards into beats, scenes, chapters, lessons, or episode sections while writing synopses and notes.
4. **Timeline** — promote placements into synchronized program decisions and render manifests.

## Google Drive source contract

Use [Google Picker with `drive.file`](https://developers.google.com/workspace/drive/picker/guides/web-picker) so Quipsly receives access only to files a user deliberately selects. Do not request whole-Drive scope for the normal import path.

For each selected blob, retain a source reference rather than original bytes:

- provider connection and Google account identity;
- Drive file ID, shared-drive ID when applicable, resource key when required;
- name, MIME type, size, created/modified time, and download capability;
- head revision ID and checksum when Drive supplies one;
- importer, project rights, and consent/rights receipt;
- last verified time, current access state, and change cursor/watch identity;
- no bearer access token or Drive download URL in shared editor state.

Drive supports [authorized full and byte-range downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads) and exposes [head revisions and change history](https://developers.google.com/workspace/drive/api/guides/change-overview). Quipsly must freeze a revision identity before proxying or rendering, verify size/checksum while reading, and reject silent revision substitution.

Drive ACLs remain authoritative. If access is revoked or download is restricted, Quipsly keeps the timeline/card intent and existing permitted derivative, but marks the original `source needs attention` and holds any new exact-source render. Drive change notifications are hints; every execution still performs a fresh capability and revision check.

## Execution paths

### Development and local-first

1. Browser Picker attaches the Drive source reference to a Nest.
2. The registered Mac executor obtains a job-scoped source lease for that exact reference and revision.
3. The Mac reads the Drive blob directly, hashing during transfer; it does not persist an extra original unless the user explicitly chooses an offline cache.
4. It creates thumbnails, waveform/transcript evidence, and an editing proxy locally.
5. It may upload only the collaboration proxy and evidence packet to Quipsly object storage.
6. Browser collaborators edit against that proxy; final local rendering re-resolves and verifies the Drive original.

The Mac's Google authorization must be explicit, account-bound, revocable, and kept in the platform credential vault. A server refresh token must never be embedded in a job manifest. The manifest contains provider-neutral source identity; the executor resolves credentials locally.

### Cloud executor later

The same frozen manifest can target a cloud worker. A server-side encrypted Drive connection authorizes the worker to stream the exact revision, and the worker produces a verified derivative/result receipt. Cloud execution remains optional and metered; the render-options UI shows estimated source bytes, proxy/output bytes, and cost before queueing.

## Storage policy

Drive is an origin vault, not Quipsly's CDN or database.

- **Keep in Drive:** selected originals and retained camera source.
- **Keep on a creator device when useful:** bounded, evictable original cache and local proxies.
- **Keep in Quipsly buckets:** collaboration proxies, thumbnails, waveform/transcript evidence, review drafts, publication candidates, and artifacts whose retention is required by the product contract.
- **Delete automatically:** superseded/rebuildable proxies after a declared retention window when no project pins them.

This can materially reduce Quipsly storage, but Drive API quotas and account storage are separate constraints. Current Drive quota policy is metered in quota units and shared-drive uploads have account limits; treat retries, byte ranges, and change reconciliation as normal product states, not edge cases.

## Exact LRV materialization checkpoint

The first provider-owned execution path is now implemented for selected
Insta360 browsing members. It intentionally does not stream an INSV original
through the web editor and does not mislabel a copied LRV as a derivative:

1. Source Room queues one deterministic, revision-bound materialization job
   only for the package's lightweight `browse-proxy` member. Camera LRVs are
   not assumed to be stitched merely because their canvas is 2:1.
2. The persistent Mac worker re-resolves the user-owned, verified Drive
   connection and inspects file ID, head revision, MD5, size, and download
   capability immediately before transfer.
3. A stable mode-0600 `.partial` file supports HTTP Range resume. Admission
   checks enforce a reviewed per-file limit and a configurable free-space
   reserve before more bytes are accepted.
4. The worker fsyncs and atomically renames the completed file, computes MD5
   and SHA-256 locally, and inspects Drive again. Provider drift, checksum
   disagreement, an escaped cache path, or an identity conflict fails closed.
5. `StudioMediaSourceReplica` retains the exact-copy receipt separately from
   `StudioMediaDerivative`. Its locator stays server-only. The source revision
   becomes SHA-256-bound only in the same transaction that retains the exact
   replica.
6. That transaction queues the existing collaboration-proxy worker from the
   verified local bytes. Source Room projects transfer progress and retry state
   and says plainly that the LRV is cached while INSV stays in Drive until
   conform/export.

The current admission policy is bounded but is not yet a global LRU cache. A
later lifecycle slice must add project pinning, total-cache accounting,
eviction receipts, and a visible storage manager before Quipsly claims fully
automatic cache management.

### Real hierarchy and retained operation

Read-only inspection of the user-supplied shared folder confirmed the practical
economics. One complete three-segment batch contains INSV members of roughly
29–31 GB and LRV companions of roughly 1.8–1.9 GB. Quipsly can therefore make
one segment quickly browsable without copying roughly 90 GB of originals.
Other batch folders were empty or incomplete at inspection time, so folder
health remains a first-class state rather than an assumed success.

The loopback retained operation used a generated valid video as a fake Drive
provider boundary—no real Drive source bytes were downloaded. It copied and
verified 3,676,170 exact bytes, checksum-bound the immutable source revision,
retained an exact replica, automatically queued the existing FFmpeg path, and
produced a 121,682-byte fast-start collaboration proxy. Independent readback
proved the provider fixture unchanged and both retained outputs matched their
SHA-256 receipts. The operation is repeatable through
`pnpm quipsly:retained:google-drive-materialization` while the background media
worker is paused so it cannot race the injected provider.

## Canonical model boundaries

Names are architectural roles; implementation should map them onto existing Quipsly canonical models where appropriate instead of creating duplicates.

- `ExternalMediaReference`: provider-neutral locator and live capability state.
- `MediaSourceRevision`: immutable provider revision/checksum/byte identity.
- `MediaDerivative`: proxy, thumbnail, audio overview, transcript, or analysis with provenance.
- `SourceRange`: immutable revision plus in/out source clock and optional reframe recipe.
- `StoryCard`: editable synopsis/notes/metadata referencing zero or one source range.
- `StoryBoard`: ordered or freeform placements of cards; a placement owns order/group/lane, never source bytes.
- `TimelinePlacement`: promotion receipt connecting a card/range to Episode-clock edit intent.
- `RenderManifest`: frozen timeline, source revisions, recipes, executor profile, and output policy.

A card can appear in multiple boards and timelines. Deleting a placement does not delete the card; deleting a card does not delete the source; disconnecting Drive does not rewrite edit history.

## Delivery slices

1. **Drive attach + source health** — Picker, `drive.file`, reference/revision contract, capability refresh, disconnected states.
2. **Proxy-first source viewer** — thumbnails, scrub proxy, range marking, notes, tags, transcript search, local Mac proxy generation.
3. **Story cards and boards** — card/outline/board views over the same objects; drag/reorder is revisioned collaboration intent.
4. **Episode promotion** — turn card placements into current program decisions with explicit source-clock to Episode-clock receipts.
5. **360 recipe** — inspect `.insv`/`.lrv`, preserve pairs, keyframe FOV/view/stabilization recipes, render through a local Insta360-capable adapter.
6. **Cloud executor + lifecycle policy** — optional exact-source streaming, spend preflight, retention/eviction, and portable provider adapters.

Acceptance for every slice includes real long-form media, revoked/changed Drive source recovery, collaborator access, device restart, and exact-revision render readback. A thumbnail grid alone is not completion.

## Operated source-to-story slice

The first production-shaped slice now exists inside each Nest at `/nests/:slug/story`:

- a permission-aware source library over the Nest's retained media, with honest proxy/source and byte-health labels;
- a video/audio source viewer with button and keyboard `I`/`O` marks on the source clock;
- immutable `MediaSourceRevision` and `SourceRange` rows, including an explicit non-destructive 360 recipe contract;
- editable, append-only-revisioned source cards with synopsis, notes, purpose, status, and the same canonical project tags used elsewhere in Quipsly;
- Episode-aware boards whose revisioned placements own only group, lane, and order;
- optimistic conflict handling and idempotent board/card/reorder requests for browser and native callers through one authenticated route;
- exact-range audition that switches to the correct source, seeks only after its player mounts, and stops at the selected out-point;
- no source mutation, proxy creation, transcription, rendering, or cloud execution merely from browsing or organizing.

The schema is additive. The older `StudioStoryboard` tables remain untouched for compatibility, but the new source-story surface does not call their GET-time auto-creation or simulated-AI actions. Migration ownership was tested through project deletion; card placements cascade with their hard-deleted card, while normal product deletion remains an archive operation.

### Retained High Ground Odyssey operation

Operated locally as `render-dogfood@quipsly.test` against real retained High Ground Odyssey media:

- created Episode-linked board `Episode 9 source selects — retained dogfood`;
- played the retained 30-second local Episode proof and marked source clock `00:01.02–00:04.01`;
- saved and revised `Rendezvous proof: source handoff opens cleanly`, including Episode 9, Homer, and Media tags;
- marked `Ted Lasso Be Curious.collaboration-proxy.mp4` with keyboard `I`/`O` at `00:01.11–00:04.26` and saved it as a shared-viewing clip cue;
- switched from that 254.63-second source back to the 30-second proof from a card, then observed playback stop at the exact persisted out-point;
- reordered both cards and observed the board move from revision 3 to revision 4 without either source range changing;
- read back two board/card revision histories, canonical tag links, exact selectors, and honest `identity-unverified` holds for both retained cards after invalidating the first checksum receipt algorithm;
- confirmed the registered media row predates the card and was not updated by organizing it.

### Defects found by operating the slice

1. A placement's restrictive card foreign key could block project teardown even though both parent objects belonged to the project. Hard card deletion now cascades placements; source identity remains independently retained by its own contract.
2. Parallel validation inside an interactive Prisma transaction could keep querying after another validation rolled it back. Transactional reads and writes are now sequential.
3. Checksum discovery recursively treated primitive or missing nested metadata as another object, causing a stack overflow on real retained variant metadata. Recursion now stops at the JSON object boundary, and the database fixture contains nested checksum-missing metadata.
4. Range playback originally sought the current player and ran past the out-point. Cross-asset audition now waits for the correct mounted player and enforces the exact range boundary for video and audio.
5. A proxy attachment carries both the proxy output checksum and the original-behind-the-proxy checksum. The v1 lookup paired the original checksum with the proxy byte count. All v1 verification claims are now explicitly invalidated; v2 accepts only an output/direct-registration checksum whose declared byte count matches the exact `StudioMediaAsset`. The database fixture proves the proxy checksum is accepted while the tempting original checksum is rejected.

The local database smoke covers request replay, request/slug collision, same-Nest asset and tag enforcement, rollback without partial rows, exact output-versus-original checksum binding, 360 range persistence, immutable ranges through reorder, stale revision rejection, append-only card history, and PostgreSQL range checks. The retained board and cards are deliberate dogfood evidence, not sample UI state.

## Explicit source-rebind recovery

A source-backed card can now move to a corrected, newly verified, relinked, or
replacement source through one deliberate `rebind-card-source` operation. This
is a change in card source intent, not a mutation of the old recording:

1. the caller names the exact current card revision and current range ID;
2. the replacement media must still belong to the same Nest;
3. Quipsly resolves or creates the replacement immutable v2 source revision;
4. it creates or reuses an immutable range over that exact revision;
5. one serializable optimistic update changes only the card's range pointer and
   revision;
6. an append-only `rebind-source` card revision records the reason, old and new
   range/revision/media IDs, source state, and explicit `sourceMutated:false`
   and `placementsMutated:false` evidence.

The card title, synopsis, notes, purpose, status, tags, stable ID, and every
board placement remain unchanged. Board revision and ordering do not advance.
The old range and old invalidated v1 revision remain queryable. UUID request
replay converges only for the same normalized intent; reused request IDs,
stale card revisions, and stale range pointers fail with conflicts.

The story UI exposes two forms of the same operation:

- **Re-check exact registered source** repairs a held card against the current
  v2 verification rules while preserving its range and reframe recipe.
- **Replace or relink source** requires a human reason and supports a different
  registered asset/range, including loading the in/out marks currently visible
  in the source viewer. A 360 recipe is retained only for an exact-current
  range re-check; it is not silently applied to different source coordinates.

Retained Episode 9 operation repaired both cards through the signed-in browser.
`Be Curious clip — shared viewing cue` advanced from revision 1 to 2 and
`Rendezvous proof: source handoff opens cleanly` advanced from revision 2 to 3.
Both are now `checksum-bound` under
`quipsly-media-source-verification-v2`; exact times remain
`1.107004–4.263378` and `1.020478–4.007790`. Board revision remains 4 with sort
orders 0 and 1. The old ranges `cmsiv4kzr00082kxlrnt39jk6` and
`cmsiuzigq00022kxl45rmnha1` still exist with their original selectors and v1
revision links.

The expanded database suite proves request convergence, request-identity
collision, stale-write refusal, old-range retention, prose/tag preservation,
placement identity and order preservation, board revision preservation, exact
replacement checksum binding, and a complete create/update/rebind revision
sequence. The next coherent source slice is provider-neutral Drive attachment
and capability refresh; timeline promotion should follow only after changed or
revoked provider revisions can exercise this same recovery operation.

## Provider-neutral external vault kernel

The first Drive dependency is now implemented without pretending a Google
connection exists. `StudioExternalMediaReference` is the current provider
capability projection and has an optimistic revision. The new
`StudioExternalMediaReferenceOperation` is its append-only attach/refresh
ledger. Each operation records the actor, UUID request identity, normalized
request hash, old/new revision, and a client-safe capability snapshot.

The provider adapter boundary supplies a verified file description; browser
metadata is never accepted as verified source truth. The kernel validates:

- provider, connection, file, shared-drive, and revision identities;
- non-negative byte count and SHA-256/MD5 checksum syntax;
- access/capability consistency;
- optimistic authority for refresh;
- same-request convergence and changed-request collision;
- immutable revision identity when a provider reuses a revision key.

An exact SHA-256 plus byte count produces `checksum-bound`. A Drive-like head
revision, provider MD5, and byte count produces `provider-revision-bound` and
still requires the executor to stream and SHA-256 verify the resolved revision
before rendering. Revocation updates only the reference projection and ledger;
it does not rewrite the immutable content revision or any card that cites it.

Nest's source library now projects connected-vault sources without returning
`providerLocatorJson`, resource keys, local paths, or credentials. It labels
downloadable, metadata-only, reauthentication, and unavailable states and
does not offer direct playback until a verified collaboration proxy exists.

### Retained vault operation

The loopback-only retained operation inspected the actual local
`Ted Lasso Be Curious.mp4`, hashed 19,100,059 bytes, and attached it to High
Ground Odyssey as reference `cmsiwjuvc0000lsxlp616yx6q` with immutable source
revision `cmsiwjuvl0001lsxltsbf5kxx`. The source is checksum-bound and
downloadable. A second provider inspection advanced the capability projection
to revision 2 while correctly reusing the same immutable source revision. No
bucket/library original was created and no source was modified. The retained
local adapter did create a checksum-addressed, read-only APFS execution clone
under its dedicated worker root so the background worker did not depend on the
operator's Downloads permission. The signed-in browser rendered the source as
**Source access verified** while explicitly withholding range marking until a
collaboration proxy exists.

Focused coverage proves normalized credential-free contracts, attach replay,
request collision, changed provider revisions, stale refresh rejection,
revocation without content rewrite, malicious revision-key reuse, independent
same-file identities across Nests, and safe client projection. Google OAuth,
Picker, and server-side `files.get` verification were still the next slice at
that checkpoint; the local-vault adapter remains retained dogfood evidence, not
a claim that deployed Drive authorization is configured.

## User-owned Google Drive attachment flow

The next production slice is implemented behind deployment configuration:

- `StudioMediaProviderConnection` is a user-owned provider/account projection;
  encrypted credentials live in a separate one-to-one row and every connect,
  reconnect, or disconnect has an append-only operation receipt.
- Google authorization uses signed, expiring state, PKCE, account selection,
  offline access, `openid email`, and only `drive.file`. Return paths are
  same-origin relative URLs, and one Google subject cannot be silently captured
  by two Quipsly identities.
- AES-256-GCM protects the refresh credential with a Drive-specific
  authenticated-data boundary. Access tokens remain short-lived and are never
  written to the database or operation receipts.
- Source to Story now offers Connect, Browse, and Disconnect controls. The
  browser receives a bounded Picker token; the selected file ID and optional
  resource key are sent back to Quipsly, while Picker-supplied name, byte count,
  revision, and checksum are ignored.
- The server calls Drive `files.get` for the signed-in connection and records
  only provider-verified identity, head revision, MD5/size evidence, timestamps,
  shared-drive identity, and download capability. Restricted files are honest
  metadata-only sources rather than fake playable assets.
- Disconnect revokes the Google grant before deleting the encrypted credential,
  then marks every connected source `revoked / needs-reauth` without deleting
  cards, source ranges, or immutable source revisions.

Deployment still needs a Google OAuth web client callback for
`/api/media/connections/google-drive/callback`, a referrer-restricted Picker API
key, the Google Cloud project number used as Picker app ID, and four protected
server secrets (`GOOGLE_DRIVE_OAUTH_CLIENT_ID`, client secret, state secret, and
token encryption key). Until those exist, the UI names the missing setup and
does not pretend Drive browsing works.

## Exact-revision collaboration proxy and external story cards

The local-vault execution slice now crosses the complete source-to-story
boundary rather than stopping at provider metadata:

- one deterministic `external-source-proxy` workflow job freezes project,
  external reference, exact source revision, revision/checksum/byte identity,
  target profile, actor, and request evidence;
- the persistent Mac worker re-resolves that identity from PostgreSQL, hashes
  the source immediately before and after FFmpeg, writes through a private
  partial file plus atomic rename, and retains a verified
  `StudioMediaDerivative` receipt;
- the collaboration profile is `collaboration-efficient-960w-h264-aac-v1`
  (H.264, AAC, fast-start, maximum dimension 960, CRF 30, 80 kbps audio). It is
  explicitly a browsing derivative; render/export still resolves the original;
- a newer ready profile marks older ready proxies `superseded` without deleting
  their immutable derivative rows or files;
- an authenticated, project-authorized, local-development-only media route
  serves the derivative with HEAD, ordinary GET, suffix ranges, and bounded byte
  ranges. It resolves the real path under the configured worker root and never
  exposes that path to the browser projection;
- a Story Card created while viewing an external proxy cites the original
  `StudioMediaSourceRevision` and immutable source-clock range—not the proxy
  bytes—so proxy replacement cannot move the select;
- Google Drive references fail honestly at `provider-executor-unavailable`
  until the approved Drive executor configuration is active. No original is
  downloaded merely because it was attached or browsed.

The retained `Ted Lasso Be Curious.mp4` operation proves 19,100,059 original
bytes remained at SHA-256
`acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`.
The current proxy is 8,223,151 bytes (43.05% of the original), 960x478,
23.976 fps, and 254.63 seconds. Authenticated page readback found the selected
source and card; a protected `bytes=0-1023` request returned HTTP 206 and exactly
1,024 bytes. Card `Be Curious · external vault proxy select` remains bound to
source revision `cmsiwjuvl0001lsxltsbf5kxx` at `1.107004–4.263378`.

Operating the worker found two production defects that synthetic fixtures did
not reveal:

1. macOS privacy suspended a launchd-owned worker while it opened an original
   under Downloads. The local-vault adapter now creates a checksum-addressed,
   read-only APFS clone in the dedicated ingest root, rehashes that execution
   cache, and keeps the user's original as provider truth.
2. PostgreSQL `timestamp without time zone` lease comparisons interpreted a JS
   date six hours away from the Mac's Mountain time. Both local job claimers now
   convert timestamptz parameters explicitly to UTC for claim, start, update,
   completion, and retry timestamps.

Focused coverage now includes contract isolation for server-only local paths,
deterministic queue replay, retained failure history on explicit retry, Drive
execution hold, stale provider-binding refusal, original-byte preservation,
verified derivative evidence, source-story persistence, build/type checks, and
the real authenticated playback operation above.

Repeated provider verification now converges without state-revision churn. An
unchanged inspection writes an append-only `observe` receipt whose previous and
current revision are equal, updates verification freshness, and leaves the
reference revision untouched. The retained local operation proved the first
observation stayed at r4 and an exact retry replayed it instead of creating
another receipt. Changed provider capability or byte/revision evidence still
advances the reference and must satisfy optimistic revision authority.

## Complete Insta360 packages and spatial selects

The next slice closes the gap between a generic external video and the camera
package Homer actually needs to organize. An Insta360 take is not modeled as one
filename. Official Studio guidance says a complete 360 package may include a
master `.insv` plus `.lrv` proxy and that all members should be imported
together. The official Desktop MediaSDK likewise describes one input as up to
two camera-file paths and exports a 2:1 panorama. Quipsly now represents that
truth explicitly:

- `StudioMediaSourceSet` is one immutable logical take with a stable package
  identity, capture key, display name, completeness, and exact viewing clock.
- `StudioMediaSourceSetMember` binds 2–32 exact source revisions with role,
  ordinal, render requirement, and membership identity. Current roles include
  primary/secondary originals, browse proxy, audio sidecar, and metadata
  sidecar.
- Every member must already have an exact SHA-256 and positive byte count. An
  Insta360 package must contain a primary original and must use its browse member
  as the viewing clock. A Story Card stores both that package identity and the
  exact clock revision, so neither file replacement nor proxy regeneration can
  move its selection.
- Source revisions now record `flat`, `equirectangular`, or `dual-fisheye`
  projection plus bounded projection metadata. These are immutable revision
  facts, not labels inferred later from filenames.

The creator-facing library collapses package members into one camera take. The
exact file inventory remains discoverable under **Package contents**, including
which files are render-required and which exist only for browsing. This avoids
the false choice between a simple UX and source transparency.

Verified stitched sources use the standard WebGL equirectangular model:
Three.js `VideoTexture` maps the protected video onto an inward-facing
`SphereGeometry`, and `WebGLRenderer` draws the camera view. Drag, mouse wheel,
arrow keys, plus/minus, playback, scrubbing, and reset are explicit controls.
At any source time the creator can add a reframe keyframe containing pan, tilt,
roll, field of view, interpolation, stabilization, horizon lock, and target
aspect ratio. This is edit intent only; the original bytes and browse derivative
remain unchanged. Unstitched dual-fisheye camera previews stay in a normal
video player for honest timing and range selection; Quipsly does not map those
pixels onto a sphere or offer camera-direction keyframes prematurely.

Official implementation references:

- [Insta360 Desktop MediaSDK](https://github.com/Insta360Develop/Desktop-MediaSDK-Cpp)
- [Insta360 complete-file import guidance](https://onlinemanual.insta360.com/studio/en-us/troubleshooting/file-import-issue/media-import-issue)
- [Three.js VideoTexture](https://threejs.org/docs/pages/VideoTexture.html),
  [SphereGeometry](https://threejs.org/docs/pages/SphereGeometry.html), and
  [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)

### Real retained package proof

The operated package is intentionally tiny but real:

- original `VID_20250711_222639_00_037.insv`: 21,549,387 bytes, two 3840x3840
  HEVC tracks, 24 fps, SHA-256
  `df4834771a4cf1d8f460e10b6607b9809588bd6ca67183aebc4277febcf67277`;
- browse `LRV_20250711_222639_01_037.lrv`: 14,209,349 bytes, 1664x832
  dual-fisheye H.264 camera preview, 24 fps, SHA-256
  `8e8ba0acc54cdd0e0258587132937d1c4fcf1facccc3a4be0de6f8f204a29971`;
- verified collaboration derivative: 960x480 H.264/AAC, 30,884 bytes,
  SHA-256
  `e6032ecb68d78c65103d7a328a274163b1b73c43ce974f0629ff54ecf299263a`;
- board `Homer's Insta360 story selects`, card
  `Micro take · spatial composition proof`, source range `0.05–0.35`, two
  retained spatial keyframes.

The operation rehashed both originals after proxying, verified the derivative
receipt against the produced bytes, and checked that no source or execution path
entered the browser projection. A disposable Firebase-emulator user with only a
read-only project grant then opened the canonical story page. Authenticated
first/suffix ranges returned 206, an impossible range returned 416, HEAD returned
the exact byte count, and an unauthenticated range returned 404. The temporary
identity and grant were removed in `finally`, so access proof does not rely on a
privileged developer session or a retained secret.

Operating this slice uncovered three boundary defects:

1. Insta360's full-range YUV browse file could remain `yuvj420p` even when the
   output pixel format requested `yuv420p`; the worker then rejected its own
   derivative. The scale pipeline now explicitly converts output range to TV
   before formatting, and the real file produces verified `yuv420p` output.
2. The long-running local Next process held a Prisma client generated before the
   two migrations. Direct database operations passed while the page lacked the
   new delegate. Restarting the managed local service after client generation
   made the same authenticated page proof pass; this must become an explicit
   local activation gate whenever schema/client generation changes.
3. Restrictive member-to-revision links correctly prevent deleting one exact
   package member, but account erasure must delete story cards, ranges, and
   source sets before deleting the owning Nest. The hard-delete executor now
   uses that explicit order instead of weakening immutable-source integrity.

This is not yet Insta360-quality stitching or a final 360 renderer. The browser
can use a camera-generated dual-fisheye browse carrier for timing and source
ranges, and switches to spatial navigation only for a verified stitched
equirectangular derivative. Final-quality stitching, FlowState execution,
optical metadata, and export remain executor-adapter work.

### Real Episode 5 segment proof

The shared Drive inventory matched the retained Episode 5 files on the mounted
external volume by name and byte count; that observation does not claim the two
provider copies are byte-identical. Quipsly operated the local provider copy of
segment 4 as its own provenance boundary:

- exact INSV: 1,222,300,003 bytes, two 3840x3840 HEVC tracks, 25 fps, 81.76
  seconds, SHA-256
  `493ffae87185b11c0db96198ec43976ca06b9c87e36a7484cd946ca07e91ab84`;
- exact LRV: 102,420,828 bytes, 1664x832 H.264 plus AAC, 25 fps, 81.76
  seconds, dual-fisheye pixels on a 2:1 canvas, SHA-256
  `035f07255b6903eb52605023b33a530025b8a6fa6b8e48d6e51b0d2631bbeaae`;
- protected collaboration preview: 960x480 H.264/AAC, 1,597,198 bytes,
  81.76 seconds, SHA-256
  `d91b1104b8aba1d3a9e3eac0317721174e21f121eca96888946b9093d7ea9b9c`.

The complete take now exists as `Episode 5 · lakeside walk · segment 4` on
`Homer's Insta360 story selects`. Its notes explicitly record that no camera
direction was invented from the unstitched preview. The same immutable range
was promoted into the draft Episode artifact
`episode-5-insta360-segment-4-source-handoff-20260807`; publication remains
unstarted and final rendering must resolve the exact source-set identity.

The same exact source revision now has retained navigation evidence. A 4x2
contact sheet samples source seconds 5.11, 15.33, 25.55, 35.77, 45.99, 56.21,
66.43, and 76.65. A complete audio decode projects 273 bounded waveform windows
and six broad frequency bands; measured RMS is -27.774455 dBFS and sample peak
is -5.736753 dBFS. These are navigation and transparency evidence, not an
automatic mastering decision. Both operations select the stable capture key
instead of relying on creation order.

## Canonical Episode promotion

The next product slice now uses the existing
`StudioEpisodeProduction.timelineJson` artifact as the only program timeline.
It does not introduce a Story-only timeline. One deliberate promotion
transaction:

1. checks the caller's Episode fingerprint and project scope;
2. resolves the card's immutable range, source revision, optional multi-file
   package, exact checksums, and verified collaboration derivative;
3. creates a normal video `TimelineClip`, translating source-time spatial view
   instructions into editable transform keyframes while retaining the complete
   reframe recipe;
4. adds a provider-neutral imported-media descriptor for browser playback;
5. writes Episode artifact v6 plus the production media projection;
6. creates `StudioStoryTimelinePlacement` as the current reversible projection
   and `StudioStoryTimelinePlacementOperation` as append-only intent evidence.

The clip carries `quipsly-source-story-timeline-binding-v1`. Moving or trimming
the clip later changes program intent but cannot erase its original source/card
identity. The collaboration derivative is explicitly not an original. A final
executor must resolve the exact source revision/package and refuse checksum or
provider-revision substitution.

Withdrawal is a second serializable operation. It requires the current
placement revision and Episode fingerprint, removes only that clip and any
now-unused imported descriptor, advances the placement to `withdrawn`, and
appends a ledger operation. It does not delete the card, range, source,
derivative, board placement, or earlier receipt.

The Story UI exposes append versus exact Episode time, video track, active and
historical placements, direct editor navigation, and withdrawal. Conflict
responses refresh the workspace so a creator sees the collaborator's current
timeline rather than overwriting it.

### Retained spatial promotion proof

The real High Ground Odyssey package and retained card were promoted into
`source-story-spatial-promotion-qa-20260807` on V1. The local app proved:

- Story page, Source Story API, editor shell, and canonical Episode API all
  resolve under a disposable Editor identity;
- the canonical clip retains placement/card/range/source-set identity, two
  spatial keyframes, exact source and derivative hashes, and final-render
  source-resolution boundaries;
- protected proxy prefix and suffix requests return 206, invalid range returns
  416, and unauthenticated media returns 404;
- both original package members hash identically before and after;
- replay converges on the same placement without creating another clip.

This proves organization and edit-intent continuity. Full-quality Insta360
stitching/stabilization through a versioned local executor, long-source
performance, mobile arrangement UX, and a cloud cost proposal remain separate
delivery gates.

### Canonical editor reconciliation

The normal Episode save transaction now owns both canonical playback bytes and
the current `StudioStoryTimelinePlacement` projection. Before it writes an
Episode artifact, it validates every Source Story clip against the immutable
promotion snapshot and then records only meaningful projection changes:

- a move, trim, track change, or transform edit becomes `timeline-reconcile`;
- deleting the clip becomes reversible `editor-withdraw`;
- restoring the exact bound clip becomes `editor-restore`;
- unchanged Story clips create no ledger noise;
- stripped, substituted, unknown, duplicated, or out-of-range bindings fail the
  whole serializable save rather than creating split truth.

The editor can trim only inside the retained card range. It cannot extend a
selection, change playback rate, turn the placement into audio, clone one
placement identity, or replace its source/card/package proof. New promotions
also carry the retained range, media identity, and origin board identities so
the editor can explain the boundary and return to the exact highlighted card.

The retained HGO route operation uses a real 360 source set and the normal
authenticated Episode API. It moved and trimmed a 58.350–118.360 card range to
58.600–118.110 on V3 at 7.250, deleted it, restored it, rejected a provenance-
stripped save with `SOURCE_STORY_BINDING_REMOVED`, and read the exact-card Story
route back at HTTP 200. The placement remained active at revision 4 with
`promote`, `timeline-reconcile`, `editor-withdraw`, and `editor-restore` in
order. Re-run with `pnpm quipsly:retained:source-story-editor-handoff`.

## Versioned spatial render executor

The executor boundary is now explicit and split at the format boundary rather
than hidden behind one ambiguous “render” button:

1. `insta360-mediasdk-v3` consumes only the complete, checksum-verified INSV
   package. It performs official stitching and FlowState stabilization and
   produces a reusable 5760x2880 2:1 equirectangular master. The stage is cached
   by source-set identity and stitch profile, not by a browser proxy.
2. `ffmpeg-v360-frame-commanded-v1` trims that master on the retained source
   clock and produces a flat proof or 4K24 edit source. It samples the reversible
   recipe once per output frame and sends runtime yaw, pitch, roll, and horizontal
   FOV commands to a named `v360` filter. Hold, linear, and eased transitions are
   deterministic; angles take the shortest path across the seam.

The shared `quipsly-spatial-render-job-v1` contract binds project, Episode,
timeline placement/fingerprint, exact source set and members, checksums,
selection, recipe, both targets, profile, actor, request identity, and a
canonical manifest digest. It refuses LRV members, checksum-unbound generations,
incomplete primary-original identity, target aliasing, and boundary weakening.
Results remain non-published derivatives and require complete decode.

The official [Insta360 Desktop MediaSDK](https://github.com/Insta360Develop/MediaSDK-Cpp)
documents raw INSV-to-MP4 stitching, FlowState, direction lock, multiple stitch
algorithms, and a 2:1 output requirement. Its documented desktop platforms are
Windows x64 and Ubuntu 22.04 x64; it requires an SDK application/license and GPU
for current 3.x releases. The official [SDK guide](https://onlinemanual.insta360.com/developer/en-us/resource/sdk)
also describes MediaSDK as the stitching/export layer. FFmpeg's official
[`v360` documentation](https://ffmpeg.org/ffmpeg-filters.html#v360) supports
equirectangular-to-flat conversion, yaw/pitch/roll/FOV, and runtime commands.

The actual development Mac reports:

- macOS arm64;
- Insta360 Studio 5.9.9 installed;
- FFmpeg 8.1.1 with `v360` and runtime-controllable yaw, pitch, roll, and FOV;
- no approved MediaSDK adapter, license, or model pack.

Therefore the truthful current product state is `manual-stitch-handoff`:
Insta360 Studio creates one reviewed full-resolution stabilized 2:1 master,
Quipsly verifies and registers that derivative, and the automatic Quipsly
reframe stage applies the saved Story intent. Installing the GUI is not treated
as a supported automation API, and internal app binaries are not invoked as an
undocumented CLI. A future licensed Linux x64 worker can replace only the stitch
handoff without changing cards, Episode clips, recipes, or reframe execution.

The FFmpeg integration test generated a real equirectangular video/audio
fixture, issued 96 view commands over 24 output frames, rendered H.264/AAC at
1280x720/24, probed the exact stream shape, and completed a full decode. The
retained High Ground Odyssey operation also read the readiness state through an
authenticated Source Story page/API while re-proving original hashes, protected
range playback, outsider denial, Episode identity, and idempotent placement.
