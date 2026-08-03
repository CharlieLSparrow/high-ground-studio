# Google Calendar push delivery qualification

Date: 2026-08-03

Status: locally implemented and operated; cloud activation remains gated

## Outcome

Quipsly can now opt an owned Google calendar lane into live change alerts
without making a webhook a second calendar reader. Google sends an empty
notification. Quipsly verifies its lease evidence, writes one durable wake, and
the existing privacy-minimized reconciliation engine later reads only provider
identity, etag, status, updated time, and Quipsly private linkage.

The schedule UI exposes this as **Turn on live alerts** per verified coaching,
podcast-production, or personal lane. It shows the current lease expiry and
keeps **Check Google changes** available. Turning alerts off attempts exact
provider channel stops, disables local receipt immediately even when a provider
stop cannot be confirmed, and retains receipts.

## Production architecture

- `CalendarNotificationChannel` stores one renewable provider lease per row.
  `ACTIVE` and `DRAINING` leases may overlap during renewal.
- Random channel tokens are sent to Google once and persisted only as SHA-256
  digests.
- The webhook requires an empty body and exact channel ID, token, resource ID,
  documented resource state, and monotonically newer arbitrary-precision
  message number.
- `CalendarReconciliationWake.activeKey` permits one queued/processing wake per
  collection. Repeated notifications update that wake instead of multiplying
  provider reads. A notification received while its wake is already processing
  marks the same row for one lock-protected follow-up reconciliation, so
  completion cannot swallow an in-flight change.
- A worker lease recovers abandoned `PROCESSING` work after ten minutes and
  retries up to five times with bounded backoff.
- Channel renewal starts a unique replacement, commits it as active, moves the
  prior lease to draining, and then stops the prior provider identity. An
  unconfirmed stop remains verifiable only until its original expiration.
- Notifications are not correctness proof. The scheduler independently queues
  a deduplicated reconciliation when a live collection cursor has not advanced
  for 24 hours, and manual checks remain available, because Google documents
  that some notifications can be dropped.
- Cloud Scheduler invokes the worker every 15 minutes with a Google-signed OIDC
  token. Nest verifies the exact service-account email and Cloud Run audience;
  no long-lived scheduler secret is stored.

Primary references:

- [Google Calendar push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
- [Events watch reference](https://developers.google.com/workspace/calendar/api/v3/reference/events/watch)
- [Channels stop reference](https://developers.google.com/workspace/calendar/api/v3/reference/channels/stop)
- [Incremental synchronization](https://developers.google.com/workspace/calendar/api/guides/sync)
- [Cloud Scheduler HTTP authentication](https://docs.cloud.google.com/scheduler/docs/http-target-auth)
- [Cloud Run service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)

## Operated evidence

The additive migration was applied only to
`postgresql://...@127.0.0.1:5432/high_ground_studio`. The operated command was:

```bash
pnpm quipsly:local:google-calendar-push-dogfood
```

It used the real Prisma client and PostgreSQL tables with a fully mocked Google
HTTP boundary. It proved:

- verified OAuth refresh and `events.watch` request construction;
- exact HTTPS notification address and seven-day TTL;
- raw notification token absent from channel rows and receipts;
- activation wake to full sync and encrypted cursor;
- verified notification to incremental reconciliation;
- one provider-side etag change became one human-review conflict;
- exact replay skipped without another wake;
- wrong token denied;
- renewal created two auditable rows, activated the replacement, and stopped
  the old exact channel/resource pair;
- disabling stopped local acceptance;
- provider reads stayed on the identity/version-only field contract; and
- cleanup left zero users, connections, collections, channels, or wakes.

Verification at qualification time:

- Quipsly TypeScript: pass.
- Calendar push, worker auth/backstop, webhook, existing reconciliation,
  existing connection/disconnect route, and schedule UI: 7 suites / 34 tests,
  pass.
- Scheduler static release contract: 2 tests, pass.
- Quiet-calendar backstop: live cursors older than 24 hours are selected and
  deduplicated into the same durable reconciliation queue.
- Concurrent notification follow-up: a notification received during provider
  reconciliation retains the active deduplication key and forces one second
  cursor pass before the wake may complete.
- Complete Quipsly regression: 244 suites / 1,294 tests pass; 37 suites / 108
  tests remain explicitly skipped by the existing repository contract.
- Product contracts: 254/254 pass.
- Optimized production build: pass; 163 static pages generated and all dynamic
  routes, including live alerts, webhook, and scheduler maintenance, collected.

## Cloud activation gate

Do not turn on a real provider watch until all of these are true:

1. Google Calendar OAuth secrets are mounted on the promoted Nest revision.
2. The additive migration is applied through the schema release workflow.
3. `pnpm quipsly:calendar:push-scheduler` succeeds and its final JSON readback
   matches the deployed service URL, OIDC audience, service account, and
   15-minute schedule.
4. A human connects a QA-owned calendar and enables live alerts.
5. A Google-side edit reaches the webhook, the scheduler drains its wake, the
   UI shows the conflict, and Google event content is absent from logs and
   receipts.
6. Renewal and disable are read back against the real provider.

Current external blocker: the local gcloud user and ADC credentials require
reauthentication before cloud mutation/readback. No scheduler, watch channel,
OAuth grant, calendar event, cloud revision, or production database was changed
in this slice.

## Rollback

Turn off live alerts for every selected lane, run one scheduler cycle, and then
remove or pause `quipsly-google-calendar-push`. Rolling back the app revision
stops new webhook acceptance; provider channels expire within their bounded
lease even if an exact stop cannot be confirmed. The additive tables and
receipts may remain for audit. Existing manual reconciliation, calendar
projections, iCalendar feeds, and iPhone EventKit export do not depend on the
push tables.
