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
diagnostic assertion, but it cannot overwrite an existing canonical source
tag. Once `source-<full-commit-sha>` exists, the routine path reuses it and the
override fails closed; a distinct binary requires a distinct commit identity.

The dedicated transcript-worker release follows the same rule. Its default tag
is the full committed source SHA, registry failures fail closed, and an existing
verified image is reused before deploying the Cloud Run Job by digest.

## Build worker and release cadence

Ordinary Nest builds default to `e2-highcpu-32`. An Aug 2 exact-source
`e2-highcpu-8` build compiled successfully, then spent more than 20 minutes in
TypeScript before receiving `SIGKILL`, consistent with worker memory pressure.
That failed
attempt cost approximately as much as a complete 32-core build. The primary
savings therefore come from committed-image reuse and the cadence gate, while
the worker default favors a reliable completed artifact. The smaller worker
remains an explicit diagnostic option after peak build memory is reduced:

```bash
CLOUD_BUILD_MACHINE_TYPE=e2-highcpu-8 \
SOURCE_REF=COMMITTED_SHA \
bash scripts/release/quipsly-deploy-preview.sh
```

New successful Nest image builds are also separated by a 72-hour default
cadence. Exact-source image reuse, local testing, failed-build retries, preview
smoke, and promotion do not consume this interval. An urgent production repair
can use `ALLOW_EARLY_CLOUD_BUILD=1`; using that override for routine checkpoint
deployment violates the release contract. The interval can be changed with
`MIN_CLOUD_BUILD_INTERVAL_HOURS`, including `0` for a deliberately unthrottled
diagnostic run.

[Current Cloud Build pricing](https://cloud.google.com/build/pricing)

## Read-only cost audit

The audit reads the previous 30 days of Cloud Build, Artifact Registry, and
every Cloud Run service in the selected region. It estimates build compute from
current public list prices, counts repeated committed-source builds, resolves
all traffic-serving revision digests, inventories old/tagged/untagged images,
reports minimum instances per service, and reads existing cleanup policies. It
performs no mutation.

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
  warm instance worth its idle charge. The project-wide audit must report every
  service so a warm auxiliary service cannot be hidden by checking only Nest.
  Increase concurrency only after the application and database pool are proven
  safe under parallel requests.
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
- 492 Cloud Run revisions, seven traffic-serving revision digests across four
  services, and zero minimum instances; and
- four repeated committed-source build groups detected from available source
  identities.

The first version of this audit scoped Cloud Run readback to `studio`, so its
"zero minimum instances" result did not cover `studio-collab`. A project-wide
readback found that the idle collaboration service had retained
`minScale=1` since May despite no request logs in the preceding 30 days. On
2026-08-01 it was changed to `minScale=0`; its existing image, `maxScale=1`,
3600-second WebSocket timeout, Cloud SQL attachment, service account, public
invoker posture, IAM policy, and 100% traffic contract were preserved. The
replacement revision passed `/health`, and no Cloud Build ran.

The production database is one zonal PostgreSQL 16 Cloud SQL instance using
the smallest shared-core `db-f1-micro` tier, 10 GB HDD storage, seven retained
backups, and deletion protection. Its charge is a persistent database baseline,
not deployment churn. Stopping it or weakening backups would save money by
making production unavailable or less recoverable, so no database cost change
was made.

The red **HighGroundOdyssey** billing row is project
`gen-lang-client-0819080752`. It has only Cloud DNS and the Generative Language
API enabled. Its single API key is restricted to the Generative Language API
and supplies Quipsly's server-side `GEMINI_API_KEY`; that $17.34 is model usage,
not Cloud Build or deployment spend. Future optimization belongs in per-feature
AI metering, caching, quotas, and model selection rather than the release
pipeline.

## Follow-up readback — 2026-08-02

The next credentialed, read-only 30-day audit found 113 builds: 88 succeeded,
19 failed, and 6 were canceled. Estimated priced build compute was $38.14;
83 `E2_HIGHCPU_32` builds account for $36.14 of that estimate. Only two builds
were newer than the prior snapshot: one successful schema image and one failed
non-urgent `E2_HIGHCPU_8` qualification. No cloud build was triggered by this
readback or by the local product work documented here.

The smaller-worker history is now explicit in the audit receipt: 2 successes,
7 failures, and 3 cancellations in 30 days. Because failed attempts still cost
money, the audit no longer recommends buying another smaller-worker benchmark
when non-successes outnumber successes. It recommends retaining the reliable
32-core worker for the comparatively infrequent required image and reducing
peak build memory before another qualification.

The cost controls are measurably reducing retained infrastructure:

- all four Cloud Run services have zero minimum instances;
- Artifact Registry has two cleanup policies and fell from 927 to 477 versions;
- versions older than 30 days fell from 536 to 84;
- the audit found no version currently eligible under the protected 45-day /
  keep-10-per-package policy; and
- exact-source reuse remains the remaining release-churn recommendation, with
  four repeated committed-source builds in the 30-day window.

The private read-only receipt is
`/private/tmp/quipsly-cloud-cost-audit-20260802-postfix-1785723585.json`.
It records zero artifact deletion, cleanup-policy change, service change,
database change, or other mutation by the audit itself.

The repository still exposed a second timestamp-tag deployment path through
package scripts, the HGO/Quipsly conductor, readiness output, and coaching
runway. Those entry points now route through the single committed-source Nest
preview pipeline. HGO web and the GitHub Studio workflow also read back the
exact source tag before deciding to build. Registry errors fail closed instead
of being treated as a missing image.

Artifact Registry initially received this conservative policy in **dry-run**
mode. After provider-log review, explicit approval, and a retention-aware proof
that every traffic-serving digest survives, the policy was activated on
2026-08-02:

- evaluate versions older than 45 days for deletion, regardless of tag state;
  and
- keep at least the ten newest versions of every package.

Google applies cleanup asynchronously. The activation operator first proves
that every live digest survives the exact age/keep-ten policy, requires an
explicit confirmation value, and never directly deletes a named image or
repository. On the first post-activation readback, 452 versions (about 76.8 GB
of summed known manifest sizes) were eligible but had not yet been processed.

```bash
pnpm quipsly:cloud:cleanup-dry-run
pnpm quipsly:cloud:cleanup-dry-run -- --apply-dry-run
```

The first command is plan-only. The second configures dry-run. Active cleanup
uses the separately guarded `quipsly:cloud:artifact-cleanup:activate` operator.

## Live follow-up — 2026-08-02

Fresh credentialed readback found 113 builds in 30 days: 88 successful, 19
failed, and 6 canceled. Twelve `E2_HIGHCPU_8` attempts account for about $2.00
of estimated list-price compute; the historical 83 `E2_HIGHCPU_32` attempts
still account for $36.14. The latest 8-core exact-source Nest build received
`SIGKILL` after approximately 22 minutes, consistent with worker memory
pressure, so the reliable 32-core
default was restored while the 72-hour cadence and exact-image reuse remain.

Artifact Registry reports 152,454.130 MB, 929 versions, and active cleanup
(`Dry run is disabled`). The asynchronous evaluator has not yet reduced the
inventory. All five traffic-serving digests survive the retention policy. All
four Cloud Run services still report zero minimum instances.
