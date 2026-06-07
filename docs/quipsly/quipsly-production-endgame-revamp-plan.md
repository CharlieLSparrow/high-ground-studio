# Quipsly production endgame revamp plan

Date: 2026-06-07

## The question

Instead of asking "what is the next useful feature?", ask:

> After four or five serious iterations, what will this system have become, and can we build toward that shape now instead of building the temporary thing first?

This document answers that question for Quipsly as a full production system, not a short-term beta rescue.

## Endgame in one sentence

Quipsly is a source-aware creative operating system: it helps people ingest material, understand and annotate it, create from it, produce media with it, publish many output formats from it, and learn from the results without losing provenance, ownership, or confidence.

## Product doctrine

1. `One source, many projections`
   The final output is not the source. Books, episode pages, YouTube videos, podcast RSS items, social clips, quote feeds, courses, comics, story scrolls, and galleries are projections from shared source records.

2. `Nests are collaboration contexts, not buckets`
   A Nest is where humans, documents, assets, chat, permissions, assistant sessions, production rooms, publishing packets, and analytics meet. Assets and documents can attach to more than one Nest.

3. `Documents are living work surfaces`
   Writing documents, study documents, research packets, and show documents should share a living document spine where possible. Different modes are lenses, overlays, and output packets, not separate authoring silos.

4. `Assets are durable objects with relationships`
   Uploaded media, source books, PDFs, course pages, research photos, camera files, audio takes, YouTube references, and generated proxies need a single asset model with attachments, metadata, provenance, local availability, and processing jobs.

5. `AI is allowed to draft`
   Quipslys can draft, rewrite, brainstorm, transform, compare, and generate. The safeguard is not "no AI writing." The safeguard is no silent mutation, no fake provenance, no hidden canon changes, and no irreversible confusion about what happened.

6. `Transparency, not judgment`
   The system should show what exists, what is linked, what is missing, and what changed. It should not make moralistic or bureaucratic "quality gate" judgments that create systems anxiety.

7. `Local power plus cloud truth`
   Nest owns collaboration and project truth. The Mac app and local engine own heavy local files, proxies, uploads, sync prep, local media review, and future local ML workflows.

8. `Production-grade defaults`
   No copied browser cookies, no durable bearer-token paste workflows, no route-level hardcoded project slugs, no destructive public publishing, no "db push as deploy plan" habit.

## The eventual platform primitives

These should become the stable nouns of Quipsly.

### Identity and access

- `Organization`
- `User`
- `UserEmail`
- `Membership`
- `Subscription`
- `Entitlement`
- `NativeDeviceSession`
- `ProjectAccessGrant`
- `Invite`
- `AuditEvent`

Production meaning:

- The app owns user identity and access records.
- Patreon, Google, Apple, Stripe, and other providers provide evidence, not primary truth.
- Native apps authenticate through revocable device sessions.
- Inviting an email creates a lightweight app-owned user path and grants access before the person completes first sign-in.

### Nest

Current backing table: `StudioProject`.

Production meaning:

- Top-level user-facing workspace.
- Owns access, documents, attached assets, assistant sessions, chat, production rooms, publishing packets, and analytics.
- Can be personal, team, research, fiction, course, gallery, production, or mixed.
- Home Nest is a regular private Nest for personal intake.

Future schema pressure:

- Keep `StudioProject` as backing implementation for now.
- Add application-layer language and service methods around `Nest`.
- Consider renaming only when migrations and product clarity justify it.

### Document

Current backing tables include `StudioDocument`, `StudioDocumentBlock`, `StudioTaggedSpan`, `StudioTag`, and the document kernel package.

Production meaning:

- A document is an editable surface.
- A study document may preserve source text while allowing annotation overlays.
- A writing document may become a manuscript, article, episode script, course lesson, or book.
- Structure is derived from tagged headings and ranges.
- Spans, annotations, and source references survive editing.

Future schema pressure:

- Version document operations.
- Add durable operation/history records for rollback.
- Normalize document kind and source-mode fields.
- Keep block/spans addressable with stable IDs and migration helpers.

### Source unit

Production meaning:

- A book chapter, article, PDF page, transcript segment, YouTube clip, camera file, research photo, course webpage, quote source, or imported manuscript version.
- Source units are recoverable and citeable.
- Outputs and AI claims can point back to source units.

Future schema pressure:

- Add `SourceUnit`, `SourceVersion`, and `SourceAttribution` or equivalents.
- Keep `StudioDocumentBlock` for editable text, but do not make it carry every source concern alone.

