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
