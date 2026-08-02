# Quipsly Capture App Store submission configuration

Date: 2026-08-01

Status: source-backed provider configuration complete; submission remains
blocked by explicit creative, privacy, legal, physical-device, deletion, and
compatibility gates

## Exact target

- App Store Connect app: `6780995957` (`Quipsly Capture`)
- Bundle ID: `com.highgroundodyssey.HighGroundCapture`
- iOS version: `1.0`
- build number: `25`
- provider build ID: `bacb25d1-1e0a-40aa-90a3-3e7cd195ee33`
- release type: manual

The operator defaults to a read-only plan. Mutation requires both `--apply`
and `--confirm-target 6780995957/1.0/25`. The canonical desired facts live in
`release/app-store/quipsly-capture/submission-configuration.json`.

## Applied and read back

Apple now reports:

- content rights: `USES_THIRD_PARTY_CONTENT`;
- age rating: 24/24 current questions answered, derived `TWELVE_PLUS`;
- IDFA: `usesIdfa: false`;
- price: active Free selection, base territory `USA`;
- availability: 175/175 territory rows read, only `USA` enabled, automatic new
  territories disabled, and no blocking status on the enabled territory; and
- exact Build 25 remains assigned to editable iOS 1.0.

The final configuration readback is idempotent: it reports zero actions, zero
blockers, and `configurationComplete: true`. The independent submission audit
reports pricing and availability complete while retaining an expected exit 2
for the gates below.

Private redacted evidence:

- `/private/tmp/quipsly-capture-app-store-connect/submission-configuration-applied-and-read-back.json`
- `/private/tmp/quipsly-capture-app-store-connect/submission-readiness-exit-proof.json`

Both files are mode `0600`. They contain no API key, JWT, review credential,
private user content, or screenshot-upload token.

## Provider defects found through real operation

Three production-boundary assumptions failed safely and were corrected from
provider evidence:

1. Apple accepts a JWT `scope` claim only for GET operations. Scoped PATCH
   returned HTTP 405 before mutation. Reads remain request-scoped; mutations
   use five-minute unscoped JWTs whose authority is limited by the Team Admin
   key, exact target confirmation, and the operator's fixed endpoint set.
2. App price and availability compound creates require inline resource IDs in
   literal `${local-id}` form. The first price attempt returned
   `ENTITY_ERROR.INCLUDED.INVALID_ID`; readback proved no price mutation before
   retry.
3. App Availability creation requires an explicit row for every current App
   Store territory. A USA-only one-row body was rejected. The operator now
   loads Apple's live 175-territory catalog, marks USA true and all others
   false, and reads all rows from the v2 relationship endpoint rather than
   mistaking the 50-resource include limit for a complete inventory.

Partial-success receipts identified the exact completed actions before each
retry. Content rights, age rating, and IDFA completed before the first compound
create error; Free pricing completed before the first availability error. No
rollback or duplicate create was guessed.

The readback also decodes Apple's opaque availability resource IDs to canonical
territory IDs and evaluates content statuses only for enabled territories. The
`CANNOT_SELL` plus `AVAILABLE_FOR_SALE_UNRELEASED_APP` pair is expected for a
first unreleased app and is not treated as a legal failure; unrelated disabled
EU-territory trader statuses do not make USA unavailable.

## Intentionally impossible through this operator

The operator cannot:

- upload or delete screenshots or previews;
- publish App Privacy answers;
- determine or change DSA trader identity;
- create or mutate App Review submissions;
- submit iOS 1.0 for review;
- release or publish the app; or
- change another app, version, or build without an exact target mismatch.

DEBUG preview screenshots remain ineligible layout evidence. Approved
screenshots must come from the signed candidate or its TestFlight installation.

## Remaining submission gates

1. Capture, visually approve, and upload five private-safe iPhone 6.9-inch
   screenshots from the exact signed/TestFlight experience.
2. Publish and independently verify accurate App Privacy answers.
3. Complete the account-level DSA trader determination.
4. Install and operate Build 25 on a physical iPhone, including consent, audio
   and video capture, front/back switching, pause/resume, interruption and
   force-quit recovery, upload, assembled playback, timeline alignment, and
   same-ID Nest/Studio readback.
5. Prove production account deletion with a disposable eligible account and
   independent database, Firebase, storage, notification, and retention
   readback.
6. Confirm iPhone-only availability and remove unintended Apple-silicon Mac or
   Vision compatibility.
7. Reconcile the signed archive privacy report, reviewer notes, public policy
   pages, and published App Privacy answers before creating a review
   submission.

## Verification

- focused submission configuration/readiness tests: 12/12;
- complete Apple operator/metadata suite: 48/48;
- Capture App Store static contract: 949/949;
- all changed JavaScript parses;
- canonical metadata validates after status reconciliation;
- final configuration readback: 175/175 territories, USA only, zero actions;
- independent readiness readback: exact Build 25, configuration fields green,
  no review submission, expected exit 2 for the preserved gates;
- receipts: mode `0600`;
- `git diff --check`: pass.

Primary Apple references:

- [Generating tokens for API requests](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests)
- [App information and Content Rights](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [Age-rating values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/)
- [Territory Availability attributes](https://developer.apple.com/documentation/appstoreconnectapi/territoryavailability/attributes-data.dictionary)
- [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/)
