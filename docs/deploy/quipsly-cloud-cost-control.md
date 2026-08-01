# Quipsly cloud cost control

Quipsly's release system optimizes for trustworthy evidence and bounded spend.
A local or simulator checkpoint does not automatically justify a new cloud
image. Normal product work is accumulated into coherent release candidates;
urgent security or production-recovery changes are explicit exceptions.

## Cost ownership

The main deployment-driven services are:

- **Cloud Build** — container build minutes. The Nest build has historically
  used `e2-highcpu-32`, the highest-cost default-pool worker class.
- **Artifact Registry** — immutable release images plus the BuildKit cache.
  Timestamped tags and repeated builds retain additional versions.
- **Cloud Run** — request compute, tagged preview revisions, jobs, and any
  configured minimum instances.

Cloud SQL is the persistent product database, not a per-deploy charge. Gemini
API usage is model traffic, not a container deployment. Those services need
their own capacity, quota, and retention decisions.

## Release cadence

Ordinary Quipsly work follows this cadence:

1. Build and test locally throughout a vertical slice.
2. Commit and push coherent checkpoints without deploying each checkpoint.
3. Create a cloud preview when the slice is ready for production-boundary
   acceptance, when a live dependency must be tested, or when production needs
   repair.
4. Reuse the exact committed-source image for preview retries, repeated smoke,
   and promotion.
5. Promote only after authenticated preview, privacy, immutable source/image,
   and cleanup readback pass.

There is no correctness benefit in rebuilding the same commit under a new
timestamp. `quipsly-deploy-preview.sh` now defaults to
`source-<full-commit-sha>` and reads back the registry digest before deciding
whether Cloud Build is needed. `REUSE_EXISTING_IMAGE=0` remains an explicit
diagnostic escape hatch; it is not the routine release path.

## Build worker benchmark

The current safe default remains `e2-highcpu-32` until one real non-urgent
release proves a smaller worker. The deploy command accepts a validated
override:

```bash
CLOUD_BUILD_MACHINE_TYPE=e2-highcpu-8 \
SOURCE_REF=COMMITTED_SHA \
bash scripts/release/quipsly-deploy-preview.sh
```

Compare total wall time, billed build minutes, success, peak-memory behavior,
cache reuse, and total estimated cost. The smaller worker is one-quarter of
the current per-minute list price in `us-central1`; it is a savings only if it
finishes reliably in less than four times the duration. Do not lower Node's
memory ceiling or weaken route/build verification merely to make a smaller
worker appear successful.

[Current Cloud Build pricing](https://cloud.google.com/build/pricing)

## Read-only cost audit

The audit reads the previous 30 days of Cloud Build, Artifact Registry, and
Cloud Run state. It estimates build compute from current public list prices,
counts repeated committed-source builds, resolves traffic-serving revision
digests, inventories old/tagged/untagged images, and reads existing cleanup
policies. It performs no mutation.

```bash
cd /Users/wall-e/Dev/high-ground-studio-product
pnpm quipsly:cloud:cost-audit -- --days 30
```

For a create-only private receipt:

```bash
pnpm quipsly:cloud:cost-audit -- \
  --days 30 \
  --output '/Volumes/My Passport/Quipsly QA Artifacts/Cloud Cost/audit-YYYYMMDD.json'
```

The report refuses to imply cleanup safety when a traffic-serving digest cannot
be resolved.

## Artifact cleanup policy

Do not delete images ad hoc. After credentialed readback:

1. Resolve every traffic-serving and intentionally retained rollback revision
   to its image digest.
2. Inventory package/version age, tags, known size, and the moving BuildKit
   cache tag.
3. Draft both keep and delete policies. Keep rules must win for release and
   rollback identities.
4. Apply the policy in **dry-run** mode first.
5. Review Artifact Registry dry-run audit logs after the background evaluator
   runs.
6. Ask for explicit confirmation immediately before enabling deletion.
7. Re-run production health, digest, rollback, and repository-size readback
   after cleanup.

Google documents that keep rules take precedence over delete rules and that
cleanup is asynchronous. A policy change is external state; active deletion is
destructive.

- [Artifact Registry cleanup overview](https://cloud.google.com/artifact-registry/docs/repositories/cleanup-policy-overview)
- [Configure Artifact Registry cleanup policies](https://cloud.google.com/artifact-registry/docs/repositories/cleanup-policy)

## Cloud Run, SQL, and Gemini

- Keep Cloud Run request-based and `minScale=0` unless measured latency makes a
  warm instance worth its idle charge. Increase concurrency only after the
  application and database pool are proven safe under parallel requests.
- Keep zero-traffic preview revisions short-lived at the operational layer, but
  never delete the live or selected rollback evidence merely to make a chart
  smaller.
- Inventory both similarly named Google Cloud projects before changing Cloud
  SQL. Consolidate accidental duplicate infrastructure; do not schedule the
  production database off while Nest depends on it.
- Give Gemini separate budgets, quotas, request caching, and per-feature usage
  receipts. A model-spend spike should not be diagnosed as a release-pipeline
  issue.

[Cloud Run pricing and free-tier behavior](https://cloud.google.com/run/pricing)

## Current measured state — 2026-08-01

Credentialed readback of `high-ground-odyssey` found:

- 111 builds in 30 days: 87 succeeded, 18 failed, and 6 were canceled;
- 83 `E2_HIGHCPU_32` builds with an estimated $36.14 of the $37.77 priced
  build-compute total;
- 14 Artifact Registry packages and 927 versions, including 177 untagged and
  536 older than 30 days;
- approximately 229 GB across versions with reported sizes;
- 396 Cloud Run revisions, only two traffic-serving revisions, and zero
  minimum instances; and
- four repeated committed-source build groups detected from available source
  identities.

The repository still exposed a second timestamp-tag deployment path through
package scripts, the HGO/Quipsly conductor, readiness output, and coaching
runway. Those entry points now route through the single committed-source Nest
preview pipeline. HGO web and the GitHub Studio workflow also read back the
exact source tag before deciding to build. Registry errors fail closed instead
of being treated as a missing image.

Artifact Registry now has this conservative policy in **dry-run** mode:

- evaluate only untagged versions older than 45 days for deletion; and
- keep at least the ten newest versions of every package.

Dry-run cannot delete artifacts. Wait at least one day and inspect
`validateOnly=true` audit logs before considering active cleanup. Active
deletion still requires exact traffic/rollback digest protection and explicit
approval.

```bash
pnpm quipsly:cloud:cleanup-dry-run
pnpm quipsly:cloud:cleanup-dry-run -- --apply-dry-run
```

The first command is plan-only. The second can only configure dry-run; the
operator intentionally has no active-deletion flag.
