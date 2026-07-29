# Quipsly Production Realignment

Date: 2026-07-14

Status: Current architecture and execution proposal

Review this after the Episode 4 vertical slice ships, then monthly while Quipsly is pre-customer. It records the best current judgment, not permanent dogma.

## Executive verdict

Quipsly's thesis is strong: creative work becomes more useful when sources remain intact, human and agent decisions remain visible, and one body of work can become many outputs without repeated copying and reconstruction.

The implementation is not failing because the thesis is too ambitious. It is failing because too many product experiments, generated artifacts, scripts, app roots, and data models are being integrated at once without one enforced source map or proof target.

Three changes are urgent:

1. Build one complete production loop before expanding breadth. Episode 4 is the proof because it exercises capture, custody, sync, source-aware audio, editing, shorts, packaging, and publishing.
2. Keep ambition large but make integration batches small, reversible, and proven in the real product. AI makes large outcomes faster; it does not make unreviewable change sets safe.
3. Treat Nest, Studio, and Tower as lenses over one Creative Graph, not disconnected products and not one giant application.

## Current evidence

| Area | Evidence | Interpretation |
| --- | --- | --- |
| Git | `main` is 37 commits ahead of `origin/main`, with about 147 tracked changes and 598 untracked paths after cache ignores | Current work is not recoverable or reviewable enough |
| Product roots | About 18 app directories and 6 shared package directories | Active products and experiments are not clearly separated |
| Native Studio | Central Swift files exceed 75,000 lines; `WorkspaceView.swift` is about 53,000 | The product exists, but module boundaries have collapsed |
| Agent surface | `AgentServer.swift` is about 10,000 lines and `agentctl.sh` about 14,000 | Agent access is valuable but implemented as an accumulating command maze |
| Data | One Prisma schema is about 3,800 lines with more than 100 models | PostgreSQL is appropriate, but bounded contexts are invisible |
| Tests | Tiny conventional suites plus many bespoke smoke scripts | Proof exists, but it is fragmented and expensive to interpret |
| Documentation | Hundreds of files include stale descriptions of the active app, auth, and proof target | Documentation currently increases ambiguity |
| Disk | Internal APFS reached effectively zero free space; large media includes cloud-only placeholders | Development and media custody are unsafe until storage is managed |
| Audio Room | Charlie, Homer, and source lanes share one clock in the native app | This is the right source-aware direction |
| Episode 4 audio | Homer remains quieter and aggregate metrics include silence | Use dialogue-region evidence and stage audition, not more forms |
| Auth | Firebase-first documentation is more current than older Auth.js guidance | Firebase should prove identity; PostgreSQL should own the product account |
| Cloud | `gcloud` requires interactive reauthentication | No deploy or cloud-state claim is confirmed by this audit |

## Product north star

Quipsly is a Creative Operating System that helps people and agents capture, understand, transform, publish, and learn from meaningful work without losing source truth.

`Capture -> Curate -> Create -> Publish -> Observe -> Learn`

The promise is not that Quipsly contains every creative tool. The promise is that every tool can operate on the same sources, annotations, relationships, decisions, and outcomes.

## Nest, Studio, and Tower

### Nest

Nest is the durable context and knowledge surface. It owns people, access, Home Nests, working Nests, documents, notes, outlines, research, tags, annotations, tasks, goals, conversations, capture inboxes, and source relationships.

Nest should feel as easy to navigate as OneNote while retaining Quipsly's graph, annotation, provenance, and agent advantages.

### Studio

Studio is a family of focused creation workspaces over shared domain services. It owns video, podcast, source-aware audio, writing production, photo treatment, stories, courses, comics, scrolling media, reversible decisions, and Branching Baselines.

There can be multiple native Studio apps. They must share contracts rather than duplicate truth.

### Tower

Tower owns release, distribution, monetization, and observation: packages, calendars, queues, publication attempts, receipts, analytics, revenue, and audience learning.

