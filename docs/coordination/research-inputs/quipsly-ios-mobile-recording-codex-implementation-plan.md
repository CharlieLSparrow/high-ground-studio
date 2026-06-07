# Quipsly iOS Mobile Recording Implementation Plan for Local Codex Agent

Date: 2026-06-05

Prepared for: Chuck / High Ground Studio

Repo studied: `CharlieLSparrow/high-ground-studio`

Suggested destination in repo: `docs/agents/quipsly-ios-mobile-recording-codex-plan.md`

Purpose: give a local Codex Agent enough product context, repo context, architecture, data model, API contracts, native iOS guidance, web fallback guidance, upload design, risks, and acceptance criteria to implement Quipsly mobile recording safely without rediscovering the same swamp one boot at a time.

---

## 0. Read this before writing code

This is not a generic recording feature. Quipsly needs durable, high-quality, locally captured audio for creators reading a manuscript while watching synchronized clips, sometimes during a two-person live call. The recorder is production-critical. If it loses audio, silently gaps, uploads partial data as if complete, or claims iPhone Safari is safe for background recording, the product breaks trust at the exact moment creators need the app to behave like a tiny black box flight recorder.

The correct architecture is:

```text
Native iPhone local segmented recorder
  -> durable local files
  -> local manifest
  -> resumable/background-aware upload queue
  -> server-side segment verification
  -> sync anchors for manuscript, clips, and editor timeline
```

Mobile web is allowed only as a foreground fallback for short takes. It must not be marketed or implemented as the safe full-session iPhone recorder.

Non-negotiable decisions:

1. Production iPhone recording is native-first.
2. Web/PWA recording is fallback-only and foreground-only.
3. Local files are the source of truth until the server verifies uploaded objects.
4. Recording segments and upload chunks are different concepts.
5. Do not use `MediaRecorder` chunk count or `timeslice` cadence as authoritative duration.
6. Every phone call, audio interruption, route change, crash recovery, app lifecycle gap, or web visibility gap is a segment boundary or explicit risk marker.
7. During two-person calls, each participant records their own local isolated track. The call stream is conversation transport and optional reference, not the production master.
8. Do not delete local audio until server verification succeeds.
9. Do not hard-code bucket names or return mock upload success in production paths.
10. Do not silently stitch across interruptions. Preserve gaps honestly.

---

## 1. Repo orientation for the local agent

Start by reading the repo's own command deck and durable context:

```text
AGENTS.md
docs/project-context/current-state.md
docs/architecture/quipsly-quiplore-foundation.md
docs/plans/quipsly-quiplore-now-next-later.md
docs/agents/quipsly-quiplore-codex-brief.md
docs/analysis/studio-manuscript-mobile-recording-companion-plan.md
docs/sessions/studio-manuscript-mobile-recording-result.md
docs/runbooks/studio-manuscript-live-room.md
```

The repo is a pnpm monorepo with `apps/*` and `packages/*`. Quipsly already exists as a separate app and API surface:

```text
apps/quipsly
apps/quipsly-api
packages/quipsly-domain
```

The root scripts already include Quipsly commands:

```bash
pnpm quipsly
pnpm quipsly:build
pnpm quipsly:typecheck
pnpm quipsly:api
pnpm quipsly:api:build
pnpm quipsly:api:typecheck
pnpm quipsly:domain:build
pnpm quipsly:domain:typecheck
```

Key existing Quipsly files:

```text
apps/quipsly/package.json
apps/quipsly/next.config.mjs
apps/quipsly/src/app/recorder/page.tsx
apps/quipsly/src/app/manuscript/studio-manuscript-client.tsx
apps/quipsly/src/app/manuscript/manuscript-editor-model.ts
apps/quipsly/src/lib/webrtc/LiveKitProvider.ts
apps/quipsly/src/lib/server/gcs.ts
apps/quipsly/src/app/api/upload/presigned/route.ts
apps/quipsly-api/package.json
apps/quipsly-api/src/lib/api.ts
apps/quipsly-api/src/app/v1/quipstream/sessions/route.ts
apps/quipsly-api/src/app/v1/quipstream/events/route.ts
packages/quipsly-domain/package.json
packages/quipsly-domain/src/index.ts
packages/quipsly-domain/src/openapi.ts
packages/quipsly-domain/src/seed.ts
prisma/schema.prisma
```

Current architecture docs say Quipsly should be first-class and should not be forced through existing HGO or Studio internals. They also say Quipsly should be Google Cloud native with its own service boundaries, Cloud Run services, Cloud SQL posture, Cloud Storage, worker/job surface, Secret Manager entries, and narrow service accounts.

Important caution: earlier Quipsly/QuipLore docs told agents to avoid root `prisma/schema.prisma` until the service boundary was explicit. This task is an explicit implementation-planning handoff for recording. If the implementation changes Prisma, do it additively, document the change, and do not run `pnpm db:push` against a remote or production database unless Chuck explicitly confirms the target is safe.

---

## 2. Current repo findings that matter for recording

### 2.1 `apps/quipsly/src/app/recorder/page.tsx` is a prototype, not a safe recorder

The current recorder page:

- is client-only React.
- starts camera and mic on mount through `navigator.mediaDevices.getUserMedia`.
- uses Web Audio `AnalyserNode` for a meter.
- uses `new MediaRecorder(stream, { mimeType: "video/webm" })`.
- calls `recorder.start()` without a `timeslice`.
- does not listen to `dataavailable`.
- does not persist chunks.
- does not upload.
- does not recover.
- does not feature-detect MIME support.
- does not distinguish Safari/iPhone/PWA limits.
- uses a UI label that implies "Local isolated track recording" and "Riverside parity" before the safety architecture exists.

Treat this file as a visual prototype shell. It should be split into UI plus real recorder modules. Do not try to patch it into production by adding one more `ondataavailable` handler and calling that done. That would be duct tape on a fog machine.

### 2.2 The manuscript surface already has useful recording-mode primitives

`apps/quipsly/src/app/manuscript/studio-manuscript-client.tsx` already has:

- `isRecordingMode` state.
- `editor.setEditable(!isRecordingMode)` so Recording / Reading mode is view-only.
- recording outline derivation from structure regions.
- semantic highlight support, including `clip` and `show-notes` types.
- local draft persistence under `high-ground-studio.manuscript-editor.v1`.
- import/export/handoff helpers, including `createRecordingHandoffMarkdown`.

This means the implementation should not invent a separate manuscript model for recording. Instead, it should create sync anchors against existing manuscript block IDs, semantic highlights, structure regions, and clip markers.

### 2.3 Existing mobile recording docs deferred exactly the next pieces

`docs/analysis/studio-manuscript-mobile-recording-companion-plan.md` and `docs/sessions/studio-manuscript-mobile-recording-result.md` already say:

- recording support starts with reading, navigation, and reduced accidental edit risk.
- clip markers, recording comments, take markers, audio sync, multi-user collaboration, and saved recording presets were deferred.
- Recording / Reading mode is a responsive viewing/navigation layer around the same TipTap/ProseMirror JSON, block IDs, marks, and structure regions.

This plan implements the deferred recording spine without replacing the manuscript surface.

### 2.4 Live room exists but is not the audio recording architecture

`docs/runbooks/studio-manuscript-live-room.md` describes a private `/manuscript/live` room with Yjs updates, polling, presence heartbeats, shareable links, and snapshots. That is collaboration state, not media capture durability.

Use the live-room concepts for presence and event vocabulary. Do not treat the live room as the master recorder.

### 2.5 `apps/quipsly/src/lib/webrtc/LiveKitProvider.ts` is a stub

The current provider is a placeholder that logs connection actions and comments that local recording would use browser `MediaRecorder` plus OPFS or File System Access API. For this feature:

- keep WebRTC/LiveKit as a call transport abstraction.
- do not let it own the production recording model.
- if LiveKit is adopted for native iOS, coordinate `AVAudioSession` ownership carefully.
- local isolated recording must be independent enough to survive call network degradation.

### 2.6 Existing GCS upload code is a prototype

`apps/quipsly/src/lib/server/gcs.ts` currently:

- hard-codes `BUCKET_NAME = "high-ground-media-vault"`.
- writes to `ingest/${Date.now()}-${fileName}`.
- returns a mock upload URL if credentials fail.

`apps/quipsly/src/app/api/upload/presigned/route.ts` currently:

- returns a mock Storage URL using `high-ground-raws/episodes/${episodeId}/${filename}`.
- is under `apps/quipsly`, not `apps/quipsly-api`.

For recording, replace this with session-scoped upload intents under `apps/quipsly-api`. Keep the old endpoint only as legacy/prototype unless a separate migration removes it.

### 2.7 `apps/quipsly/Dockerfile` appears to be miswired

The current `apps/quipsly/Dockerfile` copies `apps/studio/package.json`, runs `pnpm --filter studio build`, and copies `apps/studio/.next/standalone`. If deployment work is in scope, fix this separately. Do not let the recording implementation depend on this Dockerfile being correct.

---

## 3. Official source conclusions to preserve in code comments and docs

Use these as source-of-truth architecture constraints.

### 3.1 Safari `MediaRecorder` support exists, but format and behavior require feature detection

WebKit documents Safari `MediaRecorder` support and shows feature detection using `MediaRecorder.isTypeSupported`. The WebKit article says Safari currently supports MP4 with H.264 video and AAC audio for generated output blobs. For audio-only iPhone fallback, prefer runtime detection for `audio/mp4;codecs=mp4a.40.2`, then `audio/mp4`, then desktop-friendly alternatives.

Source: https://webkit.org/blog/11353/mediarecorder-api/

### 3.2 `MediaRecorder.timeslice` is not a clock

MDN documents that `dataavailable` can fire on stream end, `stop()`, `requestData()`, or `start(timeslice)`, but warns that `timeslice` is not exact. Delays can happen because of browser tasks, Safari pausing camera/microphone, screen lock behavior, or browser bugs. The implementation must not derive elapsed time from chunk count.

Source: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event

### 3.3 Browser storage is not a vault

WebKit's storage policy says web storage is quota-bound and can be evicted under quota pressure, storage pressure, or inactivity. IndexedDB is useful, but the browser controls the vault door. Use native files for production iPhone recording.

Source: https://webkit.org/blog/14403/updates-to-storage-policy/

### 3.4 Background Sync is not a dependable iPhone upload system

MDN marks Background Synchronization as limited availability and not Baseline because it does not work in some widely used browsers. Do not rely on service-worker background sync for iPhone upload recovery. Web upload recovery must be foreground-first and explicit.

Source: https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API

### 3.5 Native iOS has the correct primitives for recording through screen lock and app switch

Apple's Audio Session category table says `AVAudioSessionCategoryRecord` continues recording with the screen locked and `AVAudioSessionCategoryPlayAndRecord` supports input and output. Apple also notes that background audio requires the `UIBackgroundModes` audio key in `Info.plist` in addition to the correct category.

Source: https://developer.apple.com/library/archive/documentation/Audio/Conceptual/AudioSessionProgrammingGuide/AudioSessionCategoriesandModes/AudioSessionCategoriesandModes.html

### 3.6 Native iOS interruptions must be explicit segment boundaries

Apple's interruption guidance says an audio interruption deactivates the app's audio session and immediately stops audio. It specifically mentions phone calls, Clock/Calendar alarms, and other audio sessions. Apple says an app may be suspended if a user accepts a phone call, that state should be saved, UI updated, and audio session reactivated when appropriate. Apple also says there is no guarantee that a begin interruption has a corresponding end interruption.

