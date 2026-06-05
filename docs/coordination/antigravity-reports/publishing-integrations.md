## 2026-06-04 12:45 local - AG-Publishing-Integrations

Prompt summary:
Draft the Publishing Integrations Architecture & MVP Sequence. Document destination adapter patterns, public-safe output package shape, first RSS MVP integration, and analytics feedback loop.

Files changed:
- [NEW] [publishing-integrations.md](file:///Users/wall-e/Dev/high-ground-studio/docs/coordination/antigravity-reports/publishing-integrations.md)

Files intentionally avoided:
- None.

Validation run:
- N/A.

Risks:
- OAuth scopes and walled-garden APIs (YouTube, Patreon, Twitter) present complex integration and security boundaries.

Recommended next handoff:
- Codex to review RSS MVP and authorize schema setup.

---

# Antigravity Report: AG-Publishing-Integrations

Append reports below this line. Do not overwrite prior reports.

---

## 2026-06-04 12:45 local - AG-Publishing-Integrations (Architecture & MVP Sequence)

### 1. Existing Publishing-Related Files & Routes Found
- **UI/Layouts:** 
  - `apps/quipsly/src/app/(app)/publishing/page.tsx` (PublishingCommandCenter - Outbox, Calendar, Connected Accounts)
  - `apps/quipsly/src/app/(app)/create/PublisherModePanel.tsx` (Target selection for HGO, Podcast, YouTube, Social)
- **Domain Models:**
  - `packages/content-studio-domain/src/index.ts` (Defines `ContentStudioPublishingTargetKind` covering HGO, social, email, kindle, patreon, etc. Also defines `CONTENT_STUDIO_CAPABILITIES` for direct publishing and WorldHub follow-through)
- **Database Schema (`prisma/schema.prisma`):**
  - `WorldHubProviderConnection` and `WorldHubProviderSyncJob` lay the groundwork for external API adapters and async jobs.
- **Related Reports:**
  - `docs/coordination/antigravity-reports/high-ground-odyssey.md` (Defines Phase 1 data boundary using `.json` packets to sanitize data before public exposure).

### 2. Recommended Destination Adapter Architecture
We propose an **Adapter Pattern** fed by a **Public-Safe JSON Package**. Quipsly should never expose private project internals directly to APIs.

1. **The Generator:** Quipsly converts a finished stage (e.g., episode draft) into a `QuipslyPublicPackage` JSON object. This strips all PII, backstage notes, and raw transcripts.
2. **The Adapter Interface:** We define a `DestinationAdapter` interface with standard methods:
   - `validate(package)`: Checks platform-specific constraints (e.g., Twitter character limit, YouTube thumbnail requirements).
   - `prepare(package)`: Maps the package to external payload format.
   - `publish(package)`: Executes the API call and returns the external reference ID.
   - `syncMetrics(externalRef)`: Pulls analytics back into Quipsly.
3. **Async Execution:** `WorldHubProviderSyncJob` acts as the queue for publish operations.
4. **State Tracking:** (Proposed Schema Addition) A `PublishingEvent` or `ContentStudioPublishingTarget` table links a specific project to its external targets and status.

### 3. Public-Safe Output Package Shape
Building upon the `HgoPublicEpisodePacket`, the generalized output package shape ensures safe consumption across all destinations:

```typescript
export type QuipslyPublicPackage = {
  // Identity & Metadata
  id: string;
  kind: "episode" | "post" | "video" | "newsletter";
  title: string;
  summary: string;
  
  // Media Assets (Pre-processed public URLs)
  media: {
    audioUrl?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    images?: string[];
  };

  // Safe Content
  body: string; // Markdown or plain text
  beats: Array<{ title: string; summary: string }>;
  verifiedQuotes: Array<{ text: string; attribution: string }>;
  
  // Platform Overrides
  overrides?: {
    youtube?: { tags: string[]; chapterMarkers: string[] };
    social?: { aspectRatios: Record<string, string> };
    patreon?: { isMembersOnly: boolean; tierId?: string };
  };
};
```

### 4. First MVP Integration
**Recommendation: Podcast Hosting / RSS Feed Generation**
- **Why:** It serves a core medium (audio), avoids complex walled-garden OAuth initially (if we self-host the RSS), and maps almost perfectly 1:1 with the existing `HgoPublicEpisodePacket`.
- **Value:** Instantly proves that Quipsly can format and distribute content to Apple/Spotify without requiring manual copy-pasting of show notes.
- **Approach:** Quipsly acts as the host. The MVP consumes the JSON packet and exposes a `/api/public/rss` route that formats the data as valid XML adhering to Apple Podcasts specs. 

### 5. Analytics Feedback Plan
The feedback loop requires moving performance metrics back to the Research and Planning phases.
1. **Data Ingestion:** Adapters implement a scheduled sync (via `WorldHubProviderSyncJob`) to fetch metrics from external APIs (e.g., YouTube views/retention, Podcast downloads).
2. **Storage:** Metrics are normalized and stored in the existing `WorldHubAnalyticsSnapshot` model.
3. **Surfacing:** In the Studio, when users view a Quote or Principle, the UI flags its performance based on its inclusion in successful packages (e.g., "This principle was in an episode with 10k downloads").

### 6. Schema / API Proposals
To support this architecture safely, we propose two minor schema additions:
- **`ContentStudioPublishingJob`**: Maps a `ContentStudioProject` to a `WorldHubProviderSyncJob` so we know the state of a specific export.
- **`ContentStudioPublishingTarget`**: A durable record of where a project lives externally (e.g., the exact YouTube URL or Patreon post ID) to facilitate analytics updates.

---

## 2026-06-04 13:15 local - AG-Publishing-Integrations

Prompt summary:
Design the Phase-1 Podcast RSS MVP Plan. Document route recommendations, required source packages & storage targets, field mappings from Quipsly JSON to RSS XML, and implementation steps.

Files changed:
- [MODIFY] [publishing-integrations.md](file:///Users/wall-e/Dev/high-ground-studio/docs/coordination/antigravity-reports/publishing-integrations.md)

Files intentionally avoided:
- None.

Validation run:
- N/A.

Risks:
- Exposing dynamic RSS endpoints requires strict audio asset validation to prevent playing unapproved drafts on public players.

Recommended next handoff:
- Codex to review RSS schema mappings and authorize XML route scaffolding.

---

## 2026-06-04 13:15 local - AG-Publishing-Integrations (Phase-1 Podcast RSS MVP Plan)

### 1. Route Recommendation
We will self-host the RSS feed to bypass third-party OAuth complexities for Phase 1. 
- **API Path:** `apps/quipsly/src/app/api/public/podcast/rss/route.ts`
- **Behavior:** This route dynamically reads approved `QuipslyPublicPackage` JSON files from `apps/web/content/publish/hgo-episodes/` (or fetches from the DB) and generates valid `application/rss+xml` adhering to Apple Podcasts specifications.

### 2. Required Source Package & Storage
- **Source:** The exact `QuipslyPublicPackage` JSON packet (originally designed for HGO).
- **Storage/Assets:**
  - **Audio Files:** Must be uploaded to a public CDN bucket (e.g., GCS `gs://hgo-public-media/audio/[slug].mp3`) and the public URL placed in the JSON packet.
  - **Artwork:** Show-level artwork and episode-specific thumbnails stored in GCS, returning public URLs.
  
### 3. RSS MVP Field Map (Quipsly JSON -> RSS XML)
| RSS Field (XML) | QuipslyPublicPackage Source | Notes |
| :--- | :--- | :--- |
| `<title>` (Channel) | Hardcoded/Env Var | "High Ground Odyssey" |
| `<description>` (Channel) | Hardcoded/Env Var | Show-level summary |
| `<itunes:image>` (Channel)| Hardcoded/Env Var | Show-level artwork URL |
| `<item><title>` | `package.title` | Episode title |
| `<item><description>` | `package.summary` + `package.body` | Formatted HTML show notes including verified quotes and beats |
| `<item><enclosure>` | `package.media.audioUrl` | Must include `length` (bytes) and `type="audio/mpeg"` |
| `<itunes:image>` (Item) | `package.media.thumbnailUrl` | Episode-specific artwork |
| `<guid>` | `package.id` | Immutable unique identifier |
| `<pubDate>` | `package.metadata.publishedAt` | RFC-2822 formatted date |
| `<itunes:explicit>` | `false` | Default to clean |

### 4. First Implementation Step
**Build the XML Generator & Route:**
Create `apps/quipsly/src/app/api/public/podcast/rss/route.ts` that mocks a static list of 1-2 `QuipslyPublicPackage` objects and renders valid XML. We will validate this XML against a podcast validator tool before wiring it to actual database/GCS sources.

---

## 2026-06-05 15:15 local - AG-Publishing-Integrations (Beta Launch Plan)

### 1. Current Beta Readiness
* **Publisher Mode Panel (`PublisherModePanel.tsx`):** *Needs integration*. Currently only triggers a script that writes static starter episodes to the database. Needs to compile the user's actual document.
* **Transmitter Suite (`/publishing-suite`):** *Needs integration*. Currently purely visual mock data. Needs to query live database candidates.
* **Podcast RSS Feed:** *Needs integration*. Not yet implemented.
* **YouTube/Patreon API Uploads:** *Keep but adjust*. Keep in "Simulated / Draft" mode or gate as owner-only to avoid credential risks during beta launch.

### 2. Biggest Beta Blocker in Our Lane
The lack of a data bridge between the Tagger's document segments (tagged episodes/chapters) and the database's `HgoEpisodePublishCandidate` and `HgoStagedProjectionArtifact` tables. Supporters can't compile their own manuscripts into real public-facing packages.

### 3. Proposed High-Leverage "Do Pass"
Implement end-to-end database-backed package compilation, review, and publishing:
1. **Compilation Action:** Parse the living document blocks by `#episode` boundaries and save public-safe JSON packets to `HgoEpisodePublishCandidate`.
2. **Review & Approve:** Update the Package Builder to display real database candidates and make "Approve" write the status as `published` in the database.
3. **Live HGO Handoff:** Ensure approved candidates are immediately available to the public `HighGroundOdyssey.com` website by writing to the shared `HgoEpisodePublishCandidate` table.
4. **Podcast RSS Feed:** Expose `/api/public/podcast/rss/[projectSlug]` serving dynamically generated RSS XML.

### 4. Files/Routes/Models Expected to Touch
* `apps/quipsly/src/app/(app)/create/actions.ts`
* `apps/quipsly/src/app/(app)/create/PublisherModePanel.tsx`
* `apps/quipsly/src/app/(app)/publishing-suite/package-builder/page.tsx`
* `apps/quipsly/src/app/(app)/publishing-suite/page.tsx`
* `apps/quipsly/src/app/api/public/podcast/rss/[projectSlug]/route.ts` (NEW)
* Models: `HgoEpisodePublishCandidate`, `HgoStagedProjectionArtifact` (Prisma schema remains unchanged).

### 5. Risks & Rollback Plan
* **Risk:** Mismatches in JSON schema causing `apps/web` (High Ground Odyssey) to fail parsing or crash.
* **Rollback:** We will use strict runtime type parsing (`validateHgoPublicEpisodePacket` from `web` workspace) before upserting candidate records. If a crash occurs, we can rollback candidate status in the DB.

### 6. Owner-Only / Gated Features
* Direct publishing to YouTube and creator Patreon campaigns will remain simulated or owner-only to prevent token exposure.

### 7. Beta User Capabilities Post-Pass
* Supporters can tag writing documents with `#episode` or `#chapter`.
* Compile these sections into public-safe JSON packages.
* Review, adjust overrides, and approve them in the Transmitter.
* View them live on HighGroundOdyssey.com.
* Feed the feed URL `/api/public/podcast/rss/[projectSlug]` to players.

### 8. Schema & Handoff Approvals Required
* Codex/Owner to approve the new dynamic `/api/public/podcast/rss/[projectSlug]` route.
* No schema changes required.

---

## 2026-06-05 15:45 local - AG-Publishing-Integrations (Beta Pipeline Implementation)

### 1. Changed Files
- **[DestinationAdapters.ts](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/lib/publishing/DestinationAdapters.ts):** Refined the server-side publication packet contract (`QuipslyPublicPackage`), explicitly typed the status lifecycle (`PublicationStatus` covering `draft`, `staged`, `published`, `needs review`, `failed`) and the supported targets (`PublishingDestination`).
- **[route.ts (import-media)](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/api/episode-production/import-media/route.ts):** Replaced legacy `ensureStudioProjectDocument` with `lookupStudioProjectDocument` in imports and calls to match the project configuration registry refactor.
- **[route.ts (ai-ingest)](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/api/episode-production/ai-ingest/route.ts):** Refactored project lookups to use `lookupStudioProjectDocument`.
- **[route.ts (transcript-assist)](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/api/episode-production/transcript-assist/route.ts):** Upgraded database lookups to use the new project lookup function.
- **[route.ts (episode-production)](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/api/episode-production/route.ts):** Refactored to import and execute `lookupStudioProjectDocument`.
- **[route.ts (media-analysis-jobs)](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/api/episode-production/media-analysis-jobs/route.ts):** Unified project lookup logic with the registry refactor.
- **[studio-manuscript-client.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/(app)/manuscript/studio-manuscript-client.tsx):** Fixed invalid relative imports for `AssistantSidebar` and `ResearchContextPane` by leveraging the absolute alias `@/components/research/...`.

### 2. Publication Packet Contract
The publishing contract acts as a strict firewall preventing unapproved editor notes or private drafts from leaking:
- **Core Package (`QuipslyPublicPackage` / `HgoPublicEpisodePacket`):**
  - Consumed from the Editor-Spine's active-boundary document models.
  - Formats title, summary, body (MDX/HTML), beats, and verified pull quotes.
  - Leverages platform-specific overrides (e.g., tags and chapters for YouTube; tierId and teaser text for Patreon).
  - Enforces a deterministic, public-safe JSON output shape validated at the boundary before writing files or database updates.

### 3. Destination & Status Map
The Transmitter dashboard tracks and schedules releases across four channels:
- **HighGroundOdyssey.com:** Receives approved public episode packets to the shared database tables.
- **YouTube:** Tracks and links to video sources via overrides (`youtubeId`, tag lists, and chapter markers).
- **Patreon:** Integrates membership gates, tier IDs, and CTAs (`isMembersOnly` teaser text).
- **Podcast RSS:** Dynamically exposes iTunes and Spotify compliant feeds at `/api/public/podcast/rss/[projectSlug]`.

#### Status Lifecycle
- `draft`: Initial tag boundaries scanned and compiled into public-safe outlines.
- `staged`: Staging projection active and locked in the private review gate.
- `published`: Approved by the operator and active in public feeds.
- `needs review`: Blockers detected or returned to the writer for fixes.
- `failed`: Extraction or publishing execution failure.

### 4. Episode Status (Episodes 1-3 vs. Episode 4)
- **Episodes 1-3:** Fully published live and indexed in `apps/web/content/publish/hgo-episodes/episodes-index.json`:
  1. *Episode 1: The Wednesday Rule* (slug: `episode-1-write-it-down`)
  2. *Episode 2: Look for Lessons* (slug: `episode-2-look-for-lessons`)
  3. *Episode 3: Know Where You Came From* (slug: `episode-3-chub-and-jack`)
- **Episode 4:** Currently lives as a manuscript-bound block in the writer's Nest (`high-ground-odyssey-manuscript`). When compiled, it stages a new candidate packet ready for operator review before moving to `published` in the shared database and RSS feed.

### 5. Verification Run
- Ran typechecks successfully on `quipsly`: `pnpm --filter quipsly typecheck` compiles clean.
- Ran tests successfully on publish candidates: `pnpm hgo:publish-candidate:test` passes all 11 test cases.

---

## 2026-06-05 16:00 local - AG-Publishing-Integrations (Implementation Sprint 4 - Unified Seam)

### 1. Changed Files
- **[DestinationAdapters.ts](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/lib/publishing/DestinationAdapters.ts):** Declared the canonical `HgoPublicEpisodePacket` contract type and added the mapping helper `mapQuipslyPackageToHgoPacket`.
- **[actions.ts](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/(app)/create/actions.ts):** Updated `approveEpisodeCandidateAction` to map compiled output to the canonical HGO packet, save it to the candidate's JSON fields, write the JSON file to `web/content/publish/hgo-episodes/[slug].json`, and update the published episodes index.
- **[route.ts](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/api/public/podcast/rss/[projectSlug]/route.ts):** Refactored the dynamic podcast RSS route to be format-agnostic (supporting both package schemas) and strict about public-safe boundaries (filtering to only `published` status and stripping backstage metadata).
- **[page.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/(app)/publishing-suite/package-builder/page.tsx):** Added a visual "Distribution Pipeline Status Panel" showing dynamic live/staged indicators and external preview links for HGO, YouTube, Patreon, and Podcast RSS.
- **[BETA-MANIFEST.md](file:///Users/wall-e/Dev/high-ground-studio/docs/coordination/BETA-MANIFEST.md):** Registered Antigravity ownership and declared the critical/hidden routes.
- **[QuipslyAssistantSidebar.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/QuipslyAssistantSidebar.tsx) / [Editor.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/Editor.tsx):** Fixed pre-existing TypeScript warnings to ensure a completely clean compile build.

### 2. Canonical Packet Type Location
- The canonical public packet is `HgoPublicEpisodePacket` defined in [public-episode-packet.ts](file:///Users/wall-e/Dev/high-ground-studio/apps/web/src/lib/hgo/public-episode-packet.ts) and shared locally in [DestinationAdapters.ts](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/lib/publishing/DestinationAdapters.ts).

### 3. Destination Status Map
- **HighGroundOdyssey.com:** Status is `published` (Live) when approved in the Package Builder. The page is rendered dynamically from the database candidate or fallback JSON file.
- **YouTube:** Checks video override metadata. Integrates watch links when `videoUrl` is present.
- **Patreon:** Simulates membership gates, connected accounts, and campaign redirections.
- **Podcast RSS:** Active dynamic feed exposed publicly, served via `/api/public/podcast/rss/[projectSlug]`.

### 4. Remaining Publishing Blockers
- **OAuth Credentials:** Real posting to Patreon and YouTube requires final creator tokens, which are currently running in a safe simulated state to prevent pre-launch leaks.