Tower must never represent a local export as published. A provider URL, ID, webhook, or equivalent receipt is publication truth.

## Active source map

| Path | Status | Responsibility |
| --- | --- | --- |
| `apps/QuipslyStudio` | Active | Native macOS video, podcast, audio, shorts, and production review |
| `apps/quipsly` | Active | Nest web app, Firebase identity bridge, projects, documents, collaboration |
| `apps/web` | Active | HighGroundOdyssey.com public and coaching surface |
| `apps/mobile-capture/HighGroundCapture` | Active, secondary | Native iOS capture, coaching, call, and recording workflows |
| `apps/local-engine` | Active service | Local probe, proxy, treatment, upload, and render support |
| `packages/quipsly-domain` | Active shared contract | Cross-surface domain concepts and payloads |
| Other app roots | Quarantine pending classification | Reference, experiment, or retired; not a default patch target |

Quarantine does not mean delete. It means no agent should modify or revive a root without documenting why the active product cannot satisfy the need.

## The Creative Graph

Keep PostgreSQL. Do not create microservices to make the repository look mature. First make the monolith modular and ownership explicit.

| Concept | Meaning |
| --- | --- |
| User | Product account independent of identity provider |
| Identity | Firebase, email, passkey, or provider identity linked to User |
| Workspace | Organization or personal security boundary |
| Nest | Context and access attachment point |
| Asset | Stable identity for source material |
| AssetVersion | Immutable source or derivative with checksum and provenance |
| Attachment | Asset relationship to Nest, document, production, or output |
| Document | Living work with revisions and recoverable local state |
| DocumentRevision | Immutable checkpoint for comparison, recovery, and annotation anchors |
| Annotation | Observation anchored to source span, time range, region, or revision |
| Production | Episode, book, course, gallery, or other creative production |
| Baseline | Named immutable parent state such as sync or treatment |
| Branch | Lightweight decisions layered over a baseline |
| Operation | Typed reversible intent such as trim, show, skip, gain, tag, or reorder |
| Output | Render recipe and produced versions |
| PublishAttempt | Requested external action |
| PublishReceipt | Provider-backed evidence of the result |

The Home Nest is the default attachment and access root for personal assets. It must not create duplicate storage.

Implementation direction:

- Split Prisma 7 into domain files. Multi-file schemas are generally available.
- Keep one database initially, grouped into identity, nest, knowledge, media, production, coaching, publishing, and analytics contexts.
- Stop adding overlapping asset/output models until they map to the canonical concepts.
- Use an append-only operation ledger plus snapshots for production edits. Do not force full event sourcing on the whole company.
- Use optimistic concurrency and idempotency keys for native, web, and agent writes.
- Use merge-aware text operations where real-time document collaboration requires them. Timeline conflicts need domain rules, not generic text CRDTs.

## Branching Baselines

Branching Baselines should be core.

1. Source manifest: immutable assets, checksums, device clocks, recording metadata, custody.
2. Sync baseline: whole sources aligned on one clock, including gaps.
3. Treatment baseline: audio/video cleanup, speaker masks, color defaults, quality evidence.
4. Editorial branch: SHOW, SKIP, source choice, pacing, reactions, J/L cuts, framing, captions, notes.
5. Output branches: 16:9, podcast audio, 9:16 shorts, alternate durations, platform packaging.

Branches contain operations and references, not duplicated media and not thousands of chopped source clips.

Support OpenTimelineIO as interchange because it models tracks, clips, gaps, transitions, markers, enabled state, and metadata. Do not replace Quipsly's richer decision graph with OTIO or Premiere semantics.

## Media custody

Media custody is a product subsystem, not a script convention.

Visible states should include `cloud-only`, `hydrating`, `local-working`, `external-archived`, `proxy-ready`, `uploading`, `cloud-verified`, `missing`, and `quarantined`.

Rules:

