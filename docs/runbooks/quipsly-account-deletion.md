# Quipsly account deletion

Status: executable for blocker-free accounts; reviewed retention plans remain a
manual privacy operation.

This runbook owns the complete boundary between an in-app deletion request and
a truthful completion receipt. It applies to Nest, HighGroundCapture, Firebase
Authentication, PostgreSQL, and Media Vault objects.

## Product contract

- A signed-in person can request deletion from the iPhone app and reopen the
  request status.
- A request is not completion. Staff review export choices, shared work,
  recordings, consent, payments, legal retention, and project ownership first.
- `COMPLETED` can only be persisted with a detached user, a completion time, and
  an executor receipt whose outcome is `completed`.
- Disabling an account must not be reversed by a later valid Firebase token.
- Completion confirmation is sent to the verified account email before the
  email snapshot is removed from the retained receipt.
- Retried work resumes from persisted phase progress. Provider calls are
  idempotent or ignore already-missing resources.

The state machine is:

```text
REQUESTED
  -> REVIEWING
  -> EXPORT_PREPARING (when needed)
  -> READY_FOR_DELETION
  -> EXECUTING
  -> COMPLETED
         |
         +-> FAILED -> EXECUTING
```

`CANCELED` and `REJECTED` remain terminal review outcomes. They are not
completion.

## Automated scope

The current executor supports `automated-empty-or-private-account`. Immediately
before claiming the request, it inventories:

- the subject user, verified email aliases, and Firebase UID;
- private Home Nests, collaborators, shared media, original storage objects,
  and media variants;
- appointments, bookings, coaching records, rooms, recordings, consent, and
  transcript authorship;
- assigned tasks in shared projects or sessions;
- shared project ownership that would otherwise become ownerless;
- payments, Stripe links, organizations, support, commerce, and feedback;
- legacy email-owned manuscripts, content projects, and HGO artifacts.

Removable access to a shared Nest is not itself a blocker. Sole ownership,
assigned shared work, shared authorship, regulated records, unsupported storage
providers, collaborators in a Home Nest, and shared media are blockers.

For an eligible account, the executor:

1. atomically claims the request and deactivates the database user;
2. disables Firebase Authentication and revokes refresh tokens;
3. deletes personal tasks, Home Nest tasks, grants, invites, Home Nests, and the
   user plus database-owned cascades;
4. deletes every exclusive GCS original and variant recorded by the inventory;
5. deletes the Firebase identity;
6. sends idempotent completion confirmation;
7. writes the execution receipt and detached request as `COMPLETED`.

Accounts with blockers require a reviewed retention/deletion plan. Do not
change their status to `COMPLETED`, bypass the database check, or improvise
production SQL. Record and implement the missing category-specific plan first.

## Operator surface

Open:

```text
/admin/account-deletion
```

An OWNER or configured Quipsly admin can:

- inspect the current inventory and blockers;
- start review;
- record that an export is being prepared;
- mark a blocker-free inventory ready;
- execute or resume deletion with the exact phrase `DELETE <request-id>` and
  an explicit export disposition.

The final Execute button remains disabled unless Nest has a verified private
worker connection:

```bash
QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED=true
QUIPSLY_ACCOUNT_DELETION_WORKER_URL=https://PRIVATE-WORKER.run.app
QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET=...
```

Nest receives only `roles/run.invoker` on that private service and accessor on
the shared secret. It must always retain
`QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED=false`. Nest still has the database
and Firebase permissions required by existing product authentication and admin
workflows; only the dedicated worker combines those with allowlisted GCS
deletion and completion-email authority.

The worker requires:

```bash
QUIPSLY_ACCOUNT_DELETION_WORKER_MODE=true
QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED=true
QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS=high-ground-odyssey-media
QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET=...
```

These variables are safety gates, not authorization. Cloud Run IAM, the
defense-in-depth shared secret, signed-in staff check, fresh inventory, ready
state, immutable plan, exact confirmation, and provider-scoped worker identity
are all still required.

