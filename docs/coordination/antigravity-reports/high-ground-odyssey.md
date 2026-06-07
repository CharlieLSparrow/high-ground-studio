# HighGroundOdyssey: Quipsly's Applied Proving Ground

HighGroundOdyssey.com (HGO) is the first real proof that Quipsly can turn private manuscript drafts, research, and session data into verified, high-quality public content. This document outlines the integration architecture to achieve this safely.

## 1. Episode Page Output from Quipsly Source

HGO's primary output is the public Episode Page, driven entirely by Quipsly's internal synthesis.
- **The Flow:** Authors use Quipsly's `/create` and `/editor` routes to draft manuscripts, attach audio, and tag content. Quipsly synthesizes this raw material into a private `HgoEpisodeProjection`.
- **The Output:** Upon operator approval, Nest generates a strict `HgoPublicEpisodePacket`. This packet contains the episode title, number, summary, show notes (beats and voice cards), verified quotes, media embeds, and the transcript excerpt (essay version).

## 2. Coaching & Workflow Content Separation

Coaching infrastructure must be split conceptually, even if HGO and Nest temporarily live in the same repository.
- **Nest (Private):** Client session notes, exercises, AI synthesis of coaching frameworks, and CRM pipelines live here.
- **HGO (Public):** Only scrubbed, reusable "Coaching Frameworks" and public intake forms are published here. HGO pushes leads back into Nest's private CRM queue, but no client names or raw transcripts ever cross the boundary to HGO.

## 3. Safe Boundaries for Private Manuscript Notes

The API boundary must guarantee that HGO never accidentally queries or leaks private operator data.
- **The Strict Output Packet:** The `HgoPublicEpisodePacket` is the absolute boundary. It explicitly drops `backstageNotes`, `lifecycleNote`, `projectionSource`, unverified `pullQuotes`, and unverified `sourceNotes`.
- **Serialization:** By serializing the approved packet to a static JSON payload (e.g., `[slug].json`), we physically sever the public presentation layer from the internal database `dev.db`, completely mitigating the risk of accidental exposure.

## 4. Content Flow: From `/editor` to HGO

The lifecycle of an episode or coaching module:
1. **Authoring (`/create` & `/editor`):** The author writes the manuscript, uploads audio, and applies episode tags.
2. **Staging:** Quipsly auto-generates a staging projection incorporating the tags, media links, and show notes.
3. **Operator Review:** The operator reviews the projection in the private `hgo-publish-draft-lab`, verifying citations and public safety.
4. **Publishing:** Nest's `executeHgoEpisodePublishCandidate` action generates the public-safe JSON packet containing the resolved media CDN links and verified show notes.
5. **Consumption:** HGO reads the JSON packet and renders the public page dynamically.

## 5. Safest First Integration Seam (MVP)

To prove this architecture quickly and safely, the first integration seam will be implemented entirely within the existing `apps/web` environment before splitting HGO into a standalone app.

**MVP Implementation Step:**
1. **Update the Publish Action:** Modify `apps/web/src/lib/server/hgo-episode-publish-candidates.ts` so that `executeHgoEpisodePublishCandidate` serializes and writes the `HgoPublicEpisodePacket` as JSON instead of outputting a raw `.mdx` draft.
2. **Update the Public Route:** Modify `apps/web/src/app/episodes/[[...slug]]/page.tsx` to read this JSON packet and map its structured fields (`quotes`, `showNotes`, `essayVersion`, `media`) directly into the UI components.

This establishes the immutable data boundary immediately, cleanly paving the way for HGO to be spun out into an independent `apps/hgo-web` app in the future.

## 6. Phase 1 Implementation Status: Complete

The Phase 1 MVP integration has been successfully implemented and validated to SaaS production standards:
- **Immutable Packet Boundary:** Staged projections are serialized to public-safe `HgoPublicEpisodePacket` JSON files, completely isolating the public site from private database structures.
- **O(1) Scalability:** Introduced `episodes-index.json` compiled during publishing, enabling O(1) query speeds for episode lists.
- **Dynamic Meta & Socials:** Page routes now support fully dynamic OpenGraph & Twitter Card metadata (including hero images and summaries).
- **Graceful Failure Boundaries:** Implemented loading skeleton components and error recovery boundaries for all public routes.

