# Cloud retention correction

Date: 2026-08-03

## Outcome

Quipsly's active Artifact Registry retention now evaluates versions after
three days and always keeps the ten newest versions of every package. The
previous 45-day threshold had reduced version count but left more than 100 GB
billable, so it did not address the dominant continuing storage cost.

No Cloud Build or Cloud Run deployment was performed. Cloud SQL, application
data, media, IAM, service traffic, and live image identities were unchanged.

## Billing ownership

The user's billing view combines two similarly named projects:

- `high-ground-odyssey` (High Ground Odyssey) owns Quipsly Cloud Build,
  Artifact Registry, Cloud Run, and Cloud SQL resources.
- `gen-lang-client-0819080752` (HighGroundOdyssey) owns Generative Language API
  usage. Its $17.34 line is model usage rather than deployment spend.

The 30-day Quipsly audit reports 113 builds: 88 successful, 19 failed, and six
canceled. Eighty-three used `E2_HIGHCPU_32` and account for $36.14 of the
$38.14 estimated priced build compute. The latest build remains failed build
`f747c2b3-09ab-40a1-924d-e15b19ccac13` from 2026-08-02; this correction did
not start another build.

## Safety proof

Before external mutation, the activation operator:

1. validated the exact checked-in policy;
2. inventoried all regional Cloud Run services and traffic revisions;
3. resolved five traffic-serving image digests;
4. proved all five survive the proposed three-day / keep-ten rule; and
5. identified 341 cleanup candidates with 107,894,496,919 summed known bytes.

The size sum is not the billable repository total because shared layers are
deduplicated. Provider readback before cleanup reported 103,302.543 MB.

The provider accepted:

```text
delete-any-after-3-days: DELETE tagState=ANY olderThan=259200s
keep-recent-10-per-package: KEEP keepCount=10
dry run: disabled
```

Cleanup is asynchronous. The repository total can remain unchanged until the
background evaluator processes eligible versions.

## Runtime readback

- Cloud Run services: four.
- Total minimum instances: zero.
- Traffic-serving digests protected: five of five.
- Nest health: HTTP success from `https://nest.quipsly.com/api/healthz`.
- Serving Nest revision: `studio-00492-jeg`.
- Database mutation: none.
- Image build or deployment: none.

## Durable controls

- New successful Nest images remain separated by a 72-hour default cadence.
- An exact committed-source image is reused for repeated preview and promotion.
- Ten versions per package remain available independent of age.
- Cloud Run remains request-scaled with zero minimum instances.
- Cloud SQL stays online because it is the canonical production database; its
  cost is an availability baseline rather than deployment churn.

Post-change audit receipt:
`/private/tmp/quipsly-cloud-cost-audit-20260803-tightened.json`.
