#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const captureRoot = path.join(
  repositoryRoot,
  "apps/mobile-capture/HighGroundCapture/HighGroundCapture",
);

const [
  audio,
  model,
  phoneShell,
  videoController,
  videoService,
  providerAudio,
  architecture,
] = await Promise.all([
  readFile(path.join(captureRoot, "AudioCaptureController.swift"), "utf8"),
  readFile(path.join(captureRoot, "CaptureExperienceModel.swift"), "utf8"),
  readFile(path.join(captureRoot, "CapturePhoneShell.swift"), "utf8"),
  readFile(path.join(captureRoot, "VideoCaptureController.swift"), "utf8"),
  readFile(path.join(captureRoot, "VideoCaptureService.swift"), "utf8"),
  readFile(path.join(captureRoot, "ProviderAudioMasterRecorder.swift"), "utf8"),
  readFile(
    path.join(
      repositoryRoot,
      "docs/quipsly/ios-coordinated-podcast-capture.md",
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
  "Capture exposes a distinct podcast audio plus video mode",
  model.includes("case podcastAV")
    && model.includes('case .podcastAV: "Podcast audio + video"')
    && model.includes("self == .audio || self == .podcastAV"),
);
check(
  "coordinated camera is video only while audio has its own recorder",
  model.includes("var movieIncludesAudio: Bool { self == .soloVideo }")
    && model.includes("videoCapture.resolvedProfile?.includesAudio == false")
    && videoService.includes("if includesAudio {")
    && videoService.includes("newMicrophoneInput = try AVCaptureDeviceInput"),
);
check(
  "live-room audio observes LiveKit local PCM instead of opening a second microphone",
  providerAudio.includes("AudioManager.shared.add(localAudioRenderer: self)")
    && providerAudio.includes("AudioMixRecorder(")
    && providerAudio.includes("source.render(pcmBuffer: pcmBuffer)")
    && !providerAudio.includes("AVAudioRecorder(")
    && audio.includes("providerInputObservationAvailable"),
);
check(
  "live-room start and resume require a real PCM callback",
  audio.includes("confirmProviderAudioInput(")
    && audio.includes("providerAudioMaster?.isReceivingPCM == true")
    && audio.includes("func waitUntilRecordingOrTerminal(")
    && model.includes("await audioCapture.waitUntilRecordingOrTerminal()"),
);
check(
  "audio source identity is separate from capture group identity",
  audio.includes("let captureID: UUID")
    && audio.includes("let captureGroupID: UUID")
    && audio.includes("captureGroupID: captureGroupID ?? captureID")
    && audio.includes("captureGroupId: captureIntent.captureGroupID"),
);

const coordinatedStart = model.slice(
  model.indexOf("func startCoordinatedPodcastCapture("),
  model.indexOf("func stopCoordinatedPodcastCapture("),
);
const groupAllocation = coordinatedStart.indexOf("let captureGroupID = UUID()");
const videoStart = coordinatedStart.indexOf("await startVideoCapture(");
const videoConfirmation = coordinatedStart.indexOf(
  "await videoCapture.waitUntilRecording()",
);
const audioStart = coordinatedStart.indexOf("await startCapture(");
const successClaim = coordinatedStart.indexOf(
  "Recording two local masters:",
);
check(
  "one capture group is allocated before either local source",
  groupAllocation >= 0
    && groupAllocation < videoStart
    && coordinatedStart.includes("captureGroupID: captureGroupID"),
);
check(
  "each source records its own clock evidence under the shared group identity",
  model.includes("captureGroupID: resolvedCaptureGroupID")
    && model.includes("CaptureClockClient.shared.measureBurst")
    && videoController.includes("CaptureClockClient.shared.measureBurst")
    && architecture.includes("server-clock burst")
    && architecture.includes("never copy one source's timestamps"),
);
check(
  "camera delegate confirmation precedes microphone start",
  videoStart >= 0
    && videoStart < videoConfirmation
    && videoConfirmation < audioStart,
);
check(
  "two-source success is claimed only after both controllers report recording",
  coordinatedStart.includes("audioCapture.captureState == .recording")
    && coordinatedStart.includes("videoCapture.state == .recording")
    && coordinatedStart.includes("activeCaptureSession != nil")
    && coordinatedStart.includes("activeVideoCaptureSession != nil")
    && successClaim > audioStart,
);
check(
  "partial camera startup is closed and preserved",
  coordinatedStart.includes("await videoCapture.stop()")
    && coordinatedStart.includes("await stopCapture(using: audioCapture)")
    && coordinatedStart.includes("await videoCapture.waitUntilTerminal()")
    && coordinatedStart.includes("Every partial source was closed and preserved"),
);
check(
  "camera is rechecked after audio START journaling and before microphone bytes",
  model.includes("The camera source ended while the microphone boundary was being armed.")
    && model.includes("audioCapture.abortArmedCaptureBeforeRecording()")
    && model.includes("activeVideoCapture?.state == .recording"),
);

const coordinatedStop = model.slice(
  model.indexOf("func stopCoordinatedPodcastCapture("),
  model.indexOf("func toggleCoordinatedPodcastPause("),
);
check(
  "one Stop closes both local sources and waits for camera finalization",
  coordinatedStop.includes("await stopCapture(using: audioCapture)")
    && coordinatedStop.includes("await stopVideoCapture(using: videoCapture)")
    && coordinatedStop.includes("await videoCapture.waitUntilTerminal()")
    && coordinatedStop.includes("Both local podcast masters are saved"),
);

const coordinatedPause = model.slice(
  model.indexOf("func toggleCoordinatedPodcastPause("),
  model.indexOf("func stopVideoCapture("),
);
check(
  "Pause and resume explicitly coordinate both source controllers",
  coordinatedPause.includes("isCoordinatingPodcastCapture = true")
    && coordinatedPause.includes("await togglePause(using: audioCapture)")
    && coordinatedPause.includes("await toggleVideoPause(using: videoCapture)")
    && coordinatedPause.includes("await videoCapture.waitUntilPausedOrTerminal()")
    && coordinatedPause.includes("videoCapture.state == .paused")
    && coordinatedPause.includes("await videoCapture.waitUntilRecording()")
    && coordinatedPause.includes("Both local masters resumed"),
);
check(
  "camera Flip preserves its existing group while audio can continue",
  videoController.includes("captureGroupID: finishedCapture.captureGroupID")
    && videoController.includes("pendingSwitchPosition")
    && phoneShell.includes(
      "Closes and validates this movie, then starts the other camera in the same capture group.",
    ),
);
check(
  "unexpected source termination visibly closes its partner",
  model.includes("closeAudioPartner")
    && model.includes("closeVideoPartner")
    && model.includes("closed and preserved the microphone partner")
    && model.includes("closed and preserved the camera partner")
    && model.includes("while self.isChangingCapture")
    && model.includes("The microphone partner is still closing")
    && model.includes("The camera partner is still closing"),
);
check(
  "unexpected microphone pause closes the current camera boundary",
  model.includes("state == .paused")
    && model.includes("await videoPartner.pause()")
    && model.includes("microphone source paused unexpectedly")
    && model.includes("safely closed the current movie boundary too"),
);
check(
  "provider controls remain locked for the audio-bearing group",
  model.includes("if activeCoordinatedCaptureGroupID != nil { return true }")
    && model.includes("coordinated podcast group is recording, paused, or saving"),
);
check(
  "Record UX exposes camera truth plus the separate microphone route meter",
  phoneShell.includes("CoordinatedPodcastAudioStatus(")
    && phoneShell.includes('"Separate microphone master"')
    && phoneShell.includes("CaptureCoordinatedAudioStatus")
    && phoneShell.includes("inputRoute: audioCapture.inputRouteName")
    && phoneShell.includes("capturePipeline: audioCapture.capturePipelineLabel")
    && audio.includes('"Same microphone as the live room"')
    && audio.includes('"Will use the live-room microphone"')
    && audio.includes('"Recorded directly on this iPhone"'),
);
check(
  "the global banner does not claim two-source recording during startup",
  phoneShell.includes('return "Preparing podcast sources"')
    && phoneShell.includes('return "Recording audio + video"')
    && phoneShell.includes("audioCapture.captureState == .recording")
    && phoneShell.includes("videoCapture.state == .recording"),
);
check(
  "movie start and stop wait for delegate-backed state",
  videoController.includes("func waitUntilRecording(")
    && videoController.includes("func waitUntilTerminal(")
    && videoController.includes("func waitUntilPausedOrTerminal(")
    && videoController.includes("The camera did not confirm source start in time."),
);
check(
  "camera interruptions close active sources without inventing continuity",
  videoController.includes("AVCaptureSession.wasInterruptedNotification")
    && videoController.includes("AVCaptureSession.runtimeErrorNotification")
    && videoController.includes("case captureSessionInterrupted")
    && videoController.includes("case captureSessionRuntimeError")
    && videoController.includes("await stopIfActive(reason: .captureSessionInterrupted)")
    && videoController.includes("await stopIfActive(reason: .captureSessionRuntimeError)")
    && videoController.includes("Prepare the camera again"),
);
check(
  "pause and camera flip continue only after source and STOP validation",
  videoController.includes("roomBoundaryClosed")
    && videoController.includes("finalized?.status.isPlaybackEligible == true")
    && videoController.includes("Quipsly did not open the other camera."),
);
check(
  "architecture keeps sync review and physical-device proof honest",
  architecture.includes("not a promise that two independent Apple capture")
    && architecture.includes("waveform review remains the")
    && architecture.includes("physical iPhone proves"),
);

process.stdout.write(
  `quipsly coordinated podcast capture contract: ${checks.length}/${checks.length} checks passed\n`,
);
for (const name of checks) process.stdout.write(`  ✓ ${name}\n`);
