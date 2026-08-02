# Quipsly Capture App Store listing — current readiness

Date: 2026-08-02

Status: metadata staged; listing is not yet submission-ready

## Live App Store Connect readback

App Store Connect currently reports:

- app: Quipsly Capture (`6780995957`);
- iOS version: 1.0, `PREPARE_FOR_SUBMISSION`;
- assigned binary: Build 25 (`bacb25d1-1e0a-40aa-90a3-3e7cd195ee33`);
- release mode: manual;
- IDFA: no;
- Content Rights: complete;
- age-rating questionnaire: 24 of 24 answers, rated 12+;
- price: Free;
- availability: United States complete;
- reviewer contact and review information: present; and
- screenshots: zero delivered to Apple.

The canonical checked-in listing supplies the description, keywords, support and privacy URLs, promotional copy, reviewer notes, version facts, age-rating answers, and a five-screen creative plan.

## Screenshot audit

Five 1320-by-2868 portrait drafts were captured from exact committed source `6b858194274538f4572a03b3f74e3c74639a1848` and visually reviewed:

1. Today — next Session, Calendar continuity, and follow-through;
2. Record — independent audio, video, transcription, and participant consent choices;
3. Work — one project identity across tasks, goals, notes, and tags;
4. Library — separate local-save, upload, server-verification, and transcript truth; and
5. Account — reachable privacy, deletion, upload-policy, and local-original controls.

The images are coherent, private-data-safe synthetic states, and contain no real HGO or coaching information. They remain design-approved drafts only. Build 25 came from source `4ef8ddbacbba7949b16607d8dae5454ff28e9082`; uploading newer-source screenshots would let the listing promise an experience that the assigned binary cannot reproduce. Final images must be recaptured from the next exact signed/TestFlight candidate and explicitly approved before upload.

## Remaining gates

1. Bundle the current product slices into the next deliberately spaced signed candidate.
2. Recapture and approve the five screenshots from that exact candidate.
3. Publish accurate App Privacy answers in App Store Connect and verify the public result.
4. Complete the account-holder EU Digital Services Act trader determination.
5. Perform physical-iPhone acceptance against the exact TestFlight build.
6. Prove account deletion with one disposable production user and zero unintended residue.
7. Remove the accidental empty macOS and visionOS version shells after explicit destructive confirmation.

The screenshot uploader remains intentionally disabled until candidate identity, image checksums, human approval, and Apple delivery readback are all part of one auditable command. Metadata-only work should be accumulated between spaced binary releases; it does not justify a new Cloud Build or TestFlight upload by itself.
