# Quipsly product analytics

Quipsly uses two complementary sources instead of asking one analytics system
to do a job it cannot do reliably.

- The app-owned `UserEvent` ledger records a fixed, privacy-minimized workflow
  vocabulary for signed-in users whether or not they permit Google Analytics.
  It is the operational authority for funnels such as invitation, preflight,
  call, recording, transcript, and follow-through.
- GA4 receives the same bounded product vocabulary plus redacted route
  categories only after the browser grants analytics consent. It answers
  audience, device, traffic-acquisition, and anonymous navigation questions.

Names, email addresses, user/room/project IDs, Session titles, notes,
transcripts, recordings, media URLs, and creative content are excluded from
both event payloads. The product taxonomy is defined in
`apps/quipsly/src/lib/product-analytics.ts`.

## Production resources

- GA4 account: `366960751`
- GA4 property: `503353241`
- Web stream: `studio-cut-web` (`14924212569`)
- Measurement ID: `G-47PCQGW8ZB`
- Google Cloud API: `analyticsdata.googleapis.com`
- Runtime reader: `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com`

The public measurement ID and numeric property ID are normal configuration,
not secrets. The Cloud Run identity uses Application Default Credentials and
the read-only Analytics scope; no downloaded service-account key is used.

## One-time GA4 access

In GA4 **Admin → Property access management**, add
`studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com` as **Viewer**.
Do not grant Editor or Administrator. Cloud IAM roles do not substitute for
this property-level permission.

The internal `/admin/product-ops` page then reads a five-minute-cached aggregate
report for the selected 7, 30, or 90-day window. If access is absent or Google
is unavailable, the page degrades to Quipsly's canonical operating metrics and
shows staff a configuration status; customer workflows never depend on GA4.

Official references:
[GA Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart),
[GA4 property access](https://support.google.com/analytics/answer/9305587), and
[Google consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode).

## Product-management operating loop

Use `/admin/product-ops` first:

1. Find the largest break between canonical workflow stages.
2. Segment the corresponding consent-based GA4 behavior by device and
   acquisition channel, without treating it as a complete population.
3. Reproduce the failure with an ordinary coach/client account and inspect the
   exact customer in `/admin/support` only when support access is appropriate.
4. Ship a UX or reliability improvement, then compare the same fixed event and
   time window. Do not invent a new event merely to make a change look busy.

Use GA4 exploration only for questions that need flexible anonymous
segmentation. Exporting user-level or content-level data is outside this
boundary.

## Event changes

New events must describe a durable customer outcome, use bounded parameters,
and be useful for a concrete product decision. Add the event to the shared
taxonomy, sanitize its parameters, instrument both the app-owned ledger and
consented GA4 bridge, and add a focused test. Renaming an event creates a new
time series, so prefer additive taxonomy changes and preserve the old meaning.