Runtime dependencies:

```bash
RESEND_API_KEY=...
HGO_EMAIL_FROM='Quipsly <support@quipsly.com>'
```

The dedicated worker identity also needs Firebase Authentication user
update/delete permission and deletion permission for only the exact GCS
buckets in `QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS`. The adapter refuses valid
GCS URLs outside that allowlist.

Read the complete machine boundary without mutation:

```bash
pnpm quipsly:account-deletion:worker-readiness -- \
  --source COMMITTED_SHA \
  --output /absolute/private/account-deletion-worker-readiness.json
```

The deployment wrapper is read-only by default. Its explicit apply path is
documented by `--help` and requires exact target confirmation; it provisions no
account and performs no deletion.

## Local verification

Start or verify the owned local lane:

```bash
pnpm quipsly:local:up
pnpm quipsly:local:doctor
```

Apply the migration only to the disposable local database:

```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio' \
  pnpm exec prisma migrate deploy
```

Run the real HTTP, Firebase emulator, and PostgreSQL deletion proof:

```bash
QUIPSLY_LOCAL_ACCOUNT_DELETION_SMOKE=1 \
QUIPSLY_LOCAL_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio' \
QUIPSLY_LOCAL_NEST_URL='http://127.0.0.1:3012' \
QUIPSLY_LOCAL_FIREBASE_AUTH_URL='http://127.0.0.1:9099' \
  pnpm --filter quipsly exec jest --runInBand \
  src/app/api/account/deletion-request/local-flow.integration.test.ts
```

The proof must demonstrate:

- a verified Firebase identity creates and reopens one request;
- a manual `COMPLETED` update is rejected by PostgreSQL;
- a user, Home Nest, personal task, and Home Nest task are actually deleted;
- a collaborator blocks all mutation;
- a simulated provider interruption records `FAILED`;
- a fresh operator form timestamp resumes the same immutable plan;
- replay returns the same receipt without another confirmation;
- the deleted Firebase token no longer authenticates;
- disposable users, requests, and Home Nests are cleaned up.

Also run:

```bash
pnpm --filter quipsly typecheck
pnpm exec tsc --noEmit --project apps/quipsly/tsconfig.json
pnpm --filter quipsly build
```

## Production rollout

1. Take a database backup and run migration status against the intended target.
2. Apply `20260724060000_add_account_deletion_execution_receipts` before
   deploying code that emits `EXECUTING` or `FAILED`.
3. Deploy Nest to a no-traffic preview with both worker invocation and the
   legacy in-process executor off.
4. Verify request creation/status, staff denial, staff inventory, TypeScript 7,
   production build, and exact migration state.
5. Verify the dedicated worker's Cloud SQL, Firebase, allowlisted GCS, Resend,
   private IAM, concurrency-1, and secret boundaries. Never grant GCS delete or
   Resend to the public Nest identity.
6. Deploy the dedicated worker, then enable only its invocation on the reviewed
   no-traffic Nest revision. Keep Nest's in-process executor false.
7. Complete one disposable end-to-end deletion and confirm the email, detached
   request, successful execution row, deleted Firebase identity, deleted GCS
   objects, and outsider denial.
8. Promote traffic only after that readback and explicit production approval.

Do not infer production completion from a green build, an open console, a
`RUNNING` execution, or an email-provider request alone.

## Failure and recovery

- `FAILED` means access remains disabled and persisted phase progress is the
  retry source of truth.
- Fix the named provider, permission, or data blocker, then use the same staff
  actor, export disposition, scope, and confirmation phrase. A new form
  timestamp does not change the semantic plan.
- Never delete the request or execution row while recovery is active.
- Never reactivate the user to make retry easier.
- If the stored inventory no longer describes reality or the plan hash differs,
  stop and perform operator review; do not edit receipt JSON by hand.

PostgreSQL soft failure, Firebase deletion, GCS retention/hold behavior, and
email confirmation are separate facts. Verify each one directly.
