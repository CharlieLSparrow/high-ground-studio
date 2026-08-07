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
