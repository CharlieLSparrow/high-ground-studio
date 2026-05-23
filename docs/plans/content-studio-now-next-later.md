# Content Studio Now / Next / Later

Date: 2026-05-23

## Now

- Keep `/content-studio` private inside `apps/studio`.
- Use browser-local state for the first working board.
- Make podcast, book, and episode-page projects the primary defaults.
- Keep monetization and coaching visible as secondary follow-through lanes.
- Keep the first provider-neutral spine and capability contract in `packages/content-studio-domain`.
- Preserve current manuscript, structure, writing, and HGO staged projection boundaries.
- Keep WorldHub as the business/access follow-through layer, not the creative source layer.
- Export a JSON handoff packet with safety flags.
- Deploy coherent Studio slices to the existing private Cloud Run service when
  validation passes and gcloud credentials are available.
- Keep coordination lightweight through:
  - `docs/coordination/agent-board.md`
  - `docs/coordination/progress-thread.md`

## Next

- Add a real content-project packet model when the first workflow stabilizes: project, source, research note, quote/example, principle, outline, draft, production task, schedule item, publishing target, review state, and agent task packet.
- Extend the pure domain package only when a field is needed by a real workflow or test.
- Decide whether persistence should be Prisma-backed Studio state, an API
  boundary, or a small service.
- Connect episode-page projects to HGO staged artifact review without automatic
  public publishing.
- Connect podcast projects to Studio Cut media package state.
- Connect follow-through ideas to WorldHub offers, supporter, merch, Patreon,
  and coaching concepts.
- Add focused tests for packet creation, safety flags, and export/import.
- Add a Studio browser smoke for `/content-studio`.
- Add an automatic Cloud Build trigger after the current one-command deploy path
  proves stable.

## Later

- Shared multi-device project state.
- Multi-user project collaboration.
- Podcast-host metadata/export packages.
- Direct media hosting architecture.
- Provider adapters for Patreon, merch/POD, social, analytics, email, and
  podcast distribution.
- Kindle/Audible export packages.
- Production queues for provider publishing or fulfillment.
- Quipsly quote/principle/example API adapter.
- Research assistant task runner.
- Content calendar persistence.
- Service extraction where a separate release/deploy boundary buys speed or
  reliability.
- Production database schema changes with migration and rollback plans.

## Fast-Approval Rule

If a database update, API, service boundary, or deployment is the smallest
correct move, ask for that approval directly and keep going. Do not turn
coordination into a bottleneck and do not force a monolith shape just to avoid
infrastructure work.
