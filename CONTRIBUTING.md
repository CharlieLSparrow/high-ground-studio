# Contributing

Thank you for helping build Quipsly. The best contribution is a small,
reviewable improvement to a real user workflow with evidence that the visible
surface works.

## Before your first change

1. Read the root [README](README.md).
2. Follow [Development](docs/development/README.md) for toolchain and local setup.
3. Locate the owning surface in the
   [product and repository map](docs/architecture/product-and-repository-map.md).
4. Read the relevant architecture decision and release runbook.
5. Run `node scripts/ci/audit-repository-contract.mjs`.

Ask before starting work that changes licensing, user-data retention, public
APIs, authentication providers, production infrastructure, payment behavior,
or repository boundaries.

## Branch and change scope

- Branch from current `main`.
- Use `feature/<short-name>`, `fix/<short-name>`, `docs/<short-name>`, or
  `chore/<short-name>`.
- Keep one pull request to one user outcome or infrastructure contract.
- Include every dependency required to prove the slice; exclude unrelated
  cleanup.
- Do not mix generated evidence, recordings, renders, caches, or local secrets
  into source changes.

Capture and Nest share product contracts. A cross-surface change is welcome
when the contract, both consumers, and their tests move together.

## Local workflow

```bash
corepack enable
pnpm install --frozen-lockfile
node --test scripts/ci/audit-repository-contract.test.mjs
node scripts/ci/audit-repository-contract.mjs
node --test scripts/ci/plan-changed-surfaces.test.mjs
```

Run the checks for every affected surface from
[Testing and proof](docs/development/testing.md). Operate the visible app when
the change affects user behavior.

For a Nest or High Ground web change, run the same dependency-closed gates used
by pull-request CI:

```bash
pnpm quipsly:contracts:test
pnpm quipsly:release:local
```

The local release gate builds both web surfaces because their handoff and data
contracts move together. It uses a non-production build-only database URL when
none is configured; database readiness is reported separately and is not
claimed by that fallback. The command never deploys or moves production
traffic.

For visible Nest work, also run the persistent local stack:

```bash
pnpm quipsly:local:up
pnpm quipsly:local:doctor
pnpm quipsly:local:smoke
pnpm quipsly:local:down
```

Create or change a real synthetic record, reload it, and exercise its next
state—not only its empty screen. A passing build cannot substitute for that
operated proof. Physical-iPhone, TestFlight, App Store Connect, credentialed
cloud, and production-traffic claims each require their own target readback.

## Commits

- Prefer short, imperative subjects such as
  `fix(capture): preserve failed upload recovery`.
- Use explicit-path staging and inspect `git diff --cached`.
- Do not commit credentials, `.env` files, production exports, user recordings,
  private notes, client data, or App Store Connect keys.
- Do not rewrite shared branch history without maintainer coordination.

## Pull requests

Complete the pull-request template with:

- the user workflow and affected surface;
- source-of-truth and provenance impact;
- commands run and visible runtime proof;
- persistence/save/reload evidence when applicable;
- auth, privacy, schema, media, and release risk;
- screenshots or recordings only when they contain synthetic or approved data;
- follow-up work that is intentionally outside this slice.

Reviewers should be able to reproduce the claimed proof from committed source.

## Documentation

Update durable documentation in the same pull request when a change alters:

- system or data boundaries;
- developer setup;
- environment variables;
- a release or rollback procedure;
- authentication, authorization, storage, or privacy behavior;
- a cross-surface contract.

Use an architecture decision record for choices that are expensive to reverse.
See [Architecture decisions](docs/decisions/README.md).

## Reporting problems

Use the issue templates for reproducible bugs and bounded feature proposals.
Do not place vulnerability details, secrets, private recordings, or personal
data in an issue. Follow [SECURITY.md](SECURITY.md) for security reports.
