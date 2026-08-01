# Production Capture cross-device system checkpoint

**Date:** 2026-08-01

**Status:** compiled Build 25 iPhone operation and same-record production Nest
readback complete; physical TestFlight iPhone acceptance remains open

## Outcome

The released Quipsly Capture product and production Nest now share one retained,
private project system that can be operated across releases. The compiled iPhone
app created a real production project, Task, document-kernel Note, active Goal,
and one canonical tag assigned across all three work records. Rendered Nest then
opened those same stable records on desktop and phone-width surfaces.

This is durable QA data for the fixed `codex@dev.test` identity. It was not
cleaned up after success. No real collaborator identity, invitation, recording,
calendar, payment, message, or publication was involved.

## Native production operation

The fail-closed operator was introduced in exact commits:

- `3290ead51bc3d94954421dac7d3d4e36c0a8d2fa`: production native-project
  operator and source contracts;
- `7cce8021b7a614345b938c33052f8d938f907164`: stable macOS Keychain read path.

The first run exposed that the dynamically interpreted Swift Keychain reader
could sleep indefinitely before the product journey. A direct, no-output
diagnostic proved `/usr/bin/security find-generic-password` returned the same
credential immediately. The read path now uses that stable system CLI, removes
only its terminal newline, and never places or prints the password in command
arguments, logs, or receipts. The existing Swift/stdin write path remains.

The successful operator ran the released Build 25 source
`4ef8ddbacbba7949b16607d8dae5454ff28e9082` through
`CaptureRoomRuntimeSmokeTests.testIPhoneCreatesRetainedProjectAndOrganizesCanonicalWork`.
The compiled iPhone Simulator journey passed 1/1 in 114.090 seconds (168.862
seconds for the complete XCTest session), with no unexpected runtime warnings.
It authenticated through Firebase and the native-session exchange, selected the
Home Nest, created the graph through the visible app, and independently read it
back from the canonical production APIs.

Stable production records:

| Record | Stable identity | State |
| --- | --- | --- |
| Project | `cmsa4j3qx001001s61chyta98` | `qa-retained-production-iphone-system-2026-08-01-a` |
| Task | `mobile-task-d6067a0b-8193-4551-a4a6-b5558ced29bb` | `OPEN` |
| Note | `mobile-note-2ab23f02-d872-41e0-91f3-b0939473676b` | stable document ID `mobile-document-note-2ab23f02-d872-41e0-91f3-b0939473676b` |
| Note revision | `5b1cf2bad828af795ece97e16f04ad1ea228619546bb5f843fb8a219b706c6a2` | exact content read back |
| Goal | `mobile-goal-06ca3215-b93c-49bc-a1d6-d8b236edde14` | `ACTIVE` |
| Tag | `cmsa4jr6j001601s6v1zigqwm` | `QA Retained · Product system A`, usage count 3 |

The existing retained Session `cmsa2xxoo001i01s639zmnn5u` remained unchanged;
the account had ten Sessions before and after this operation.

Private native evidence:

- XCResult:
  `/Volumes/My Passport/Quipsly QA Artifacts/Retained Production/2026-08-01/capture-build25-production-project-a.xcresult`;
- mode-`0600` receipt:
  `/Volumes/My Passport/Quipsly QA Artifacts/Retained Production/2026-08-01/capture-build25-production-project-a.json`;
- receipt SHA-256:
  `098977bdc7112d92a388bc6a3972eea0ce279d47422df2df00700b34d0024a5b`.

## Rendered Nest defect and repair

The first rendered production readback opened all target records and wrote four
private screenshots, but correctly failed instead of issuing a receipt because
two full `/work` loads raised React minified hydration error `#418`. The failed
evidence remains preserved at:

`/Volumes/My Passport/Quipsly QA Artifacts/Retained Production/2026-08-01/capture-build25-production-project-a-web`

Both errors mapped to Work timestamps formatted with an implicit locale and
timezone during server rendering, then reformatted in the browser during
hydration. Commit `e6ce7da7` routes visible Work dates through the existing
UTC-first `LocalDateTime` contract, adds deterministic date-only rendering,
and keeps non-hydratable `<option>` labels explicitly in UTC. The regression
suite server-renders Task, Goal, and weekly-commitment timestamps across that
boundary. Commit `f1a40357` also corrects the preview-secret contract test to
match the already-hardened two-secret deploy mapping.

Verification before release:

- complete Quipsly Jest suite: 195 suites and 989 tests passed; 34 suites and
  100 intentionally gated tests remained skipped;
- focused Work/LocalDateTime suite: 34/34 passed;
- TypeScript 7 strict typecheck passed;
- optimized Next.js 16 production build generated all 150 routes;
- release manifest audit passed all seven manifests;
- release-pipeline contracts passed 15/15.

## Exact production release

The exact committed release source is
`f1a403572cd5804a6ffb81a6a6112edf0b8809c2`.

- Cloud Build: `3154fb52-ef10-4b10-9df0-dd25917e6388` (`SUCCESS`);
- pushed multi-platform image manifest:
  `sha256:9133e8a065e09c33b3e02dc2abc37763621b258b1c1f0b7134ed112eafaf2208`;
- Cloud Run revision: `studio-00490-hex`;
- runtime platform image digest:
  `sha256:b84bc743747ee9016dec964afa3471c619bb8b2c294f04baa7089ace33670879`;
- production traffic: 100% to `studio-00490-hex`.

The exact-context preflight installed the pinned workspace, passed 30/30
Session-evidence tests, regenerated Prisma, compiled the strict 150-route
bundle, proved managed media-vault IAM, and passed the production recovery gate
including all 111 mobile Capture contracts. The image passed required-route
inspection before a zero-traffic deploy.

The generated reviewer then used a separate temporary identity against the
immutable preview, persisted a database-backed Session workspace, rendered
the Episode Room timeline handoffs, logged out, and verified complete Firebase
and database cleanup. Promotion re-resolved the preview tag, moved only
`studio-00490-hex` to 100%, and passed production recovery. Automatic rollback
remained armed but was not needed.

## Final same-record web readback

The second read-only rendered operation passed against production. It proved:

- the exact Project, Task, Note, Goal, and Tag IDs above;
- Project Overview, Notes, and Work on desktop;
- focused global Task and Goal routes;
- the Note's exact stable document path;
- the shared Tag rendered on project and Work surfaces with usage count 3;
- the Project Overview at phone width;
- no horizontal overflow, browser exception, server failure, or product write;
- browser-session removal and zero external side effects.

Private final evidence directory:

`/Volumes/My Passport/Quipsly QA Artifacts/Retained Production/2026-08-01/capture-build25-production-project-a-web-v2`

The four screenshots and `readback.json` are all mode `0600`. The readback
receipt SHA-256 is
`dcf3b8d0d6155ca48ae4442fed500dfcf5d2a70e09687d30043edf9fe5ce98b0`.

## Boundaries still open

This closes compiled-iPhone-to-production-Nest continuity for core project,
Task, Note, Goal, and tagging records. It does not substitute for physical
hardware. The remaining acceptance boundary is to install Build 25 from
TestFlight on a CoreDevice-visible iPhone and operate the same retained world
through real note/task/goal/tag work plus consented audio/video, pause/resume,
camera switching, interruption recovery, upload, transcript, timeline
alignment, and same-ID Studio playback.
