#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const captureRoot = path.join(
  root,
  "apps/mobile-capture/HighGroundCapture/HighGroundCapture",
);

const [
  watch,
  auth,
  audio,
  shell,
  episodeRoute,
  episodeAccess,
  episodeStore,
  mediaRoute,
] = await Promise.all([
  readFile(path.join(captureRoot, "MobileEpisodeWatch.swift"), "utf8"),
  readFile(path.join(captureRoot, "AuthManager.swift"), "utf8"),
  readFile(
    path.join(captureRoot, "CaptureAudioSessionCoordinator.swift"),
    "utf8",
  ),
  readFile(path.join(captureRoot, "CapturePhoneShell.swift"), "utf8"),
  readFile(
    path.join(
      root,
      "apps/quipsly/src/app/api/nests/[slug]/episode-room/route.ts",
    ),
    "utf8",
  ),
  readFile(
    path.join(
      root,
      "apps/quipsly/src/lib/server/episode-production-access.ts",
    ),
    "utf8",
  ),
  readFile(
    path.join(
      root,
      "apps/quipsly/src/lib/server/episode-room-store.ts",
    ),
    "utf8",
  ),
  readFile(
    path.join(
      root,
      "apps/quipsly/src/app/api/ingest/media/[sourceId]/route.ts",
    ),
    "utf8",
  ),
]);

const checks = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}

