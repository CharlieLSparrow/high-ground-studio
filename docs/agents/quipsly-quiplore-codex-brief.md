# Quipsly / QuipLore Codex Brief

Date: 2026-05-25

Use this brief when starting Quipsly or QuipLore work in this repo.

## Read First

1. `AGENTS.md`
2. `docs/project-context/current-state.md`
3. `docs/architecture/platform-service-boundaries.md`
4. `docs/architecture/tagged-source-projection-architecture.md`
5. `docs/architecture/worldhub-foundation.md`
6. `docs/architecture/quipsly-quiplore-foundation.md`
7. `docs/plans/quipsly-quiplore-now-next-later.md`
8. `docs/coordination/agent-board.md`

## Camp

Start from a fresh branch off current `origin/main`.

Suggested branch:

```bash
git switch -c codex/quipsly-quiplore-foundation-001 origin/main
```

If another worktree is active, check `git worktree list` before choosing a
path. Do not build the first Quipsly/QuipLore slice on top of the existing
Content Studio persistence supervisor branch unless the integration captain
explicitly takes that dependency.

## Intended File Ownership

First implementation lane should own only:

- `apps/quiplore`
- `apps/quipsly-api`
- `apps/quipsly-worker` when needed later
- `packages/quipsly-domain`
- Quipsly/QuipLore docs under `docs/architecture`, `docs/plans`, `docs/runbooks`,
  and `docs/agents`
- later Quipsly/QuipLore-specific scripts and Cloud Build files

Avoid without explicit handoff:

- `apps/web`
- `apps/studio`
- `packages/worldhub-domain`
- `packages/content-studio-domain`
- `prisma/schema.prisma`
- current HGO content directories
- deployment files for existing `web` and `studio` services

## Product Intent

QuipLore is the public quote platform.

Quipsly is the agent/API/research/database/media layer that powers QuipLore and
future apps.

The surface should feel warm, literary, tactile, and inviting, but the data
model must behave like a serious source archive.

## Visual Rules

Carry these forward until image assets or a stronger visual handoff replaces
them:

- warm storybook archive
- paper cards and field-note details
- brown or near-black ink
- muted green, restrained gold, occasional plum
- evidence/status UI with enough contrast to avoid a one-color parchment app
- Quipsly-only visual representation for people pages by default
- no real human portraits as the default person-page treatment
- no hustle-poster quote cheese
- no generic AI-gradient product look
- no source-trust compromises for mascot charm

When image files arrive, extract:

- palette
- typography direction
- shape language
- icon style
- illustration style
- motion rules
- anti-patterns
- reusable component motifs

Then update `docs/architecture/quipsly-quiplore-foundation.md`.

## First Build Order

1. Create `packages/quipsly-domain`.
2. Create `apps/quiplore`.
3. Add static seed records shaped like future source-backed quote data.
4. Build Quip Card.
5. Build Quote Passport page.
6. Build quotable person page.
7. Build Lorelist page.
8. Build QuipStream prototype.
9. Add QuipStream impression/action event logging, even if only in memory at
   first.
10. Draft Quipsly API/database proposal.
11. Only then add Quipsly API, worker, database, and Cloud Run scaffolding.

## Data Rules

Model verification around the relationship between:

- quote text
- attribution
- source
- evidence
- review state

Do not model verification as a boolean on quote text alone.

A quote can be verified in one wording, disputed in another, and misattributed
in a third. Preserve those distinctions.

## Google Cloud Rules

Quipsly and QuipLore should be Google Cloud native, but do not mutate cloud
state in the first docs/prototype pass.

Expected future services:

- Cloud Run `quiplore`
- Cloud Run `quipsly-api`
- Cloud Run Job or worker `quipsly-worker`
- dedicated Cloud SQL database/user for Quipsly
- app-specific Secret Manager entries
- app-specific service accounts
- Artifact Registry images
- Pub/Sub or Cloud Tasks for async work
- Cloud Storage for source/import artifacts

Do not reuse `web-*` or `studio-*` service accounts, secrets, deploy scripts, or
Cloud Run service names.

## Validation

For docs-only work:

```bash
git diff --check
```

For a future package-only domain slice:

```bash
pnpm --filter @high-ground/quipsly-domain typecheck
```

For a future QuipLore app slice:

```bash
pnpm --filter quiplore build
```

Add precise scripts once the package/app manifests exist.

## Handoff Requirement

If a Quipsly/QuipLore session makes a stable decision, update the durable docs.

Prefer:

- architecture decisions in `docs/architecture/quipsly-quiplore-foundation.md`
- sequence changes in `docs/plans/quipsly-quiplore-now-next-later.md`
- operator instructions in `docs/runbooks/*`
- current-agent startup guidance in this brief

Do not leave important product or infrastructure decisions only in chat.
