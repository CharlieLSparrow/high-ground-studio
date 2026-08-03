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

## Cloud Build source uploads

`gcloud builds submit` uploads a reconstructable source archive to the
dedicated `high-ground-odyssey_cloudbuild` bucket before each build. These are
not release images, build logs, product media, or database backups. The bucket
uses a prefix-bounded lifecycle that expires only `source/` objects after seven
days. The checked-in operator audits the bucket first and requires an exact
activation phrase; it never directly deletes an object:

```bash
pnpm quipsly:cloud:build-source-retention
```

Keeping seven days supports recent build diagnosis while Git plus immutable
release images remain the durable source and binary evidence.

The upload bucket is intentionally different from a backup or media bucket.
Its contents are temporary, reconstructable Git source archives, so its normal
seven-day lifecycle must not be followed by a second seven-day soft-delete
window. Audit and disable only that bucket's redundant recovery window with:

```bash
CONFIRM_CLOUD_BUILD_SOURCE_SOFT_DELETE=disable-high-ground-odyssey-cloudbuild-soft-delete \
  bash scripts/release/quipsly-cloud-build-source-retention.sh \
  --disable-soft-delete-after-audit
```

The operator proves that every live object is under `source/`, does not directly
delete an object, and verifies the live bucket readback. Clearing soft delete
does not purge objects already in the soft-deleted state. Never copy this policy
to database, media, release-evidence, or user-content buckets.

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

## Follow-up readback — 2026-08-03

The live 30-day audit found 113 builds consuming 47,398 seconds. Eighty-three
used `E2_HIGHCPU_32`, accounting for an estimated $36.14 of $38.14 in priced
build compute. None were trigger-driven. Audit logs attribute the local
`gcloud builds submit` calls to the signed-in operator account rather than an
automatic GitHub or Cloud Build trigger. August 1-2 alone contained 12 builds
and 87.5 build-minutes.

The three-day Artifact Registry policy is active and currently identifies 341
retention candidates (107.89 GB by per-image accounting). Cleanup remains
asynchronous; the repository readback was 477 versions and 103.30 GB shortly
after activation. All four Cloud Run services still have zero minimum
instances. Cloud SQL remains the smallest shared-core production tier and was
not changed.

The dedicated Cloud Build upload bucket contained 449 objects, all under the
reconstructable `source/` prefix, totaling 36.45 GB. A checked-in, exact-prefix
seven-day lifecycle was audited and activated. At activation, 393 archives
totaling 31.67 GB were old enough for asynchronous expiry. No direct object
deletion occurred, and no logs, images, media, database data, or backups are in
that lifecycle boundary.

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

## Retention correction — 2026-08-03

The active 45-day rule proved too conservative for Quipsly's historical build
churn. It reduced the repository from 927 to 477 versions, but still left
103,302.543 MB billable because recently created Studio images and BuildKit
caches dominated storage. Keeping ten rollback versions per package already
provides the durable safety boundary; requiring every other version to age 45
days merely prolonged the storage charge.

The active policy now:

- evaluates every version older than three days for deletion, including tagged
  checkpoint and cache versions; and
- keeps the ten newest versions of every package, regardless of age.

Before activation, the guarded live audit resolved all five traffic-serving
digests and proved all five survive the exact three-day / keep-ten rule. It
identified 341 eligible versions with 107,894,496,919 summed known bytes. That
sum is not the billable repository total because image layers are deduplicated,
but it demonstrates that the prior rule retained substantial stale content.
The provider normalized three days to `259200s`, confirmed active cleanup, and
continues to apply deletions asynchronously.

The same readback found no new Cloud Build after
`f747c2b3-09ab-40a1-924d-e15b19ccac13` on 2026-08-02. The 72-hour new-image
gate and exact-source reuse remain the primary future build controls. All four
Cloud Run services retain zero minimum instances, and
`https://nest.quipsly.com/api/healthz` still reports serving revision
`studio-00492-jeg`. Cloud SQL, media, traffic, IAM, and application data were
not changed.

The read-only post-change audit receipt is
`/private/tmp/quipsly-cloud-cost-audit-20260803-tightened.json`.

## Temporary source and database follow-up — 2026-08-03

The dedicated Cloud Build upload bucket still contained 449 `source/` archives
totaling 36.45 GB. Its exact-prefix seven-day lifecycle had just been activated,
making 393 archives / 31.67 GB eligible for asynchronous expiry, but the bucket
also retained Google's default seven-day soft-delete window. That second window
would continue charging for short-lived source archives after lifecycle
deletion even though Git and immutable release images are the recovery sources.

The checked-in operator now audits the soft-delete state and requires a separate
exact confirmation before clearing it. Live activation changed only
`gs://high-ground-odyssey_cloudbuild` from 604,800 seconds to zero and preserved
the existing `source/`, age-seven lifecycle. It did not directly delete any
object, and objects already soft-deleted retain their existing recovery period.
Google explicitly warns that temporary-data buckets can incur significantly
higher storage cost from [soft
delete](https://cloud.google.com/storage/docs/soft-delete) while confirming that
already-soft-deleted objects are not affected by clearing the policy.

Cloud SQL was also measured rather than guessed. `studio-postgres` remains the
single zonal PostgreSQL 16 `db-f1-micro` with 10 GB HDD and seven backups. Across
the prior 30 days, its daily maximum CPU was approximately 8.5%–51.7%, reported
memory utilization was continuously 100%, and database bytes used were only
about 97–122 MB. There is no smaller Cloud SQL tier; stopping it would stop
production Nest, while reducing backup retention would save negligible storage
at the cost of recovery. No SQL setting changed. A future database cost change
must be a measured migration to a different durable architecture, not a
production shutdown disguised as optimization.

Artifact Registry readback was 477 versions and approximately 98.5 GB while the
three-day/delete plus keep-ten policy was less than one day old. Per-image
accounting attributes the bulk to cache packages, but double-counts shared
layers. Google documents that [Artifact Registry cleanup is periodic and changes
take effect in approximately one
day](https://cloud.google.com/artifact-registry/docs/repositories/cleanup-policy-overview),
so tightening the keep set again before the first policy converges would
sacrifice rollback evidence without establishing incremental savings. The next
readback gate is after `2026-08-04T16:03:25Z`.

The post-change read-only receipt is
`/private/tmp/quipsly-cloud-cost-audit-20260803-soft-delete.json`. It confirms
113 builds / $38.14 estimated priced compute in the 30-day historical window,
477 registry versions, all four Cloud Run services at zero minimum instances,
and no mutation by the audit itself.
