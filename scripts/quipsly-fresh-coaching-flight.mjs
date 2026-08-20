#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmod, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const controlledSpeechFlight =
  process.env.QUIPSLY_FRESH_COACHING_SPEECH_FLIGHT === "1";
assert(
  process.env.QUIPSLY_FRESH_COACHING_FLIGHT === "1" || controlledSpeechFlight,
  "Set QUIPSLY_FRESH_COACHING_FLIGHT=1 or QUIPSLY_FRESH_COACHING_SPEECH_FLIGHT=1 to run a complete local fresh-coach flight.",
);

function readGitReleaseIdentity() {
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
  const trackedChanges = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { cwd: process.cwd(), encoding: "utf8" },
  ).trim();
  assert.match(sourceSha, /^[a-f0-9]{40}$/, "Fresh flight could not resolve an exact candidate commit.");
  return {
    sourceSha,
    trackedWorktreeCleanAtStart: trackedChanges.length === 0,
  };
}

const releaseIdentity = readGitReleaseIdentity();

function parsePacket(output, label) {
  for (
    let cursor = output.indexOf("{");
    cursor >= 0;
    cursor = output.indexOf("{", cursor + 1)
  ) {
    try {
      const packet = JSON.parse(output.slice(cursor));
      if (packet?.ok === true) return packet;
    } catch {}
  }
  throw new Error(`${label} did not emit one machine-readable result.`);
}

async function run(label, script, flag, extraEnv = {}) {
  process.stderr.write(`\n[coaching flight] ${label}\n`);
  const startedAt = Date.now();
  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      "./scripts/register-ts-extension-loader.mjs",
      script,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv, [flag]: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exitCode !== 0)
    throw new Error(
      `${label} failed with exit ${exitCode}.\n${stderr}\n${stdout}`,
    );
  const packet = parsePacket(stdout.trim(), label);
  process.stderr.write(
    `[coaching flight] ${label} passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`,
  );
  return packet;
}

const start = await run(
  "Fresh signup, coach setup, appointment, and client entry",
  "scripts/quipsly-fresh-coaching-start-operation.mjs",
  "QUIPSLY_FRESH_COACHING_START_OPERATION",
);
const continuationEnv = {
  QUIPSLY_COACHING_ACCEPTANCE_CONTEXT: start.contextPath,
};
const artifactDirectory = path.dirname(start.contextPath);
let controlledSpeech = null;
if (controlledSpeechFlight) {
  const phrases = {
    coach:
      "Welcome to our coaching session. Today we will clarify your goal and choose one next step. What outcome would make this week feel successful?",
    client:
      "My goal is to complete the certification practice review by Friday. Please create a task to send the recording to my instructor tomorrow, and note that I want accountability without daily reminders.",
  };
  const voices = { coach: "Daniel", client: "Samantha" };
  const files = {};
  for (const role of ["coach", "client"]) {
    const intermediatePath = path.join(
      artifactDirectory,
      `${role}-controlled-speech.aiff`,
    );
    const audioPath = path.join(
      artifactDirectory,
      `${role}-controlled-speech.wav`,
    );
    execFileSync(
      "/usr/bin/say",
      ["-v", voices[role], "-r", "145", "-o", intermediatePath, phrases[role]],
      { stdio: "inherit" },
    );
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        intermediatePath,
        "-af",
        "apad=pad_dur=3",
        "-ar",
        "48000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        audioPath,
      ],
      { stdio: "inherit" },
    );
    await chmod(audioPath, 0o600);
    await rm(intermediatePath, { force: true });
    files[role] = audioPath;
  }
  controlledSpeech = {
    files,
    expectedTerms: {
      coach: ["goal", "successful"],
      client: ["certification", "friday", "instructor"],
    },
  };
  continuationEnv.QUIPSLY_LOCAL_LIVE_ROOM_AUDIO_FILES_JSON =
    JSON.stringify(files);
  continuationEnv.QUIPSLY_LOCAL_LIVE_ROOM_RECORDING_MS = "22000";
  continuationEnv.QUIPSLY_LOCAL_TRANSCRIPT_EXPECTED_TERMS_JSON = JSON.stringify(
    controlledSpeech.expectedTerms,
  );
}
const call = await run(
  "Two-endpoint call, consent, chat, and local source capture",
  "scripts/quipsly-local-live-room-operation.mjs",
  "QUIPSLY_LOCAL_LIVE_ROOM_OPERATION",
  continuationEnv,
);
const transcript = await run(
  "Participant-attributed transcription and protected playback",
  "scripts/quipsly-local-coaching-transcript-operation.mjs",
  "QUIPSLY_LOCAL_COACHING_TRANSCRIPT_OPERATION",
  continuationEnv,
);
const work = await run(
  "Shared and private relationship work",
  "scripts/quipsly-fresh-coaching-work-operation.mjs",
  "QUIPSLY_FRESH_COACHING_WORK_OPERATION",
  continuationEnv,
);
const share = await run(
  "Light edit, private preview, client release, and revoke",
  "scripts/quipsly-local-recording-share-operation.mjs",
  "QUIPSLY_LOCAL_RECORDING_SHARE_OPERATION",
  continuationEnv,
);