Source: https://developer.apple.com/library/archive/documentation/Audio/Conceptual/AudioSessionProgrammingGuide/HandlingAudioInterruptions/HandlingAudioInterruptions.html

### 3.7 iOS recording and VoIP apps need different audio-session modes

Apple's app-type guidance says user-controlled recording apps typically use `Record`, `PlayAndRecord`, or `Playback`, should observe interruptions, pause on unplug route changes, use background audio when needed, and request record permission. For VoIP/chat apps, Apple recommends `PlayAndRecord`, handling interruptions, background audio, and Voice Processing I/O. For measurement apps, Apple recommends measurement mode to minimize signal processing.

Source: https://developer.apple.com/library/archive/documentation/Audio/Conceptual/AudioSessionProgrammingGuide/AudioGuidelinesByAppType/AudioGuidelinesByAppType.html

### 3.8 Do not play silence to stay alive

Apple's audio guidance says to use a background task instead of streaming silence to keep the app from being suspended. The implementation must not use silent audio hacks.

Source: https://developer.apple.com/library/archive/documentation/Audio/Conceptual/AudioSessionProgrammingGuide/AudioGuidelinesByAppType/AudioGuidelinesByAppType.html

### 3.9 GCS resumable uploads are the preferred provider-aligned upload mechanism

Google Cloud Storage says resumable uploads are recommended for large files because the upload does not need to restart from the beginning after a network failure. Resumable uploads send multiple requests, each containing part of the object, and only a completed resumable upload appears in the bucket. JSON API resumable uploads start with `uploadType=resumable` and return a session URI that the client uses for subsequent `PUT` requests.

Source: https://cloud.google.com/storage/docs/resumable-uploads

### 3.10 GCS signed URLs are useful but must be treated as bearer secrets

Google Cloud Storage says signed URLs provide limited permission and time to make a request. Anyone in possession of the URL can use it while active. For resumable uploads, Google says the server can initiate the resumable upload and send the session URI to the client, avoiding the complexity of signed URLs for the upload chunks.

Source: https://cloud.google.com/storage/docs/access-control/signed-urls

---

## 4. Product architecture target

### 4.1 Production mode: native iPhone recorder

The native app owns safe iPhone recording:

```text
SwiftUI Quipsly app
  -> AudioSessionCoordinator
  -> RecordingController actor
  -> AVAudioEngine or AVAudioRecorder segment writer
  -> SQLite local manifest
  -> File recovery scanner
  -> UploadQueue using background-capable URLSession and/or resumable upload session URIs
  -> Quipsly API
  -> GCS bucket
  -> server verification
  -> editor timeline assembly
```

Native production features:

- microphone permission before session.
- audio session category and mode selected for session type.
- background audio mode only while the user is intentionally recording or on a call.
- rolling finalized audio segments.
- local manifest updated after every state transition.
- interruption, route-change, media-services-reset, and app lifecycle handling.
- durable upload queue.
- recovery scanner on launch.
- sync anchors emitted for session start, manuscript cues, clip events, user markers, interruptions, and resume.

### 4.2 Web fallback mode: short, foreground, honest

The web recorder is allowed to support:

- short single-person takes.
- foreground iPhone Safari recording with clear warnings.
- desktop browser recording, if feature detection passes.
- recovery of unuploaded chunks from IndexedDB when the user returns.

The web recorder is not allowed to promise:

- screen-lock recording.
- safe app-switch recording.
- phone-call survival.
- background upload retry on iPhone.
- full episode safety.

### 4.3 Live call mode: double-ended recording

For two-person calls:

```text
Participant A iPhone native app records A local mic track
Participant B iPhone/native/web app records B local mic track
Live call/WebRTC carries conversation audio only
Server later aligns A and B tracks through sync anchors and waveform checks
```

The server should also store call events:

- participant joined.
- participant left.
- mute/unmute.
- network degraded.
- reconnect.
- local recorder started/stopped.
- segment uploaded/verified.

The call mix may be recorded as a low-quality reference track, but never as the only production master.

---

## 5. Implementation boundary and branch instructions

Recommended branch:

```bash
git switch -c codex/quipsly-ios-recording-spine origin/main
```

Before writing code:

```bash
git status --short
git worktree list
pnpm install
```

Do not change unrelated surfaces. Avoid broad cleanups. This repo has active production-ish paths, and the docs explicitly prefer narrow changes.

Preferred file ownership for this task:

```text
packages/quipsly-domain/src/index.ts
packages/quipsly-domain/src/openapi.ts
packages/quipsly-domain/src/seed.ts
apps/quipsly-api/src/lib/api.ts
apps/quipsly-api/src/lib/recording/*
apps/quipsly-api/src/app/v1/recording-sessions/**
apps/quipsly-api/src/app/v1/recording-segments/**
apps/quipsly/src/lib/recording/**
apps/quipsly/src/app/recorder/**
apps/quipsly/src/app/manuscript/** only for sync-anchor/event integration
prisma/schema.prisma, only additively and only if this implementation slice includes DB persistence
docs/agents/*
docs/architecture/*
docs/runbooks/*
```

Avoid unless explicitly needed:

```text
apps/web
apps/studio
current HGO content directories
existing deployment scripts for web/studio
public publish routes
OAuth/DNS/secrets/cloud resources
```

Database caution:

```bash
pnpm db:generate     # ok after schema change
pnpm db:push         # local safe database only, never production by assumption
pnpm db:migrate      # only if project migration policy says yes
```

---

## 6. Data model overview

The recording data model needs three clocks:

1. Wall-clock UTC: useful for user-visible timelines and cross-device rough alignment.
2. Monotonic device time: useful for local elapsed time unaffected by user clock changes.
3. Sample frames/media duration: authoritative for audio sync.

The model also needs two distinct layers:

1. Recording segments: semantic audio files with start/stop metadata.
2. Upload parts: byte transfer units used by GCS resumable upload, S3 multipart, tus, or future upload protocols.

Do not mix these together.

---

## 7. Domain package additions

Add recording domain contracts to `packages/quipsly-domain/src/index.ts`. Keep them pure TypeScript. Do not import Prisma or Next.

### 7.1 New domain enum types

Add types like these:

```ts
export type RecordingPlatform =
  | "ios-native"
  | "ios-safari"
  | "pwa"
  | "desktop-web"
  | "android-web"
  | "unknown";

export type RecordingSessionType = "solo" | "live-call" | "imported";

export type RecordingSessionStatus =
  | "draft"
  | "waiting"
  | "active"
  | "completed"
  | "interrupted"
  | "recovery-required"
  | "abandoned";

export type ParticipantRecordingStatus =
  | "joined"
  | "recording"
  | "paused"
  | "interrupted"
  | "completed"
  | "needs-recovery";

export type RecordingSegmentKind =
  | "normal"
  | "manual-pause"
  | "manual-stop"
  | "interruption"
  | "route-change"
  | "crash-recovered"
  | "web-visibility-gap";

export type RecordingSegmentStopReason =
  | "timer-rollover"
  | "user-stop"
  | "user-pause"
  | "ios-audio-interruption"
  | "ios-route-change"
  | "ios-media-services-reset"
  | "app-backgrounded"
  | "app-terminated"
  | "web-visibility-change"
  | "web-page-hide"
  | "web-stream-ended"
  | "web-recorder-error"
  | "network-loss"
  | "unknown";

export type RecordingUploadState =
  | "recording"
  | "local-finalizing"
  | "local-finalized"
  | "checksum-ready"
  | "upload-queued"
  | "upload-in-progress"
  | "uploaded-unverified"
  | "server-verified"
  | "local-deletable"
  | "local-deleted"
  | "upload-retryable-error"
  | "upload-auth-expired"
  | "upload-needs-new-intent"
  | "server-verification-failed"
  | "local-file-missing"
  | "recovered-unverified"
  | "abandoned-by-user";

export type RecordingUploadProtocol =
  | "gcs-resumable"
  | "gcs-signed-put"
  | "s3-multipart"
  | "tus"
  | "foreground-fetch"
  | "background-urlsession"
  | "mock-local";

export type SyncAnchorType =
  | "session-countdown"
  | "clap"
  | "beep"
  | "manuscript-cue"
  | "manuscript-scroll"
  | "clip-play"
  | "clip-pause"
  | "clip-seek"
  | "clip-rate-change"
  | "user-marker"
  | "take-start"
  | "take-stop"
  | "pre-interruption-stop"
  | "post-interruption-resume"
  | "route-change"
  | "waveform-match";
```

### 7.2 New projection interfaces

Add these interfaces. Keep fields optional where native/web clients may not have a value yet.

```ts
export interface RecordingDeviceProjection {
  readonly deviceId: string;
  readonly platform: RecordingPlatform;
  readonly model?: string;
  readonly osVersion?: string;
  readonly appVersion?: string;
  readonly appBuild?: string;
  readonly browserName?: string;
  readonly browserVersion?: string;
  readonly isPwa?: boolean;
}

export interface RecordingAudioConfigProjection {
  readonly api:
    | "AVAudioEngine"
    | "AVAudioRecorder"
    | "MediaRecorder"
    | "unknown";
  readonly sessionCategory?: string;
  readonly sessionMode?: string;
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly codec: string;
  readonly container: string;
  readonly mimeType?: string;
  readonly bitrate?: number;
  readonly inputRoute?: string;
}

export interface RecordingServerTimeSyncProjection {
  readonly clientWallUtc: string;
  readonly clientMonotonicNs?: string;
  readonly serverWallUtc: string;
  readonly estimatedOffsetMs?: number;
  readonly roundTripMs?: number;
}

export interface RecordingSessionProjection {
  readonly id: QuipslyId;
  readonly projectId?: string;
  readonly episodeId?: string;
  readonly manuscriptId?: string;
  readonly createdByUserId?: string;
  readonly createdByEmail?: string;
  readonly sessionType: RecordingSessionType;
  readonly clientPlatform: RecordingPlatform;
  readonly appVersion?: string;
  readonly startedAtServerUtc?: string;
  readonly endedAtServerUtc?: string;
  readonly status: RecordingSessionStatus;
  readonly serverTimeSync?: RecordingServerTimeSyncProjection;
  readonly editorTimelineId?: string;
}

export interface ParticipantRecordingProjection {
  readonly id: QuipslyId;
  readonly recordingSessionId: QuipslyId;
  readonly participantId?: string;
  readonly participantEmail?: string;
  readonly displayName: string;
  readonly role: "host" | "guest" | "producer" | "solo";
  readonly device: RecordingDeviceProjection;
  readonly audioConfig: RecordingAudioConfigProjection;
  readonly startedAtWallUtc?: string;
  readonly startedAtMonotonicNs?: string;
  readonly endedAtWallUtc?: string;
  readonly status: ParticipantRecordingStatus;
}

export interface RecordingSegmentTimeProjection {
  readonly startWallUtc: string;
  readonly stopWallUtc?: string;
  readonly startMonotonicNs?: string;
  readonly stopMonotonicNs?: string;
  readonly startSampleFrame?: string;
  readonly endSampleFrame?: string;
  readonly durationMsFromSamples?: number;
  readonly mediaDurationMs?: number;
}

export interface RecordingSegmentUploadProjection {
  readonly state: RecordingUploadState;
  readonly protocol?: RecordingUploadProtocol;
  readonly objectKey?: string;
  readonly uploadId?: string;
  readonly uploadedBytes?: string;
  readonly attemptCount?: number;
  readonly lastErrorCode?: string;
  readonly lastErrorMessage?: string;
  readonly serverVerifiedAtUtc?: string;
}

export interface RecordingSegmentProjection {
  readonly id: QuipslyId;
  readonly recordingSessionId: QuipslyId;
  readonly participantRecordingId: QuipslyId;
  readonly clientSegmentId: string;
  readonly segmentIndex: number;
  readonly segmentKind: RecordingSegmentKind;
  readonly time: RecordingSegmentTimeProjection;
  readonly audio: RecordingAudioConfigProjection;
  readonly byteSize?: string;
  readonly sha256?: string;
  readonly stopReason?: RecordingSegmentStopReason;
  readonly upload: RecordingSegmentUploadProjection;
}

export interface RecordingSyncAnchorProjection {
  readonly id: QuipslyId;
  readonly recordingSessionId: QuipslyId;
  readonly participantRecordingId?: QuipslyId;
  readonly recordingSegmentId?: QuipslyId;
  readonly anchorType: SyncAnchorType;
  readonly anchorLabel?: string;
  readonly wallUtc?: string;
  readonly monotonicNs?: string;
  readonly sampleFrame?: string;
  readonly editorTimelineMs?: number;
  readonly clipId?: string;
  readonly clipTimeMs?: number;
  readonly manuscriptBlockId?: string;
  readonly manuscriptCharOffset?: number;
  readonly confidence?: number;
  readonly source: "client-event" | "server-event" | "post-processing";
}
```

