# Quipsly Capture App Store listing

Date: 2026-07-24
Status: source-complete, submission-blocked

The canonical English (U.S.) listing is
[`release/app-store/quipsly-capture/en-US.json`](../../release/app-store/quipsly-capture/en-US.json).
It is machine-validated so field limits, canonical URLs, review boundaries,
screenshot dimensions, and submission blockers do not drift between a document,
an operator, and App Store Connect.

Validate the reviewed source packet:

```bash
pnpm quipsly:capture:app-store-metadata
```

Run the final fail-closed submission gate:

```bash
pnpm quipsly:capture:app-store-metadata --submission
```

The second command must remain red until all screenshot files are present at
their declared dimensions, each is explicitly approved, the blocker list is
empty, and readiness is changed to `ready`.

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

The category and copyright values are strong working recommendations, not proof
of the App Store Connect account holder's legal selections. The account holder
must confirm those values together with age rating, content rights, DSA trader
status, and territory availability before the packet can become submission
ready.

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
drafts from the app's deterministic preview state:

```bash
bash apps/mobile-capture/HighGroundCapture/scripts/capture-app-store-draft-screenshots.sh
```

That command operates all five real iPhone surfaces on an iPhone 17 Pro Max
simulator, exports `1320 x 2868` PNG attachments, hashes them, and writes a
`draft-receipt.json` beside the images under `/tmp`. The receipt always records
`submissionEligible:false`. Drafts are for composition and clipping review;
they do not satisfy the screenshot blocker and must never be copied into the
canonical approved-assets directory. Re-run the same five stories on the exact
signed candidate or its TestFlight install with the approved reviewer account,
then inspect and approve those final captures separately.

## Submission ownership

Reviewer credentials belong only in App Store Connect's App Review Information,
never in Git, screenshots, shell history, or shared logs. The checked-in packet
contains the safe review journey and points to the detailed review-notes draft.

The current blocker ledger is intentionally stored in the canonical JSON. It
includes production route parity, policy redirect deployment, legal/account
holder selections, reviewer state, screenshots, physical-iPhone proof,
TestFlight proof, App Privacy answers, and production account-deletion proof.
Removing a blocker requires evidence from the actual delivery layer; changing
the JSON alone is not evidence.

## Apple references

- [App information fields and name/subtitle limits](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [Platform version fields and Support URL requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [Screenshot upload rules](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/)
- [Current screenshot dimensions](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [App privacy management](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
- [Account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app)
