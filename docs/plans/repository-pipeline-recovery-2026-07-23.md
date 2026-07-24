# Repository and pipeline recovery

**Date:** 2026-07-23
**Decision:** Keep the product source together for now; remove binary assets,
legacy automation, and unrelated validation from the critical path before
considering source-repository splits.

## Executive decision

The main problem is not that Quipsly, Capture, Studio, and High Ground Odyssey
share a repository. The main problem is that the checkout currently has no
enforced operational boundaries:

- `5,581` tracked files occupy about `459.2 MiB`;
- `403.8 MiB` of the current tracked tree is PNG data;
- `409` duplicate current-tree paths account for about `203.3 MiB` of duplicate
  checkout bytes, even though Git deduplicates identical blobs internally;
- `.git` is about `1.1 GiB`;
- the worktree has `991` changed paths: `224` modified, `5` deleted, and `762`
  untracked;
- `507` dirty paths are under `apps/QuipslyStudio` and `252` are under
  `apps/quipsly`;
- there are `61` local branches;
- no `.gitattributes` or Git LFS policy exists;
- PR CI builds Quipsly for every pull request;
- two GitHub workflows react to deployable web changes, while the older
  `deploy.yml` builds both web images even when only one app changed.

The existing exact-commit Quipsly release context is a good safety boundary,
but its current measured payload is still `919` files and `247.9 MiB`. Most of
that is app imagery, so a bounded context alone does not solve transfer, build,
or checkout weight.

Splitting the source today would distribute those unresolved states across
multiple repositories. It would not create clean ownership, API versioning, or
release truth.

## Target repository boundaries

### Keep together during product convergence

Keep these in the current product monorepo until their shared contracts are
versioned:

- `apps/mobile-capture/HighGroundCapture`;
- `apps/quipsly`;
- `packages/quipsly-domain`;
- `packages/quipsly-document-kernel`;
- the Prisma schema and migrations used by Nest;
- shared Capture↔Nest auth, session, source, tag, task, goal, and transcript
  contract tests.

Capture and Nest are one user workflow. Separating them before the API and
offline-sync contracts are explicit would make cross-surface changes slower
without making releases safer.

### Extract from the critical path

The first extraction should be binary visual assets, not application code.

`apps/quipsly` contains about `234.8 MiB` of PNGs and only about `6.3 MiB` of
TypeScript/TSX. `apps/quiplore` contains about `103.5 MiB` of PNGs and less than
`1 MiB` of application source. Identical reference images also appear beneath
application and documentation paths.

Move canonical originals to a versioned asset store or dedicated visual-assets
repository, then keep only:

- optimized shipping derivatives actually required by each app;
- stable asset identifiers and manifests;
- source/license/provenance metadata;
- checksums and deterministic derivative-generation instructions.

Do not rewrite Git history during active Capture/TestFlight work. First stop
adding new binary originals, migrate current references with readback, then
perform any history rewrite as a separately backed-up maintenance operation.

### Candidate later source splits

Consider a source split only when all of these are true for the candidate:

1. it has an independent release cadence and owner;
2. its cross-repository API is versioned and contract-tested;
3. local development does not require unpublished sibling source;
4. deployment and rollback no longer consume the root lockfile accidentally;
5. history can be extracted and verified without losing active WIP.

Likely candidates, in order:

1. Quiplore/visual asset production;
2. QuipslyStudio native media tooling after its document/session handoff
   protocol is stable;
3. High Ground Odyssey public web after the Quipsly coaching and episode
   handoffs are fully API-owned.

Capture and Nest should be the last pair considered for separation, not the
first.

## Pipeline architecture

Each surface gets four independent proofs:

1. **Source scope:** exact committed paths and declared dependencies.
2. **Deterministic validation:** unit/type/build/simulator checks that do not
   require credentials or mutable production state.
3. **Credentialed runtime:** separate-account auth, authorization, persistence,
   and reload checks against the intended environment.
4. **Delivery readback:** physical device, TestFlight, Cloud Run revision, or
   published artifact proof.

One green stage cannot substitute for another.

### Immediate corrections

- Keep the bounded, exact-commit Quipsly Cloud Run context.
- Keep the exact-commit Capture archive, IPA verifier, and receipt.
- Make PR Quipsly install/typecheck/build conditional on changes to its declared
  release slice.
- Use the validated per-app manifests in `release/manifests` as the source of
  truth consumed by `scripts/ci/plan-changed-surfaces.mjs` for PR validation
  and automatic Cloud Run deploy planning. Shared packages follow declared
  runtime and build consumers; root dependency changes no longer invent a
  database migration.
- Materialize `scripts/release/quipsly-build-context.sh` from the exact GitHub
  source SHA before building the Nest production image. The Docker build now
  consumes that source-labeled context instead of the checkout root and embeds
  the GitHub SHA as `QUIPSLY_BUILD_ID`.
- Run Capture's 24-scenario deterministic UX suite only for Capture pull
  requests on GitHub's `macos-26` runner, with Xcode 26.2 and the iOS 26.2
  iPhone 17 Pro simulator pinned explicitly. Preserve the `.xcresult` and build
  log for 14 days even when the test fails.
- Make the old GHCR image workflow manual-only; Cloud Run
  `deploy-cloud-run.yml` remains the automatic production path.
- Keep deterministic Capture UI tests separate from reviewer credentials,
  physical-device tests, and TestFlight-installed tests.
- Require the Cloud auth preflight to call Firebase Admin, not merely mint an
  ADC token.
- Remove `70` zero-reference generated-art files (`120.3 MiB`) and retain their
  pushed recovery anchor at `f04cc42`.
