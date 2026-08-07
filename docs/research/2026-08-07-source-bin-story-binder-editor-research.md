# Source bin, story binder, and editor research · 2026-08-07

Status: implemented first production slice; licensed spatial execution remains a separate activation decision.

## Product question

Homer needs to browse large Insta360 libraries, choose exact useful moments,
attach notes, arrange those moments into a story, write against them, and later
edit the same decisions without copying originals or learning several Quipsly
data models. The intended experience overlaps Insta360 Studio, StudioBinder,
Scrivener, Riverside, and Descript, but Quipsly should not reproduce their
product boundaries.

## Primary-source findings

### Insta360

Insta360 Studio separates rough single-footage work from multi-media project
editing. Its Project page exposes Project Media, General Media, and Temporary
Media; Temporary Media carries most viewing edits into the deeper editor. The
footage panel supports list and thumbnail modes plus favorites. A 5.7K 360 take
may require two original files in the same folder with unchanged names, and
Studio automatically finds the companion member.

Sources:

- [Insta360 Studio Project page](https://onlinemanual.insta360.com/studio/en-us/operation-guide/page-introduction/project-page-introduction)
- [Insta360 Studio import footage](https://onlinemanual.insta360.com/oner/en-us/studio/import/importfootage)
- [Insta360 X5 editing](https://onlinemanual.insta360.com/x5/en-us/camera/appuse/editing)

Quipsly implication: the browsing object is a complete logical camera package,
not a loose INSV file or a flattened proxy. Vault, project, and working
collections should be projections over the same immutable package identity.

### Scrivener

Scrivener uses one Binder hierarchy across manuscript material and supporting
content. Its Corkboard and Outliner are alternate views of the same items;
index cards carry title and synopsis, and labels, status, keywords, custom
metadata, and collections provide cross-cutting organization. Its freeform
corkboard can remain exploratory until the writer deliberately commits that
arrangement to the outline.

Sources:

- [Scrivener overview](https://www.literatureandlatte.com/scrivener/overview)
- [Scrivener manual](https://www.literatureandlatte.com/docs/Scrivener_Manual-Mac.pdf)

Quipsly implication: free exploration, binder order, and Episode timeline order
must not be the same mutation. Cards can be reused; board placement owns one
arrangement; a durable binder section owns the writing handoff; the timeline
owns edit playback.

### StudioBinder

StudioBinder connects script scenes to storyboard panels and shot lists. It
supports visual and list layouts, groups by scene/shoot day/location/project
phase, shot specs, images and annotations, comments, tasks, color, archival,
and view-only or editable collaboration. Its shot-list interface keeps the
script visible beside production decisions.

Sources:

- [StudioBinder storyboarding tools](https://www.studiobinder.com/storyboarding-tool/)
- [StudioBinder shot-list software](https://www.studiobinder.com/shot-list-storyboard/)
- [StudioBinder customizable shot lists](https://www.studiobinder.com/blog/shot-lists-complete-customization-intuitive-interface/)

Quipsly implication: one source-backed card needs both visual-story and
production-detail projections. Notes, purpose, lane, tags, comments, tasks, and
technical camera recipes should remain attached to stable identities rather
than copied into a storyboard export.

### Descript and Riverside

Descript projects contain reusable project files, non-destructive compositions,
and sequences for multi-track media. Riverside distinguishes participant or
uploaded recording transcription from Media Board or screen-share playback;
media played during a session is not automatically equivalent to a canonical
participant source.

Sources:

- [Descript projects and compositions](https://help.descript.com/hc/en-us/articles/13535123897485-Projects-and-compositions-overview)
- [Riverside transcription boundaries](https://support.riverside.fm/hc/en-us/articles/11419817842973-Does-Riverside-transcribe-media-I-add-to-the-Editor-media-board-files-or-audio-from-screen-shares)

Quipsly implication: external clips, participant tracks, call mix, and source
packages need explicit roles. A clip watched during recording is a synchronized
reference event, not silently a participant recording or transcript authority.

## Quipsly architecture

```text
creator-owned vault / camera / Capture
                |
                v
immutable source revision or camera package
                |
                +--> lightweight browse derivative
                |
                v
exact source-time range + reversible 360 recipe
                |
                v
reusable story card (title, synopsis, notes, purpose, tags)
                |
        +-------+----------------+
        |                        |
 exploratory collections   board placement
                                 |
                                 v
                         durable binder section
                                 |
                    +------------+------------+
                    |                         |
              shared writing             Episode timeline
                                              |
                                              v
                               local/cloud verified render
```

This is one source-to-story graph with several views, not separate storyboard,
notes, writing, and editor databases.

## Implemented source-bin slice

The Source Story workspace now provides:

- one displayed item per logical camera package, even when final rendering
  needs multiple exact files;
- live Working, All, and Attention collections derived from retained cards,
  board usage, and source health;
- distinct browse-ready and final-render-ready health;
- media/readiness filters, source-date/type/location grouping, name/newest/
  select-count sorting, search, and thumbnail/list views;
- exact select, chosen-select, and board-use counts per source;
- an initial 60-item render window with incremental reveal and CSS rendering
  containment, avoiding an unbounded media-card DOM;
- server-wide search and an opaque mixed-source cursor whose independent
  package, external-reference, and asset positions prevent one dense stream
  from starving or skipping another; and
- deliberate incremental page loading with exact loaded-versus-total evidence.

The Working collection is intentionally derived rather than a second manual
folder: a source enters it when a stable select exists or one of its cards is
used on a board. A future personal Favorite should be a small explicit filing
or collection relation, not a mutation of the original or a duplicate tag
taxonomy.

Named personal and Nest-shared source collections now provide that explicit
filing boundary. They reference source-set, external-reference, or asset
identity without copying media and without changing tags, cards, boards,
writing, or timelines. The database requires exactly one typed target and
checks its stable prefixed key. Mutations are serializable, optimistic-revision
checked, idempotent, and append-only.

The cursor intentionally uses canonical `createdAt` plus stable kind/identity
for continuation while capture timestamps remain a presentation/sort
projection. Provider modification time and filenames can change during
reconciliation; they are useful browsing evidence but unsafe cursor identity.

## Next production slices

1. Extend the now-operational checksum-bound 4x2 contact-sheet derivative into
   duration-aware filmstrips and audio waveforms. Keep each derivative bound to
   the exact source revision and exact collaboration-proxy generation.
2. Add waveform/filmstrip navigation and keyboard range marking to the viewer.
3. Add a freeform exploratory board that can deliberately commit an order to a
   durable binder, preserving both arrangements and their receipts.
4. Add comments/tasks beside a card and section through the existing Nest
   collaboration and work kernels.
5. Add collection rename, archive, and explicit reordering on the same
   revisioned operation ledger; do not turn filing order into binder order.
6. Activate a licensed Insta360 MediaSDK stitch executor only after approval of
   its provider, cost, retention, and minimum-capacity proposal. The executor
   must emit the existing exact-source stitch-master receipt.

The first visual derivative is no longer a paper design. A retained operation
generated and replayed a protected 1140x328 contact sheet with eight ordered
source-time samples for the retained HGO Insta360 package. Quipsly verified the
input proxy before and after generation and verified the output SHA-256, size,
MIME type, dimensions, profile, and source/proxy binding. Signed-in Chrome then
loaded the exact protected derivative in the 19-source Source Story library.

## Product vocabulary without product silos

The durable system should remain universal while each project presents a
purpose-built lens:

- **Source Room** is provider-neutral intake, health, search, and visual
  browsing for Drive, local files, capture uploads, camera packages, and future
  connectors.
- **Collections and selects** are loose personal or shared discovery. They do
  not imply story order and never copy source bytes.
- **Source-backed cards** record an exact range, optional camera/view recipe,
  synopsis, notes, tags, and provenance. The card is the stable bridge between
  research, writing, collaboration, and editing.
- **Boards and binders** organize the same cards spatially or sequentially.
  Exploration remains reversible; committing an arrangement creates an
  explicit revision rather than silently replacing another person's order.
- **Episode timelines** are committed editorial placements over the same exact
  decisions. Local and cloud editors consume the same timeline and derivative
  graph; rendering location is an execution choice, not a different project.

An Episode lens can call these clips, beats, script, and timeline. A coaching
lens can call them session media, moments, notes, follow-ups, and plan. A
research lens can call them sources, evidence, annotations, and manuscript.
Those vocabularies, defaults, permissions, and suggested views may differ while
the canonical source, card, document, task, conversation, and revision kernels
remain shared. That is how Quipsly can feel more specialized than separate
point tools without becoming a collection of incompatible databases.

## UX acceptance

The next retained-media operation should prove that Homer can:

1. find a camera package by date or name;
2. see whether every final-render member is available;
3. open its lightweight spatial proxy without fetching the originals;
4. mark a precise range and optional view recipe;
5. find that source immediately in Working;
6. arrange the card into a section;
7. open the section's shared writing with the source card beside it; and
8. promote the same immutable decision into an Episode timeline without
   changing the source, card, or prose.

The current retained operation proves steps 1–3 and 5–8 across the application
and database boundaries. A signed-in disposable operator opened 19 retained
sources, switched to the 4-source Working collection and List view, saw the
complete Insta360 package and ready collaboration proxy, retained its existing
exact select and board use, opened the durable binder and writing context, and
kept the signed-out shell private. The same operator created and idempotently
replayed a personal source collection, traversed the mixed library one source
per cursor page without loss or duplication, and rendered the collection and
server-wide search interactions in Chrome. Step 4 was already proved by the
retained spatial-card operation; the next combined usability rehearsal should
perform all eight steps consecutively as Homer rather than as separate QA
operations.