Why `string` for bigint-like fields in API projections: Prisma `BigInt` does not serialize directly to JSON. Send big integers as decimal strings over JSON.

### 7.3 Domain helper functions

Add pure helpers:

```ts
export function createRecordingClientId(prefix: string, now = new Date()): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${now.getTime().toString(36)}_${random}`;
}

export function isTerminalUploadState(state: RecordingUploadState): boolean {
  return (
    state === "server-verified" ||
    state === "local-deleted" ||
    state === "abandoned-by-user"
  );
}

export function isRetryableUploadState(state: RecordingUploadState): boolean {
  return (
    state === "upload-queued" ||
    state === "upload-retryable-error" ||
    state === "upload-auth-expired" ||
    state === "upload-needs-new-intent" ||
    state === "recovered-unverified"
  );
}

export function getRecordingPlatformRiskLabel(platform: RecordingPlatform): string {
  if (platform === "ios-native") return "production-safe native path";
  if (platform === "ios-safari" || platform === "pwa") return "foreground web fallback only";
  if (platform === "desktop-web") return "web fallback, verify browser capabilities";
  return "unknown recording risk";
}
```

### 7.4 Domain test expectations

If this repo already has a package test pattern, add tests. If not, at minimum make typecheck pass.

Suggested tests:

```text
packages/quipsly-domain/src/recording.test.ts
```

Test:

- terminal upload states.
- retryable upload states.
- client ID prefix and uniqueness shape.
- projection sample object satisfies interfaces.

---

## 8. Prisma schema implementation plan

This task likely needs durable persistence. Additive Prisma models are the simplest local implementation because the repo already has Prisma/Postgres and current Quipsly models in root `prisma/schema.prisma`.

If Chuck prefers a dedicated Quipsly database later, these models can move to a Quipsly-specific schema. For now, keep changes additive and reversible.

### 8.1 Add Prisma enums

Use uppercase enum values in Prisma even if API/domain uses kebab-case strings. Add mapping helpers in API code.

```prisma
enum QuipslyRecordingPlatform {
  IOS_NATIVE
  IOS_SAFARI
  PWA
  DESKTOP_WEB
  ANDROID_WEB
  UNKNOWN
}

enum QuipslyRecordingSessionType {
  SOLO
  LIVE_CALL
  IMPORTED
}

enum QuipslyRecordingSessionStatus {
  DRAFT
  WAITING
  ACTIVE
  COMPLETED
  INTERRUPTED
  RECOVERY_REQUIRED
  ABANDONED
}

enum QuipslyParticipantRecordingStatus {
  JOINED
  RECORDING
  PAUSED
  INTERRUPTED
  COMPLETED
  NEEDS_RECOVERY
}

enum QuipslyRecordingSegmentKind {
  NORMAL
  MANUAL_PAUSE
  MANUAL_STOP
  INTERRUPTION
  ROUTE_CHANGE
  CRASH_RECOVERED
  WEB_VISIBILITY_GAP
}

enum QuipslyRecordingStopReason {
  TIMER_ROLLOVER
  USER_STOP
  USER_PAUSE
  IOS_AUDIO_INTERRUPTION
  IOS_ROUTE_CHANGE
  IOS_MEDIA_SERVICES_RESET
  APP_BACKGROUNDED
  APP_TERMINATED
  WEB_VISIBILITY_CHANGE
  WEB_PAGE_HIDE
  WEB_STREAM_ENDED
  WEB_RECORDER_ERROR
  NETWORK_LOSS
  UNKNOWN
}

enum QuipslyRecordingUploadState {
  RECORDING
  LOCAL_FINALIZING
  LOCAL_FINALIZED
  CHECKSUM_READY
  UPLOAD_QUEUED
  UPLOAD_IN_PROGRESS
  UPLOADED_UNVERIFIED
  SERVER_VERIFIED
  LOCAL_DELETABLE
  LOCAL_DELETED
  UPLOAD_RETRYABLE_ERROR
  UPLOAD_AUTH_EXPIRED
  UPLOAD_NEEDS_NEW_INTENT
  SERVER_VERIFICATION_FAILED
  LOCAL_FILE_MISSING
  RECOVERED_UNVERIFIED
  ABANDONED_BY_USER
}

enum QuipslyRecordingUploadProtocol {
  GCS_RESUMABLE
  GCS_SIGNED_PUT
  S3_MULTIPART
  TUS
  FOREGROUND_FETCH
  BACKGROUND_URLSESSION
  MOCK_LOCAL
}

enum QuipslySyncAnchorType {
  SESSION_COUNTDOWN
  CLAP
  BEEP
  MANUSCRIPT_CUE
  MANUSCRIPT_SCROLL
  CLIP_PLAY
  CLIP_PAUSE
  CLIP_SEEK
  CLIP_RATE_CHANGE
  USER_MARKER
  TAKE_START
  TAKE_STOP
  PRE_INTERRUPTION_STOP
  POST_INTERRUPTION_RESUME
  ROUTE_CHANGE
  WAVEFORM_MATCH
}

enum QuipslyUploadPartState {
  PENDING
  UPLOADING
  UPLOADED
  VERIFIED
  FAILED
  ABORTED
}
```

### 8.2 Add Prisma models

Add these near existing Quipsly models in `prisma/schema.prisma`, preferably after `QuipStreamEvent` and before podcast/media models.

```prisma
model QuipslyRecordingSession {
  id                 String                         @id @default(cuid())
  clientSessionId    String                         @unique
  projectId          String?
  episodeId          String?
  manuscriptId       String?
  createdByUserId    String?
  createdByEmail     String?
  sessionType        QuipslyRecordingSessionType
  clientPlatform     QuipslyRecordingPlatform       @default(UNKNOWN)
  appVersion         String?
  status             QuipslyRecordingSessionStatus  @default(DRAFT)
  startedAtServerUtc DateTime?
  endedAtServerUtc   DateTime?
  serverTimeSyncJson Json?
  editorTimelineId   String?
  metadataJson       Json?
  createdAt          DateTime                       @default(now())
  updatedAt          DateTime                       @updatedAt

  createdBy     User?                           @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)
  participants  QuipslyParticipantRecording[]
  segments      QuipslyRecordingSegment[]
  syncAnchors   QuipslySyncAnchor[]

  @@index([createdByEmail, updatedAt])
  @@index([createdByUserId, updatedAt])
  @@index([episodeId, updatedAt])
  @@index([manuscriptId, updatedAt])
  @@index([status, updatedAt])
}

model QuipslyParticipantRecording {
  id                 String                              @id @default(cuid())
  clientParticipantId String                             @unique
  recordingSessionId String
  participantUserId  String?
  participantEmail   String?
  displayName        String
  role               String
  status             QuipslyParticipantRecordingStatus   @default(JOINED)
  deviceJson         Json
  audioConfigJson    Json
  startedAtWallUtc   DateTime?
  startedAtMonotonicNs BigInt?
  endedAtWallUtc     DateTime?
  endedAtMonotonicNs BigInt?
  createdAt          DateTime                            @default(now())
  updatedAt          DateTime                            @updatedAt

  recordingSession QuipslyRecordingSession @relation(fields: [recordingSessionId], references: [id], onDelete: Cascade)
  participantUser  User?                   @relation(fields: [participantUserId], references: [id], onDelete: SetNull)
  segments         QuipslyRecordingSegment[]
  syncAnchors      QuipslySyncAnchor[]

  @@index([recordingSessionId, createdAt])
  @@index([participantEmail, updatedAt])
  @@index([participantUserId, updatedAt])
  @@index([status, updatedAt])
}

model QuipslyRecordingSegment {
  id                       String                         @id @default(cuid())
  clientSegmentId           String                         @unique
  recordingSessionId        String
  participantRecordingId    String
  segmentIndex              Int
  segmentKind               QuipslyRecordingSegmentKind    @default(NORMAL)
  stopReason                QuipslyRecordingStopReason?

  startWallUtc              DateTime
  stopWallUtc               DateTime?
  startMonotonicNs          BigInt?
  stopMonotonicNs           BigInt?
  startSampleFrame          BigInt?
  endSampleFrame            BigInt?
  durationMsFromSamples     Int?
  mediaDurationMs           Int?

  sampleRate                Int?
  channelCount              Int?
  codec                     String?
  container                 String?
  mimeType                  String?
  bitrate                   Int?
  inputRouteStart           String?
  inputRouteEnd             String?

  localByteSize             BigInt?
  sha256                    String?
  uploadState               QuipslyRecordingUploadState    @default(RECORDING)
  uploadProtocol            QuipslyRecordingUploadProtocol?
  objectBucket              String?
  objectKey                 String?
  uploadId                  String?
  uploadedBytes             BigInt?                        @default(0)
  attemptCount              Int                            @default(0)
  lastErrorCode             String?
  lastErrorMessage          String?
  serverVerifiedAtUtc       DateTime?
  serverProbeJson           Json?
  lifecycleJson             Json?
  localManifestJson         Json?
  createdAt                 DateTime                       @default(now())
  updatedAt                 DateTime                       @updatedAt

  recordingSession     QuipslyRecordingSession     @relation(fields: [recordingSessionId], references: [id], onDelete: Cascade)
  participantRecording QuipslyParticipantRecording @relation(fields: [participantRecordingId], references: [id], onDelete: Cascade)
  syncAnchors          QuipslySyncAnchor[]
  uploadParts          QuipslyUploadPart[]

  @@unique([participantRecordingId, segmentIndex])
  @@index([recordingSessionId, createdAt])
  @@index([participantRecordingId, createdAt])
  @@index([uploadState, updatedAt])
  @@index([objectBucket, objectKey])
}

