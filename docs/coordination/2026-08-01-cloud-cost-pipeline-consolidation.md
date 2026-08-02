# Quipsly cloud-cost pipeline consolidation

Date: 2026-08-01
Status: future duplicate-build prevention implemented; Artifact Registry cleanup evaluating in non-deleting dry-run

## What the billing chart represented

The blue **High Ground Odyssey** project contains the deployment infrastructure.
Its largest measured service was Cloud Build. The separate red
**HighGroundOdyssey** project exposed Gemini API spend and did not have Cloud
Build, Cloud Run, or Artifact Registry APIs enabled. The similarly named
projects made the chart confusing, but the deployment spend attribution itself
was real.

Credentialed 30-day readback of `high-ground-odyssey` found 111 builds. Eighty-
three used `E2_HIGHCPU_32` and account for an estimated $36.14 of $37.77 priced
build compute. Eighteen builds failed and six were canceled. Artifact Registry
contained 14 packages, 927 versions, 177 untagged versions, 536 versions older
than 30 days, and roughly 229 GB across versions with reported sizes. Cloud Run
had 396 revisions but only two traffic-serving revisions and no minimum
instances.

That initial Cloud Run statement was scoped only to the primary `studio`
service. The corrected project-wide auditor found four services and exposed
`studio-collab` at one minimum instance. The underlying deployment helper had
hardcoded that warm-instance default.

These are list-price estimates from the build history, not the final invoice.
Google currently lists `e2-highcpu-8` at $0.0156/minute and
`e2-highcpu-32` at $0.0624/minute in `us-central1`.

## Root ownership defect

The repository already had a correct Nest preview path that materialized one
committed source, used `source-<full-sha>`, read the registry digest, skipped an
existing image, deployed at zero traffic, and kept smoke/promotion separate.
But it was not the only owner:

- `quipsly:web:deploy` still called the older deploy script;
- the HGO/Quipsly release conductor generated timestamp Nest and HGO tags;
- release-readiness and coaching-runway output instructed operators to use the
  older path; and
- the GitHub Studio job rebuilt and pushed the same SHA on a workflow retry.

This was why previous cost work felt like a half measure: the good pipeline was
present, while common entry points still bypassed it.

## Consolidated release ownership

All supported Nest entry points now call
`scripts/release/quipsly-deploy-preview.sh`. The old
`scripts/quipsly-web-deploy.sh` remains only as a compatibility shim:

- stage-only mode materializes the bounded committed release context;
- deploy mode immediately delegates to the canonical preview path;
- positional timestamp image tags fail with a migration message; and
- the shim contains no Cloud Build or Cloud Run mutation command.

The HGO web deploy now defaults to its source SHA, reads back a valid registry
digest before building, reuses an existing exact-source image, distinguishes
not-found from authorization/service failures, refuses to replace an existing
immutable tag, and verifies the digest after build or reuse.

The manual GitHub Studio workflow performs the same registry decision. A rerun
for the same source skips `docker buildx build` but still deploys and reads back
the exact preview boundary.

This reduces future build frequency without weakening local validation,
committed-context materialization, route verification, zero-traffic preview,
authenticated smoke, promotion, or rollback contracts.

## Artifact Registry dry-run

The applied policy is deliberately conservative:

```json
[
  {
    "name": "delete-untagged-after-45-days",
    "action": { "type": "Delete" },
    "condition": { "tagState": "untagged", "olderThan": "45d" }
  },
  {
    "name": "keep-recent-10-per-package",
    "action": { "type": "Keep" },
    "mostRecentVersions": { "keepCount": 10 }
  }
]
```

Google readback normalized 45 days to `3888000s` and confirmed **Dry run is
enabled**. No image or tag was deleted. The policy does not target tagged
source, candidate, release, rollback, or BuildKit-cache versions.

Google evaluates cleanup asynchronously. Wait at least one day, then inspect
Data Access logs for `validateOnly=true`. Active cleanup is a separate
destructive decision and is intentionally impossible through the dry-run
operator.

## Verification

- release/cost entrypoint and policy tests: 6/6;
- adjacent preview/release/web-readiness tests: 26/26;
- all changed JavaScript and shell entry points parse;
- bounded 1,283-file, 112.7 MiB Nest context materializes from exact commit
  `686f750660da9162e2f24bfdf5202584b7dd4dc7`;
- Artifact Registry policy readback: two policies, dry-run enabled;
- post-policy audit: still 927 versions and two protected traffic digests,
  proving no immediate deletion; and
- `git diff --check`: pass.

## Immediate Cloud Run reduction

The collaboration deploy helper now defaults to `min-instances=0` and treats
Google's omitted zero-value annotation as zero during readback. A regression
test prevents the old always-warm default from returning. A warm instance
remains an explicit opt-in for measured latency needs.

Live revision `studio-collab-00005-xht` was created from the existing image
without a build and now serves 100% of traffic. Provider readback proves:

- all four regional Cloud Run services have zero minimum instances;
- the collaboration service remains Ready with `maxScale=1`, concurrency 80,
  timeout 3600 seconds, and its existing Cloud SQL attachment and service
  account;
- the before/after IAM policy SHA-256 is identical;
- `/health` returns the expected `high-ground-studio-collab` identity; and
- the most recent Cloud Build predates the Cloud Run configuration change.

The cost audit now lists all regional services and all traffic-serving revision
digests. Its live post-change result covers four services, 492 revisions, seven
protected traffic digests, and zero total minimum instances.

## Next cost decisions

1. After at least one day, inspect dry-run audit logs and enumerate every
   proposed digest/package/age.
2. Resolve both live digests and selected rollback revisions again immediately
   before any cleanup decision.
3. Decide whether to enable the conservative untagged-only policy. This needs
   explicit approval because the background evaluator would then delete data.
4. Benchmark one real non-urgent Nest release on `E2_HIGHCPU_8`. Keep the
   32-core default unless the smaller worker completes reliably and materially
   cheaper; do not infer Nest memory behavior from unrelated worker images.
5. Add a retention policy for zero-traffic Cloud Run revisions only after
   rollback ownership is explicit. Revision count alone is not significant
   Cloud Run spend while minimum instances remain zero.

Primary references:

- [Cloud Build pricing](https://cloud.google.com/build/pricing)
- [Configure Artifact Registry cleanup policies](https://docs.cloud.google.com/artifact-registry/docs/repositories/cleanup-policy)
- [Artifact Registry cleanup overview](https://docs.cloud.google.com/artifact-registry/docs/repositories/cleanup-policy-overview)