### Asset

Current backing includes `StudioMediaAsset`, bins, tags, media clips, and JSON payloads.

Production meaning:

- An asset is any durable file/object/reference: video, audio, image, PDF, source book, downloaded page, generated proxy, thumbnail, transcript, render output.
- Assets attach to Nests, production rooms, output packets, or source units.
- Assets can have local availability state per user/device.

Future schema pressure:

- Add/strengthen `AssetAttachment`.
- Add `AssetVariant` for raw/proxy/thumb/transcript/render.
- Add `AssetLocalAvailability` for Mac/device cache state.
- Add `AssetProcessingJob` for probe/proxy/transcript/triage/sync/render.
- Use GCS object paths and signed URLs for upload/download.

### Production room

Current backing: `StudioEpisodeProduction` plus JSON.

Production meaning:

- A production room is the media workshop for an episode, lesson, short film, podcast, gallery, or course segment.
- It owns imported media, spine audio, sync maps, timeline clips, transcript alignment, render state, publish packets, and collaboration presence.
- It references document boundaries instead of forcing media state into manuscript tags.

Future schema pressure:

- Keep flexible `productionJson` short term, but introduce normalized records for durable nouns:
  - `ProductionRoom`
  - `ProductionAsset`
  - `Timeline`
  - `TimelineClip`
  - `SyncMap`
  - `RecordingTake`
  - `TranscriptSegment`
  - `RenderJob`
  - `PublishPacket`

### Timeline

Production meaning:

- A timeline is a versioned arrangement of clips and disabled ranges.
- Deactivated does not mean deleted.
- Source monitors show all source material.
- Program monitor plays the active edit, skipping disabled gaps.
- AI edits should create proposals or branches, not irreversible cuts.

Future schema pressure:

- Move from loose timeline JSON toward versioned timeline packets plus clip rows or typed packet storage.
- Preserve source ranges, active/inactive state, track ID, sync anchor, asset ID, transcript references, and branch metadata.

### Assistant action ledger

Current direction: assistant sessions/messages/actions/ledger.

Production meaning:

- Quipslys can propose, preview, execute approved actions, and undo/revert.
- Every meaningful assistant mutation should be inspectable.
- Drafting is allowed; canon mutation and publishing require deliberate acceptance.

Future schema pressure:

- Strengthen action payload schemas.
- Store before/after snapshots or patch operations.
- Add batch/group undo.
- Track model/provider/token/cost metadata.
- Add user-owned provider key support later if economics require it.

### Output packet

Current package: `packages/quipsly-domain/src/output-catalog.ts`.

Production meaning:

- An output packet is a public-safe or destination-specific projection from Nest data.
- Examples:
  - HGO episode page
  - podcast RSS episode
  - YouTube package
  - Patreon post
  - QuipLore quote feed/card
  - SCORM/mobile course package
  - story/comic scroll
  - photo gallery review
  - Kindle/book export

Future schema pressure:

- Add `OutputPacket`, `OutputDestination`, `PublishAttempt`, and `PublishedArtifact`.
- Keep packet schemas versioned in `packages/quipsly-domain`.
- Public sites read approved packets, not private source tables.

### Retrieval and knowledge graph

Current backing includes knowledge nodes, QuipLore nodes/edges, and retrieval embeddings.

Production meaning:

- Quipsly should retrieve examples, quotes, source passages, story patterns, research notes, and related blocks.
- Retrieval should be source-aware and citation-aware when claims matter.
- Vector search belongs inside SQL bounds first if possible, then can graduate to a dedicated vector service if scale requires it.

Future schema pressure:

- Use Postgres plus vector extension or a managed vector layer when production pressure justifies it.
- Keep relational source/permission/provenance as the authority.
- Embeddings are indexes over source truth, not source truth.

### Conversation and collaboration

Current direction: one Nest chat thread, GIFs first-class, presence/edit lease for media collaboration.

Production meaning:

- Every Nest has durable team conversation.
- Chat messages can reference blocks, assets, timeline clips, output packets, assistant actions, and jobs.
- Real-time collaboration starts soft and centralized, then can evolve toward CRDT-backed text/document editing where it genuinely helps.

Future schema pressure:

- Add message attachments/reactions/references.
- Add actor/device presence.
- Add notification/subscription settings.
- Consider Yjs for collaborative text surfaces, but avoid making CRDT the universal data model.

### Jobs and workflows

Production meaning:

- Importing, proxying, transcribing, AI triage, sync suggestion, render, publish, analytics sync, and ML training should be jobs.
- Jobs have status, retries, logs, result packets, errors, owner, Nest, and provider.

Future schema pressure:

- Central `WorkflowJob` or family-specific job models.
- Worker service for long-running jobs.
- Idempotency keys.
- Backoff/retry policy.
- User-facing calm error language.

### Analytics

Production meaning:

- Publishing is incomplete without feedback loops.
- Analytics should show where outputs were published, what happened afterward, and what assets/source packets they came from.
- For research/ML, analytics also includes dataset quality, labeling progress, model experiments, and evaluation metrics.

Future schema pressure:

- Add `AnalyticsSource`, `MetricSnapshot`, `OutputPerformance`, `ExperimentRun`, and `DatasetLabelStats`.
- Keep metrics transparent. Avoid fake confidence scores unless a user asks for evaluation.

## Production service boundaries

### Nest web app

Current: `apps/quipsly`.

Production role:

- Main app shell.
- Nest hub.
- Document editor.
- Asset manager.
- Assistant sidebar.
- Publishing suite.
- User/admin/access management.
- Web editor routes.
- App-facing route handlers.

Rule:

- Server Actions are fine for web-only forms.
- Route Handlers are the contract for Mac, iPad, iPhone, workers, and external integrations.

### Public sites

Current:

- `apps/web` for High Ground Odyssey.
- `apps/quiplore` for QuipLore.

Production role:

- Public surfaces consume approved output packets.
- They do not mutate source truth.
- They can display provenance, support CTAs, episode pages, quote feeds, galleries, course pages, and public artifacts.

Rule:

- Quipsly publishes packets.
- Public sites render packets.

### Local engine

Current: `apps/local-engine`.

Production role:

- Local file probe.
- Proxy/thumbnail generation.
- Upload/register.
- Premiere rescue/import.
- Local sync diagnostics.
- Future local ML dataset preparation and inference jobs.

Rule:

- The local engine never silently fakes success.
- It reports calm, precise status.

### Native Mac app

Current: `apps/quipsly-mac`.

Production role:

- Native command cockpit.
- Web editor bridge.
- Local import queue.
- Source/program media review.
- Sync prep.
- Device session profile vault.
- Local ML dashboard later.

Rule:

- Mac owns local-machine truth.
- Nest owns collaboration/project truth.

### iPhone/iPad apps

Production role:

- Mobile capture.
- Reading/recording companion.
- Quick tagging.
- Research/photo/video field intake.
- Mobile-friendly review.
- iPad editing/review cockpit.

Rule:

- Mobile should be simple, not a squeezed desktop.
- iPad can carry deeper editing controls.

### Worker/job service

Production role:

- Async media, AI, publishing, analytics, and ML tasks.
- Keeps web requests fast.
- Owns retries and idempotency.

Rule:

- Long-running provider calls and renders should graduate out of the request/response web app.

### Render engine

Current candidates:

- `apps/render-engine`
- Remotion pieces in the editor.

Production role:

- Render final videos, clips, GIFs, quote cards, course media, and visual-story outputs.
- Could use Remotion for programmatic video and web-native composition.

Rule:

- Timeline truth comes from Quipsly packets.
- Render engine produces artifacts and status, not source edits.

### Realtime collaboration service

Current: `apps/studio-collab` and soft collaboration endpoints.

Production role:

- Presence.
- Awareness.
- Collaborative document/timeline editing if needed.
- Conflict-safe sync.

Rule:

- Do not force everything through realtime CRDTs.
- Use CRDT where live text/document editing truly benefits.
- Use versioned saves/fingerprints/leases where that is calmer and more supportable.

## Architecture revamp: what to build instead of the temporary thing

### 1. Introduce a shared Quipsly core service layer

Create or expand a stable domain layer under `packages/quipsly-domain` and app server libraries around:

- `Nests`
- `Documents`
- `Assets`
- `SourceUnits`
- `ProductionRooms`
- `OutputPackets`
- `AssistantActions`
- `Access`
- `Jobs`

Goal:

- Routes stop recreating project/document/upsert logic.
- Mac/web/mobile/workers all use the same contract language.
- Agents can reason from stable nouns instead of route quirks.

### 2. Convert route-specific creation into explicit repositories

Current smell:

- `/create`, `/editor`, `/recorder`, `/call`, media APIs, and seed paths have each grown local creation assumptions.