model QuipslySyncAnchor {
  id                       String                 @id @default(cuid())
  clientAnchorId            String                 @unique
  recordingSessionId        String
  participantRecordingId    String?
  recordingSegmentId        String?
  anchorType                QuipslySyncAnchorType
  anchorLabel               String?
  wallUtc                   DateTime?
  monotonicNs               BigInt?
  sampleFrame               BigInt?
  editorTimelineMs          Int?
  clipId                    String?
  clipTimeMs                Int?
  manuscriptBlockId         String?
  manuscriptCharOffset      Int?
  source                    String
  confidence                Float                  @default(1)
  metadataJson              Json?
  createdAt                 DateTime               @default(now())
  updatedAt                 DateTime               @updatedAt

  recordingSession     QuipslyRecordingSession      @relation(fields: [recordingSessionId], references: [id], onDelete: Cascade)
  participantRecording QuipslyParticipantRecording? @relation(fields: [participantRecordingId], references: [id], onDelete: SetNull)
  recordingSegment     QuipslyRecordingSegment?     @relation(fields: [recordingSegmentId], references: [id], onDelete: SetNull)

  @@index([recordingSessionId, createdAt])
  @@index([participantRecordingId, createdAt])
  @@index([recordingSegmentId, createdAt])
  @@index([anchorType, createdAt])
  @@index([manuscriptBlockId])
  @@index([clipId])
}

model QuipslyUploadPart {
  id                 String                  @id @default(cuid())
  recordingSegmentId String
  partNumber         Int
  byteStart          BigInt
  byteEnd            BigInt
  state              QuipslyUploadPartState  @default(PENDING)
  checksum           String?
  providerEtag       String?
  providerPartJson   Json?
  createdAt          DateTime                @default(now())
  updatedAt          DateTime                @updatedAt

  recordingSegment QuipslyRecordingSegment @relation(fields: [recordingSegmentId], references: [id], onDelete: Cascade)

  @@unique([recordingSegmentId, partNumber])
  @@index([recordingSegmentId, state])
}
```

### 8.3 Update `User` relations if adding user references

If the Prisma schema requires back-relations on `User`, add:

```prisma
quipslyRecordingSessionsCreated QuipslyRecordingSession[]
quipslyParticipantRecordings    QuipslyParticipantRecording[]
```

Name relations explicitly if Prisma complains about multiple relations to `User`.

### 8.4 BigInt JSON serialization helper

Add a helper in `apps/quipsly-api/src/lib/recording/serialize.ts`:

```ts
export function serializeBigInt(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeBigInt);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        serializeBigInt(child),
      ]),
    );
  }

  return value;
}
```

Use this before `jsonOk` for any Prisma object containing `BigInt`.

---

## 9. API architecture

Implement recording APIs under `apps/quipsly-api`, not under `apps/quipsly/src/app/api`, so native and web clients share the same service surface.

### 9.1 Route map

Add these App Router routes:

```text
apps/quipsly-api/src/app/v1/recording-sessions/route.ts
  POST create recording session
  GET list recent sessions, optional filters

apps/quipsly-api/src/app/v1/recording-sessions/[sessionId]/route.ts
  GET fetch session detail
  PATCH update status/end session

apps/quipsly-api/src/app/v1/recording-sessions/[sessionId]/participants/route.ts
  POST create or resume participant recording

apps/quipsly-api/src/app/v1/recording-sessions/[sessionId]/segments/route.ts
  POST create or upsert recording segment metadata
  GET list segments for a session

apps/quipsly-api/src/app/v1/recording-sessions/[sessionId]/sync-anchors/route.ts
  POST batch create sync anchors
  GET list anchors

apps/quipsly-api/src/app/v1/recording-sessions/[sessionId]/pending-uploads/route.ts
  GET list segments needing upload or verification

apps/quipsly-api/src/app/v1/recording-segments/[segmentId]/route.ts
  GET fetch segment detail
  PATCH update segment metadata or upload state

apps/quipsly-api/src/app/v1/recording-segments/[segmentId]/upload-intent/route.ts
  POST create/reissue upload intent

apps/quipsly-api/src/app/v1/recording-segments/[segmentId]/complete-upload/route.ts
  POST mark uploaded and queue/perform verification

apps/quipsly-api/src/app/v1/recording-segments/[segmentId]/verify/route.ts
  POST explicit server verification, admin/internal only for now
