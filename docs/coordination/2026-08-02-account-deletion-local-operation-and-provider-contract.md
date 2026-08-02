# Account deletion local operation and provider contract

Date: 2026-08-02

## Outcome

The account-deletion implementation has now been exercised as a real local
product workflow against disposable Firebase Emulator and PostgreSQL state,
not only through mocked unit seams. The production worker remains intentionally
undeployed because its exact-source image, provider secrets, dedicated IAM, and
disposable production proof are still absent.

The completion-email boundary is now owned by account deletion itself. It no
longer inherits the generic web/coaching email environment variables:

```bash
QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY=...
QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM='Quipsly <account@notify.quipsly.com>'
```

The deployment and readiness operators bind only those names. The worker
validates the sender syntax before contacting Resend, returns only the sender
domain in its authorized readiness response, and never exposes either secret.
The execution engine continues to send the immutable
`account-deletion:<request-id>:completion-email` idempotency key to Resend.

## Operated local proof

The owned local lifecycle was recovered and verified at
`http://127.0.0.1:3012`, using PostgreSQL on `127.0.0.1:5432` and Firebase Auth
Emulator on `127.0.0.1:9099`. The integration operation passed 2/2 and proved:

- verified Firebase identity creates one request and exact retries reopen it;
- PostgreSQL rejects a fabricated `COMPLETED` state without its receipt;
- the disposable user, Home Nest, personal Task, and Home Nest Task are
  actually deleted;
- a collaborator blocks execution before any provider call;
- a simulated provider interruption records `FAILED`;
- the same immutable plan resumes and completes after explicit operator retry;
- replay reuses the receipt and does not send another confirmation;
- the deleted Firebase token receives HTTP 401; and
- cleanup returns disposable users, projects, and deletion requests to zero.

GCS deletion and completion delivery are mocked in this local operation. Those
provider boundaries require the later production disposable-account exercise.

## Verification

- complete Quipsly Jest suite: 225 suites / 1,182 runnable tests passed, 35
  suites / 105 environment-gated tests skipped;
- real local deletion integration: 2/2 passed;
- focused isolated-email/external-adapter/worker-route coverage: 13/13 passed;
- worker readiness and deployment operator coverage: 7/7 passed;
- strict Quipsly TypeScript: passed;
- deployment shell syntax and `git diff --check`: passed; and
- no Cloud Build, Cloud Run deployment, IAM grant, DNS write, provider email,
  production database mutation, or account deletion occurred.

## Provider setup boundary

Use `notify.quipsly.com` as the dedicated sending subdomain so its SPF and DKIM
records do not replace the root domain's current or future Google Workspace
mail configuration. Create a Resend sending-only API key restricted to that
verified domain and store it directly in Secret Manager. Resend documents both
the [domain verification model](https://resend.com/docs/dashboard/domains/introduction)
and [domain-restricted sending-only keys](https://resend.com/docs/dashboard/api-keys/introduction).

The Resend sign-in page is ready, but account creation/sign-in is a new
third-party authorization and remains an explicit user action. No credentials
were entered and no DNS record was changed.

## Remaining production proof

1. Authorize the intended Quipsly Google identity to sign into Resend.
2. Verify `notify.quipsly.com` without altering root mail records.
3. Create the domain-restricted sending-only key and the two dedicated secrets.
4. Build and qualify one exact committed worker image, then apply the private
   concurrency-1 worker boundary.
5. Prove immutable production schema status and a no-traffic Nest preview.
6. Create and delete one disposable verified production account; independently
   verify PostgreSQL, Firebase/token denial, any allowlisted GCS objects, one
   email, detached receipt, idempotent replay, and outsider denial.

The App Store account-deletion gate stays red until step 6 succeeds.