- Originals are immutable.
- Every file has checksum, size, probe, and provenance.
- Identity uses asset/version IDs and content hashes, not only project folders.
- Proxies, thumbnails, waveforms, transcripts, and model features are reproducible.
- Local caches have budgets and eviction policy.
- External copies are verified before local eviction.
- Cloud Storage uses soft delete and lifecycle rules for derivatives.
- Capture stores separate participant tracks as canonical sources. Composite recordings are previews or delivery artifacts.

The current Podcast migration needs a staged File Provider workflow: hydrate one placeholder, copy externally, verify size/checksum, then evict only the local cache while preserving the cloud original.

## Professional audio

Canonical editorial truth is equal-length Charlie, Homer, and clip/source stems on one sequence clock, with per-stem activity/keep masks and reversible processing stages.

Audition mixes, podcast masters, and video program mixes are derived artifacts.

Inspectable stages:

1. Raw synchronized source.
2. Channel and clock repair.
3. Speech activity and speaker ownership mask.
4. Noise, echo, and bleed control.
5. Voice restoration.
6. Corrective EQ and dynamics.
7. Per-speaker loudness match.
8. Mix bus and delivery master.

Measure dialogue, not an hour of silence:

- Dialogue integrated LUFS.
- Short-term loudness distribution.
- Loudness range.
- True peak.
- Noise floor during retained speech.
- Clipping and distortion flags.
- Retained speech ratio.
- Cross-talk estimate.
- A/B stage deltas.

Use EBU R128-compatible measurement as a foundation, then platform targets. Do not reduce quality to one red/yellow/green score.

## Native Studio architecture

Decompose the current giant SwiftUI files without another product rewrite.

| Module | Responsibility |
| --- | --- |
| `StudioDomain` | Production, baseline, operation, branch, output models |
| `MediaGraph` | Assets, variants, custody, probes, proxies, resolution |
| `PlaybackClock` | One sequence clock and synchronized players |
| `DecisionTimeline` | SHOW/SKIP/source/reaction/gap operations and timeline |
| `AudioWorkbench` | Stems, stages, waveforms, meters, masks, audition |
| `TranscriptWorkspace` | Words, speakers, timing, notes, annotations |
| `RenderPipeline` | Deterministic recipes, jobs, versions, evidence |
| `AgentBridge` | Versioned resources, commands, events, receipts, diagnostics |
| `StudioShell` | Navigation, windows, settings, workspace composition |

`WorkspaceView.swift` should become composition code. `AgentServer.swift` should route to typed handlers. A 500-line file is a smell threshold, not a rigid rule.

## Human and agent interface

Humans and agents should use the same domain commands.

- Resources expose current state, branch, manifest, playhead, marks, metrics, warnings.
- Tools scrub, zoom, select, audition, set ranges, add decisions, adjust boundaries, apply stages, render, compare, undo, inspect.
- Workflows name procedures such as sync audit, dialogue match, first cut, short discovery, package, and publish verification.

Every write needs stable IDs, a base revision, idempotency key, typed result, undo or compensating operation, and evidence receipt. OS mouse automation remains useful for end-to-end UX testing, but must not be the editing API.

An MCP-compatible facade is sensible because MCP separates resources, tools, and workflows. Keep the internal API transport-independent.

## UX rules

Quipsly should feel warm, calm, direct, and professional. Rigor belongs under the glass.

- Show the work, not a report about it.
- Prefer direct manipulation and visible state over explanatory prose.
- Use progressive disclosure for diagnostics.
- Preserve conventional shortcuts where they reduce learning cost.
- Keep source truth separate from decisions and outputs.
- Make reversible actions safe without bureaucratic approval.
- Keep forms for settings and external commitments, not ordinary creative work.

Studio keeps program and source monitors central, one shared playhead, continuous source lanes, visible decision overlays, simultaneous source-aware audio, compact branch context, and selection-aware inspectors.

Nest writing uses OneNote-like notebooks, sections, pages, and search. Documents remain living works with immutable recovery checkpoints. Notes, outlines, drafts, sources, annotations, and tasks are first-class rather than forced into one document.