```

Every mutating endpoint should support idempotency:

- accept `Idempotency-Key` header.
- accept client-generated IDs in body, such as `clientSessionId`, `clientParticipantId`, `clientSegmentId`, `clientAnchorId`.
- use unique constraints so retried requests return the existing record instead of creating duplicates.

### 9.2 Update API CORS helper

Current CORS allows `GET,POST,OPTIONS` and headers `Content-Type,Authorization,X-Quipsly-Client`. Recording APIs may need `PATCH`, `Idempotency-Key`, `X-Quipsly-Device`, `X-Quipsly-Session`, and possibly `X-Quipsly-App-Version`.

Update cautiously in `apps/quipsly-api/src/lib/api.ts`:

```ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "Authorization",
    "X-Quipsly-Client",
    "X-Quipsly-Device",
    "X-Quipsly-Session",
    "X-Quipsly-App-Version",
    "Idempotency-Key",
  ].join(","),
  "Access-Control-Max-Age": "86400",
} as const;
```

Do not include raw media uploads through Quipsly API unless needed. The API should issue upload intents and verify results. Media should upload directly to GCS or the chosen object store.

### 9.3 Request and response contracts

#### Create recording session

`POST /v1/recording-sessions`

Request:

```json
{
  "clientSessionId": "rs_client_...",
  "projectId": "proj_...",
  "episodeId": "episode-06",
  "manuscriptId": "manuscript_latest",
  "sessionType": "solo",
  "clientPlatform": "ios-native",
  "appVersion": "1.0.0",
  "createdByEmail": "creator@example.com",
  "serverTimeSync": {
    "clientWallUtc": "2026-06-05T16:00:00.110Z",
    "clientMonotonicNs": "12839123123123",
    "roundTripMs": 42
  },
  "editorTimelineId": "timeline_...",
  "metadata": {
    "readerRoute": "/manuscript/live/latest",
    "source": "native-ios"
  }
}
```

Response:

```json
{
  "data": {
    "id": "cuid...",
    "clientSessionId": "rs_client_...",
    "status": "active",
    "startedAtServerUtc": "2026-06-05T16:00:00.000Z",
    "serverWallUtc": "2026-06-05T16:00:00.000Z"
  },
  "meta": {
    "service": "quipsly-api",
    "prototype": false
  }
}
```

Server behavior:

- If `clientSessionId` already exists, return existing session with `200` or `201` plus `idempotent: true`.
- Server sets `startedAtServerUtc` if session status becomes active.
- Store server time sync payload in JSON.

#### Create participant

`POST /v1/recording-sessions/{sessionId}/participants`

Request:

```json
{
  "clientParticipantId": "pr_client_...",
  "participantEmail": "guest@example.com",
  "displayName": "Guest",
  "role": "guest",
  "status": "recording",
  "device": {
    "deviceId": "dev_...",
    "platform": "ios-native",
    "model": "iPhone",
    "osVersion": "iOS 18.x",
    "appVersion": "1.0.0",
    "appBuild": "100"
  },
  "audioConfig": {
    "api": "AVAudioEngine",
    "sessionCategory": "playAndRecord",
    "sessionMode": "voiceChat",
    "sampleRate": 48000,
    "channelCount": 1,
    "codec": "aac",
    "container": "m4a",
    "mimeType": "audio/mp4",
    "bitrate": 128000,
    "inputRoute": "wired-headset"
  },
  "startedAtWallUtc": "2026-06-05T16:00:03.200Z",
  "startedAtMonotonicNs": "12842200000000"
}
```

#### Create/upsert segment

`POST /v1/recording-sessions/{sessionId}/segments`

This endpoint is called when a segment starts and again when it finalizes. It must be idempotent by `clientSegmentId`.

Start request:

```json
{
  "clientSegmentId": "seg_client_...",
  "participantRecordingId": "pr_...",
  "segmentIndex": 12,
  "segmentKind": "normal",
  "uploadState": "recording",
  "time": {
    "startWallUtc": "2026-06-05T16:04:31.221Z",
    "startMonotonicNs": "12869021000000",
    "startSampleFrame": "17280000"
  },
  "audio": {
    "sampleRate": 48000,
    "channelCount": 1,
    "codec": "aac",
    "container": "m4a",
    "mimeType": "audio/mp4",
    "inputRoute": "wired-headset"
  },
  "lifecycle": {
    "appStateStart": "foreground"
  }
}
```

Finalize request:

```json
{
  "clientSegmentId": "seg_client_...",
  "participantRecordingId": "pr_...",
  "segmentIndex": 12,
  "segmentKind": "normal",
  "stopReason": "timer-rollover",
  "uploadState": "checksum-ready",
  "time": {
    "startWallUtc": "2026-06-05T16:04:31.221Z",
    "stopWallUtc": "2026-06-05T16:05:01.236Z",
    "startMonotonicNs": "12869021000000",
    "stopMonotonicNs": "12899036000000",
    "startSampleFrame": "17280000",
    "endSampleFrame": "18720672",
    "durationMsFromSamples": 30014,
    "mediaDurationMs": 30014
  },
  "byteSize": "1048576",
  "sha256": "hex-or-base64",
  "audio": {
    "sampleRate": 48000,
    "channelCount": 1,
    "codec": "aac",
    "container": "m4a",
    "mimeType": "audio/mp4",
    "bitrate": 128000,
    "inputRoute": "wired-headset"
  },
  "lifecycle": {
    "appStateStart": "foreground",
    "appStateEnd": "foreground",
    "inputRouteStart": "wired-headset",
    "inputRouteEnd": "wired-headset"
  }
}
```

Server behavior:

- Create row if `clientSegmentId` does not exist.
- Update row if it exists and the incoming state is further along.
- Never move `server-verified` backward.
- Reject mismatched session/participant ownership.

#### Batch create sync anchors

`POST /v1/recording-sessions/{sessionId}/sync-anchors`

Request:

```json
{
  "anchors": [
    {
      "clientAnchorId": "anc_client_...",
      "participantRecordingId": "pr_...",
      "recordingSegmentId": "seg_...",
      "anchorType": "clip-play",
      "anchorLabel": "Clip A started",
      "wallUtc": "2026-06-05T16:04:42.000Z",
      "monotonicNs": "12879800000000",
      "sampleFrame": "17797440",
      "editorTimelineMs": 42000,
      "clipId": "clip_...",
      "clipTimeMs": 13500,
      "manuscriptBlockId": "block-paragraph-...",
      "manuscriptCharOffset": 2712,
      "source": "client-event",
      "confidence": 1.0
    }
  ]
}
```

Server behavior:

- Upsert by `clientAnchorId`.
- Preserve existing anchor if duplicate body is identical.
- Reject if duplicate ID points to a different session.

#### Create upload intent

`POST /v1/recording-segments/{segmentId}/upload-intent`

Request:

```json
{
  "protocolPreference": "gcs-resumable",
  "contentType": "audio/mp4",
  "byteSize": "1048576",
  "sha256": "hex-or-base64",
  "fileExtension": "m4a"
}
```

Response for recommended GCS resumable path:

```json
{
  "data": {
    "segmentId": "seg_...",
    "uploadProtocol": "gcs-resumable",
    "bucket": "quipsly-recordings-dev",
    "objectKey": "quipsly-recordings/dev/rs_.../pr_.../segments/000012-seg_client_....m4a",
    "sessionUri": "https://storage.googleapis.com/upload/storage/v1/b/...",
    "expiresAtUtc": "2026-06-06T16:04:31.221Z",
    "requiredHeaders": {
      "Content-Type": "audio/mp4"
    }
  }
}
```

Response for MVP signed PUT fallback:

```json
{
  "data": {
    "segmentId": "seg_...",
    "uploadProtocol": "gcs-signed-put",
    "bucket": "quipsly-recordings-dev",
    "objectKey": "quipsly-recordings/dev/rs_.../pr_.../segments/000012-seg_client_....m4a",
    "signedUrl": "https://storage.googleapis.com/...?X-Goog-Signature=...",
    "expiresAtUtc": "2026-06-05T16:19:31.221Z",
    "requiredHeaders": {
      "Content-Type": "audio/mp4"
    }
  }
}
```

Security rule: treat `sessionUri` and `signedUrl` as bearer credentials. Never log them in production logs.

#### Complete upload

`POST /v1/recording-segments/{segmentId}/complete-upload`

Request:

```json
{
  "objectBucket": "quipsly-recordings-dev",
  "objectKey": "quipsly-recordings/dev/rs_.../pr_.../segments/000012-seg_client_....m4a",
  "byteSize": "1048576",
  "sha256": "hex-or-base64",
  "mediaDurationMs": 30014,
  "clientCompletedAtUtc": "2026-06-05T16:05:09.110Z",
  "provider": {
    "generation": "...",
    "etag": "..."
  }
}
```

Response:

```json
{
  "data": {
    "segmentId": "seg_...",
    "uploadState": "uploaded-unverified",
    "verificationQueued": true
  }
}
```

Server then verifies object existence, size, checksum where possible, and media probe result. After verification:

```json
{
  "data": {
    "segmentId": "seg_...",
    "uploadState": "server-verified",
    "serverVerifiedAtUtc": "2026-06-05T16:05:11.000Z"
  }
}
```

### 9.4 Error vocabulary

Use stable error codes in response bodies. Do not only return prose.

```json
{
  "error": {
    "code": "segment_not_found",
    "message": "The requested recording segment was not found."
  },
  "meta": {
    "service": "quipsly-api",
    "prototype": false
  }
}
```

Suggested codes:

```text
invalid_json
invalid_recording_session
recording_session_not_found
participant_not_found
segment_not_found
segment_ownership_mismatch
segment_already_verified
upload_intent_not_ready
upload_auth_expired
object_not_found
object_size_mismatch
object_checksum_mismatch
object_probe_failed
unsupported_upload_protocol
```

---

## 10. Upload and object storage architecture

### 10.1 Use GCS as the first-class provider

The repo already includes `@google-cloud/storage` in `apps/quipsly`. Move production upload-intent logic to `apps/quipsly-api` and add `@google-cloud/storage` there if needed.

Add env vars:

```text
QUIPSLY_RECORDINGS_BUCKET=quipsly-recordings-dev
QUIPSLY_RECORDINGS_OBJECT_PREFIX=quipsly-recordings/dev
QUIPSLY_UPLOAD_PROTOCOL=gcs-resumable
QUIPSLY_GCS_SIGNED_URL_TTL_SECONDS=900
QUIPSLY_GCS_RESUMABLE_SESSION_TTL_SECONDS=604800
```

Update:

```text
.env.example
docs/runbooks/local-dev.md
docs/architecture/quipsly-quiplore-foundation.md or a new recording architecture doc
```

Do not reuse the hard-coded `high-ground-media-vault` or `high-ground-raws` names for the new recording path unless Chuck explicitly wants that bucket.

### 10.2 Object key format

Use deterministic object keys. Do not use user-provided filenames or only `Date.now()`.

```ts
export function buildRecordingObjectKey(input: {
  env: string;
  sessionId: string;
  participantRecordingId: string;
  segmentIndex: number;
  clientSegmentId: string;
  extension: "m4a" | "wav" | "caf" | "webm";
}) {
  const paddedIndex = String(input.segmentIndex).padStart(6, "0");
  return [
    "quipsly-recordings",
    input.env,
    input.sessionId,
    input.participantRecordingId,
    "segments",
    `${paddedIndex}-${input.clientSegmentId}.${input.extension}`,
  ].join("/");
}
```

Example:

```text
quipsly-recordings/dev/cmap123/pr_456/segments/000012-seg_client_abcd.m4a
```

### 10.3 MVP upload strategy

Use this sequence:

1. Client finalizes local file.
2. Client computes SHA-256 and byte size.
3. Client calls `POST /v1/recording-sessions/{sessionId}/segments` with finalized metadata.
4. Client calls `POST /v1/recording-segments/{segmentId}/upload-intent`.
5. API creates a GCS resumable upload session and returns the session URI, or returns a short-lived signed PUT URL for MVP if resumable session creation is too much for first implementation.
6. Client uploads from disk, not memory.
7. Client calls `complete-upload`.
8. Server verifies object.
9. Client marks local segment deletable only after `server-verified`.

### 10.4 GCS resumable details

Preferred API behavior:

- Server authenticates to GCS with service account credentials.
- Server initiates the resumable upload with object metadata.
- Server stores `objectBucket`, `objectKey`, `uploadProtocol`, and `uploadId` or session URI hash.
- Server returns the session URI to the client over HTTPS.
- Client uses `PUT` requests to upload bytes.
- Server never logs session URI.

Metadata to set on GCS object:

```text
quipsly-session-id
quipsly-participant-recording-id
quipsly-segment-id
quipsly-client-segment-id
quipsly-segment-index
quipsly-sha256
quipsly-media-duration-ms
quipsly-codec
quipsly-created-by
```

For MVP, it is acceptable to skip custom metadata if it blocks upload progress, but object key and DB row must carry enough correlation.

### 10.5 Verification

Initial verification can be synchronous in `complete-upload` for small MVP segments:

- call GCS object metadata/head.
- compare object size with expected byte size.
- compare metadata checksum if available.
- compare stored SHA-256 if the server can download or stream hash. For large files, do async verification later.
- mark `server-verified` if all checks pass.

A later worker should do deeper media probe:

- codec/container.
- duration.
- sample rate.
- channel count.
- corruption/truncation.

Suggested future worker path:

```text
apps/quipsly-worker/src/jobs/verify-recording-segment.ts
```

### 10.6 Local deletion rule

Only the native app or web fallback can delete local media. It may delete only when the API returns:

```json
{
  "uploadState": "server-verified",
  "serverVerifiedAtUtc": "..."
}
```

Even then, keep a retention window if device storage allows:

- MVP: keep verified local files for 24 hours or until the user chooses cleanup.
- Later: configurable local retention per user/session.

---

## 11. Web fallback implementation

### 11.1 Refactor current recorder page

Split `apps/quipsly/src/app/recorder/page.tsx` into:

```text
apps/quipsly/src/app/recorder/page.tsx
apps/quipsly/src/app/recorder/recorder-dashboard-client.tsx
apps/quipsly/src/lib/recording/web-recorder-capabilities.ts
apps/quipsly/src/lib/recording/web-media-recorder-session.ts
apps/quipsly/src/lib/recording/idb-recording-store.ts
apps/quipsly/src/lib/recording/recording-api-client.ts
apps/quipsly/src/lib/recording/web-upload-queue.ts
apps/quipsly/src/lib/recording/web-sync-anchors.ts
apps/quipsly/src/lib/recording/web-recording-types.ts
```

`page.tsx` should be a thin route wrapper. `recorder-dashboard-client.tsx` owns UI state. The libraries own recorder behavior and are testable.

### 11.2 Capability detection

`web-recorder-capabilities.ts`:

```ts
const CANDIDATE_AUDIO_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

export type WebRecordingCapability = {
  canUseMediaDevices: boolean;
  canUseMediaRecorder: boolean;
  supportedMimeType: string | null;
  isLikelyIos: boolean;
  isLikelyStandalonePwa: boolean;
  isProductionSafe: false;
  guidance: string[];
};

export function detectWebRecordingCapability(): WebRecordingCapability {
  const canUseMediaDevices = !!navigator.mediaDevices?.getUserMedia;
  const canUseMediaRecorder = typeof window.MediaRecorder !== "undefined";
  const supportedMimeType = canUseMediaRecorder
    ? CANDIDATE_AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
    : null;

  const ua = navigator.userAgent || "";
  const isLikelyIos = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isLikelyStandalonePwa = window.matchMedia?.("(display-mode: standalone)").matches ?? false;

  return {
    canUseMediaDevices,
    canUseMediaRecorder,
    supportedMimeType,
    isLikelyIos,
    isLikelyStandalonePwa,
    isProductionSafe: false,
    guidance: isLikelyIos
      ? [
          "Keep Quipsly open and unlocked while recording.",
          "Do not switch apps or accept phone calls during web recording.",
          "Use the native app for full episodes.",
        ]
      : ["Keep this tab open until upload is verified."],
  };
}
```

Never hard-code `video/webm` for iPhone.

### 11.3 Web recording session wrapper

`web-media-recorder-session.ts` should:

- request audio only by default for recording fallback.
- avoid camera unless the user explicitly wants video preview.
- create `MediaRecorder(stream, { mimeType: supportedMimeType })` only after feature detection.
- call `start(timesliceMs)`, for example `start(5000)`.
- on each `dataavailable`, write the blob to IndexedDB before upload.
- call `requestData()` on visibility/page lifecycle events if safe.
- track `performance.now()`, `event.timeStamp`, and wall UTC per chunk.
- never use chunk count as duration.
- mark gaps when visibility changes or tracks mute/end.

Skeleton:

```ts
export class WebMediaRecorderSession {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private startedAtWallUtc: string | null = null;
  private startedAtPerformanceMs: number | null = null;

  async start(input: {
    sessionId: string;
    participantRecordingId: string;
    mimeType: string;
    timesliceMs: number;
  }) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    this.startedAtWallUtc = new Date().toISOString();
    this.startedAtPerformanceMs = performance.now();

    this.recorder = new MediaRecorder(this.stream, { mimeType: input.mimeType });

    this.recorder.addEventListener("dataavailable", async (event) => {
      if (!event.data || event.data.size === 0) return;
      await persistChunkBeforeUpload({
        blob: event.data,
        eventTimestampMs: event.timeStamp,
        wallUtc: new Date().toISOString(),
        performanceNowMs: performance.now(),
      });
    });

    this.recorder.addEventListener("error", async () => {
      await markCurrentSegmentRisk("web-recorder-error");
    });

    this.stream.getTracks().forEach((track) => {
      track.addEventListener("mute", () => markCurrentSegmentRisk("web-track-muted"));
      track.addEventListener("ended", () => markCurrentSegmentRisk("web-stream-ended"));
    });

