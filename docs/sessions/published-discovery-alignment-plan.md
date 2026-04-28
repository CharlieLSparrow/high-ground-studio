# Published Discovery Alignment Plan

Date: 2026-04-27

Scope:
- Inspect the published content directory, the discovery metadata arrays, and the consuming routes/components.
- Document the current split between published page source and published discovery surfaces.
- Update broader docs only where that split should be called out more clearly.

Verified inspection targets:
- `apps/web/content/publish`
- `apps/web/src/lib/site.ts`
- `apps/web/src/lib/reading.ts`
- `apps/web/src/app/library/page.tsx`
- `apps/web/src/components/home/FeaturedEpisode.tsx`
- `apps/web/src/components/home/EpisodeFeed.tsx`
- `apps/web/src/app/episodes/[[...slug]]/page.tsx`

Plan:
1. Document what currently feeds live page content.
2. Document what currently feeds discovery surfaces.
3. Explain where drift can happen and what must be updated together.
4. Record the lowest-risk future options for reducing drift without changing app behavior in this pass.
