# Quipsly Capture App Store Connect audit

Date: 2026-07-28
Observed at: 2026-07-29T01:34:08Z
Provider app ID: `6780995957`
Bundle ID: `com.highgroundodyssey.HighGroundCapture`
Observed app record name: `Quipsly Capture`
Intended storefront name: `Quipsly Capture`

## Scope and evidence boundary

This began as a read-only provider audit of the signed-in App Store Connect UI.
After the account holder explicitly chose the customer-facing name, the
localizable app record name was changed from `HighGroundCapture` to
`Quipsly Capture`, saved, and read back from the provider. No other form was
saved; this is not proof that any legal answer was approved, screenshot was
uploaded, build was installed, or version was submitted.

The exact TestFlight binary remains `1.0 (6)` from source
`f10ceab5e83ce08e61092d3cf6a8e8ec2f457589`, provider build
`47e5e730-e5bd-4cfb-afae-baef86d3923c`. A scoped App Store Connect API
readback now reports `processingState: VALID`,
`internalBuildState: IN_BETA_TESTING`, and
`externalBuildState: READY_FOR_BETA_SUBMISSION`. The manually controlled
`Quipsly Capture Internal` group contains exactly this build and one assigned
internal tester.

## Live provider state

### App information

- App Store Connect names the record `Quipsly Capture`; the provider showed
  `Saved` and returned the new value on readback at `2026-07-28T22:48:22Z`.
- Subtitle is empty.
- Primary and secondary categories are unset.
- Content Rights is not set up.
- Age Ratings is not set up.
- The standard Apple license agreement is selected.
- The bundle ID, SKU, and Apple ID exist and are immutable provider identity.
- Digital Services Act account information is not set up.

### iOS version 1.0

- Status is `Prepare for Submission`.
- Promotional text, description, keywords, Support URL, Marketing URL, and
  copyright are empty.
- No App Store screenshots or previews are present.
- No build is selected for the App Store version.
- Sign-in is marked required, but reviewer username and password are empty.
- Reviewer contact information and notes are empty.
- Release behavior is currently automatic after approval; the source packet
  requires manual release for the first version.

### App Privacy

- Privacy Policy URL is empty.
- User Privacy Choices URL is empty.
- Data collection answers have not been started.
- Nothing has been published.

The checked-in source inventory declares no tracking and linked,
app-functionality collection for name, email address, user ID, device ID, audio
data, and other user content. Those declarations are engineering input, not a
substitute for the account holder's final App Store privacy answers.

### Pricing and availability

- No starting price is set.
- Territory availability is not set.
- Public distribution is selected.
- Compatibility distribution is currently enabled for Apple silicon Macs and
  Apple Vision Pro.
- Separate empty `1.0 Prepare for Submission` shells also exist for macOS and
  visionOS. Quipsly Capture is an iPhone-only first release, so these should be
  removed after an explicit destructive-action confirmation.

### TestFlight information

- Beta description, feedback email, Marketing URL, Privacy Policy URL, review
  contact information, sign-in information, and review notes are empty.
- Build 6 is assigned only to the internal group.
- App Store Connect API access is approved. The `QuipslyAdmin` Team Admin key
  is stored outside the repository in owner-only files and passed a live
  HTTP-200 app-identity request. The repository-owned readback uses an
  explicitly scoped five-minute JWT and emits a redacted receipt.
- App Store Connect now reports the sole tester as `INSTALLED` at
  `2026-07-29T01:34:08Z`. That is provider-side proof that Build `1.0 (6)` was
  installed after the reinvited tester opened the correct TestFlight card. It
  is not proof that Quipsly Capture launched, displayed its own version/build,
  signed in, or completed a production workflow on that device.

## Recommended account-holder decisions

These are recommendations for review, not saved provider answers.

| Field | Recommended first-release answer | Why it still needs a human |
| --- | --- | --- |
| Storefront name | `Quipsly Capture` | Saved and read back from App Store Connect on 2026-07-28. |
| Subtitle | `Capture work. Keep context.` | Matches the checked-in source packet and 30-character limit. |
| Primary category | Productivity | The core customer outcome is notes, tasks, goals, projects, and follow-through. |
| Secondary category | Photo & Video | Capture, recording, transcripts, and source recovery are central but supporting. |
| Copyright | `2026 High Ground Odyssey` | The account holder must confirm the actual legal owner text. |
| Price | Free | The first app is an authenticated product edge; do not imply an iOS digital-goods checkout. |
| Release | Manual | Preserves an explicit final readback and release decision after approval. |
| Mac / Vision compatibility | Off | The first candidate was designed, tested, and documented as iPhone-only. |
| Content rights | Third-party/user media only when authorized | The account holder must attest that Quipsly and its users have permission for accessed content. |
| DSA status | Likely trader if distributed in the EU | Apple requires a self-assessment and may publish verified business contact details. This is a legal/account-holder decision. |
| Availability | Start with territories the account holder can support | China mainland and some other regions can add documentation requirements. |

The age-rating questionnaire must describe the exact shipping binary, not the
long-term roadmap. Build 6's iPhone shell does not expose direct session chat;
it records and shows user-provided media and may contain ordinary coaching or
podcast subject matter. It has no advertising, gambling, open web browser,
public social feed, or app-authored violent, sexual, or drug content. Final
capability and frequency answers remain account-holder declarations.

## Safe work that can proceed without legal approval

- Keep the canonical listing copy machine-validated.
- Prepare TestFlight beta description, feedback URL/email, and reviewer notes
  without credentials.
- Create and prove a synthetic reviewer account and visible session.
- Install and operate Build 6 from TestFlight on the physical iPhone.
- Capture approved 6.9-inch screenshots from a private-data-safe production
  state; Apple accepts one to ten screenshots and requires a current large
  iPhone slot.
- Run the disposable production account-deletion proof and reconcile the exact
  privacy inventory.

## Actions that require the account holder

1. Confirm legal copyright owner, Content Rights, age-rating answers, DSA
   trader status, price, and territory availability.
2. Enter or approve reviewer credentials in App Store Connect without placing
   them in Git, screenshots, shell history, or logs.
3. Approve each screenshot after visual and private-data review.
4. Approve final App Privacy answers and publication.
5. Approve deleting the accidental macOS and visionOS version shells.
6. Approve saving the provider metadata packet and, later, adding the version
   for review.

## Official Apple references

- [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [Age-rating values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions)
- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Manage App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [EU Digital Services Act trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)

## 2026-07-29 Build 8 external-beta addendum

This section supersedes the TestFlight-specific Build 6 snapshot above; it does
not replace the historical App Store listing/privacy audit.

- Exact Build 8 provider ID:
  `32fdd892-e38a-41bb-992d-ef2c049bc43a`.
- The private `Quipsly Capture Rehearsal` external group contains Build 8 and
  the intended tester, with automatic notification enabled and current beta
  app/build localization.
- The synthetic reviewer account and visible consent-gated production
  Sessions are proved. Credentials remain outside Git. A real reachable review
  contact and current recording/recovery notes are stored in App Store Connect.
- The scoped API applied `update-beta-app-review-detail` and
  `submit-build-for-beta-review`. Readback at
  `2026-07-29T06:57:53.070Z` reports
  `externalBuildState: WAITING_FOR_BETA_REVIEW` and
  `betaReviewState: WAITING_FOR_REVIEW`.
- Apple approval, tester notification, Build 8 installation, app-owned version
  readback, and physical workflow proof remain open. App Store listing,
  screenshots, privacy publication, legal questionnaires, availability, and
  the disposable production deletion proof also remain open.