- Convert the `10` live generated-art PNGs from `20.1 MiB` to `1.3 MiB` of
  dimension-identical WebP shipping derivatives.
- Enforce a repository-wide pull-request budget: no new or growing binary asset
  may exceed `1 MiB`, and total positive binary checkout growth may not exceed
  `5 MiB`. Renames and reductions of oversized legacy assets remain allowed.

### Next corrections

- Replace root-lockfile fan-out with dependency-aware affected-package
  calculation.
- Add product-specific collaborators to the checked-in CODEOWNERS surface map
  as write access and durable review responsibility are granted.
- Enable protected `main` merges and required checks in GitHub after the new
  collaborator and affected-surface checks land on the default branch.
- Make each app's validated release manifest drive its materializer and
  delivery pipeline, not only affected-surface planning.
- Store generated proof artifacts outside source paths and expire them by
  policy.
- Add a worktree-health check that reports, but does not delete, unexpected
  generated files and cross-surface dirty state.

### Recovery checkpoint: 2026-07-24

The worktree-health control is now implemented as a TypeScript 7 package and
root command:

```bash
pnpm repo:health --surface <surface>
pnpm repo:health:strict --surface <surface>
```

Its first real-checkout inventory reported `621` dirty paths: `68` unstaged and
`553` untracked. Ownership was `512` QuipslyStudio, `3` Nest, `2` HGO web, `78`
repository, and `26` other paths. It identified five generated-evidence files
and one large untracked file without moving or deleting anything. The
repository-wide TypeScript 7 gate passed all `22` configured projects after
the governance package was added.

This measurement supersedes the older dirty-worktree count for recovery
planning but does not imply that the remaining paths are disposable. At this
checkpoint, the next control was one machine-readable release manifest per
deployable app, followed by preserve-first reconciliation of the inventoried
product slices.

The manifest/materializer control is complete for Nest and HGO web: both
materialize bounded source from an exact commit, HGO no longer submits the
repository root, and its deterministic predeploy checks run inside that source
context. Capture retains its separate exact-commit Xcode archive boundary.

### Clean continuation checkpoint: 2026-07-24

Recovery no longer depends on making the accumulated worktree clean before
product work can continue. The committed product state was branched into the
separate `codex/quipsly-product-20260724` worktree while the legacy checkout
remained untouched for preserve-first reconciliation.

The new worktree proves all of the following from committed source:

- strict worktree health reports `0` staged, `0` unstaged, and `0` untracked
  paths;
- `pnpm install --frozen-lockfile` installs all `22` workspace projects;
- dependency build-script decisions are explicit in `pnpm-workspace.yaml`, so
  a collaborator does not inherit a silent skipped-build warning;
- all `22` tracked TypeScript projects pass the pinned TypeScript `7.0.2`
  authority;
- all four release manifests remain valid and ownership-complete;
- the focused Nest search, task-edit, receipt, model, and UI suite passes from
  the clean worktree.

Use the clean product worktree for new dependency-closed slices and release
materialization. Use the legacy worktree only to inventory, preserve, and
reconcile its remaining `611` ambient paths. Do not copy its untracked source
wholesale into the product branch or treat the new worktree as permission to
delete the old one.

### Collaborator readiness

The repository now treats onboarding and governance as tested interfaces:

- the root README describes the real Capture → Nest → Studio → HGO product;
- contribution, security, support, conduct, ownership, issue, and pull-request
  contracts live at GitHub-recognized paths;
- Node, pnpm, text, and binary file behavior are pinned;
- architecture, development, testing, decision, release, and governance
  entrypoints form one maintained documentation path;
- Dependabot covers pnpm, GitHub Actions, Capture Ruby tooling, and the Nest
  Dockerfile;
- `scripts/ci/audit-repository-contract.mjs` validates required files, local
  documentation links, ownership coverage, pull-request headings, and toolchain
  pins on every pull request.

Live GitHub settings remain a separate administrative gate. CODEOWNERS and
workflow files do not themselves enable branch protection, required reviews,
private vulnerability reporting, or automatic branch updates.

## Git recovery sequence

1. Preserve current work by coherent surface, using explicit-path commits and
   immutable backup/readback for media.
2. Run `pnpm repo:health --surface <surface>` and use its path inventory; do not
   run broad `git add`, `reset`, `clean`, or branch deletion.
3. Reconcile the Nest WIP as one dependency-closed slice: routes, domain code,
   migrations, tests, reviewer tooling, and docs must pass together.
4. Reconcile QuipslyStudio by feature vertical, not by file extension or one
   giant “all current work” commit.
5. Classify remaining untracked paths as source, durable docs, generated
   evidence, or disposable cache; add ignore rules only for the last two.
6. Archive merged/stale branches only after their unique commits are inventoried
   and recovery refs are pushed.
7. Migrate visual assets with checksum and application readback before deleting
   any existing copy.

## Definition of recovered

The repository is operationally recovered when:

- the normal worktree is under `50` intentional dirty paths during an active
  slice and returns to clean after handoff;
- a Capture-only change does not install/build/deploy Nest;
- a Nest-only change does not build public HGO or legacy GHCR images;
- each production artifact identifies its exact source revision and dependency
  manifest;
- visual originals are not multiplied across app and docs paths;
- every remaining local branch has an owner, purpose, and archive/delete
  decision;
- clean clones can run the documented local and release paths without relying
  on untracked source;
- a new collaborator can find the owning surface, start the local lane, select
  the required proof, open a complete pull request, and report security issues
  without private oral history.

This is the point at which a repository split becomes an architectural choice
instead of an emergency response to an unhealthy checkout.
