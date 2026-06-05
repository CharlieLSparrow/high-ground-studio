# HighGroundOdyssey Architecture & Production Readiness

**Audience:** Future Developer Agents (Skippy, etc.)
**Date:** June 2026
**Status:** Production Ready (Phase 1 MVP)

This document serves as the formal handoff report for the HighGroundOdyssey (HGO) Phase 1 integration. The goal of this phase was to construct a perfectly isolated, public-safe perimeter between the Quipsly private infrastructure (manuscript drafts, backstage notes, PII) and the HGO public coaching/media site.

## 1. The Data Boundary (JSON Packets)
We have implemented a **"File-as-Database" pattern**. 
- When an episode is approved for publishing in Quipsly, the `executeHgoEpisodePublishCandidate` action maps the raw `StagedProjection` into a highly constrained `HgoPublicEpisodePacket`.
- This packet is serialized to a physical JSON file in `content/publish/hgo-episodes/`. 
- **CRITICAL**: The public Next.js API routes (`GET /api/public/v1/hgo/episodes`) and page components (`apps/web/src/app/episodes/[[...slug]]/page.tsx`) *only* have access to these JSON packets. They can never accidentally query a raw `StoryEntity` or `LivingManuscriptSection`. This physical separation guarantees safety.

## 2. API Scalability (O(1) Reads)
To prevent the Next.js API routes from collapsing under filesystem latency as the podcast grows, the publish script dynamically maintains an `episodes-index.json`.
- The list route simply performs an O(1) read against the index.
- Single episode routes do an O(1) read for `${slug}.json`.

## 3. Resilience & UX (App Router Boundaries)
To meet professional SaaS standards, the HGO routes implement strict graceful degradation:
- **`loading.tsx`**: Renders a polished Skeleton UI using Tailwind `animate-pulse` during packet fetch delays.
- **`error.tsx`**: React Error Boundary. Catches malformed JSON packets or absent files, rendering a clean "Try Again" fallback rather than a generic 500 crash. Ready to be hooked into Datadog/Sentry.

## 4. Next.js Static Optimization & NFT
- The Next.js Node File Trace (NFT) has been formally instructed to ignore dynamic `process.cwd()` executions via `/*turbopackIgnore: true*/`. This prevents the Next.js Vercel build from attempting to bundle our dynamic `/content` directory into edge lambda dependencies.

## 5. Next Steps for Developer
You are clear to begin extracting `apps/web` HGO routes into a dedicated `apps/hgo-web` microservice if desired. The JSON packet API provides a flawless network boundary to do so. You may also begin implementing the `HgoPublicCoachingPacket` using the exact same architectural pattern.
