# Calendar capability Cloud Logging privacy

Date: 2026-08-01
Status: production exclusion applied, read back, and exercised
Project: `high-ground-odyssey`
Service: `studio`

## Boundary

Calendar subscription URLs are revocable bearer capabilities. Google Calendar,
Apple Calendar, or another subscribed provider necessarily receives the private
URL, but Quipsly must not copy that path into application or Cloud Run request
logs. Disclosure still requires immediate link rotation; logging exclusion is
defense in depth, not a replacement for revocation.

The production `_Default` sink contains one enabled exclusion named
`exclude-quipsly-calendar-feed-capabilities`. Its filter is limited to:

- `cloud_run_revision` resources;
- the `studio` service;
- `run.googleapis.com/requests`; and
- request URLs matching `/api/calendar/feeds/<single path segment>`.

The sink's base audit-log exclusions, destination, and enabled state are
unchanged. `_Required` remains present and enabled. The mutation does not alter
application routes, calendar records, subscriptions, provider state, IAM,
Cloud Run traffic, or retained ordinary request logs.

## Provider operation

The checked-in operator first returned `reason: missing` in read-only mode.
Its four focused tests passed, then `--apply` added the one named exclusion and
readback returned `reason: configured`. A subsequent read-only run returned
`applyRequested: false` and `mutationPerformed: false`.

Google accepted the sink update before it finished propagating. An immediate
synthetic invalid capability request was still retained. That result is
preserved as evidence that provider configuration readback alone was
insufficient. After propagation, a second paired production probe produced:

- ordinary `GET /api/health?...` -> HTTP 200 and one request-log entry;
- synthetic invalid `GET /api/calendar/feeds/<probe>` -> HTTP 404 and zero
  request-log entries.

The two requests targeted the same host and Cloud Run service within seconds of
one another. A later independent query still returned counts of one and zero.
No real calendar capability was used or exposed.

## Durable release contract

`scripts/release/quipsly-release-preflight.sh` invokes the read-only operator
and refuses release eligibility when the named exclusion is missing, disabled,
or drifted. The operator's apply path can add or repair only that named
exclusion and never delete or replace the sink. Its receipt distinguishes
`applyRequested` from `mutationPerformed`, preventing an idempotent readback
from being misreported as a provider change.

Verification:

- operator tests: 4/4;
- production exclusion readback: pass;
- ordinary request retention: pass;
- bearer-style request exclusion after propagation: pass;
- `_Default` base filter and destination: unchanged;
- `_Required`: present and enabled;
- calendar, subscription, and provider mutation: none.