Capture starts trusted recording in one tap, records locally against network loss, uses LiveKit for transport and separate participant egress, and attaches the result to Nest context.

## Identity and security

`Firebase identity proof -> Quipsly User -> Workspace/Nest grants -> product roles`

- Normalized email is an invitation/lookup alias, not the primary key.
- Firebase UID links to User.
- First sign-in creates or updates the free account and Home Nest idempotently.
- Invite-before-account is claimed on sign-in.
- Custom claims carry coarse authorization only, not profile data.
- Legacy Auth.js fallback should leave the Nest path after Firebase is proven.
- Admin impersonation is explicit, logged, time-limited, and visibly bannered.

Credentials visible in screenshots or chat are exposed and must be rotated. Runtime secrets belong in Secret Manager or Keychain, never screenshots, committed files, packets, or logs.

## Deployment and schema change

| Lane | Purpose |
| --- | --- |
| Local proof | Fast work using representative data |
| Preview revision | Cloud-integrated smoke without production traffic |
| Hotfix | Small path-scoped correction with rollback ready |
| Full release | Coordinated product, schema, and infrastructure change |

Remove `prisma db push --accept-data-loss` from production procedures. Use reviewed expand-contract migrations, an explicit migration job, backup/restore proof, preview deployment, and exact-revision promotion. Build only affected products and keep Mac artifacts out of web contexts.

DORA's AI guidance matters here: small batches improve stability and recovery, while large AI-generated change lists can increase instability.

## Testing and evaluation

Replace isolated smoke-script growth with layers:

1. Pure domain tests.
2. Native/web/local-engine/agent contract tests.
3. Disposable database, auth, storage, and media integration tests.
4. AgentBridge-driven native tests plus a small number of true UI checks.
5. Golden workflows with fixed, permission-safe corpora.
6. AI evaluations with fixed transcripts, clips, edits, and human rubrics.

Golden workflows include new-user Home Nest, writing capture, Episode 4 source-to-publication, 9:16 short, real publication receipt, and coaching schedule-to-recording.

No feature is complete because it compiles. It needs a real surface, representative data, observable state, and recoverable result.

## Engineering operating model

Each integration batch contains one visible outcome, one authoritative contract, one proof path, one rollback path, and one concise production-log entry.

Git rescue sequence:

1. Finish cache/generated-file classification.
2. Create a dated rescue branch from the current commit.
3. Classify untracked files as active product, generated artifact, evidence, or obsolete experiment.
4. Commit coherent product slices without generated media or secrets.
5. Push before deleting or quarantining anything.
6. Use short-lived product branches or worktrees afterward.

Never let another multi-day editor implementation exist only as uncommitted code.

Documentation hierarchy:

1. This current architecture document.
2. One active goal per lane.
3. One active source map.
4. Repeatable runbooks.
5. Append-only production and lessons logs.
6. Historical plans labeled historical.

## Product sequence

### Phase 0: Stabilize the factory, 1 to 3 days

- Restore at least 50 GB of internal working space.
- Complete verified external custody without deleting cloud originals.
- Rotate exposed credentials.
- Reauthenticate and inventory Cloud Run, SQL, buckets, secrets, and Firebase.
- Preserve and push current work in coherent rescue commits.
- Mark every app root active, reference, or quarantined.
- Point coordination docs at one current truth.

### Phase 1: Episode 4 vertical slice, 1 to 2 weeks

- Prove source manifest and sync baseline.
- Produce production-quality equal-length stems.
- Make Audio Room useful for human and agent judgment.
- Create a branching long-form edit and at least five strong shorts.
- Render versioned video, podcast audio, and social outputs.
- Prepare Tower packages and record real receipts after approval.
- Measure every manual step and failure.

Do not fan out to Episodes 1 through 6 until Episode 4 is repeatable. Earlier episodes remain test corpora, not competing release programs.

