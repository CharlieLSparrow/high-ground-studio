# Quipsly spatial Source Story editor

Status: implemented local production slice, 2026-08-07

## Product decision

Quipsly treats a 360 camera take as one immutable source package, not as a loose pile of files and not as a pre-flattened video. The browser uses a lightweight equirectangular proxy for looking around, marking ranges, writing cards, and saving reversible camera moves. A final-quality flat render resolves the exact INSV package through an approved stitch master and applies the saved view recipe only when an Episode placement needs pixels.

This gives the Source Story workspace the useful overlap of:

- Insta360 Studio: spatial viewing and camera direction;
- StudioBinder: visual selects and story organization;
- Scrivener: prose, notes, cards, and flexible structure;
- Riverside and Descript: one collaborative Episode timeline and browser review surface.

The experience remains one Quipsly workflow. The user should not need to understand which process performs the heavy render.

## Media roles

| Media | Purpose | Authority |
| --- | --- | --- |
| INSV package members | Exact camera originals | Immutable, checksum-bound final source |
| LRV/collaboration proxy | Fast browser viewing and 360 selection | Browse only; never accepted as final render input |
| Reviewed 5760×2880 stitch master | Full-source stabilized equirectangular intermediate | Verified derivative bound to exact INSV members and an Insta360 Studio review receipt |
| 720p spatial proof | Fast collaborative review of one saved camera recipe | Non-public review derivative |
| 4K spatial edit source | High-quality flat input for the Episode editor and local final assembly | Non-public edit derivative |

Google Drive or another connected vault may remain the authority for ordinary source video. Quipsly retains provider identity and immutable revision evidence, generates only the proxy or derivative required for collaboration, and resolves original bytes at final render. Drive is not treated as a frame-serving edit backend and no bearer locator is returned to the browser.

## End-to-end contract

1. `StudioMediaSourceSet` freezes all render-required INSV members plus the source-clock revision used by browser selections.
2. `StudioSourceRange` freezes exact in/out time and a reversible `quipsly-360-reframe-v1` keyframe recipe.
3. `StudioStoryTimelinePlacement` promotes the card into the canonical Episode artifact and records the before/after timeline fingerprints.
4. A reviewed Insta360 Studio export is verified locally:
   - require MP4, 5760×2880, source duration, and source frame rate;
   - fully decode video and audio with FFmpeg `-xerror`;
   - hash all render-required INSV members before and after verification;
   - copy the output into the read-only Quipsly media vault;
   - seal a canonical receipt and register exactly one `spatial-stitch-master` derivative.
5. A spatial render job freezes the current Episode fingerprint, placement, source range, recipe digest, exact INSV package, and stitch-master receipt.
6. The durable local media worker verifies all frozen bytes, executes frame-commanded FFmpeg `v360`, verifies the exact bytes again, fully decodes the output, and writes an output-ready receipt.
7. Quipsly automatically registers the output as a `spatial-reframe-proof` or `spatial-reframe-edit-source` derivative. The UI changes from progress to a playable result without requiring a human bookkeeping step.

Every output remains non-public until the normal Episode review and publishing contracts approve it.

## Story board arrangement

`StudioStoryCard` owns the reusable writing and immutable source-range identity. `StudioStoryBoardPlacement` owns only one board's section, production lane, and order. A card may therefore appear on several boards without being copied, and removing it from one board does not archive the card or alter any Episode placement.

The `arrange-board` operation replaces one board's complete placement projection in a single serializable transaction. It:

- requires the exact current board revision;
- accepts each card at most once and rechecks every card against the same Nest;
- preserves placement identities for unchanged cards;
- adds, moves, groups, lanes, orders, or removes placements without touching card or source rows;
- records the exact previous and resulting arrangement in an append-only board operation;
- is idempotent by actor and request identity;
- fails stale or request-reuse conflicts instead of merging a collaborator's board silently.

The web surface exposes both a detailed card view and a compact sectioned outline. Up/down controls remain keyboard-operable and move within a section. Section/lane changes, filing an existing card, and unfiling are explicit controls rather than drag-only interactions. A later drag surface must call the same operation and cannot introduce a second ordering truth.

## Board sections and writing

A section label cannot be the identity of a Scrivener-style binder item. `StudioStoryBoardSection` is therefore the durable board-owned section behind each placement `groupKey`. Its stable ID, board-scoped key, title, synopsis, order, revision, and optional writing document survive even when every card is moved elsewhere.

The ownership boundary is deliberate:

- the section owns one board's beat or scene identity;
- the placement owns one card's lane and order inside that section;
- the card owns reusable source-backed story intent;
- `StudioDocument` and `StudioDocumentBlock` own prose, document revisions, annotations, research, and collaboration;
- an Episode timeline owns edit playback.

`open-section-writing` creates at most one project-shared draft document for a section. It uses a serializable transaction, optimistic section revision, actor/request idempotency, a deterministic document stable ID, a `StudioDocumentOperation` provenance receipt, and an append-only `StudioStoryBoardSectionOperation`. Opening an existing section document is read-like and never rewrites the board or card.

The web surface links directly from both Cards and Outline views into the canonical writing page. It does not copy card synopsis/notes into prose or create a second editor state. Source cards remain visible evidence and planning material alongside the document rather than being destructively converted into paragraphs.

## Source-card collaboration

