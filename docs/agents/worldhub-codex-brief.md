# WorldHub Codex Brief

Date: 2026-05-22

Use this brief for WorldHub task branches in this monorepo.

## Codex Sprint Expectations

WorldHub work should be treated as coherent senior-dev slices, not isolated
one-line patches. Inspect the relevant repo shape, make scoped decisions,
implement the slice, verify it, and report the result with enough operational
detail that ChatGPT / Chuck can continue without rediscovering context.

Keep the work narrow enough to review. A good WorldHub sprint can add docs,
pure package boundaries, sample-data admin shells, and verification scripts. It
should not jump straight into provider credentials, payment state, production
database mutation, or service extraction.

## Deploy-As-You-Build Preference

This is a solo-dev project. Deployment is part of building when the change
touches a deployable runtime surface and a safe existing deploy path exists.

Deploy only when:

- the repo already has an appropriate deploy script or runbook
- the change has passed relevant local verification
- no secrets, payment data, provider credentials, service accounts, or customer
  data are being committed
- no remote production database mutation is required without an explicit
  migration and rollback plan

If deployment needs paid or privileged resources, report the blocker and the
smallest safe next action instead of inventing a new path.

## Branch Strategy

- `project/worldhub` is the integration branch for coordinated WorldHub work.
- `codex/worldhub-*` branches are task branches for narrow slices.
- Start each task by confirming the current branch and working tree state.
- Keep task branches small enough to review against `project/worldhub`.
- Do not commit, push, or open a PR unless the operator explicitly asks.

## Required Files To Read

Read these before making WorldHub changes:

- `AGENTS.md`
- `docs/project-context/current-state.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/domain-model.md`
- `docs/architecture/platform-service-boundaries.md`
- `docs/architecture/worldhub-foundation.md`
- `docs/plans/worldhub-now-next-later.md`
- `docs/runbooks/local-dev.md`
- `docs/agents/codex-handoff.md`
- `docs/agents/worldhub-codex-brief.md`

For tasks touching auth, Prisma, content loading, build behavior, Studio, HGO
projections, or provider boundaries, read the most relevant existing architecture
or session note before editing.

## Allowed First Tasks

Early WorldHub work should be reversible and boundary-focused.

Allowed first tasks:

- architecture docs
- current-state audits grounded in the checkout
- provider-neutral domain model proposals
- package seam proposals
- pure type/helper scaffolds that stay provider-neutral
- sample-data admin shells behind existing internal auth boundaries
- tests for pure helpers only after a package seam is intentionally created
- read-only mapping of current `apps/web` workflows to future WorldHub nouns
- docs updates that explain what is real, what is planned, and what is blocked

## Forbidden Early Tasks

Do not do these in early WorldHub foundation work:

- implement Stripe Checkout
- add a Stripe dependency
- add Stripe webhook routes
- call Patreon APIs
- call POD vendor APIs
- add Shopify, Printful, Printify, Gelato, Fourthwall, or similar integrations
- change `prisma/schema.prisma`
- change runtime behavior in `apps/web`
- change runtime behavior in `apps/studio`
- move coaching workflows out of `apps/web`
- turn WorldHub into a new repo
- split WorldHub into microservices
- deploy without a safe existing deploy path
- store provider credentials
- create a production fulfillment worker
- create an embed SDK before the embed contract is designed

## Recommended Verification Commands

Start with:

```bash
git status --short --branch
```

For docs-only changes:

```bash
git diff --stat
```

When dependencies and env allow it, run:

```bash
pnpm --filter web build
```

If a change touches Studio boundaries or Studio code, run:

```bash
pnpm --filter studio typecheck
```

For meaningful `apps/web` runtime changes in later passes, also consider:

```bash
pnpm --filter web exec next build --webpack
```

Do not run Prisma mutation commands unless the task explicitly includes schema
or database work and the database target has been confirmed safe.

## How To Summarize Back To ChatGPT / Chuck

Report in this shape:

- branch and whether the worktree was clean before edits
- files changed
- concise summary of the content or behavior changed
- commands run
- failures, skipped checks, or env blockers
- explicit statement that no commit, push, deploy, schema change, provider
  integration, or runtime behavior change happened when that is true
- live URL or exact deploy blocker when a runtime surface changed
- rollback command
- suggested next step

If a conclusion is architecture-important and likely to matter again, promote it
into `docs/` instead of leaving it only in chat.