for (const [label, packet] of Object.entries({
  start,
  call,
  transcript,
  work,
  share,
})) {
  assert.equal(
    packet.testLane,
    "fresh-ui-automation",
    `${label} fell back to another test lane.`,
  );
  assert.equal(
    packet.fixtureIdentifiersUsed,
    false,
    `${label} used fixture identifiers.`,
  );
  assert.equal(
    packet.humanAcceptanceSatisfied,
    false,
    `${label} incorrectly claimed human acceptance.`,
  );
  assert.equal(
    packet.roomId,
    start.roomId,
    `${label} operated another Session.`,
  );
}
if (controlledSpeechFlight) {
  assert.equal(
    call.controlledAudibleSpeechUsed,
    true,
    "The speech flight did not route distinct participant audio files.",
  );
  assert.equal(
    call.naturalHumanSpeechProven,
    false,
    "Controlled TTS must not claim natural human speech proof.",
  );
  assert.equal(
    transcript.controlledSpeechTermsObserved,
    true,
    "The controlled speech terms were not recovered from both participant sources.",
  );
}

const receiptPath = path.join(
  artifactDirectory,
  "fresh-coaching-flight-receipt.json",
);
const result = {
  schema: "quipsly-fresh-coaching-flight-receipt-v2",
  recordedAt: new Date().toISOString(),
  ok: true,
  localOnly: true,
  releaseIdentity,
  testLane: "fresh-product-automation",
  sourceContextLane: start.testLane,
  fixtureIdentifiersUsed: false,
  humanAcceptanceSatisfied: false,
  receiptPath,
  contextPath: start.contextPath,
  roomId: start.roomId,
  bookingId: start.bookingId,
  engagementId: start.engagementId,
  freshAccountsCreated: true,
  exactRenderedClientEntryUsed: true,
  participantsConnected: call.participantsConnected,
  independentParticipantSourcesVerified:
    call.independentParticipantSourcesVerified,
  sourceOverlapMilliseconds: call.browserSourceOverlapMilliseconds,
  transcriptSourceCount: transcript.sourceCount,
  protectedTranscriptPlaybackDecoded: transcript.renderedTranscriptRuns.every(
    (item) => item.protectedPlaybackDecoded,
  ),
  sharedAndPrivateWorkOperated:
    work.clientCreatedSharedNote &&
    work.clientCreatedPrivateNote &&
    work.privateNoteHiddenFromCoach,
  crossAccountTaskCompletionOperated: work.clientObservedCoachCompletion,
  lightEditPreviewAndRecipientPlaybackOperated:
    share.coachPreviewDecoded && share.clientPlaybackDecoded,
  releaseAndRevokeOperated:
    share.clientMediaStatusBeforeRevoke === 200 &&
    share.clientMediaStatusAfterRevoke === 404,
  controlledAudibleSpeechPipelineOperated:
    controlledSpeechFlight && transcript.controlledSpeechTermsObserved,
  interactionSurfaceEvidence: {
    renderedBrowser: {
      accountCreation: true,
      coachSetup: start.coachSetupThroughRenderedProduct === true,
      appointmentCreation:
        start.appointmentCreatedThroughRenderedProduct === true,
      invitationHandoff:
        start.clientEntryCopiedFromRenderedProduct === true,
      clientEntryAndReturn:
        start.clientCreatedAccountFromExactEntry === true &&
        start.clientOnlyHomeOpenedExactSession === true,
      callLobbyConsentChatAndCapture: call.browserToBrowserLiveKit === "passed",
      relationshipWork: work.boundaries?.productFormsOnlyForWrites === true,
      lightEditPreviewReleaseAndRevoke:
        share.boundaries?.releaseWasExplicit === true &&
        share.boundaries?.revokeWasExplicit === true,
    },
    browserInitiatedServiceMechanics: {
      transcriptWorkerAndProtectedPlayback: true,
      immutableSourceReadback: share.sourceChecksumsUnchanged === true,
      recipientMediaAuthorizationReadback: true,
    },
    directDatabaseAcceptanceWrites: false,
    humanUnderstandingObserved: false,
  },
  boundaries: {
    localMailboxAdapterUsed: true,
    realMailboxDeliveryProven: false,
    fakeBrowserMediaUsed: true,
    controlledTextToSpeechUsed: controlledSpeechFlight,
    distinctParticipantSpeechFilesUsed: controlledSpeechFlight,
    realSpeechQualityProven: false,
    naturalHumanSpeechProven: false,
    physicalDeviceProven: false,
    humanListeningProven: false,
    minimallyInstructedHumanAcceptanceProven: false,
    productionScaleProven: false,
    combinedReceiptIsNotPureUIAutomation: true,
  },
};
await writeFile(receiptPath, `${JSON.stringify(result, null, 2)}\n`, {
  mode: 0o600,
});
await chmod(receiptPath, 0o600);
console.log(JSON.stringify(result, null, 2));
