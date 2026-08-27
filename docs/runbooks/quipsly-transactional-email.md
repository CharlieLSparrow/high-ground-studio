# Quipsly transactional email

Quipsly sends operational Session mail through Resend from
`invites@notify.quipsly.com`. The web request that creates an invitation may
send immediately; confirmations and 24-hour and 1-hour reminders are durable
database work claimed by a dedicated Google Cloud Scheduler identity.

## Production boundary

- Message bodies, Session credentials, and invitation tokens are rendered only
  at dispatch and are never stored in the queue or provider-event ledger.
- Resend delivery webhooks are verified against the raw request body and stored
  once. Open and click tracking events are ignored.
- Bounces, complaints, and suppressions update a recipient projection so later
  workers do not repeatedly call the provider for a known bad mailbox.
- Rescheduling cancels only unsent work from the old schedule. A send is
  rechecked against the current booking, recipient, and delivery window after
  it is claimed.
- Cloud Scheduler invokes the worker with a short-lived Google OIDC token. No
  scheduler bearer secret is stored in the job.

The operating views are `/admin/product-ops` for aggregate workflow and
delivery health and `/admin/support` for a single customer. Customer message
content is not shown in either view.

## One-time provider activation

1. Add and verify `notify.quipsly.com` in Resend. Publish the exact SPF and DKIM
   values Resend returns; do not weaken the existing strict parent DMARC policy.
2. Create a sending-only Resend API key scoped to the verified Quipsly domain.
3. Create a webhook for `https://nest.quipsly.com/api/webhooks/resend` with only:
   `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.failed`,
   `email.bounced`, `email.complained`, and `email.suppressed`.
4. Add the API key and webhook signing secret to Google Secret Manager without
   placing either value in shell history:

   ```bash
   gcloud secrets create quipsly-session-invitation-resend-api-key \
     --project=high-ground-odyssey --replication-policy=automatic
   gcloud secrets versions add quipsly-session-invitation-resend-api-key \
     --project=high-ground-odyssey --data-file=-

   gcloud secrets create quipsly-resend-webhook-secret \
     --project=high-ground-odyssey --replication-policy=automatic
   gcloud secrets versions add quipsly-resend-webhook-secret \
     --project=high-ground-odyssey --data-file=-
   ```

   If a secret already exists, skip its `create` command and add a new version.

Official provider references:
[domain verification](https://resend.com/docs/dashboard/domains/introduction),
[webhook event types](https://resend.com/docs/webhooks/event-types), and
[webhook persistence and retries](https://resend.com/docs/dashboard/webhooks/how-to-store-webhooks-data).

## Release and scheduler activation

Deploy and qualify the normal no-traffic preview with
`ENABLE_SESSION_INVITATION_EMAIL=1`. The release helper refuses to deploy if
either Secret Manager value is absent or malformed. Promote only after preview
smoke and the standard two-account privacy check.

After promotion, create or reconcile the scheduler and read its identity,
audience, target, and cadence back from Google Cloud:

```bash
PROJECT_ID=high-ground-odyssey \
REGION=us-central1 \
SERVICE_NAME=studio \
scripts/release/quipsly-transactional-email-scheduler.sh
```

The default cadence is every two minutes. The worker scans up to 500 upcoming
confirmed Sessions across an eight-day runway in one bulk reconciliation and
reports `scanSaturated` if that operating envelope is reached. It dispatches at
most 24 due messages per run and retries transient failures with bounded
backoff.

## Acceptance and recovery

Use Resend's official test recipients before real customer mail:
`delivered@resend.dev`, `bounced@resend.dev`, and
`complained@resend.dev`. Prove confirmation, both reminders, rescheduling,
duplicate scheduler delivery, bad mailbox suppression, webhook replay, and the
private browser fallback link.

To stop new scheduled mail without deleting evidence:

```bash
gcloud scheduler jobs pause quipsly-transactional-email \
  --project=high-ground-odyssey --location=us-central1
```

Keep provider events and send receipts for diagnosis. Correct the underlying
recipient or provider problem before resuming; do not clear complaint or bounce
state merely to make a dashboard green.
