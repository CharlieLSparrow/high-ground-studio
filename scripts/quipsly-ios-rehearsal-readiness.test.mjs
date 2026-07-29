#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const iosRoot = path.join(
  root,
  "apps/mobile-capture/HighGroundCapture",
);
const [
  readiness,
  shell,
  audioSession,
  uiTest,
] = await Promise.all([
  readFile(
    path.join(
      iosRoot,
      "HighGroundCapture/CaptureRehearsalReadiness.swift",
    ),
    "utf8",
  ),
  readFile(
    path.join(iosRoot, "HighGroundCapture/CapturePhoneShell.swift"),
    "utf8",
  ),
  readFile(
    path.join(
      iosRoot,
      "HighGroundCapture/CaptureAudioSessionCoordinator.swift",
    ),
    "utf8",
  ),
  readFile(
    path.join(
      iosRoot,
      "HighGroundCaptureUITests/CaptureExperienceUITests.swift",
    ),
    "utf8",
  ),
]);

const checks = [
  [
    "one consolidated pre-record surface",
    readiness.includes("struct CaptureRehearsalReadinessCard")
      && readiness.includes('"CaptureRehearsalReadinessCard"')
      && shell.includes("CaptureRehearsalReadinessCard("),
  ],
  [
    "verified account and exact Session destination",
    readiness.includes('"Quipsly account"')
      && readiness.includes('"Exact episode room"')
      && readiness.includes("auth.networkActionsAllowed"),
  ],
  [
    "mode-aware participant consent",
    readiness.includes("mode.requiresAudioConsent")
      && readiness.includes("mode.recordsVideo")
      && readiness.includes("consentRequiredParticipantCount"),
  ],
  [
    "real microphone route and storage",
    readiness.includes("microphonePreflightState")
      && readiness.includes("availableCaptureCapacityBytes")
      && readiness.includes("inputRouteName"),
  ],
  [
    "resolved camera profile for video modes",
    readiness.includes("videoCapture.resolvedProfile")
      && readiness.includes("estimatedAvailableMinutes")
      && readiness.includes("mode.recordsVideo"),
  ],
  [
    "canonical manuscript and selected Watch source",
    readiness.includes("manuscript.hasReadableCopy")
      && readiness.includes("manuscript.displayTitle")
      && readiness.includes("watch.selectedClip")
      && readiness.includes("watch.isPrepared"),
  ],
  [
    "private listening and live-room truth",
    readiness.includes("privateListeningRouteAvailable")
      && readiness.includes("providerConnected")
      && readiness.includes('"Private listening route"')
      && readiness.includes('"Live room"'),
  ],
  [
    "check never starts or joins",
    shell.includes("AuthManager.shared.networkActionsAllowed")
      && shell.includes("await audioCapture.prepareForRecording()")
      && shell.includes("await model.prepareVideoCapture(")
      && !shell.slice(
        shell.indexOf("private func runRehearsalCheck"),
        shell.indexOf("\n    }\n}", shell.indexOf("private func runRehearsalCheck")),
      ).includes("startCapture")
      && !shell.slice(
        shell.indexOf("private func runRehearsalCheck"),
        shell.indexOf("\n    }\n}", shell.indexOf("private func runRehearsalCheck")),
      ).includes("joinRoom"),
  ],
  [
    "versioned manuscript and protected clip preparation",
    shell.includes("forceRefresh: true")
      && shell.includes("await episodeWatch.load(session: session)")
      && shell.includes("await episodeWatch.prepareSelectedClip()"),
  ],
  [
    "connected-room audio is not reconfigured",
    shell.includes("if !model.providerRoom.isConnected")
      && readiness.includes('"Refresh script and clip"'),
  ],
  [
    "route state is observable",
    audioSession.includes(
      "@Published private(set) var privateListeningRouteAvailable",
    )
      && audioSession.includes("refreshPrivateListeningRoute()"),
  ],
  [
    "preview and UI acceptance stay honest",
    readiness.includes("Preview shows the checklist shape only")
      && readiness.includes("previewOnly")
      && uiTest.includes(
        "testRehearsalReadinessMakesEveryPhysicalBoundaryVisibleBeforeRecord",
      )
      && uiTest.includes("does not fake a protected download"),
  ],
];

for (const [name, passed] of checks) {
  assert.equal(passed, true, `Missing rehearsal-readiness contract: ${name}`);
}

process.stdout.write(
  `PASS iOS rehearsal readiness contract (${checks.length}/${checks.length})\n`,
);