check(
  "Episode Room runtime and protected media accept the same native Firebase bearer",
  episodeAccess.includes("getQuipslySessionFromRequest")
    && episodeAccess.includes('"firebase-bearer"')
    && mediaRoute.includes("getQuipslySessionFromRequest"),
);
check(
  "Episode Room tells the iPhone whether this collaborator can control Watch",
  episodeRoute.includes("roleAllowsAction")
    && episodeRoute.includes("...runtime,\n      canEdit,")
    && watch.includes("canEdit = payload.canEdit == true"),
);
check(
  "one-second native polls use a lightweight projection instead of the manuscript runtime",
  watch.includes('URLQueryItem(name: "watch", value: "1")')
    && episodeRoute.includes('searchParams.get("watch") === "1"')
    && episodeRoute.includes("loadEpisodeRoomWatchRuntime")
    && episodeStore.includes("export async function loadEpisodeRoomWatchRuntime")
    && episodeStore.includes("select: {\n      productionJson: true,\n      updatedAt: true,")
    && !episodeStore.slice(
      episodeStore.indexOf("export async function loadEpisodeRoomWatchRuntime"),
      episodeStore.indexOf("async function findProductionId"),
    ).includes("reconcileEpisodeCaptureProxies"),
);
check(
  "large Watch media downloads stream to a temporary file under stable-owner auth",
  auth.includes("func authenticatedDownload(")
    && auth.includes("session.download(for: request)")
    && auth.includes("expectedOwnerAccountID")
    && auth.includes("validateAuthenticatedOwnerBinding(ownerBinding)")
    && auth.includes("statusCode == 401"),
);
check(
  "Firebase bearer media downloads cannot leave the configured Nest origin",
  watch.includes("candidate.scheme?.lowercased() == baseURL.scheme?.lowercased()")
    && watch.includes("candidate.host?.lowercased() == baseURL.host?.lowercased()")
    && watch.includes("candidate.port == baseURL.port")
    && watch.includes("candidate.user == nil")
    && watch.includes("candidate.password == nil"),
);
check(
  "episode endpoints accept safe path-segment slugs instead of permissive URL path characters",
  watch.includes("private static func safePathSlug(")
    && watch.includes('#"^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$"#')
    && watch.includes(".appendingPathComponent(projectSlug, isDirectory: true)")
    && !watch.includes("withAllowedCharacters: .urlPathAllowed"),
);
check(
  "a second rejected bearer signs out instead of exposing stale-account media",
  auth.includes("guard retryResult.1.statusCode != 401")
    && auth.includes("removeItem(at: retryResult.0)")
    && auth.includes("AuthenticatedRequestError.sessionRejected"),
);
check(
  "Watch cache is partitioned by owner and validates identity before reuse",
  watch.includes('appendingPathComponent("SharedWatchCache"')
    && watch.includes("Self.digest(owner.ownerAccountID)")
    && watch.includes("matchesStableOwnerSnapshot(owner)")
    && watch.includes("receipt.ownerDigest =="),
);
check(
  "signed-out users cannot leave invisible protected Watch downloads behind",
  auth.includes("MobileEpisodeWatchClient.clearProtectedCache()")
    && watch.includes("static func clearProtectedCache()")
    && watch.includes("removeItem(at: cacheRoot)"),
);
check(
  "Watch cache is excluded from backup and protected at rest",
  watch.match(/isExcludedFromBackup = true/g)?.length >= 3
    && watch.includes(".completeFileProtectionUntilFirstUserAuthentication")
    && watch.includes("FileProtectionType.completeUntilFirstUserAuthentication"),
);
check(
  "downloaded media is hashed incrementally instead of materialized in memory",
  watch.includes("FileHandle(forReadingFrom:")
    && watch.includes("read(upToCount: 1_048_576)")
    && watch.includes("hasher.update(data: chunk)")
    && !watch.includes("Data(contentsOf: temporaryURL)"),
);
check(
  "cached media must match receipt hash, byte count, source, and playback identity",
  watch.includes("verification.byteCount == receipt.byteCount")
    && watch.includes("verification.sha256 == receipt.sha256")
    && watch.includes("receipt.sourceId == clip.sourceId")
    && watch.includes("receipt.playbackUrl == clip.playbackUrl")
    && watch.includes("response.expectedContentLength != receipt.byteCount"),
);
check(
  "an already-open player is invalidated when the full selected source identity changes",
  watch.includes("preparedClipIdentity == selectedClip")
    && watch.includes("let previousClip = room?.selectedClip")
    && watch.includes("if previousClip != nextRoom.selectedClip")
    && watch.includes("preparedClipIdentity = nil"),
);
check(
  "private preview is explicitly outside shared state",
  watch.includes("Private iPhone preview · not added to the shared timeline.")
    && watch.includes("Shared Watch did not change.")
    && watch.includes("Use Preview to check the clip without changing the room."),
);
check(
  "first shared Play binds to the active Capture room before playback",
  watch.includes('type: "START_SESSION"')
    && watch.includes("recordingRoomId: session.callRoomId")
    && watch.indexOf('type: "START_SESSION"') < watch.indexOf('type: "PLAY"')
    && watch.includes("sharedClockReady("),
);
check(
  "Play Pause Seek and End use revisioned idempotent Episode Room commands",
  watch.includes('"expectedRevision": room.revision')
    && watch.includes('"clientRequestId": "capture-watch-')
    && watch.includes('type: "PAUSE"')
    && watch.includes('type: "SEEK"')
    && watch.includes('type: "ENDED"'),
);
check(
  "receipt-backed watched spans can be sent explicitly to the editor from iPhone",
  watch.includes("CaptureEpisodeWatchSyncTimelineButton")
    && watch.includes("func syncWatchedSpans(")
    && watch.includes('sendCommand(type: "SYNC_TIMELINE"')
    && watch.includes("room.watchedSegmentCount > 0")
    && watch.includes('room.status != "playing"')
    && watch.includes("non-destructive editor lane"),
);
check(
  "a current timeline sync is visible and cannot be repeated accidentally",
  watch.includes("var timelineIsCurrent: Bool")
    && watch.includes("timelineSync.sourceRevision == revision")
    && watch.includes("timelineSync.segmentCount == watchedSegmentCount")
    && watch.includes("client.room?.timelineIsCurrent == true"),
);
check(
  "a current sync links to the exact non-destructive Nest episode editor",
  watch.includes("CaptureEpisodeWatchOpenEditorLink")
    && watch.includes('components.path = "/editor"')
    && watch.includes('URLQueryItem(name: "project", value: projectSlug)')
    && watch.includes('URLQueryItem(name: "episode", value: episodeSlug)')
    && watch.includes("Open assembled episode in Nest"),
);
check(
  "one revision conflict reloads truth and retries the same command identity once",
  watch.includes("response.statusCode == 409")
    && watch.includes("clientRequestID: clientRequestID")
    && watch.includes("retryConflict: false"),
);
check(
  "remote controls project a shared clock and correct meaningful local drift",
  watch.includes("func projectedPosition(")
    && watch.includes('status == "playing"')
    && watch.includes("abs(current - target) > 0.5")
    && watch.includes("Task.sleep(for: .seconds(1))"),
);
check(
  "server time is mapped onto the local midpoint with explicit uncertainty",
  episodeRoute.match(/serverNow: new Date\(\)\.toISOString\(\)/g)?.length >= 2
    && watch.includes("serverClockOffsetSeconds")
    && watch.includes("serverClockUncertaintySeconds")
    && watch.includes("requestStartedAt.addingTimeInterval(roundTrip / 2)")
    && watch.includes("Date().addingTimeInterval(serverClockOffsetSeconds)"),
);
check(
  "AVPlayer drives the position UI through its supported periodic time observer",
  watch.includes("addPeriodicTimeObserver")
    && watch.includes("removeTimeObserver")
    && !watch.includes("Task.sleep(for: .milliseconds(250))"),
);
check(
  "both editors get reachable shared Play Pause and seek controls",
  watch.includes("CaptureEpisodeWatchPlayPauseButton")
    && watch.includes("Pause everyone")
    && watch.includes("CaptureEpisodeWatchBackButton")
    && watch.includes("CaptureEpisodeWatchForwardButton")
    && watch.includes("!client.canEdit"),
);
check(
  "an unprepared collaborator can pause everyone without downloading media first",
  watch.includes("CaptureEpisodeWatchUnpreparedPauseButton")
    && watch.includes("does not need the clip downloaded")
    && watch.indexOf('if room?.status == "playing"')
      < watch.indexOf("if !isPrepared"),
);
check(
  "prepared Watch media has a reachable local-only removal control",
  watch.includes("CaptureEpisodeWatchRemoveDownloadButton")
    && watch.includes("func removePreparedClip()")
    && watch.includes("The protected Nest source is unchanged.")
    && watch.includes("Pause Watch before removing its downloaded copy."),
);
check(
  "three missed polls fail visibly closed and a successful poll resynchronizes",
  watch.includes("consecutivePollFailures >= 3")
    && watch.includes("sharedConnectionReady = false")
    && watch.includes("player?.pause()")
    && watch.includes("Local media is preserved and playback is paused")
    && watch.includes("Shared Watch reconnected to the episode room.")
    && watch.match(/!client\.sharedConnectionReady/g)?.length >= 3,
);
check(
  "recording playback refuses the speaker route and route loss pauses everyone",
  audio.includes("hasPrivateListeningRoute")
    && audio.includes("Connect headphones before shared Watch playback")
    && audio.includes("AVAudioSession.routeChangeNotification")
    && audio.includes("holdSharedWatchForUnsafeRoute")
    && audio.includes("Shared Watch paused because its private headphone route")
    && audio.includes(".headphones")
    && audio.includes(".bluetoothA2DP")
    && audio.includes(".usbAudio")
    && watch.includes("Shared Watch paused for everyone. Reconnect headphones before resuming together.")
    && watch.includes('type: "PAUSE"')
    && watch.includes("positionSeconds: heldPosition"),
);
check(
  "unsafe-route recovery preserves private preview as a local-only action",
  watch.includes("if localPreviewActive")
    && watch.includes("Private preview paused on this iPhone. Shared Watch did not change.")
    && watch.indexOf("if localPreviewActive")
      < watch.indexOf("positionSeconds: heldPosition"),
);
check(
  "Watch playback can coexist with provider and local source recording",
  audio.includes("isSharedWatchPlaybackActive")
    && audio.includes("beginSharedWatchPlayback")
    && audio.includes("isLocalCaptureActive || isProviderRoomActive || isCallKitAudioActive"),
);
check(
  "starting capture or a call cannot inherit speaker-based Watch playback",
  audio.match(/try requirePrivateRouteDuringCapture\(\)/g)?.length >= 4
    && audio.includes("func activateLocalCapture() throws")
    && audio.includes("func providerWillConnect() throws")
    && audio.includes("changed during CallKit activation")
    && audio.includes("holdSharedWatchForUnsafeRoute()"),
);
check(
  "leaving Record stops playback and releases the shared audio lease",
  shell.includes(".onDisappear { episodeWatch.stop() }")
    && watch.includes("func stop()")
    && watch.includes("endSharedAudioLease()"),
);
check(
  "deterministic preview mode never calls the live Episode Room",
  shell.includes("if model.usesPreviewData")
    && shell.includes("episodeWatch.loadPreview(session: session)")
    && watch.includes("func loadPreview(session: MobileCaptureSession)"),
);
check(
  "Watch cannot silently start consent or recording on the participant's behalf",
  !watch.includes("grantConsent")
    && !watch.includes("START_RECORDING")
    && !watch.includes("startCapture(")
    && !watch.includes("startVideoCapture("),
);

process.stdout.write(
  `quipsly shared Episode Watch contract: ${checks.length}/${checks.length} checks passed\n`,
);
for (const name of checks) process.stdout.write(`  ✓ ${name}\n`);
