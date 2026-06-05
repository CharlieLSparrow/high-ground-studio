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

