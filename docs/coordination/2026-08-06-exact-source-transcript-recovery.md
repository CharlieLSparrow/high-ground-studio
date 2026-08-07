# Exact-source transcript recovery

Date: 2026-08-06

## Defect

The Session Source Journey could truthfully identify a recovered RecordingAsset
with missing transcript evidence, but the Transcript workspace loaded the newest
TranscriptJob for the room. Following the recovery link could therefore show a
different microphone or camera source. If the intended source had no job at all,
the UI had no way to invoke the already-existing safe backend path that creates
its first durable job.

That is an identity and authority defect, not a missing-dashboard problem.

## Production contract

The source-specific workflow is now:

1. An incomplete Transcript checkpoint links to
   `/sessions/:roomId?mode=transcript&source=:recordingAssetId`.
2. The server parses the focus as display/navigation state only.
3. Packet GET proves canonical access to the Session, then looks up the
   RecordingAsset with both its exact ID and that room ID.
4. Transcript selection is constrained by both `roomId` and `assetId`.
5. The mobile-capture processing gate evaluates the selected RecordingAsset,
   even when it has no TranscriptJob yet.
6. Packet read exposes a bounded start action only when release/consent evidence
   allows processing. It creates no job by itself.
7. The user's explicit **Start transcription** action sends that exact
   `recordingAssetId` to the existing durable transcript-run endpoint.

A mismatched or inaccessible source returns 404. The response exposes only the
safe selected-source identity used by the UI; checksums, storage paths, and
credentials are not added to the packet.

## UX

The Source Journey retains actions at the point of evidence:

- Plan gaps open the recording plan.
- Capture gaps open durable Capture receipts.
- Retention gaps open independent source evidence.
- Transcript gaps open the exact RecordingAsset transcript workspace.
- Editor gaps open the canonical selected take when one exists.

The Transcript status card says `NOT STARTED`, shows the focused RecordingAsset
identity, and names the selected file. It does not show a generic empty state or
quietly substitute another source. Starting transcription remains one explicit
button with the existing statement that it creates derived text only—not notes,
tasks, goals, delivery, or publication.

## Retained local HTTP operation

Run against the local Nest, Firebase Auth emulator, PostgreSQL, and the retained
QA credential in macOS Keychain:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
  pnpm quipsly:retained:session-transcript-source-focus
```

The operation is explicitly activated, refuses non-loopback service/database
origins, and only performs authenticated GETs plus database reads. For room
`cmsfpfwrt000db9xld8ppuon4` and recovered DJI source
`cmsi2v4l4000rlqxl78h1w8t3`, it proved:

- exact source identity returned by the Session packet;
- transcript status `NOT_STARTED`;
- zero TranscriptJobs before and after repeated packet reads;
- the bounded `Start source-bound transcript` action available;
- identical stable source/action projection on replay;
- HTTP 404 when an asset from another room was requested through this room;
- no provider job enqueued and no publication started.

The operation deliberately did not press Start. Enqueuing transcription is a
durable compute action and should be performed when a person chooses this source,
not as a side effect of testing navigation.

## Verification

```bash
pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  'src/app/(app)/sessions/[roomId]/session-finishing-cockpit-card.test.tsx' \
  'src/app/(app)/sessions/[roomId]/session-review-client.test.tsx' \
  'src/app/api/mobile/capture/transcripts/packet/route.test.ts' \
  'src/app/(app)/sessions/[roomId]/page.test.tsx'
node --test scripts/quipsly-retained-session-transcript-source-focus-operation.test.mjs
pnpm --filter quipsly typecheck
git diff --check
```

The focused app set passes 61 tests and the operation guard set passes 2 tests.
The repository currently defines no Quipsly lint script, so this checkpoint does
not claim a lint run.
