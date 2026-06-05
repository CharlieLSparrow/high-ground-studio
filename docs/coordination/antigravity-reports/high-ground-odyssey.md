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