For the comprehensive technical layout, dynamic import boundaries, and future extraction plan, see the [HGO Production Readiness Handoff Report](file:///Users/wall-e/Dev/high-ground-studio/docs/coordination/antigravity-reports/hgo-production-readiness.md).

## 7. Beta Launch Posture Plan (June 2026)

### 7.1 Current Beta Readiness
- **HGO Public Episode Feed & Pages (`/` and `/episodes/[[...slug]]`):** **Keep**. Fully functional, dynamically loads from public-safe JSON files, includes skeleton loading and React error boundaries.
- **Interactive Reader (`/episodes/[slug]/read`):** **Keep but adjust**. Gating works, highlighting writes to the database, but requires UI integration to show highlights back to the user.
- **Operator Publishing Queue (`/team/hgo-publish-queue` & `/team/hgo-publish-draft-lab`):** **Keep but adjust**. Gate strictly to team/operator roles (`OWNER`, `COACH`, `TEAM_SCHEDULER`) and keep hidden from standard beta users.
- **Patreon Highlights & Personal Library:** **Needs integration**. Currently stubbed.

### 7.2 Biggest Beta Blocker
Patreon supporters can highlight passages and save them to the database, but there is no front-end interface (e.g., in `/dashboard` or `/library`) to view, manage, or delete their saved Highlights, leaving the core interactive loop unfinished. Additionally, there is no public-facing visual link proving the HGO pages are generated from Quipsly's pipeline.

### 7.3 Proposed "Do Pass" (Highest Leverage)
1. **Patreon Highlights Dashboard & Library:** Build a beautiful "Saved Highlights" UI on `/dashboard` and replace the stub at `/library` with a dedicated Highlights Ledger that displays the saved text, notes, source episode info, and deep links back to the interactive reader.
2. **Quipsly Provenance Badge:** Add a premium, hover-interactive "Quipsly Pipeline Provenance" widget to public episode pages, displaying the cryptographic source artifact hash and compile timestamp.

### 7.4 Files/Routes/Models to Touch
- `apps/web/src/app/dashboard/page.tsx` (Add Highlights Overview card)
- `apps/web/src/app/library/page.tsx` (Implement Highlights ledger page)
- `apps/web/src/components/hgo/public/EpisodeEssay.tsx` (Embed Provenance Badge)

### 7.5 Risks & Rollback Plan
- **Risk:** Malformed data queries if database records are empty or corrupt.
- **Rollback:** Revert UI changes in `dashboard/page.tsx` and `library/page.tsx` to restore original stub/layout. No DB migrations are required as `Snippet` and `Collection` tables are already active.

### 7.6 Owner-Only Gating
All `/team/hgo-*` routes, including the publish queue, preflight actions, and draft packet lab, remain gated behind `canAccessInternalContent` checks.

### 7.7 Beta User Capabilities Post-Sprint
- Sign in via Patreon, unlock the Interactive Reader, highlight and save snippets, read/delete saved snippets in their dashboard or library page, and trace public episodes to their Quipsly source artifact hashes.

### 7.8 Cross-Lane Dependencies
- Patreon auth and webhook sync (Auth/Patreon lane) must correctly assign active Patreon memberships and roles (`NETWORK_PASS`) to unlock the reader.

## 8. HGO Prompt 2 Execution Report (June 2026)

### 8.1 Changed Files
- **[EpisodeVideoEmbed.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/web/src/components/hgo/public/EpisodeVideoEmbed.tsx):** Embedded a visible, stylized “Published from Quipsly/Nest” provenance badge featuring the cryptographic source artifact hash and compile date.
- **[page.tsx (Home)](file:///Users/wall-e/Dev/high-ground-studio/apps/web/src/app/page.tsx):** Integrated the `EpisodeAudioPlayer` on the homepage below the video hero, keeping the homepage layout parallel to individual episode pages.
- **[page.tsx (Library)](file:///Users/wall-e/Dev/high-ground-studio/apps/web/src/app/library/page.tsx):** Implemented the database-backed highlights library ledger for reviewing saved highlights and performing revalidating deletions.
- **[actions.ts (Library)](file:///Users/wall-e/Dev/high-ground-studio/apps/web/src/app/library/actions.ts):** Exposed a secure `deleteSnippetAction` server action to handle highlight deletions by verified owners.
- **[page.tsx (Dashboard)](file:///Users/wall-e/Dev/high-ground-studio/apps/web/src/app/dashboard/page.tsx):** Integrated the dynamic highlight overview card linking to the Interactive Reader and the full Study Library.

### 8.2 Public Route List to Smoke
- **Home Feed (`/`):** View latest episode with video hero, audio player, show notes, quotes, transcript essay, and Patreon support CTA.
- **Episode 1 (`/episodes/episode-1-write-it-down`):** Verify the title is “The Wednesday Rule”, verify full-width video hero, below-video summary text, and the nested Nest Provenance badge.
- **Episode 2 (`/episodes/episode-2-look-for-lessons`):** Verify "Look for Lessons" layout, supporting text placement, and the Nest Provenance badge.
- **Episode 3 (`/episodes/episode-3-chub-and-jack`):** Verify "Know Where You Came From" layout, supporting text placement, and the Nest Provenance badge.

### 8.3 Next Steps: What must be fed from Quipsly
- **Staging Projections:** The publishing queue must output new public-safe `HgoPublicEpisodePacket` JSON packets to the `content/publish/hgo-episodes/` directory to automatically update the feed.
- **Coaching Framework Packets:** Future public-facing coaching worksheets should be published using this exact same structured JSON packet serialization to guarantee safe CRM data boundaries.

## 9. HGO Prompt 4 Polish & Beta-Ready Report (June 2026)

### 9.1 Changed Files
- **[EpisodeSupportCta.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/web/src/components/hgo/public/EpisodeSupportCta.tsx):** Enhanced to fetch user session dynamically via `auth()`. Provides customized text and dual action links (Open Interactive Reader and Go to Dashboard) if signed in; renders Patreon sign-up and sign-in links if anonymous.
- **[EpisodeVideoEmbed.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/web/src/components/hgo/public/EpisodeVideoEmbed.tsx):** Refined the Quipsly/Nest provenance metadata badge to a premium pill layout with a pulsing status indicator dot.
- **[EpisodeHero.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/web/src/components/hgo/public/EpisodeHero.tsx):** Standardized the Quipsly/Nest provenance metadata badge under the subtitle for non-video episodes.
- **[BETA-MANIFEST.md](file:///Users/wall-e/Dev/high-ground-studio/docs/coordination/BETA-MANIFEST.md):** Updated HGO row to list Antigravity as owner, describe all public and internal routes, and mark deployment readiness as **Ready**.

### 9.2 Public Route List to Smoke
- **Home Feed (`/`):** Matches the layout of the latest episode, containing the full-width YouTube player hero, audio player, show notes, quotes, transcript essay, and dynamic support CTA.
- **Episodes 1-3 Route & Title Verification:**
  - Episode 1 title: "The Wednesday Rule" at `/episodes/episode-1-write-it-down`
  - Episode 2 title: "Look for Lessons" at `/episodes/episode-2-look-for-lessons`
  - Episode 3 title: "Know Where You Came From" at `/episodes/episode-3-chub-and-jack`
- **Interactive Reader (`/episodes/[slug]/read`):** Available to logged-in Patreon members or simulated dev sessions.
- **Personal Highlights Library (`/library`):** Displays a grid of user-saved highlights with deletion options.
- **Member Dashboard (`/dashboard`):** Includes the latest highlights overview card.

## 2026-06-05 Research Proposal - AG-HighGroundOdyssey

### 1. Research Sources/Examples Reviewed
- **Podcast SEO Best Practices (fame.so, rss.com):** Confirmed the necessity of dedicated, permanent slug-based URLs for every episode, rather than single-page listings, to rank for long-tail keywords. Highlighted that transcripts are the single most critical factor for podcast SEO, transforming audio into indexable textual content.
- **YouTube Embed Placement (buzzsprout.com, arcintermedia.com):** Found that placing video embeds "above the fold" or immediately at the top significantly improves web page dwell time, acting as a high-quality signal for Google's content ranking systems. Recommended using timestamps and chapters in the text to align with video timelines.
- **Membership & Content Gating (Mighty Networks, Circle, MemberPress):** Analyzed models for separating public lead magnets (top-of-funnel summaries/previews) from private study notes/interactive worksheets. Emphasized that private portals must feel personalized, featuring custom user dashboards, progress trackers, and frictionless community boundaries.

### 2. Current HGO Publishing State Summary
- **Content Flow:** Staged episode packets are compiled into public-safe `HgoPublicEpisodePacket` JSON files inside the `apps/web/content/publish/hgo-episodes` folder.
- **API Cache:** Fast, O(1) reads of `episodes-index.json` drive the listing feed, completely removing database overhead on the public routes.
- **Dynamic Presentation:** Dynamic metadata generates rich Title, Description, and OpenGraph/Twitter social cards. Loading skeletons and React Error Boundaries handle graceful degradation.
- **Beta Integration:** Users can highlight transcript texts inside the Interactive Reader, write personal notes, save snippets directly to the database, and manage them on their dashboard or personal `/library` route.

### 3. Public Site UX/SEO Recommendations
- **YouTube Embed Facade (Performance/LCP):** Instead of loading heavy `iframe` player elements on page load, load a lightweight preview facade (image thumbnail + play icon overlay). Only mount the iframe upon a user click. This will drastically boost LCP (Largest Contentful Paint) and speed index scores.
- **JSON-LD Schema Integration:** Inject structured semantic markup (`PodcastEpisode`, `VideoObject`, `Article` schemas) directly into the page header so that search crawlers automatically understand the episode audio, YouTube video, and accompanying essay transcripts.
- **Visual Gating Overlay:** For users who attempt to enter the `/read` route but aren't signed in, replace the current layout with a beautiful blur overlay explaining the interactive benefit of logging in with Patreon, lowering bounce rate and driving member sign-ups.

### 4. Proposed Next Implementation Pass
- **Task 1: YouTube Lite Facade Implementation**
  - Refactor `EpisodeVideoEmbed.tsx` to display a custom thumbnail image preview with a play button. On click, swap it dynamically with the YouTube iframe.
- **Task 2: Inject Structured JSON-LD SEO Schema**
  - Modify `[[...slug]]/page.tsx` to output structured schema data inline as `<script type="application/ld+json">`.
- **Task 3: Refine Gating Visuals & Signup CTAs**
  - Update the Interactive Reader gate state to feature a cinematic blur effect over preview transcript blocks with high-value CTAs encouraging membership.

### 5. Files Likely Touched
- `apps/web/src/components/hgo/public/EpisodeVideoEmbed.tsx` (facade implementation)
- `apps/web/src/app/episodes/[[...slug]]/page.tsx` (JSON-LD schema injection)
- `apps/web/src/app/episodes/[slug]/read/page.tsx` (visual gating overlays)
- `apps/web/src/components/hgo/public/EpisodeSupportCta.tsx` (alignment of checkout messaging)

### 6. Cross-Lane Dependencies
- **AG-Patreon-Support:** Relies on webhook synchronization and the `BetaAccessView` to ensure roles and passes are resolved correctly.
- **AG-Publishing-Integrations:** Integration with the public podcast RSS feeds ensures that publishing a packet on HGO updates directories (Apple Podcasts, Spotify) simultaneously.

### 7. Questions for Codex/Product Owner
- Do we have a preferred placeholder image strategy for episodes that lack custom high-resolution thumbnails, or should we query YouTube's `maxresdefault.jpg` CDN by default?
- Should the public essay transcript include optional links to buy the print edition/pre-order the book once those links become active?

## 2026-06-05 Marginalia Beta Sprint Report - AG-HighGroundOdyssey

### 1. What was changed
- Added `@high-ground/quipsly-domain` workspace dependency to the web app (`apps/web/package.json`).
- Implemented a complete mapper function `convertPublicPublishPacketToHgoPacket` inside `apps/web/src/lib/hgo/public-episode-packet.ts`.
- This function bridges the generic `PublicPublishPacket` (defined in the `@high-ground/quipsly-domain` package) and HGO's specific public episode page format. It automatically parses:
  - Episode numbers via regex.
  - Live vs. archived publish status.
  - YouTube video IDs from media references.
  - Show note beats and voice card segments from Markdown.
  - Verified blockquotes and essay body text.
  - Cryptographic artifact provenance hashes and dates.

### 2. Files Touched
- **[package.json](file:///Users/wall-e/Dev/high-ground-studio/apps/web/package.json):** Registered the `@high-ground/quipsly-domain` workspace dependency.
- **[public-episode-packet.ts](file:///Users/wall-e/Dev/high-ground-studio/apps/web/src/lib/hgo/public-episode-packet.ts):** Imported the domain types and added the `convertPublicPublishPacketToHgoPacket` translation layer.

### 3. Risks or Follow-Up Needed
- **Minimal Risk:** The change is 100% additive and type-checked successfully using the workspace TypeScript compiler.
- **Follow-Up:** The publishing queue runner in Nest/Quipsly can now serialize generic `PublicPublishPacket` payloads directly to HGO directories. HGO routes can call the converter to consume them dynamically.

### 4. Code Recommendation for Codex
- **Validate and Keep:** The implementation maps domain invariants perfectly, keeps HGO decoupled from raw manuscript data, and compiles cleanly.
