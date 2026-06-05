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

### 8.2 Public Route List to Smoke
- **Home Feed (`/`):** View latest episode with video hero, audio player, show notes, quotes, transcript essay, and Patreon support CTA.
- **Episode 1 (`/episodes/episode-1-write-it-down`):** Verify the title is “The Wednesday Rule”, verify full-width video hero, below-video summary text, and the nested Nest Provenance badge.
- **Episode 2 (`/episodes/episode-2-look-for-lessons`):** Verify "Look for Lessons" layout, supporting text placement, and the Nest Provenance badge.
- **Episode 3 (`/episodes/episode-3-chub-and-jack`):** Verify "Know Where You Came From" layout, supporting text placement, and the Nest Provenance badge.

### 8.3 Next Steps: What must be fed from Quipsly
- **Staging Projections:** The publishing queue must output new public-safe `HgoPublicEpisodePacket` JSON packets to the `content/publish/hgo-episodes/` directory to automatically update the feed.
- **Coaching Framework Packets:** Future public-facing coaching worksheets should be published using this exact same structured JSON packet serialization to guarantee safe CRM data boundaries.