### Phase 2: Nest writing and capture, 2 to 4 weeks

- OneNote-easy writing navigation.
- Living documents, drafts, notes, outlines, sources, revisions.
- Rapid iPhone capture into Home Nest.
- Coaching/podcast call with local recording and separate cloud tracks.
- Call artifacts attached to the correct Nest and production.

### Phase 3: Tower and learning loop, 2 to 4 weeks

- Release queue, metadata, scheduling, receipts.
- Platform analytics and revenue signals.
- Edit corrections and outcomes available to evaluation/training.
- External automation bounded by explicit permissions.

### Phase 4: Expand studios

Photo Grove, 360 reframing, courses, stories, comics, quotes, galleries, coaching portals, QuipLore, and richer research reuse the Creative Graph rather than creating new truth silos.

## Stop doing

- No new app roots without an active-source decision.
- No new review packets when information belongs in the creative surface.
- No generated artifact or line count as product evidence.
- No build-only success claims.
- No broad production schema pushes.
- No work based on stale paths or docs.
- No Premiere chopped-timeline model in the Quipsly decision graph.
- No single mastered mix as editorial truth.
- No platform-parity expansion before the differentiated loop works.

## Metrics

- Capture to first usable edit.
- First edit to publication receipt.
- Manual interventions per episode.
- Assets with verified custody/provenance.
- Outputs reproducible from sources and decisions.
- Human correction rate after agent first pass.
- Accepted shorts per episode.
- Creative time versus form/packet time.
- Source-loss incidents, target zero.
- Agent command success, idempotency, and undo rate.
- Crash-free native sessions.
- Render reproducibility.
- Publication receipt coverage.
- DORA deployment frequency, lead time, change failure rate, recovery time, reliability.

## Immediate actions

1. Finish safe disk recovery and staged Podcast archive.
2. Preserve current Git state in coherent rescue commits and push it.
3. Rotate exposed provider credentials.
4. Reauthenticate GCloud and capture a no-secret inventory.
5. Replace stale coordination entry points with this source map.
6. Decompose Studio at PlaybackClock, AudioWorkbench, and AgentBridge seams.
7. Make Episode 4 the first complete Branching Baseline production.
8. Replace silence-heavy audio metrics with dialogue-region evidence.
9. Prove one human edit and one agent edit through the same commands.
10. Publish one episode and one short with real receipts before broadening.

## Research basis

- DORA: [delivery metrics](https://dora.dev/guides/dora-metrics/) and [small batches](https://dora.dev/capabilities/working-in-small-batches/)
- Firebase: [authentication](https://firebase.google.com/docs/auth/where-to-start) and [custom claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- LiveKit: [egress](https://docs.livekit.io/transport/media/ingress-egress/egress/), [participant recording](https://docs.livekit.io/transport/media/ingress-egress/egress/participant/), and [track recording](https://docs.livekit.io/transport/media/ingress-egress/egress/track/)
- OpenTimelineIO: [timeline structure](https://opentimelineio.readthedocs.io/en/v0.12/tutorials/otio-timeline-structure.html) and [architecture](https://opentimelineio.readthedocs.io/en/v0.16.0/tutorials/architecture.html)
- Prisma: [multi-file schemas](https://www.prisma.io/docs/orm/v6/prisma-schema/overview/location)
- Cloud Storage: [lifecycle](https://docs.cloud.google.com/storage/docs/lifecycle) and [versioning](https://docs.cloud.google.com/storage/docs/object-versioning)
- EBU: [R128 loudness](https://tech.ebu.ch/loudness/)
- Local-first: [Ink and Switch](https://www.inkandswitch.com/essay/local-first/)
- Apple audio: [offline AVAudioEngine processing](https://developer.apple.com/documentation/AVFAudio/performing-offline-audio-processing)
- MCP: [server resources, prompts, and tools](https://modelcontextprotocol.io/specification/2025-06-18/server/index)