A card discussion is a scoped projection of the canonical Nest chat system.
Its stable thread key is `story-card:<card-id>` and the application route
verifies that the active, unarchived card belongs to the authorized project
before a thread can be read or created. Each message records the card ID,
stable ID, exact source-range ID, and card revision in provenance metadata.

This keeps conversation and notification behavior shared across Episodes,
Sessions, coaching engagements, and Story while making the evidence anchor
explicit. Revising a card does not rewrite earlier messages, and discussion
does not mutate a range, board arrangement, writing document, or timeline.
Tasks remain canonical Work actions. An Editor can now deliberately create one
from the card discussion surface. The server re-resolves the active card and
selected board inside the authorized project, snapshots the card revision,
immutable range, source revision/set identities, and board placement into
`ActionItem.sourceJson`, and appends a `SOURCE_CARD_ANCHOR`
`ActionItemEvidenceReceipt` in the same serializable transaction. Visible card
tags use the existing Work tag-link kernel. Retry identity is stable, task text
can evolve independently, and Work links back to the exact source select.

The binder is now a first-class editing surface rather than a projection that
appears only after cards exist. An Editor can create an empty section, revise
its visible title and editorial brief, move it earlier or later, start or open
its shared writing, and archive it once every card has been deliberately moved
or unfiled. These operations divide authority deliberately:

- section creation and archive advance the board revision because they change
  binder membership;
- section reordering advances the board revision and records the complete
  previous and resulting active-section order;
- title and synopsis changes advance only the section revision;
- card arrangement never recalculates or silently overrides section order;
- an archived section keeps its document, immutable operation receipts, and
  stable identity, and cannot be implicitly reactivated by typing its old key
  into a card-placement control.

The SQL boundary independently constrains section operation kinds and requires
strictly contiguous revisions, including the `create-section` revision-zero to
revision-one receipt. Every write is actor/request idempotent and protected by
the relevant board or section optimistic revision.

The writing URL carries the board and section identities as view context, not authority. The server rechecks that the requested section belongs to the same Nest and is linked to the exact open document before projecting any cards. The Writing Desk then shows a collapsible source rail with lane, purpose, notes, tags, exact source clock, and links back to the protected source view. It caps the inline rail at 100 cards for predictable rendering and routes larger browsing back to the full board.

## Reviewed master operation

The current macOS path uses the installed Insta360 Studio application as an explicit reviewed handoff because Insta360's documented Desktop MediaSDK runner does not currently provide a supported macOS automation surface.

After exporting and watching the complete 5.7K master:

```bash
pnpm quipsly:spatial:register-reviewed-master \
  --source-set <canonical-source-set-id> \
  --output "/path/to/reviewed-master.mp4" \
  --reviewer <canonical-quipsly-email> \
  --visual-reviewed
```

Optional flags record the actual export settings:

```text
--app-version 5.9.9
--stitch-mode ai-flow|optical-flow|dynamic|template
--flowstate true|false
--horizon-lock true|false
--reviewed-at <ISO-8601 timestamp>
```

The operation refuses non-loopback databases. It never prints a local source or master locator.

## Local runtime

`pnpm quipsly:local:up` runs the web app, Firebase Auth emulator, and durable media worker. The worker now claims spatial jobs after the existing proxy, audio, transcript, alignment, mix, and Episode-proof queues.

The default spatial vault is:

```text
~/Movies/Quipsly Media Vault
```

Override it for a dedicated SSD:

```bash
export QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT="/Volumes/<dedicated-media-ssd>/Quipsly Media Vault"
```

Do not configure a home directory, volume root, or other broad path. Source and output paths are resolved through real paths and must remain beneath explicitly authorized media roots.

## Acceptance evidence

The slice is covered at four boundaries:

- contract tests reject LRV input, weakened review receipts, mismatched recipe digests, and wrong output profiles;
- verifier tests require complete decode and detect INSV drift during review verification;
- worker tests prove a successful proof render and fail closed with output removal when source bytes drift;
- local PostgreSQL integration proves master registration, idempotent replay, Episode-placement job creation, output registration, safe playback URLs, no local locator exposure, and the complete create/revise/reorder/archive binder lifecycle without disturbing card source identity or retained writing.

The retained High Ground Odyssey operation additionally proves the real source package remains unchanged, the authenticated Story page and API project the source set, and the unauthenticated derivative boundary returns not found.

`pnpm quipsly:retained:story-binder` operates the section lifecycle through the
authenticated application route against the retained High Ground Odyssey
board. It deliberately keeps one productive editorial-spine section, creates
and archives a separate empty QA section with retained writing, replays every
request, renders both Story and Writing pages, and verifies that the signed-out
shell contains none of the private binder content.

## Next production expansion

The next automatic stitch runner should be a licensed Insta360 Desktop MediaSDK adapter on a documented Linux x64 or Windows x64 executor. It must emit the same stitch-master receipt and therefore does not change the editor, queue, worker, or derivative model.

Cloud activation requires a separate cost proposal before provider mutation. The proposal should compare:

- licensed MediaSDK runner availability and minimum warm capacity;
- source ingress and egress behavior for creator-owned Drive or object storage;
- proxy retention and lifecycle policy;
- local-first versus cloud final rendering;
- per-minute 5.7K stitch and 4K reframe costs.

Until approved, Quipsly keeps collaboration and recipes in the browser, reviewed stitching and heavy rendering local, and original media in creator-controlled storage.