Production move:

- Add explicit repository/service functions:
  - `getNestBySlug`
  - `ensureHomeNest`
  - `createNest`
  - `getLivingDocument`
  - `createDocumentFromTemplate`
  - `ensureProductionRoom`
  - `attachAssetToNest`
  - `createOutputPacket`

Rule:

- Access checks never create records.
- Ensure/create functions are explicit and named honestly.

### 3. Make the asset model the universal intake layer

Current need:

- Travel Insta360 videos, podcast files, YouTube source clips, research photos, PDFs, books, course pages, comic images, client galleries, and generated outputs all need intake/tagging/processing.

Production move:

- Assets attach to Nests through one system.
- Home Nest is default intake.
- Processing creates asset variants and jobs.
- Tags/relationships connect assets to documents, production rooms, source units, and output packets.

### 4. Make source units first-class

Current need:

- Study documents, research ingestion, books, web pages, course pages, quote verification, marine biology datasets, and fiction analysis all require preserving source material.

Production move:

- Add source-unit modeling before cramming everything into document blocks.
- Documents can be editable projections over source units.
- AI and publishing cite source units.

### 5. Make production rooms general, not episode-only

Current need:

- Podcast episodes are the first production room, but courses, story scrolls, galleries, short clips, comics, and research presentations need similar production state.

Production move:

- Treat `EpisodeProduction` as the first specific implementation of a more general `ProductionRoom`.
- Keep `episodeSlug` where useful, but model the production room around Nest + boundary/source/output purpose.

### 6. Move output publishing into packet builders

Current need:

- HGO episode pages, YouTube packages, podcast RSS, Patreon posts, QuipLore, SCORM, social cuts, GIFs, books, story scrolls, and photo galleries.

Production move:

- Every destination gets:
  - packet schema
  - readiness inventory
  - preview renderer
  - publish attempt ledger
  - public artifact record

No output type should invent a second source-of-truth.

### 7. Build the document editor as a kernel, not a UI accident

Current need:

- Block splitting/merging.
- Chapter/Episode boundaries.
- Span tags surviving edits.
- Study overlays.
- Assistant changes.
- Undo history.
- Agent-friendly operations.

Production move:

- Treat document edits as operations.
- Store enough history to answer "what changed?"
- Use typed operations for:
  - insert block
  - split block
  - merge block
  - delete block
  - apply tag
  - remove tag
  - transform text
  - accept assistant proposal

### 8. Make AI actions proposal-first and execution-aware

Current need:

- Gemini/AI assistant can draft and transform, but must not silently mutate canon.

Production move:

- Assistant outputs become one of:
  - draft only
  - suggestion
  - reversible action
  - research packet
  - output packet preparation
  - publish candidate

Execution requires an approved tool intent unless the action is local preview only.

### 9. Introduce workflow jobs before more ad hoc background behavior

Current need:

- Media import, proxy generation, transcript assist, sync suggestion, AI research, render, publish, analytics, ML pipeline.

Production move:

- Central job status model.
- User-facing job panels.
- Retry and diagnostics.
- Worker service for heavy jobs.

### 10. Separate package contracts from app UI

Current smell:

- Important shapes live in app pages/routes.

Production move:

- Version key contracts in packages:
  - output catalog
  - recording payloads
  - timeline packets
  - media asset metadata
  - production room payloads
  - assistant action payloads
  - source-aware retrieval payloads

## Data model revamp priorities

### Keep

- `User`, `UserEmail`, `UserRole`
- `Organization`
- `StudioProjectAccessGrant`
- `StudioNativeAuthCode`
- `StudioNativeDeviceSession`
- `StudioDocument`, `StudioDocumentBlock`, `StudioTaggedSpan`, `StudioTag`
- `StudioEpisodeProduction` short term
- `StudioMediaAsset`
- `RetrievalEmbedding`
- Assistant session/message/action/ledger models
- Nest chat models

### Add soon

- `NestInvite`
- `AuditEvent`
- `AssetAttachment`
- `AssetVariant`
- `AssetProcessingJob`
- `SourceUnit`
- `SourceVersion`
- `DocumentOperation`
- `ProductionRoom`
- `TimelineVersion`
- `TimelineClip`
- `SyncMap`
- `RecordingTake`
- `TranscriptSegment`
- `OutputPacket`
- `PublishAttempt`
- `PublishedArtifact`
- `AnalyticsSnapshot`

### Normalize gradually

Move durable concepts out of JSON when they need:

