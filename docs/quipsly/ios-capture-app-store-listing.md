# Quipsly Capture App Store listing

Date: 2026-08-05
Status: safe provider metadata applied and read back; submission blocked

The canonical English (U.S.) listing is
[`release/app-store/quipsly-capture/en-US.json`](../../release/app-store/quipsly-capture/en-US.json).
It is machine-validated so field limits, canonical URLs, review boundaries,
screenshot dimensions, and submission blockers do not drift between a document,
an operator, and App Store Connect.

Validate the reviewed source packet:

```bash
pnpm quipsly:capture:app-store-metadata
pnpm quipsly:capture:privacy -- --strict
```

Run the final fail-closed submission gate:

```bash
pnpm quipsly:capture:app-store-metadata --submission
```

The second command must remain red until all screenshot files are present at
their declared dimensions, each is explicitly approved, the blocker list is
empty, and readiness is changed to `ready`.

Apply or read back the safe listing fields with the API-backed operator:

```bash
pnpm quipsly:capture:app-store-listing
pnpm quipsly:capture:app-store-listing --apply \
  --review-contact-first-name <name> \
  --review-contact-last-name <name> \
  --review-contact-email <email> \
  --review-contact-phone <phone>
```

Read-only planning is the default. Apply mode reads the demo password from
macOS Keychain, writes safe metadata and the exact validated build, then reads
everything back. Its mode-0600 receipt stores only hashes for reviewer contact
and demo-account identity; it never prints or stores the password or API key.

## Listing direction

- Name: **Quipsly Capture**
- Subtitle: **Capture work. Keep context.**
- Primary category: **Productivity**
- Secondary category: **Photo & Video**
- Support: `https://quipsly.com/support`
- Marketing: `https://quipsly.com`
- Privacy: `https://quipsly.com/privacy`
- Privacy choices and account deletion:
  `https://quipsly.com/privacy/account-deletion`
- Release: manual after App Review approval

These categories, copyright, manual release, the en-US listing, policy URLs,
Build 28, and App Review details are now applied and read back in App Store
Connect. Content rights, all current age-rating questions, IDFA false, Free
pricing, and USA-only availability also have provider readback. App Privacy
publication, the account-level DSA determination, approved screenshots,
physical-device acceptance, account-deletion proof, and iPhone-only provider
compatibility remain open before submission.

The source now resolves `SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD=NO` alongside
the existing iPhone-only family and Mac opt-out settings, and signed Build 28
proves `UIDeviceFamily=[1]`. Apple still computes Build 28 as capable of running
on Apple silicon Mac. That does not mean it should be offered there: use
**Pricing and Availability** to deselect both the Apple Silicon Mac and Apple
Vision Pro availability controls, save, reload, and preserve visual readback.
The supported App Store Connect API exposes the computed build compatibility
but not these two app-level choices.

Apple permits 1–10 screenshots. The canonical plan uses five portrait
screenshots in one accepted 6.9-inch size, `1320 x 2868`, so App Store Connect
can scale them for smaller current iPhones. App previews are optional and are
out of first-release scope.

## Screenshot story

1. **Know what matters today** — Today with synthetic tasks, goals, and one
   clear next action.
2. **Consent before capture** — independent audio and transcription choices
   before recording can start.
3. **Turn the moment into work** — a project connecting notes, tasks, goals,
   and flexible tags.
4. **Keep the original safe** — Library showing local-source truth and
   recoverable upload state.
5. **Privacy you can reach** — Account with direct privacy and deletion
   controls.

Capture from the exact physical-device or TestFlight candidate using only the
approved synthetic reviewer account. Do not show private coaching data,
recordings, transcripts, unpublished research, credentials, notifications,
device identifiers, or another person's name. Crop only system chrome that is
outside the product story; do not fabricate product state.

Before the signed candidate is available, generate private-data-safe layout
drafts from the app's deterministic preview state. The preferred release
boundary resolves one commit and excludes caller-worktree drift:

```bash
scripts/release/quipsly-capture-screenshots-from-commit.sh \
  --revision <candidate-source-sha>
```

For local composition work against the current checkout, the lower-level
runner remains available:

```bash
bash apps/mobile-capture/HighGroundCapture/scripts/capture-app-store-draft-screenshots.sh
```

The preferred command uses a disposable detached worktree, operates all five
real iPhone surfaces on an iPhone 17 Pro Max simulator, exports `1320 x 2868`
PNG attachments, hashes them, and writes both `draft-receipt.json` and
`committed-source-receipt.json` beside the images under `/tmp`. The receipts
record the exact source revision, clean detached-source isolation, and
`submissionEligible:false`. Drafts are for composition and clipping review;
they do not satisfy the screenshot blocker and must never be copied into the
canonical approved-assets directory. Re-run the same five stories on the exact
signed candidate or its TestFlight install with the approved reviewer account,
then inspect and approve those final captures separately.

The 2026-08-05 clean detached source `9387c6254a1d5a6e78aae2ae01193ab38af72451`
produced all five valid `1320 x 2868` layouts. An earlier exact-Build-28 journey
exposed that the Account test asserted Privacy and Request Account Deletion
before scrolling them into view; the repaired journey now captures the actual
reachable controls. These remain DEBUG composition evidence with
`submissionEligible:false`, retained outside Git under the Quipsly QA artifacts
volume. Signed/TestFlight recapture and human approval remain required.

## Submission ownership

Reviewer credentials belong only in App Store Connect's App Review Information,
never in Git, screenshots, shell history, or shared logs. The checked-in packet
contains the safe review journey and points to the current review notes.

The current blocker ledger is intentionally stored in the canonical JSON. It
now contains only legal/account-holder selections, signed-candidate screenshots,
physical-iPhone proof, App Privacy answers, and production account-deletion
proof.
Removing a blocker requires evidence from the actual delivery layer; changing
the JSON alone is not evidence.

## Apple references

- [App information fields and name/subtitle limits](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [Platform version fields and Support URL requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [Screenshot upload rules](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/)
- [Current screenshot dimensions](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [App privacy management](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
- [Account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app)
