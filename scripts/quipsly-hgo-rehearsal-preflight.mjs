#!/usr/bin/env node

import { chmod, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(message) {
  throw new Error(message);
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    appStorePath: "",
    publicLinkPath: "",
    rehearsalPath: "",
    watchPath: "",
    macAppPath: "",
    macAccountPath: "",
    nativeAccountSmokePath: "",
    captureLauncherSmokePath: "",
    outputPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    const value = takeValue(argv, index, flag);
    if (flag === "--app-store") options.appStorePath = value;
    else if (flag === "--public-link") options.publicLinkPath = value;
    else if (flag === "--rehearsal") options.rehearsalPath = value;
    else if (flag === "--watch") options.watchPath = value;
    else if (flag === "--mac-app") options.macAppPath = value;
    else if (flag === "--mac-account") options.macAccountPath = value;
    else if (flag === "--native-account-smoke") {
      options.nativeAccountSmokePath = value;
    } else if (flag === "--capture-launcher-smoke") {
      options.captureLauncherSmokePath = value;
    } else if (flag === "--output") options.outputPath = value;
    else fail(`Unknown argument: ${flag}`);
    index += 1;
  }

  if (options.help) return options;
  for (const [name, value] of Object.entries(options)) {
    if (name === "help") continue;
    if (!clean(value)) fail(`${name} is required.`);
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/quipsly-hgo-rehearsal-preflight.mjs \\
    --app-store <readback.json> \\
    --public-link <readback.json> \\
    --rehearsal <rehearsal-plan.json> \\
    --watch <native-watch.json> \\
    --mac-app <studioctl.txt> \\
    --mac-account <agent-state.json> \\
    --native-account-smoke <smoke.json> \\
    --capture-launcher-smoke <smoke.json> \\
    --output <receipt.json>

Composes existing redacted provider, Nest, and exact-Mac readbacks. It never
interprets automated readiness as physical installation, consent, capture,
playback review, upload, or assembled-timeline proof.
`;
}

function appTextValue(text, key) {
  const prefix = `${key}=`;
  return text
    .split(/\r?\n/)
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length)
    .trim() ?? "";
}

function allTrue(object) {
  return Object.values(object).every(Boolean);
}

export function composeRehearsalPreflight({
  appStore,
  publicLink,
  rehearsal,
  watch,
  macAppText,
  macState,
  nativeAccountSmoke,
  captureLauncherSmoke,
  auditedAt = new Date().toISOString(),
}) {
  const nativeAccount = macState?.nativeAccount ?? {};
  const expectedTesterState = clean(
    appStore?.testers?.expectedTester?.state,
  ).toUpperCase();
  const consentStatuses = [
    clean(rehearsal?.room?.hostConsentStatus).toUpperCase(),
    clean(rehearsal?.room?.guestConsentStatus).toUpperCase(),
  ];
  const bothConsentsGranted = consentStatuses.every(
    (status) => status === "GRANTED",
  );
  const consentStateValid = consentStatuses.every(
    (status) => status === "REQUESTED" || status === "GRANTED",
  );

  const infrastructureChecks = {
    appStoreBuildReady: Boolean(
      appStore?.passed
      && appStore?.build?.buildNumber === "12"
      && appStore?.build?.processingState === "VALID"
      && appStore?.build?.externalBuildState === "IN_BETA_TESTING",
    ),
    publicLinkOpen: Boolean(
      publicLink?.ok
      && publicLink?.open
      && publicLink?.handoffMatches
      && publicLink?.appName === "Quipsly Capture",
    ),
    rehearsalRoomReady: Boolean(
      rehearsal?.passed
      && rehearsal?.project?.slug === "high-ground-odyssey-rehearsal"
      && rehearsal?.episode?.slug === "testflight-rehearsal"
      && rehearsal?.room?.participantCount === 2
      && rehearsal?.room?.providerRoomConfigured
      && rehearsal?.room?.provider === "livekit"
      && consentStateValid,
    ),
    guestGoogleLinkReady: Boolean(
      rehearsal?.guestSignIn?.justInTimeGoogleLinkReady
      && rehearsal?.guestSignIn?.verificationEmailRequired === false
      && rehearsal?.guestSignIn?.identityAuthority === "firebase:quipsly-reef",
    ),
    manuscriptReady: Boolean(
      watch?.passed
      && watch?.manuscript?.authenticatedStatus === 200
      && watch?.manuscript?.outsiderDenied
      && watch?.manuscript?.blockCount === 34
      && watch?.manuscript?.stableIdsUnique
      && watch?.manuscript?.allBodiesPresent,
    ),
    watchReady: Boolean(
      watch?.passed
      && watch?.watch?.exactClipOrder
      && watch?.watch?.leadSelected
      && watch?.watch?.status === "paused"
      && watch?.watch?.positionSeconds === 0
      && watch?.watch?.sessionStarted === false
      && watch?.watch?.watchedSegmentCount === 0,
    ),
    protectedMediaReady: Boolean(
      watch?.protectedMedia?.length === 3
      && watch.protectedMedia.every(
        (media) => media.outsiderDenied && media.exactBytesMatch,
      ),
    ),
    canonicalMacAppReady: Boolean(
      appTextValue(macAppText, "status") === "present"
      && appTextValue(macAppText, "bundleId")
        === "com.highground.QuipslyMac"
      && appTextValue(macAppText, "canonicalPids")
      && !macAppText.includes("warning="),
    ),
    nativeAccountBoundaryReady: nativeAccountSmoke?.passed === true,
    captureLauncherReady: captureLauncherSmoke?.passed === true,
  };

  const humanGates = {
    scottPhysicalInstallProven: false,
    charlieMacSessionVerified: Boolean(
      nativeAccount?.hasSavedSession && nativeAccount?.isVerified,
    ),
    bothParticipantsGrantedRecordingConsent: bothConsentsGranted,
    physicalRoutesAndPermissionsProven: false,
    disposableTakeListenedAndWatched: false,
    twoParticipantRoomOperated: false,
    uploadAndSameIdTimelineReadbackProven: false,
  };

  const infrastructureReady = allTrue(infrastructureChecks);
  const readyToRecordNow = infrastructureReady && allTrue(humanGates);
  const blockers = [];
  if (!infrastructureReady) {
    for (const [name, passed] of Object.entries(infrastructureChecks)) {
      if (!passed) blockers.push(`infrastructure:${name}`);
    }
  }
  if (!humanGates.scottPhysicalInstallProven) {
    blockers.push("human:confirm-scott-physical-testflight-install");
  }
  if (!humanGates.charlieMacSessionVerified) {
    blockers.push("human:complete-charlie-mac-google-handoff");
  }
  if (!humanGates.bothParticipantsGrantedRecordingConsent) {
    blockers.push("human:grant-both-recording-consents-in-session");
  }
  if (!humanGates.physicalRoutesAndPermissionsProven) {
    blockers.push("physical:prove-iphone-and-mv7i-eos-routes");
  }
  if (!humanGates.disposableTakeListenedAndWatched) {
    blockers.push("physical:listen-and-watch-disposable-take");
  }
  if (!humanGates.twoParticipantRoomOperated) {
    blockers.push("physical:operate-two-participant-room");
  }
  if (!humanGates.uploadAndSameIdTimelineReadbackProven) {
    blockers.push("physical:verify-upload-and-same-id-timeline");
  }

  return {
    schema: "quipsly-hgo-rehearsal-preflight-v1",
    auditedAt,
    infrastructureReady,
    readyToBeginHumanRehearsal: infrastructureReady,
    readyToRecordNow,
    testFlight: {
      appName: appStore?.app?.name ?? "",
      buildNumber: appStore?.build?.buildNumber ?? "",
      buildState: appStore?.build?.externalBuildState ?? "",
      publicLink: publicLink?.canonicalUrl ?? "",
      publicLinkOpen: publicLink?.open === true,
      expectedNamedTesterState: expectedTesterState,
      namedTesterStateReportsInstalled:
        expectedTesterState === "INSTALLED",
      truth:
        "The public link is the canonical enrollment path. An INVITED named-tester state does not block that path and never proves physical installation.",
    },
    nest: {
      baseUrl: rehearsal?.baseUrl ?? watch?.baseUrl ?? "",
      releaseSourceSha: watch?.release?.sourceSha ?? "",
      projectSlug: rehearsal?.project?.slug ?? "",
      episodeSlug: rehearsal?.episode?.slug ?? "",
      roomId: rehearsal?.room?.id ?? "",
      participantCount: rehearsal?.room?.participantCount ?? 0,
      consentStatuses,
      guestSignInState: rehearsal?.guestSignIn?.state ?? "",
      manuscriptVersion: watch?.manuscript?.version ?? "",
      manuscriptBlockCount: watch?.manuscript?.blockCount ?? 0,
      watchRevision: watch?.watch?.revision ?? 0,
      selectedClipTitle: watch?.watch?.selectedClipTitle ?? "",
      protectedMediaCount: watch?.protectedMedia?.length ?? 0,
    },
    mac: {
      canonicalBundle: appTextValue(macAppText, "canonicalBundle"),
      bundleId: appTextValue(macAppText, "bundleId"),
      canonicalPids: appTextValue(macAppText, "canonicalPids")
        .split(/\s+/)
        .filter(Boolean),
      duplicateBundleWarning: macAppText.includes("warning="),
      sessionVerified: humanGates.charlieMacSessionVerified,
      accountStatus: nativeAccount?.statusMessage ?? "",
      captureLauncherPassed: captureLauncherSmoke?.passed === true,
      nativeAccountBoundaryPassed: nativeAccountSmoke?.passed === true,
    },
    infrastructureChecks,
    humanGates,
    blockers,
    nextActions: [
      "On Scott's iPhone, open the public TestFlight link in Safari, accept, install Build 12, and record that physical readback.",
      "Complete Charlie's state-bound Mac Google handoff; then re-run this preflight.",
      "In the exact rehearsal Session, have Charlie and Scott independently grant recording consent.",
      "Prove iPhone camera/mic and Mac MV7i/EOS routes with one disposable take before the two-person take.",
      "Listen/watch, upload, and compare the same capture/source IDs in Nest and Studio.",
    ],
    safety: {
      providerSecretsExposed: false,
      credentialsPrinted: false,
      recordingStartedByPreflight: false,
      providerJoinedByPreflight: false,
      consentMutatedByPreflight: false,
      mediaMutatedByPreflight: false,
      automatedChecksCount:
        Object.keys(infrastructureChecks).length,
      physicalClaimsInvented: false,
    },
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const [
    appStore,
    publicLink,
    rehearsal,
    watch,
    macAppText,
    macState,
    nativeAccountSmoke,
    captureLauncherSmoke,
  ] = await Promise.all([
    readJson(options.appStorePath),
    readJson(options.publicLinkPath),
    readJson(options.rehearsalPath),
    readJson(options.watchPath),
    readFile(options.macAppPath, "utf8"),
    readJson(options.macAccountPath),
    readJson(options.nativeAccountSmokePath),
    readJson(options.captureLauncherSmokePath),
  ]);

  const receipt = composeRehearsalPreflight({
    appStore,
    publicLink,
    rehearsal,
    watch,
    macAppText,
    macState,
    nativeAccountSmoke,
    captureLauncherSmoke,
  });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeFile(options.outputPath, serialized, { mode: 0o600 });
  await chmod(options.outputPath, 0o600);
  process.stdout.write(serialized);
  if (!receipt.infrastructureReady) process.exitCode = 2;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `quipsly-hgo-rehearsal-preflight: ${error.message}\n`,
    );
    process.exitCode = 1;
  });
}