- permissions
- lifecycle
- querying
- rollback
- relationships
- independent status
- audit
- attachments

Keep JSON for:

- versioned flexible packet payloads
- provider-specific metadata
- experimental output shapes
- small UI configuration

## Technology posture

### Web app

Use Next.js App Router route handlers for app/mobile/native/worker API contracts. Server Actions are fine for web-only forms and quick UI mutations.

### Database

Use Prisma migrations for production. Avoid broad `db push` as deployment behavior. Schema evolution is good; untracked production mutation is not.

### Cloud deploy

Use Cloud Build and Cloud Run with immutable images, preserved secrets, small build context, and smokeable preview/promote/rollback flow.

### Storage

Use Cloud Storage for blobs, signed URLs for controlled upload/download, and lifecycle policies for generated variants.

### Collaboration

Use centralized version/fingerprint/lease models where they are simpler. Use Yjs/CRDT-backed collaboration for live text surfaces when the editor kernel is ready for it.

### Native auth

Use normal browser authentication and native-device sessions. No copied browser cookies. No durable pasted bearer tokens.

### Video/render

Use local ffmpeg/local engine for local file work and proxy generation. Use a render service for final artifacts. Remotion remains useful for programmatic web-native compositions and output automation.

### AI and RAG

Start with SQL-owned relational truth plus embeddings. Add vector search in SQL bounds first if practical. Dedicated vector services can come later if scale, latency, or operational pressure demands it.

### ML/data science

Treat ML pipelines as Quipsly workflows:

- datasets are assets/source units
- labels are annotations
- experiments are jobs
- model outputs are proposals
- evaluations are analytics

This lets the marine biology photo-identification work plug into the same system instead of becoming a separate dashboard island.

## What to consolidate or quarantine

### Consolidate into Nest modules

- `romance-lab`
- `fiction-tools`
- `storyboard`
- `storyboards/builder`
- `story-scroll`
- `study`
- `research`
- `asset-manager`
- `media`
- `episode-production`
- `publishing-suite`
- `outputs`

These can remain routes, but their data model should become Nest-centered.

### Quarantine until promoted

- Old `apps/studio` naming assumptions.
- Route defaults that silently pick `quipsly-dev-lab`.
- Hardcoded High Ground project slugs outside seed/admin shortcuts.
- Tools that write directly to JSON blobs without packet versions.
- Upload paths with conflicting bucket/object conventions.
- Public sites reading private source tables.
- AI routes that mutate state without ledger/action records.

### Keep as separate surfaces

- `apps/web`: public High Ground Odyssey.
- `apps/quiplore`: public quote/lore surface.
- `apps/local-engine`: local machine-room worker.
- `apps/quipsly-mac`: native local cockpit.
- `apps/studio-collab`: possible realtime/collaboration service.
- `apps/render-engine`: possible rendering worker.

## Production roadmap

### Phase 0: Architecture lock-in, not feature freeze

Goal:

- Agree on primitives and stop building temporary route-local systems.

Build:

- This plan.
- A shared `quipsly-core` or expanded `quipsly-domain` contract layer.
- Migration discipline.
- Auth/device session production deploy.
- Route creation/access cleanup.

Exit criteria:

- New work can answer which primitive it touches.
- New route writes go through named service/repository functions.

### Phase 1: Nest foundation

Goal:

- Make Nests production-grade for real users.

Build:

- Invite flow.
- Access roles.
- Home Nest.
- Nest dashboard.
- Collaborator page.
- Nest chat.
- Starter documents.
- Asset attachment visibility.
- Admin/user management.

Exit criteria:

- Charlie, Homer, Melissa, Mako, a marine biology student, and a beta user can each sign in and see the right Nests without handholding.

### Phase 2: Editor spine

Goal:

- Make the living document real enough to write and study inside every day.

Build:

- Operation-backed block edits.
- Stable split/merge/delete.
- Chapter/Episode boundaries.
- Tag removal.
- Span/annotation survival.
- Study overlays.
- Assistant proposal/ledger.
- Recent changes and undo.

Exit criteria:

- Writing, study, and source annotation all feel like one tool, not three fragile demos.

### Phase 3: Asset and media intake

Goal:

- Make importing media and source material boring in the best possible way.

Build:

- Universal asset intake.
- Home Nest default upload.
- Asset attachments.
- Local availability.
- Local engine jobs.
- Probe/proxy/thumb/transcript.
- Cloud object paths.
- Signed upload/download URLs.
- Media job dashboard.

