# Quipsly Capture App Store submission readiness

Date: 2026-08-01

Status: Build 25 remains the public TestFlight target; App Store submission is
correctly blocked on exact provider, legal, creative, privacy, deletion, and
physical-device gates

## Outcome

Quipsly now has a credentialed, read-only App Store submission auditor instead
of relying on a manually aging checklist:

```bash
pnpm quipsly:capture:app-store-submission-readiness -- \
  --api-key-path /absolute/private/app-store-connect-key.json \
  --output /absolute/private/submission-readiness-build25.json
```

The operator uses request-scoped five-minute JWTs, requires a mode-`0600` API
key, writes redacted receipts as mode `0600`, and has no `--apply` or submit
path. Exit `2` means the provider read succeeded but submission is blocked;
transport/auth/operator failure uses exit `1`.

## Current Apple truth

The 2026-08-01 receipt at
`/private/tmp/quipsly-capture-app-store-connect/submission-readiness-build25.json`
read the production App Store Connect account without mutation and proved:

- app `6780995957` is **Quipsly Capture** with bundle
  `com.highgroundodyssey.HighGroundCapture`;
- iOS version `1.0` is editable at `PREPARE_FOR_SUBMISSION`;
- exact Build 25 provider ID
  `bacb25d1-1e0a-40aa-90a3-3e7cd195ee33` is assigned;
- manual release and App Review detail are present;
- content rights are unset;
- 0 of 23 current age-rating questions are answered and no derived App Store
  age rating exists;
- the version's IDFA answer is unset;
- zero `en-US` screenshot sets exist;
- a price-schedule record and USA base territory exist, but no active price
  selection exists;
- App Availability does not exist, so no release territory is configured; and
- no App Store review submission exists.

This is stronger than a UI screenshot or stale prose: absence is now a direct
provider readback with stable blocker codes.

## Fail-closed readiness model

Provider checks cover:

- app, version, locale, and exact Build 25 identity;
- editable state and App Review detail;
- content-rights declaration;
- every field in Apple's current age-rating questionnaire plus derived rating;
- explicit IDFA answer;
- largest-iPhone screenshot count and delivery completion;
- active Free price;
- complete territory inventory, intended USA availability, and blocking
  content statuses, including trader-status failures; and
- review-submission state without creating a submission.

The receipt intentionally keeps these as manual blockers even if every API
check becomes green:

- published App Privacy answers;
- EU DSA trader identity verification;
- physical Build 25 acceptance;
- production disposable-account deletion completion; and
- iPhone-only provider compatibility cleanup.

Apple requires App Privacy responses to cover the app and integrated third
parties across every platform, and publication requires an explicit human
confirmation. The public API does not expose a complete trustworthy readback
for that assertion, so Quipsly does not infer it from the privacy-policy URL or
the binary privacy manifest.

## Verification

- new operator unit coverage: 4/4;
- complete App Store/TestFlight operator coverage: 42/42;
- committed-source screenshot cleanup fixture: pass for default cleanup,
  explicit retention, fallback materialization, and failed-run preservation;
- JavaScript syntax: pass;
- live Apple read: completed with expected readiness exit `2`;
- receipt permissions: mode `0600`;
- receipt secret boundary: no API key, review email/phone, demo credential,
  asset token, upload operation, or screenshot checksum;
- App Store mutation: none;
- App Store submission: none; and
- repository diff check: pass at the implementation checkpoint.

During final verification the system volume reached `ENOSPC`. The bounded cause
was ten temporary screenshot-draft `DerivedData` trees totaling 11.98 GiB. They
were deleted while preserving screenshots, receipts, attachment exports, and
`.xcresult` evidence. Successful direct and exact-commit screenshot runs now
remove their regenerable `DerivedData` automatically; failed runs preserve it
for diagnosis, and `QUIPSLY_CAPTURE_KEEP_DERIVED_DATA=1` explicitly opts into
retention.

## Loop-back sequence

1. Account Holder/Admin answers content rights, age rating, IDFA, Free price,
   USA availability, and DSA trader status in App Store Connect.
2. Run the auditor again and require those provider checks to turn green.
3. Produce, visually approve, and upload the five Build 25 screenshots.
4. Publish accurate App Privacy answers and independently verify the UI state.
5. Complete physical-iPhone capture/recovery/upload/playback/alignment proof.
6. Operate production deletion against a disposable account and preserve the
   independent completion receipt.
7. Re-run the auditor, reconcile reviewer notes and public legal surfaces, then
   create the review submission as a separate explicit mutation.

Primary Apple references:

- [List App Infos and current age-rating fields](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appinfos)
- [Read app identity and content-rights declaration](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_)
- [Read App Store version localization and screenshot sets](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appstoreversionlocalizations-_id_)
- [Read app availability](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appavailabilityv2)
- [Territory blocking statuses](https://developer.apple.com/documentation/appstoreconnectapi/territoryavailability/attributes-data.dictionary)
- [Read app price schedule](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-apppriceschedule)
- [Review submissions](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-reviewsubmissions)
- [Manage App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
