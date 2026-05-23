# Content Studio Now / Next / Later

Date: 2026-05-23

## Now

- Keep Studio private and deployable.
- Make the Content Management Studio spine visible at `/content-studio`.
- Keep the first provider-neutral spine and capability contract in
  `packages/content-studio-domain`.
- Preserve current manuscript, structure, writing, and HGO staged projection
  boundaries.
- Keep WorldHub as the business/access follow-through layer, not the creative
  source layer.
- Use static/sample planning state until the first persisted data model is
  clear.
- Keep all provider credentials, payment providers, social APIs, publishing
  APIs, and vendor calls out of the first shell.

## Next

- Define a provider-neutral content project model:
  - project
  - source
  - research note
  - quote/example
  - principle
  - outline
  - draft
  - production task
  - schedule item
  - publishing target
  - review state
  - agent task packet
- Extend the pure domain package only when a field is needed by a real workflow
  or test.
- Create a Homer-ready workflow slice:
  - content project intake
  - structured outline
  - draft or show-prep packet
  - schedule item
  - WorldHub follow-through note
- Add tests for pure model helpers before adding persistence.
- Add a safe browser/local persistence prototype if the workflow needs state
  before Prisma changes.
- Add a deployment smoke for `/content-studio` after Studio deploys with the
  route.

## Later

- Quipsly quote/principle/example API adapter.
- Research assistant task runner.
- Content calendar persistence.
- Social publishing adapters.
- Analytics and SEO adapters.
- Kindle/Audible export packages and eventual direct publishing integrations.
- Podcast and video editing integration points.
- Travel video asset/shot-list workflows.
- Patreon/supporter adapter through WorldHub.
- Merch/POD adapter through WorldHub.
- Coaching package/session follow-through through WorldHub.
- Production database schema changes with migration and rollback plans.

## Deployment Rule

Deploy Studio runtime changes when:

- local Studio typecheck/build passes
- the route is private or intentionally public
- no private source material is exposed
- no provider credentials or secrets are committed
- Cloud Run has a known rollback path

If the change depends on missing secrets, OAuth settings, paid resources, or a
production database mutation, stop at the exact blocker and document the
smallest safe next action.