Exit criteria:

- Homer can tag travel videos.
- Episode media can be imported without panic.
- Research photos can become a dataset.
- Assets can attach to multiple Nests.

### Phase 4: Production rooms and timeline

Goal:

- Make podcast/video production usable for real episodes.

Build:

- First-class production room.
- Spine audio.
- Recording takes.
- Timeline versioning.
- Source/program monitors.
- Disabled gap model.
- Sync maps.
- Transcript-aligned playback.
- Remote Mac collaboration.
- Premiere import translation.

Exit criteria:

- Episodes 1-8 can be re-edited or edited in Quipsly without falling back to Premiere as the source of truth.

### Phase 5: Publishing packets

Goal:

- Make "publish from Quipsly" real.

Build:

- HGO episode page packets.
- Podcast RSS packets.
- YouTube package.
- Patreon post package.
- QuipLore quote packets.
- Social cuts.
- Book export packet.
- Publish attempt ledger.
- Public artifact records.

Exit criteria:

- Quipsly can show where an episode/article/quote/course/gallery is published and what source packet produced it.

### Phase 6: Assistant and retrieval

Goal:

- Make Quipslys useful research assistants and co-drafters, not generic chat boxes.

Build:

- Source-aware retrieval.
- Example finder.
- Quote/citation retrieval.
- Draft/rewrite modes.
- Tool/action approval.
- Cost controls.
- Usage tiers.
- Optional bring-your-own-provider keys.
- Assistant run logs.

Exit criteria:

- The assistant can find examples, prepare packets, draft options, and execute approved actions without confusing source/canon/published truth.

### Phase 7: Scroll, course, comic, gallery interaction engine

Goal:

- Build one interaction engine with multiple skins.

Build:

- Vertical section navigation.
- Horizontal card groups.
- Media cards.
- Quiz cards.
- Comic panels.
- Story beats.
- Photo galleries.
- Ratings/comments/selects.
- Mobile-first lesson/story viewer.

Exit criteria:

- SCORM/mobile lessons, comics, story scrolls, quote journeys, and photo client galleries share the same underlying packet/interaction model.

### Phase 8: Data science and research lab

Goal:

- Make Quipsly credible for research workflows and ML pipelines.

Build:

- Dataset Nests.
- Source photo/document intake.
- Labeling overlays.
- MLE pipeline jobs.
- Local Mac training/inference dashboard.
- Evaluation reports.
- Research notes and publication packets.

Exit criteria:

- The marine biology photo-identification project can run as a real Quipsly workflow, not a one-off side app.

### Phase 9: Production SaaS maturity

Goal:

- Make Quipsly run like a serious SaaS.

Build:

- Billing/entitlements.
- Audit logs.
- Admin dashboards.
- Usage/cost dashboards.
- Error monitoring.
- Observability.
- Data export.
- Workspace backup/restore.
- Migration runbooks.
- Support tooling.
- Accessibility pass.
- Performance budgets.

Exit criteria:

- A paying beta user can rely on Quipsly without needing Charlie or Codex to babysit every workflow.

## Immediate next implementation pass

Build this, not another temporary feature:

1. Add `docs/quipsly/quipsly-production-endgame-revamp-plan.md`.
2. Create a `quipsly-core` implementation plan or expand `packages/quipsly-domain` with service contracts for:
   - Nests
   - Assets
   - Documents
   - Production rooms
   - Output packets
   - Jobs
3. Add schema proposal for:
   - `NestInvite`
   - `AssetAttachment`
   - `AssetVariant`
   - `AssetProcessingJob`
   - `SourceUnit`
   - `DocumentOperation`
   - `ProductionRoom`
   - `OutputPacket`
   - `PublishAttempt`
4. Refactor one route family through the new service layer.
   Recommended first family: Nest + document access, because every other workflow depends on it.
5. Then refactor asset intake through the same layer.
6. Then refactor episode production into production rooms and timeline packets.

## The uncomfortable but correct conclusion

Quipsly is already too broad to survive as a pile of route experiments.

The right answer is not to shrink the ambition. The right answer is to promote the shared primitives now:

- Nest
- Document
- Source unit
- Asset
- Tag/span/annotation
- Assistant action
- Production room
- Timeline
- Output packet
- Job
- Published artifact
- Analytics snapshot

If those primitives are solid, the wild vision becomes surprisingly coherent.

If those primitives stay fuzzy, every exciting feature becomes another adorable little goblin chewing on the data model.