    this.recorder.start(input.timesliceMs);
  }

  requestData(reason: string) {
    if (this.recorder?.state === "recording") {
      this.recorder.requestData();
    }
    return markCurrentSegmentRisk(reason);
  }

  stop() {
    if (this.recorder?.state !== "inactive") {
      this.recorder?.stop();
    }
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}
```

### 11.4 IndexedDB stores

Use IndexedDB, not `localStorage`, for media chunks.

DB name:

```text
quipsly-recording-fallback-v1
```

Stores:

```text
sessions
participants
segments
chunks
syncAnchors
uploadQueue
```

Chunk shape:

```ts
export type WebRecordingChunkRecord = {
  chunkId: string;
  clientSegmentId: string;
  recordingSessionId: string;
  participantRecordingId: string;
  chunkIndex: number;
  wallUtc: string;
  eventTimestampMs: number;
  performanceNowMs: number;
  mimeType: string;
  byteSize: number;
  blob: Blob;
  uploadState: "pending" | "uploading" | "uploaded" | "failed";
};
```

Segment shape in IndexedDB should mirror server fields:

```ts
export type WebLocalSegmentRecord = {
  clientSegmentId: string;
  serverSegmentId: string | null;
  recordingSessionId: string;
  participantRecordingId: string;
  segmentIndex: number;
  segmentKind: "normal" | "web-visibility-gap" | "manual-stop";
  startWallUtc: string;
  stopWallUtc: string | null;
  startPerformanceMs: number;
  stopPerformanceMs: number | null;
  mimeType: string;
  chunkIds: string[];
  uploadState: RecordingUploadState;
  riskFlags: string[];
};
```

### 11.5 Web lifecycle hooks

In the recorder client:

```ts
useEffect(() => {
  const onVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      recorderRef.current?.requestData("web-visibility-change");
      setWarning("iPhone web recording may pause when Quipsly is not visible. Keep this page open and unlocked.");
    }
  };

  const onPageHide = () => {
    recorderRef.current?.requestData("web-page-hide");
  };

  const onOnline = () => uploadQueue.resume();
  const onOffline = () => setWarning("Network lost. Recording is local-only until Quipsly reconnects.");

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}, []);
```

Do not claim recording continued safely after a visibility gap. Mark it.

### 11.6 Web UX copy

Add these messages to the recorder page:

```text
Web recording on iPhone is a short-take fallback. Keep Quipsly open and your phone unlocked until upload is verified.
```

```text
For full episodes, live calls, screen lock, or app switching, use the Quipsly iPhone app.
```

```text
Upload pending. Do not close this tab yet.
```

```text
Possible recording gap detected. Quipsly marked this point so the editor can show it later.
```

### 11.7 Web session limits

Initial guardrails:

- iPhone Safari/PWA: soft warning at 5 minutes, hard stop or explicit confirmation at 15 minutes.
- Desktop web: soft warning at 30 minutes, allow longer with storage estimate warning.
- Always show storage estimate if available.

Use:

```ts
const estimate = await navigator.storage?.estimate?.();
const persisted = await navigator.storage?.persisted?.();
const persistGranted = await navigator.storage?.persist?.();
```

Treat these as guidance only, not durability guarantees.

---

## 12. Native iOS app implementation plan

There is no obvious native iOS project in the current repo. Decide with Chuck whether to create `apps/quipsly-ios` in this monorepo or a separate iOS repo. This implementation plan assumes monorepo placement for handoff clarity.

Suggested path:

```text
apps/quipsly-ios/
  README.md
  QuipslyRecorder.xcodeproj or QuipslyRecorder.xcworkspace
  QuipslyRecorderApp/
  QuipslyRecorderCore/
  QuipslyRecorderTests/
```

If the local Codex Agent cannot create a working Xcode project, create the Swift files and `README.md` skeleton with exact instructions for an Xcode-side agent.

### 12.1 Native modules

```text
QuipslyRecorderCore/
  AudioSessionCoordinator.swift
  RecordingController.swift
  SegmentRecorder.swift
  AVAudioEngineSegmentRecorder.swift
  AVAudioRecorderSegmentRecorder.swift
  RecordingManifestStore.swift
  RecordingFileStore.swift
  RecordingRecoveryScanner.swift
  RecordingUploadQueue.swift
  QuipslyAPIClient.swift
  DeviceClock.swift
  SyncAnchorEmitter.swift
  RecordingModels.swift
  RecordingRouteObserver.swift
  NetworkPathObserver.swift
```

`RecordingController` should be an `actor` or otherwise serialized state machine. Recording state transitions must not race with interruption or upload callbacks.

### 12.2 Info.plist requirements

Add:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Quipsly records your local microphone so your episode audio is saved clearly on this iPhone before upload.</string>

<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

Only add `NSCameraUsageDescription` if the native app uses camera preview or video.

### 12.3 Audio session coordinator

`AudioSessionCoordinator.swift` responsibilities:

- request mic permission before recording.
- configure category and mode based on session type.
- set preferred sample rate.
- activate/deactivate session intentionally.
- observe interruptions.
- observe route changes.
- observe media services reset.
- notify `RecordingController` of segment-boundary events.

Suggested category/mode policy:

```swift
enum QuipslyRecordingMode {
    case soloHighQuality
    case liveCall
    case liveCallHeadphonesPreferred
}

func configureAudioSession(for mode: QuipslyRecordingMode) throws {
    let session = AVAudioSession.sharedInstance()

    switch mode {
    case .soloHighQuality:
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.allowBluetooth])
    case .liveCall:
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
    case .liveCallHeadphonesPreferred:
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
    }

    try session.setPreferredSampleRate(48_000)
    try session.setActive(true)
}
```

Notes:

- `voiceChat` is appropriate when echo cancellation/voice processing matters.
- `measurement` is better for clean solo capture when signal processing should be minimized.
- If using WebRTC/LiveKit native SDK, do not let multiple components fight over `AVAudioSession`. Create one coordinator.

### 12.4 Segment recorder protocol

```swift
protocol SegmentRecorder: AnyObject {
    var currentSampleFrame: AVAudioFramePosition { get }
    var sampleRate: Double { get }

    func startSegment(_ descriptor: SegmentDescriptor) throws
    func stopSegment(reason: SegmentStopReason) throws -> FinalizedSegment
    func abortCurrentSegment(reason: SegmentStopReason) throws -> FinalizedSegment?
}
```

`FinalizedSegment`:

```swift
struct FinalizedSegment: Codable, Sendable {
    let clientSegmentId: String
    let segmentIndex: Int
    let fileURL: URL
    let byteSize: Int64
    let sha256: String
    let startWallUtc: Date
    let stopWallUtc: Date
    let startMonotonicNs: UInt64
    let stopMonotonicNs: UInt64
    let startSampleFrame: Int64
    let endSampleFrame: Int64
    let durationMsFromSamples: Int
    let mediaDurationMs: Int?
    let sampleRate: Int
    let channelCount: Int
    let codec: String
    let container: String
    let stopReason: SegmentStopReason
    let inputRouteStart: String
    let inputRouteEnd: String
}
```

### 12.5 AVAudioEngineSegmentRecorder

Long-term preferred implementation:

- create `AVAudioEngine`.
- get input node and format.
- install tap on input node.
- write buffers to `AVAudioFile`.
- maintain `currentSampleFrame` by adding buffer frame lengths.
- rotate segments every 30 to 60 seconds.
- finalize file before upload.

Pseudo-flow:

```swift
final class AVAudioEngineSegmentRecorder: SegmentRecorder {
    private let engine = AVAudioEngine()
    private var audioFile: AVAudioFile?
    private var currentDescriptor: SegmentDescriptor?
    private(set) var currentSampleFrame: AVAudioFramePosition = 0
    private(set) var sampleRate: Double = 48_000

    func startEngineIfNeeded() throws {
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        sampleRate = format.sampleRate

        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, time in
            guard let self else { return }
            do {
                try self.audioFile?.write(from: buffer)
                self.currentSampleFrame += AVAudioFramePosition(buffer.frameLength)
            } catch {
                // Send fatal recorder error to RecordingController.
            }
        }

        engine.prepare()
        try engine.start()
    }

    func startSegment(_ descriptor: SegmentDescriptor) throws {
        currentDescriptor = descriptor
        currentSampleFrame = descriptor.startSampleFrame
        audioFile = try AVAudioFile(forWriting: descriptor.fileURL, settings: descriptor.audioSettings)
    }

    func stopSegment(reason: SegmentStopReason) throws -> FinalizedSegment {
        audioFile = nil
        // Probe file, hash, compute duration, return FinalizedSegment.
    }
}
```

For AAC `.m4a`, direct `AVAudioFile` settings need careful testing. If direct compressed segment writing through `AVAudioEngine` is painful, MVP may use `AVAudioRecorder` for AAC segment files, then upgrade to `AVAudioEngine` for sample-accurate anchors.

### 12.6 AVAudioRecorder MVP option

MVP native can use `AVAudioRecorder` if speed matters:

```swift
let settings: [String: Any] = [
    AVFormatIDKey: kAudioFormatMPEG4AAC,
    AVSampleRateKey: 48_000,
    AVNumberOfChannelsKey: 1,
    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
    AVEncoderBitRateKey: 128_000
]
```

Tradeoff:

- Easier file recording.
- Less exact sample-frame tracking.
- Good enough for MVP if anchors use monotonic time plus media duration and later waveform alignment.

### 12.7 Segment rotation policy

Defaults:

```text
Segment length: 60 seconds for MVP
Emergency rotation: 30 seconds if testing shows crash/interruption risk
Manual boundary: start, pause, resume, stop
Forced boundary: interruption began, route change, media services reset, app termination warning, sample-rate change, recorder error
```

Do not keep a single multi-hour audio file open.

### 12.8 Local file layout

```text
Application Support/Quipsly/recordings/
  {clientSessionId}/
    manifest.sqlite
    participants/
      {clientParticipantId}/
        segment_000001.m4a
        segment_000002.m4a
        segment_000003.m4a
