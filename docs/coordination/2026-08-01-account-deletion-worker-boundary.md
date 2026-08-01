# Quipsly production account-deletion worker boundary

Date: 2026-08-01

Status: in-process deletion execution removed from Nest ownership; dedicated worker
code, deployment contract, and read-only live readiness audit implemented;
provider provisioning and a disposable production deletion remain blocked

## Outcome

Account deletion no longer asks the public Nest runtime to combine database,
Firebase Authentication, GCS deletion, and completion-email authority in one
execution path. Nest retains database and Firebase capabilities required by
existing authentication/admin workflows; the production deletion design is:

```text
staff review in Nest
  -> exact request + immutable approved plan
  -> private Cloud Run invocation + shared-secret defense
  -> dedicated concurrency-1 deletion worker
  -> database / Firebase / allowlisted GCS / Resend
  -> durable detached completion receipt
```

Nest retains staff authorization, inventory review, export disposition, and
the exact `DELETE <request-id>` confirmation. It invokes the worker with a
Google-signed Cloud Run identity token. The worker route additionally requires
a mode-`true` runtime and a 32-byte-or-longer shared secret before calling the
existing idempotent executor.

The worker is deployed from the same immutable qualified Nest image but under
its own service account. Its apply operator constrains it to concurrency 1,
minimum 0, maximum 1, a 900-second request timeout, private Cloud Run IAM, the
exact GCS bucket allowlist, and these provider roles only:

- Cloud SQL client in `high-ground-odyssey`;
- Firebase Authentication admin in `quipsly-reef`;
- Storage Object User on `high-ground-odyssey-media`;
- accessor on the database, Resend, verified sender, and worker shared secrets;
  and
- Nest gets only Cloud Run Invoker plus accessor on the shared secret.

The GCS adapter itself now independently refuses every bucket not explicitly
listed in `QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS`. A database URL that happens
to reference a different valid GCS bucket can no longer broaden the deletion
target.

## Operators

Read-only readiness:

```bash
pnpm quipsly:account-deletion:worker-readiness -- \
  --source COMMITTED_SHA \
  --output /absolute/private/account-deletion-worker-readiness.json
```

The deploy wrapper is also read-only by default:

```bash
pnpm quipsly:account-deletion:worker-deploy -- \
  --source COMMITTED_SHA \
  --output /absolute/private/account-deletion-worker-readiness.json
```

After provider setup and review, its only mutation path is:

```bash
pnpm quipsly:account-deletion:worker-deploy -- \
  --source COMMITTED_SHA \
  --output /absolute/private/account-deletion-worker-readiness.json \
  --apply \
  --confirm-target high-ground-odyssey/quipsly-account-deletion-worker
```

The operator cannot delete an account. It creates/configures the dedicated
identity, IAM, random shared secret, and private worker service, then requires
all machine checks to pass while preserving production schema and disposable
account deletion as separate manual gates.

Canonical Nest preview deployment defaults both worker invocation and the
legacy in-process executor to false. `ENABLE_ACCOUNT_DELETION_WORKER=1` is
accepted only after provider readback proves the private service, dedicated
identity, worker/executor gates, storage allowlist, shared-secret binding,
concurrency 1, and exact Nest invoker grant. Nest always receives
`QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED=false`.

## Live provider truth

The 2026-08-01 read-only receipt at
`/private/tmp/quipsly-account-deletion/worker-readiness.json` proves:

- both public account-deletion pages return HTTP 200 with the expected policy;
- the dedicated worker service does not exist;
- the current exact-source image has not been built;
- `quipsly-resend-api-key`, `quipsly-email-from`, and the worker shared secret
  do not exist with enabled versions;
- the dedicated worker identity and its Cloud SQL, Firebase, GCS-delete, and
  secret permissions do not exist;
- the current Nest runtime identity has Firebase Authentication Admin in
  `quipsly-reef`, but only Storage Object Viewer on the media bucket; and
- the public Nest service does not have its legacy executor gate enabled. Its
  existing Firebase Authentication Admin grant is retained for current login,
  Mac handoff, and user-management workflows and is not misreported as removed.

The receipt is mode `0600`, prints no secret values, and reports no external
mutation. No service account, IAM grant, secret, worker service, database row,
Firebase identity, storage object, email, or account was created or changed.

## Verification

- dedicated worker/client/route and GCS allowlist tests: 16/16;
- worker readiness/deployment/preview activation operator tests: 11/11;
- broader account-deletion policy/request/worker coverage: 24/24;
- Quipsly strict TypeScript: pass;
- optimized Quipsly production build: pass at the release image's documented
  8 GiB Node heap, 157 pages, with the internal worker route included;
- Capture/App Store static contract: 949/949;
- internal worker route is present in the Cloud Build image route gate;
- both deployment scripts pass `bash -n`;
- live readiness read: expected exit 2 with a mode-`0600` receipt; and
- no production mutation or account deletion.

The first local production-build attempt compiled successfully but its
TypeScript worker exhausted the default 4 GiB heap. The identical build passed
at `NODE_OPTIONS=--max-old-space-size=8192`, matching the committed Cloud Build
configuration. This is recorded as local capacity evidence, not hidden as a
code failure.

## Remaining external setup

1. Verify a Quipsly sender domain with Resend and provide one production API
   key plus a verified `HGO_EMAIL_FROM` value. Do not use an unverified or
   placeholder sender for deletion confirmations.
2. Build the exact committed image, review the read-only receipt, then run the
   explicit worker apply operator. It will create the random internal shared
   secret without printing it.
3. Run immutable production migration status and zero-diff proof for the exact
   source before enabling Nest invocation.
4. Enable the worker on a no-traffic Nest preview and prove outsider denial,
   staff inventory, and the worker readiness endpoint before promotion.
5. Create a disposable verified production account, submit its request through
   the shipped product flow, review it in Nest, execute it once, and
   independently prove database deletion, Firebase deletion/token denial, any
   allowlisted GCS deletion, one completion email, detached request/receipt,
   idempotent replay, and outsider denial.

The App Store deletion gate remains red until step 5 succeeds. A deployed
worker or a `COMPLETED` label alone is not proof.