```

Do not put master recordings in caches. Use Application Support or Documents depending on user visibility and backup policy. Consider excluding from iCloud backup if files are large and server upload is the durable backup after verification.

### 12.9 Local manifest

Use SQLite. If adding a dependency is acceptable, use GRDB. If minimizing dependencies, use `sqlite3` directly.

Local tables mirror server data:

```sql
CREATE TABLE recording_sessions (
  client_session_id TEXT PRIMARY KEY,
  server_session_id TEXT,
  status TEXT NOT NULL,
  session_type TEXT NOT NULL,
  started_at_wall_utc TEXT,
  ended_at_wall_utc TEXT,
  server_time_sync_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE participant_recordings (
  client_participant_id TEXT PRIMARY KEY,
  server_participant_id TEXT,
  client_session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  device_json TEXT NOT NULL,
  audio_config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE recording_segments (
  client_segment_id TEXT PRIMARY KEY,
  server_segment_id TEXT,
  client_session_id TEXT NOT NULL,
  client_participant_id TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  local_file_path TEXT NOT NULL,
  upload_state TEXT NOT NULL,
  byte_size INTEGER,
  sha256 TEXT,
  start_wall_utc TEXT NOT NULL,
  stop_wall_utc TEXT,
  start_monotonic_ns TEXT,
  stop_monotonic_ns TEXT,
  start_sample_frame TEXT,
  end_sample_frame TEXT,
  duration_ms_from_samples INTEGER,
  media_duration_ms INTEGER,
  stop_reason TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sync_anchors (
  client_anchor_id TEXT PRIMARY KEY,
  server_anchor_id TEXT,
  client_session_id TEXT NOT NULL,
  client_participant_id TEXT,
  client_segment_id TEXT,
  anchor_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  upload_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 12.10 Recovery scanner

On app launch:

1. Open every active local session manifest.
2. Scan segment directories.
3. Compare files to manifest rows.
4. For manifest row with file and upload not verified, requeue upload.
5. For file without manifest row, probe file duration and create `crash-recovered` segment.
6. For manifest row without file, mark `local-file-missing` and never fake completion.
7. If session status was `recording`, mark `recovery-required`.
8. Show user recovery UI.

User-facing copy:

```text
Quipsly found saved audio from your last session. Upload can resume now.
```

### 12.11 Interruption handling

On interruption began:

- stop current segment as `ios-audio-interruption` if possible.
- persist manifest immediately.
- emit `pre-interruption-stop` anchor.
- stop UI timer or show interrupted state.
- do not start a new segment until safe.

On interruption ended:

- do not auto-resume blindly.
- reactivate session if user intended to continue.
- start a new segment.
- emit `post-interruption-resume` anchor.
- tell server session had interruption.

Remember Apple warning: there may be no matching interruption-ended notification. On foreground return, inspect local state and prompt the user.

### 12.12 Route-change handling

On headphones unplugged, Bluetooth route change, sample-rate change, or input route change:

- close current segment as `ios-route-change`.
- persist route start/end.
- start new segment if recording should continue.
- show route warning if quality risk increases.

Bluetooth guidance:

```text
Bluetooth microphone quality can be lower. For master-quality recording, use wired, USB, or built-in mic when possible.
```

### 12.13 Upload queue

`RecordingUploadQueue` responsibilities:

- query manifest for `checksum-ready`, `upload-queued`, `upload-retryable-error`, `upload-auth-expired`, `recovered-unverified`.
- call API to create/reissue upload intent.
- upload file from disk.
- call complete-upload.
- poll/fetch verification state.
- mark local segment deletable after server verification.
- retry with exponential backoff.
- pause when low power or no network if appropriate.

Use `NWPathMonitor` to resume uploads when connectivity returns.

For native iOS, prefer upload from file URL, not loading full media into memory.

### 12.14 Native UI states

Show separate states:

```text
Recording locally
Recording interrupted
Saved on this iPhone
Upload pending
Uploading
Uploaded, verifying
Verified in Quipsly cloud
Safe to delete local copy
Possible gap marked
```

Do not collapse all of these into "Saved".

---

## 13. Sync-anchor implementation

### 13.1 Anchor sources

Emit sync anchors from:

- session countdown.
- recorder start.
- segment rollover.
- user marker/take marker.
- manuscript block focus.
- manuscript scroll/focus changes.
- clip play/pause/seek/rate change.
- call join/leave/mute/unmute/reconnect.
- interruption stop/resume.
- route change.

### 13.2 Reuse existing manuscript identifiers

The existing manuscript model already uses block IDs and semantic highlights. Store:

```text
manuscriptBlockId
manuscriptCharOffset
semanticHighlightId
structureRegionId
```

For clip tags, store:

```text
clipId
clipTimeMs
clipPlaybackRate
clipEventType
```

### 13.3 Event bus in web app

Add a small client-side event emitter:

```text
apps/quipsly/src/lib/recording/sync-anchor-bus.ts
```

API:

```ts
export type SyncAnchorEvent = {
  type: SyncAnchorType;
  label?: string;
  manuscriptBlockId?: string;
  manuscriptCharOffset?: number;
  clipId?: string;
  clipTimeMs?: number;
  editorTimelineMs?: number;
  metadata?: Record<string, string | number | boolean>;
};

export function emitSyncAnchor(event: SyncAnchorEvent): void;
export function subscribeToSyncAnchors(handler: (event: SyncAnchorEvent) => void): () => void;
```

The recorder session subscribes and enriches events with:

- wall UTC.
- performance now.
- current segment ID.
- current sample frame if native bridge provides it.

### 13.4 Native bridge option

If the native iOS app wraps the manuscript web UI in `WKWebView`, expose a bridge:

```text
window.webkit.messageHandlers.quipslyRecording.postMessage({
  type: "sync-anchor",
  anchorType: "clip-play",
  manuscriptBlockId: "...",
  clipId: "...",
  clipTimeMs: 12345,
  editorTimelineMs: 42000
})
```

Native receives it, adds monotonic time and sample frame, persists locally, and sends to server.

If the native app is fully SwiftUI, share the same anchor fields through native models.

### 13.5 Timeline assembly rules

Later editor sync should prefer:

1. sample frame anchors.
2. decoded media duration.
3. monotonic elapsed time.
4. server-corrected wall clock.
5. manual/waveform matching.

Wall clock alone is never enough for final alignment.

---

## 14. Native/Web API client design

### 14.1 Shared API client in web

Create:

```text
apps/quipsly/src/lib/recording/recording-api-client.ts
```

Functions:

```ts
export async function createRecordingSession(input: CreateRecordingSessionInput): Promise<RecordingSessionResponse>;
export async function createParticipantRecording(sessionId: string, input: CreateParticipantInput): Promise<ParticipantResponse>;
export async function upsertRecordingSegment(sessionId: string, input: UpsertSegmentInput): Promise<SegmentResponse>;
export async function createUploadIntent(segmentId: string, input: UploadIntentInput): Promise<UploadIntentResponse>;
export async function completeUpload(segmentId: string, input: CompleteUploadInput): Promise<CompleteUploadResponse>;
export async function postSyncAnchors(sessionId: string, input: SyncAnchorBatchInput): Promise<SyncAnchorBatchResponse>;
export async function getPendingUploads(sessionId: string): Promise<PendingUploadsResponse>;
```

Include headers:

```ts
const headers = {
  "Content-Type": "application/json",
  "X-Quipsly-Client": "quipsly-web",
  "X-Quipsly-App-Version": process.env.NEXT_PUBLIC_QUIPSLY_APP_VERSION ?? "dev",
  "Idempotency-Key": idempotencyKey,
};
```

### 14.2 Swift API client

Native should mirror the same endpoints.

```swift
struct QuipslyAPIClient {
    let baseURL: URL
    let appVersion: String
    let deviceId: String

    func createRecordingSession(_ input: CreateRecordingSessionRequest) async throws -> RecordingSessionResponse
    func createParticipant(_ input: CreateParticipantRequest, sessionId: String) async throws -> ParticipantRecordingResponse
    func upsertSegment(_ input: UpsertSegmentRequest, sessionId: String) async throws -> RecordingSegmentResponse
    func createUploadIntent(segmentId: String, input: UploadIntentRequest) async throws -> UploadIntentResponse
    func completeUpload(segmentId: String, input: CompleteUploadRequest) async throws -> CompleteUploadResponse
    func postSyncAnchors(sessionId: String, anchors: [SyncAnchorRequest]) async throws -> SyncAnchorBatchResponse
}
```

Include idempotency keys.

---

## 15. Web recorder UI acceptance criteria

Modify `/recorder` so it is honest and useful.

Visible UI:

- capability panel.
- current input route/device where web can expose it.
- recording timer labeled as approximate for web.
- local saved chunks count.
- upload pending/uploading/verified count.
- warning banner for iPhone Safari/PWA.
- recovery banner if IndexedDB has unuploaded sessions.
- explicit "Use native iPhone app for full episodes" CTA or placeholder.

Do not show "Riverside parity" until native double-ended upload path exists.

Suggested states:

```ts
type WebRecorderUiState =
  | "checking-capabilities"
  | "unsupported"
  | "ready-short-take"
  | "recording-foreground"
  | "possible-gap"
  | "stopping"
  | "uploading"
  | "upload-paused"
  | "verified"
  | "recovery-available"
  | "error";
```

---

## 16. OpenAPI updates

`packages/quipsly-domain/src/openapi.ts` currently only has simple request bodies for QuipStream endpoints. Extend it in one of two ways:

Option A, fast MVP:

- Add recording endpoints to `apiEndpoints` seed.
- Add broad `requestBody` objects for recording endpoints.
- Add tags: `Recording`, `Recording Uploads`, `Recording Sync`.

Option B, better:

- Add schema definitions for `RecordingSession`, `ParticipantRecording`, `RecordingSegment`, `SyncAnchor`, `UploadIntent`.
- Add typed request bodies.

For this task, Option A is acceptable if Option B would balloon the change.

Add endpoint group union value in `ApiEndpointProjection`:

```ts
| "Recording"
| "Recording Uploads"
| "Recording Sync"
```

Update seed endpoint list with paths.

---

## 17. Tests and validation

### 17.1 Domain validation

```bash
pnpm --filter @high-ground/quipsly-domain typecheck
pnpm quipsly:domain:typecheck
```

### 17.2 API validation

```bash
pnpm --filter quipsly-api typecheck
pnpm quipsly:api:typecheck
pnpm --filter quipsly-api build
```

Add route tests if this repo has a pattern. If not, add a script-level smoke test under `scripts/`:

```text
scripts/quipsly-recording-api-contract.test.mjs
```

Test pure helpers and request validation without needing cloud credentials.

### 17.3 Web validation

```bash
pnpm --filter quipsly typecheck
pnpm quipsly:typecheck
pnpm --filter quipsly build
```

Browser manual QA:

- Desktop Chrome: record 30 seconds, chunks appear, upload intent is requested.
- Desktop Safari: feature detection picks supported MIME type.
- iPhone Safari: warning appears, short recording works in foreground.
- iPhone Safari: lock screen or app switch marks possible gap.
- iPhone Safari: reload after upload failure shows recovery.

### 17.4 Database validation

Only on a safe local DB:

```bash
pnpm db:generate
pnpm db:push
```

Then run a local API smoke test:

```bash
pnpm quipsly:api
```

Manual requests:

```bash
curl -X POST http://localhost:3000/v1/recording-sessions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: local-test-session-1' \
  -d '{"clientSessionId":"rs_client_local_1","sessionType":"solo","clientPlatform":"desktop-web"}'
```

### 17.5 Native QA gauntlet

On real iPhones:

1. Start recording, lock screen for 20 minutes.
2. Start recording, switch apps repeatedly.
3. Start recording, accept incoming phone call.
4. Start recording, decline incoming phone call.
5. Start recording, receive timer/alarm/Siri interruption.
6. Start recording, unplug headphones.
7. Start recording, switch Bluetooth route.
8. Start recording, lose network for 20 minutes.
9. Start recording, enable Airplane Mode.
10. Start recording, force quit app.
11. Start recording, kill app during upload.
12. Relaunch and verify recovery scanner finds files.
13. Verify server receives segments and anchors.
14. Verify local deletion is blocked until server verification.

Pass condition:

```text
Every finalized segment is preserved, every unsafe gap is explicit, uploads resume, and the UI never claims unsafe audio is safe.
```

---

## 18. Implementation phases

### Phase 0: Documentation and branch hygiene

Deliverables:

- Commit this plan under `docs/agents/quipsly-ios-mobile-recording-codex-plan.md`.
- Add a brief architecture note under `docs/architecture/quipsly-recording-architecture.md` if useful.
- Confirm `git status --short` is clean before code.

Validation:

```bash
git diff --check
```

### Phase 1: Domain contracts

Files:

```text
packages/quipsly-domain/src/index.ts
packages/quipsly-domain/src/openapi.ts
packages/quipsly-domain/src/seed.ts
```

Tasks:

- Add recording enum/type interfaces.
- Add helper functions.
- Extend API endpoint group union.
- Add recording endpoint catalog seed entries.
- Extend OpenAPI request bodies enough to expose contracts.

Validation:

```bash
pnpm quipsly:domain:typecheck
git diff --check
```

### Phase 2: Persistence spine

Files:

```text
prisma/schema.prisma
apps/quipsly-api/src/lib/recording/serialize.ts
apps/quipsly-api/src/lib/recording/mappers.ts
apps/quipsly-api/src/lib/recording/validation.ts
apps/quipsly-api/src/lib/recording/repository.ts
```

Tasks:

- Add Prisma enums and models.
- Add mappers between Prisma uppercase enums and domain kebab-case strings.
- Add BigInt serialization.
- Add repository functions.
- Do not run DB push except local safe DB.

Validation:

```bash
pnpm db:generate
pnpm quipsly:api:typecheck
git diff --check
```

### Phase 3: Recording API routes

Files:

```text
apps/quipsly-api/src/app/v1/recording-sessions/route.ts
apps/quipsly-api/src/app/v1/recording-sessions/[sessionId]/route.ts
apps/quipsly-api/src/app/v1/recording-sessions/[sessionId]/participants/route.ts
apps/quipsly-api/src/app/v1/recording-sessions/[sessionId]/segments/route.ts
apps/quipsly-api/src/app/v1/recording-sessions/[sessionId]/sync-anchors/route.ts
apps/quipsly-api/src/app/v1/recording-sessions/[sessionId]/pending-uploads/route.ts
apps/quipsly-api/src/app/v1/recording-segments/[segmentId]/route.ts
apps/quipsly-api/src/app/v1/recording-segments/[segmentId]/upload-intent/route.ts
apps/quipsly-api/src/app/v1/recording-segments/[segmentId]/complete-upload/route.ts
apps/quipsly-api/src/app/v1/recording-segments/[segmentId]/verify/route.ts
```

Tasks:

- Implement idempotent create/upsert.
- Implement validation and ownership checks.
- Implement JSON responses with `jsonOk` and `jsonError`.
- Add `OPTIONS` handlers if current patterns require them.
- Update CORS headers.

Validation:

```bash
pnpm quipsly:api:typecheck
pnpm quipsly:api:build
git diff --check
```

### Phase 4: Upload intents and GCS adapter

Files:

```text
apps/quipsly-api/src/lib/recording/gcs-recording-storage.ts
apps/quipsly-api/src/lib/recording/object-keys.ts
apps/quipsly-api/src/lib/recording/upload-intents.ts
apps/quipsly-api/src/lib/recording/verify-segment-object.ts
.env.example
docs/runbooks/local-dev.md
```

Tasks:

- Add env-based bucket config.
- Implement deterministic object key builder.
- Implement GCS resumable upload session creation if feasible.
- Implement signed PUT fallback if resumable session is deferred.
- Implement object metadata verification.
- Make mock mode explicit and impossible in production unless `QUIPSLY_ALLOW_MOCK_UPLOADS=1`.

Validation:

```bash
pnpm quipsly:api:typecheck
pnpm quipsly:api:build
git diff --check
```

### Phase 5: Web fallback recorder

Files:

```text
apps/quipsly/src/app/recorder/page.tsx
apps/quipsly/src/app/recorder/recorder-dashboard-client.tsx
apps/quipsly/src/lib/recording/web-recorder-capabilities.ts
apps/quipsly/src/lib/recording/web-media-recorder-session.ts
apps/quipsly/src/lib/recording/idb-recording-store.ts
apps/quipsly/src/lib/recording/recording-api-client.ts
apps/quipsly/src/lib/recording/web-upload-queue.ts
apps/quipsly/src/lib/recording/sync-anchor-bus.ts
```

Tasks:

- Replace direct `new MediaRecorder(stream, { mimeType: "video/webm" })` with feature-detected audio recorder.
- Persist chunks before upload.
- Add upload queue.
- Add recovery UI.
- Add iPhone/PWA warnings.
- Add gap markers on lifecycle events.
- Remove or soften "Riverside parity" claim.

Validation:

```bash
pnpm quipsly:typecheck
pnpm quipsly:build
git diff --check
```

### Phase 6: Manuscript and clip sync anchors

Files:

```text
apps/quipsly/src/app/manuscript/studio-manuscript-client.tsx
apps/quipsly/src/app/manuscript/manuscript-editor-model.ts
apps/quipsly/src/lib/recording/sync-anchor-bus.ts
```

Tasks:

- Add optional recorder integration to emit anchors when visible block/structure changes.
- Emit anchors for clip semantic tags when clip playback UI exists.
- Add user marker/take marker button in Recording / Reading mode if in scope.
- Keep manuscript draft source of truth unchanged.

Validation:

```bash
pnpm quipsly:typecheck
pnpm quipsly:build
git diff --check
```

### Phase 7: Native iOS skeleton

Files:

```text
apps/quipsly-ios/README.md
apps/quipsly-ios/QuipslyRecorderCore/*.swift
apps/quipsly-ios/QuipslyRecorderApp/*.swift
```

Tasks:

- Add Swift model files matching API contracts.
- Add `AudioSessionCoordinator`.
- Add `RecordingController` state machine.
- Add segment recorder protocol and MVP recorder implementation.
- Add local manifest schema.
- Add upload queue skeleton.
- Add recovery scanner skeleton.
- Add test plan.

Validation:

- If Xcode project exists: build in Xcode and run unit tests.
- If skeleton only: ensure docs state which files must be added to Xcode target.

### Phase 8: End-to-end smoke

Goal:

```text
Create session -> create participant -> create segment -> upload file -> complete upload -> verify -> post anchors -> fetch session detail
```

Build a script using a tiny synthetic audio fixture or text fixture if real media upload is mocked.

Possible file:

```text
scripts/quipsly-recording-e2e-smoke.mjs
```

Do not commit real private audio.

---

## 19. Code-level anti-patterns to remove or prevent

Do not keep this in production:

```ts
new MediaRecorder(stream, { mimeType: "video/webm" })
recorder.start()
```

Do not store media in:

```text
localStorage
sessionStorage
React state
one giant Blob kept in memory until stop
```

Do not upload with object keys like:

```text
ingest/${Date.now()}-${fileName}
episodes/${episodeId}/${filename}
```

Do not return mock upload URLs from production catch blocks.

Do not delete files on upload request success.

Do not claim web recording survives:

```text
screen lock
app switch
phone call
browser tab close
background upload retry
```

Do not use silent audio to keep the app alive.

Do not silently stitch interrupted segments.

Do not let WebRTC SDK audio session configuration overwrite native recorder needs without an `AudioSessionCoordinator`.

Do not serialize Prisma `BigInt` directly through `NextResponse.json`.

---

## 20. User-facing safety guidance

Native app copy:

```text
Quipsly records locally first, so your audio is protected even if the network drops.
```

```text
Your audio is saved on this iPhone. Upload will resume when the network returns.
```

```text
Recording was interrupted by a phone call. Quipsly marked the gap and is ready to resume.
```

```text
Use headphones for live calls to avoid echo.
```

```text
For best audio, use wired, USB, or built-in mic. Bluetooth mic quality may vary.
```

Web fallback copy:

```text
Web recording on iPhone is best for short takes. Keep Quipsly open and your phone unlocked until upload is verified.
```

```text
For full episodes, live calls, screen lock, or app switching, use the Quipsly iPhone app.
```

```text
Upload pending. Do not close this tab yet.
```

```text
Possible recording gap detected. Quipsly marked this point for the editor.
```

---

## 21. Security and privacy notes

- Treat signed URLs and GCS resumable session URIs as bearer credentials.
- Do not log upload URLs, session URIs, raw auth headers, or local file paths in production telemetry.
- Store only necessary device metadata.
- Do not upload raw audio without explicit user action/recording state.
- Consider consent UX for two-person calls before public or external-guest use.
- If recording guests, store consent timestamp and consent copy version.
- Keep object buckets private. No public read ACLs.
- Use lifecycle rules for abandoned partial uploads and failed sessions.
- Add deletion/export policy later if user accounts expand.

---

## 22. Observability and telemetry

Add structured events, but never include raw audio or manuscript text.

Suggested events:

```text
recording_session_created
participant_recording_started
segment_started
segment_finalized
segment_upload_intent_created
segment_upload_started
segment_upload_failed
segment_upload_completed
segment_server_verified
sync_anchor_created
recording_interrupted
recording_route_changed
recording_recovered
web_visibility_gap_detected
web_storage_quota_warning
```

Event payloads should include IDs and states:

```json
{
  "recordingSessionId": "rs_...",
  "participantRecordingId": "pr_...",
  "segmentId": "seg_...",
  "uploadState": "upload-retryable-error",
  "platform": "ios-native",
  "errorCode": "network_unavailable"
}
```

No manuscript body. No audio. No signed URLs.

---

## 23. MVP scope recommendation

The fastest safe MVP is:

1. Domain types and API contracts.
2. Prisma models and idempotent API routes.
3. GCS signed PUT upload intent for finalized short segments.
4. Web fallback with feature detection, IndexedDB chunk persistence, warnings, and foreground upload.
5. Native iOS skeleton or first native recorder prototype using `AVAudioRecorder` with rolling AAC `.m4a` segments.
6. Server verification by object size and metadata.
7. Sync anchors for session start, user markers, manuscript block focus, clip events if available, and interruptions.

Defer:

- full native WebRTC integration.
- waveform matching.
- PCM/lossless premium mode.
- transcription.
- editor timeline UI.
- multi-cloud upload adapters.
- worker queue infrastructure unless verification needs it immediately.
- public guest consent flow beyond a private MVP copy gate.

---

## 24. Later production hardening

Add later:

- dedicated `apps/quipsly-worker` for verification and media probes.
- Cloud Tasks or Pub/Sub for verification jobs.
- GCS lifecycle cleanup for stale resumable/multipart artifacts.
- object soft-delete/versioning policy review.
- waveform sync service.
- transcript alignment.
- editor timeline assembly page.
- native background upload progress notifications.
- CallKit integration if calls become phone-like rather than in-app sessions.
- USB/external microphone quality checks.
- per-session consent ledger.
- account-level retention settings.

---

## 25. Acceptance checklist

A local Codex implementation is acceptable when all of these are true:

- [ ] The current `/recorder` no longer uses hard-coded `video/webm` as the production path.
- [ ] Web recorder feature-detects MIME support.
- [ ] iPhone web UI clearly says foreground short-take fallback.
- [ ] Web chunks are persisted to IndexedDB before upload.
- [ ] Web lifecycle gaps are marked, not hidden.
- [ ] Domain package contains recording session, participant, segment, upload, and anchor types.
- [ ] OpenAPI catalog includes recording endpoints.
- [ ] API can create sessions, participants, segments, upload intents, upload completion, and sync anchors.
- [ ] API route writes are idempotent by client-generated IDs.
- [ ] Prisma schema additions are additive and indexed.
- [ ] BigInt fields serialize safely.
- [ ] Upload object keys are deterministic and session-scoped.
- [ ] Upload intents do not use hard-coded buckets.
- [ ] Mock upload mode cannot accidentally run in production.
- [ ] Server verification is required before local deletion.
- [ ] Native iOS plan or skeleton includes audio session, interruption, route change, local manifest, segment rotation, upload queue, and recovery scanner.
- [ ] Validation commands pass.
- [ ] New docs explain the architecture and remaining risks.

---

## 26. Suggested final handoff note after implementation

When the local Codex Agent finishes, add a result note like:

```text
docs/sessions/quipsly-ios-mobile-recording-spine-result.md
```

Include:

- branch name.
- files changed.
- what works.
- what is intentionally mocked.
- what requires local DB.
- what requires GCS credentials.
- validation commands run.
- known risks.
- next recommended slice.

---

## 27. Final reminder for the agent

The main job is not to make the red recording dot blink. The job is to make the audio survive real iPhone weather: lock screen, phone calls, app switching, bad network, route changes, browser quirks, and user panic. The UI can be cozy. The recorder must be stern.
