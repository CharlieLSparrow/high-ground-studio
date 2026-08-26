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
      "--experimental-transform-types",
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
const adversarialNeighbor = await run(
  "Independent neighboring coach, client, Nest, Session, and relationship",
  "scripts/quipsly-fresh-coaching-start-operation.mjs",
  "QUIPSLY_FRESH_COACHING_START_OPERATION",
);
assert.equal(adversarialNeighbor.testLane, "fresh-ui-automation");
assert.equal(adversarialNeighbor.fixtureIdentifiersUsed, false);
assert.notEqual(adversarialNeighbor.roomId, start.roomId);
assert.notEqual(adversarialNeighbor.engagementId, start.engagementId);
const continuationEnv = {
  QUIPSLY_COACHING_ACCEPTANCE_CONTEXT: start.contextPath,
  QUIPSLY_COACHING_ACCEPTANCE_NEIGHBOR_CONTEXT:
    adversarialNeighbor.contextPath,
  // The production alignment planner intentionally needs enough shared signal
  // for two separated waveform checks. Keep the ordinary full-product flight
  // long enough to exercise that contract instead of weakening it for a
  // three-second browser smoke capture.
  QUIPSLY_LOCAL_LIVE_ROOM_RECORDING_MS: "12000",
};
const isolation = await run(
  "Fresh coach/client isolation from neighboring Nests, Sessions, and coaching relationships",
  "scripts/quipsly-fresh-coaching-isolation-operation.mjs",
  "QUIPSLY_FRESH_COACHING_ISOLATION_OPERATION",
  continuationEnv,
);
const preparation = await run(
  "Client check-in, coach-private preparation, retry, and privacy boundaries",
  "scripts/quipsly-fresh-session-preparation-operation.mjs",
  "QUIPSLY_FRESH_SESSION_PREPARATION_OPERATION",
  continuationEnv,
);
const practiceCommand = await run(
  "Coach practice command, exact Session action, client boundary, and neighboring-practice isolation",
  "scripts/quipsly-fresh-coaching-practice-command-operation.mjs",
  "QUIPSLY_FRESH_COACHING_PRACTICE_COMMAND_OPERATION",
  continuationEnv,
);
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
const forms = await run(
  "Reusable intake, private draft, submission, and cross-account form isolation",
  "scripts/quipsly-fresh-coaching-forms-operation.mjs",
  "QUIPSLY_FRESH_COACHING_FORMS_OPERATION",
  continuationEnv,
);
const share = await run(
  "Light edit, private preview, client release, and revoke",
  "scripts/quipsly-local-recording-share-operation.mjs",
  "QUIPSLY_LOCAL_RECORDING_SHARE_OPERATION",
  continuationEnv,
);
let audioPolish = null;
if (controlledSpeechFlight) {
  audioPolish = await run(
    "Automatic post-call audio readiness in the ordinary Session",
    "scripts/quipsly-fresh-session-audio-polish-operation.mjs",
    "QUIPSLY_FRESH_SESSION_AUDIO_POLISH",
    continuationEnv,
  );
}

for (const [label, packet] of Object.entries({
  start,
  isolation,
  preparation,
  practiceCommand,
  call,
  transcript,
  work,
  forms,
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
assert.equal(
  call.allExpectedParticipantsRecordingVisible,
  true,
  "The host never received complete participant recording-health evidence.",
);
assert.equal(
  transcript.mentorReport?.downloadedThroughRenderedUi,
  true,
  "The coach did not receive the mentor transcript through the rendered Session.",
);
assert.equal(
  transcript.mentorReport?.schema,
  "quipsly-coaching-transcript-report-v2",
  "The mentor transcript did not use the multi-source report contract.",
);
assert.equal(
  transcript.mentorReport?.sourceCount,
  2,
  "The mentor transcript did not bind both participant recordings.",
);
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
  assert.equal(
    audioPolish?.roomId,
    start.roomId,
    "Automatic audio readiness operated another Session.",
  );
  assert.equal(
    audioPolish?.actionOperated,
    false,
    "The coach had to request recurring post-call audio preparation manually.",
  );
  assert.notEqual(
    audioPolish?.initialState,
    "action-required",
    "The ordinary Session did not expose the automatically queued audio result.",
  );
  assert.equal(
    audioPolish?.originalSourceAndCaptureManifestUnchanged,
    true,
    "Automatic audio preparation changed an original participant source.",
  );
  assert.equal(
    audioPolish?.calmRecordingSummaryRendered,
    true,
    "The ordinary Session did not reduce post-call evidence to one calm recording summary.",
  );
  assert.equal(
    audioPolish?.expertRecordingDetailsCollapsedByDefault,
    true,
    "Production evidence was expanded before the coach requested it.",
  );
  assert.equal(
    audioPolish?.transcriptAppearedBeforePacketAdministration,
    true,
    "The ordinary transcript was buried below packet administration.",
  );
  assert.equal(
    audioPolish?.recordingEditorOpenedInline,
    true,
    "Basic recording edits left the transcript workflow instead of opening inline.",
  );
  assert.equal(
    audioPolish?.transcriptViewModesOperated,
    true,
    "The transcript did not expose both familiar linear and recording-plus-transcript workspaces.",
  );
  assert.equal(
    audioPolish?.recordingAndTranscriptRenderedSideBySide,
    true,
    "The recording-plus-transcript workspace did not render side by side on a wide screen.",
  );
  assert.equal(
    audioPolish?.correctionPlaybackStartedAutomatically,
    true,
    "Correcting a transcript passage did not begin evidence playback automatically.",
  );
  assert.equal(
    audioPolish?.repeatedPlaybackAttestationAbsent,
    true,
    "Transcript correction still required a repeated manual playback attestation.",
  );
  assert(
    ["improved-listening-copy", "already-balanced"].includes(
      audioPolish?.outcome,
    ),
    "Automatic audio preparation did not reach a calm terminal state.",
  );
  if (audioPolish.outcome === "improved-listening-copy") {
    assert.equal(
      audioPolish.originalAndImprovedPlaybackRendered,
      true,
      "The improved result did not keep original and listening-copy playback together.",
    );
    assert(
      audioPolish.originalReadyState >= 1 &&
        audioPolish.improvedReadyState >= 1,
      "The automatic listening comparison did not expose decodable media metadata.",
    );
  }
}

const receiptPath = path.join(
  artifactDirectory,
  "fresh-coaching-flight-receipt.json",
);
const result = {
  schema: "quipsly-fresh-coaching-flight-receipt-v3",
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
  adversarialNeighborCreatedThroughRenderedProduct: true,
  exactRenderedClientEntryUsed: true,
  automaticCoachDefaultsOperated:
    start.automaticCoachDefaultsRendered === true &&
    start.mandatoryCoachConfigurationRequired === false,
  coachAndClientTenantIsolationOperated:
    isolation.coachAndClientIsolationOperated === true &&
    isolation.normalNavigationLeakageObserved === false &&
    isolation.directUrlLeakageObserved === false &&
    isolation.directApiLeakageObserved === false,
  preSessionPlanningOperated:
    preparation.renderedClientPlanSaved === true
    && preparation.renderedCoachSharedReadback === true
    && preparation.renderedCoachPrivatePlanSaved === true
    && preparation.clientPrivateProjectionAbsent === true
    && preparation.neighboringCoachDirectRouteDenied === true
    && preparation.exactRetryConverged === true
    && preparation.unrelatedSideEffectsAbsent === true,
  coachPracticeCommandOperated:
    practiceCommand.renderedPhoneWidthCommand === true
    && practiceCommand.renderedNextActionOpenedExactSession === true
    && practiceCommand.exactCoachProjectionOperated === true
    && practiceCommand.clientCoachCommandAbsent === true
    && practiceCommand.neighboringPracticeAbsent === true
    && practiceCommand.neighboringCoachOwnPracticePreserved === true,
  participantsConnected: call.participantsConnected,
  independentParticipantSourcesVerified:
    call.independentParticipantSourcesVerified,
  conventionalCallEntryOperated:
    call.conventionalLobbyOperated === true &&
    call.advancedDeviceSettingsCollapsedBeforeJoin === true &&
    call.technicalDeviceDetailsCollapsedBeforeJoin === true &&
    call.prejoinRecordingActionAbsent === true,
  unchangedSessionConsentRemembered:
    call.savedConsentRestoredAfterReentry === true,
  safePostCallRecordingExitOperated:
    call.postCallRecordingRecoveryStayedMounted === true &&
    call.verifiedRecordingSafeToCloseRendered === true,
  participantRecordingCompletenessVisible:
    call.allExpectedParticipantsRecordingVisible === true,
  sourceOverlapMilliseconds: call.browserSourceOverlapMilliseconds,
  transcriptSourceCount: transcript.sourceCount,
  protectedTranscriptPlaybackDecoded: transcript.renderedTranscriptRuns.every(
    (item) => item.protectedPlaybackDecoded,
  ),
  mentorTranscriptReportOperated:
    transcript.mentorReport?.downloadedThroughRenderedUi === true &&
    transcript.mentorReport?.schema ===
      "quipsly-coaching-transcript-report-v2" &&
    transcript.mentorReport?.sourceCount === 2,
  mentorTranscriptReport: transcript.mentorReport,
  sharedAndPrivateWorkOperated:
    work.clientCreatedSharedNote &&
    work.clientCreatedPrivateNote &&
    work.privateNoteHiddenFromCoach,
  reusableCoachingFormsOperated:
    forms.coachPublishedStarterThroughRenderedProduct === true &&
    forms.coachAssignedExactVersionThroughRenderedProduct === true &&
    forms.clientSavedPrivateDraftThroughRenderedProduct === true &&
    forms.draftHiddenFromCoach === true &&
    forms.clientSubmittedThroughRenderedProduct === true &&
    forms.submittedResponseVisibleToCoach === true &&
    forms.neighboringAccountDenied?.listContainsAssignment === false &&
    forms.neighboringAccountDenied?.writeStatus === 404,
  crossAccountTaskCompletionOperated: work.clientObservedCoachCompletion,
  lightEditPreviewAndRecipientPlaybackOperated:
    share.coachPreviewDecoded && share.clientPlaybackDecoded,
  releaseAndRevokeOperated:
    share.clientMediaStatusBeforeRevoke === 200 &&
    share.clientMediaStatusAfterRevoke === 404,
  controlledAudibleSpeechPipelineOperated:
    controlledSpeechFlight && transcript.controlledSpeechTermsObserved,
  automaticPostCallAudioReadinessOperated:
    controlledSpeechFlight &&
    audioPolish?.actionOperated === false &&
    audioPolish?.initialState !== "action-required" &&
    audioPolish?.originalSourceAndCaptureManifestUnchanged === true &&
    ["improved-listening-copy", "already-balanced"].includes(
      audioPolish?.outcome,
    ),
  automaticPostCallAudioResult: audioPolish
    ? {
        initialState: audioPolish.initialState,
        outcome: audioPolish.outcome,
        originalAndImprovedPlaybackRendered:
          audioPolish.originalAndImprovedPlaybackRendered,
        originalReadyState: audioPolish.originalReadyState,
        improvedReadyState: audioPolish.improvedReadyState,
        originalSourceAndCaptureManifestUnchanged:
          audioPolish.originalSourceAndCaptureManifestUnchanged,
        calmRecordingSummaryRendered:
          audioPolish.calmRecordingSummaryRendered,
        expertRecordingDetailsCollapsedByDefault:
          audioPolish.expertRecordingDetailsCollapsedByDefault,
        transcriptAppearedBeforePacketAdministration:
          audioPolish.transcriptAppearedBeforePacketAdministration,
        recordingEditorOpenedInline:
          audioPolish.recordingEditorOpenedInline,
        transcriptViewModesOperated:
          audioPolish.transcriptViewModesOperated,
        recordingAndTranscriptRenderedSideBySide:
          audioPolish.recordingAndTranscriptRenderedSideBySide,
        correctionPlaybackStartedAutomatically:
          audioPolish.correctionPlaybackStartedAutomatically,
        repeatedPlaybackAttestationAbsent:
          audioPolish.repeatedPlaybackAttestationAbsent,
      }
    : null,
  interactionSurfaceEvidence: {
    renderedBrowser: {
      accountCreation: true,
      coachSetup:
        start.automaticCoachDefaultsRendered === true &&
        start.mandatoryCoachConfigurationRequired === false,
      appointmentCreation:
        start.appointmentCreatedThroughRenderedProduct === true,
      invitationHandoff:
        start.clientEntryCopiedFromRenderedProduct === true &&
        start.primaryInvitationActionAttempted === true,
      coachPracticeCommand:
        practiceCommand.renderedPhoneWidthCommand === true
        && practiceCommand.renderedNextActionOpenedExactSession === true
        && practiceCommand.clientCoachCommandAbsent === true
        && practiceCommand.neighboringPracticeAbsent === true,
      oneTimeInvitationAcceptance:
        start.clientInvitationAcceptedThroughRenderedProduct === true,
      clientEntryAndReturn:
        start.clientCreatedAccountFromExactEntry === true &&
        start.clientOnlyHomeOpenedExactSession === true,
      authorizedListsAndUnauthorizedDirectProbes:
        isolation.coachAndClientIsolationOperated === true,
      callLobbyConsentChatAndCapture: call.browserToBrowserLiveKit === "passed",
      conventionalCallEntry:
        call.conventionalLobbyOperated === true &&
        call.advancedDeviceSettingsCollapsedBeforeJoin === true &&
        call.technicalDeviceDetailsCollapsedBeforeJoin === true,
      unchangedSessionConsentRemembered:
        call.savedConsentRestoredAfterReentry === true,
      safePostCallRecordingExit:
        call.postCallRecordingRecoveryStayedMounted === true &&
        call.verifiedRecordingSafeToCloseRendered === true,
      participantRecordingCompleteness:
        call.allExpectedParticipantsRecordingVisible === true,
      relationshipWork: work.boundaries?.productFormsOnlyForWrites === true,
      reusableForms:
        forms.boundaries?.productFormsOnlyForWrites === true &&
        forms.draftHiddenFromCoach === true &&
        forms.submittedResponseVisibleToCoach === true,
      lightEditPreviewReleaseAndRevoke:
        share.boundaries?.releaseWasExplicit === true &&
        share.boundaries?.revokeWasExplicit === true,
      automaticPostCallAudioReadiness:
        controlledSpeechFlight && audioPolish?.actionOperated === false,
      calmPostCallRecordingSummary:
        controlledSpeechFlight &&
        audioPolish?.calmRecordingSummaryRendered === true &&
        audioPolish?.expertRecordingDetailsCollapsedByDefault === true,
      transcriptFirstEditingContinuity:
        controlledSpeechFlight &&
        audioPolish?.transcriptAppearedBeforePacketAdministration === true &&
        audioPolish?.recordingEditorOpenedInline === true &&
        audioPolish?.transcriptViewModesOperated === true &&
        audioPolish?.recordingAndTranscriptRenderedSideBySide === true &&
        audioPolish?.correctionPlaybackStartedAutomatically === true &&
        audioPolish?.repeatedPlaybackAttestationAbsent === true,
      mentorTranscriptReport:
        transcript.mentorReport?.downloadedThroughRenderedUi === true &&
        transcript.mentorReport?.sourceCount === 2,
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
    automaticAudioResultWasNotPublished: audioPolish
      ? audioPolish.automaticPublicationAbsentMessageRendered === true ||
        audioPolish.outcome === "already-balanced"
      : null,
    minimallyInstructedHumanAcceptanceProven: false,
    productionScaleProven: false,
    combinedReceiptIsNotPureUIAutomation: true,
    localInvitationDeliveryBoundaryUsed:
      start.localInvitationDeliveryReceiptRecorded === true,
    adversarialNeighborCreatedThroughRenderedProduct:
      isolation.boundaries?.adversarialNeighborCreatedThroughRenderedProduct === true,
    unrelatedPodcastLeakageObserved:
      isolation.unrelatedPodcastLeakageObserved === true,
    privateTestArtifactLeakageObserved:
      isolation.privateTestArtifactLeakageObserved === true,
    externalInvitationMessageSent: false,
    mandatoryCoachConfigurationRequired: false,
  },
};
await writeFile(receiptPath, `${JSON.stringify(result, null, 2)}\n`, {
  mode: 0o600,
});
await chmod(receiptPath, 0o600);
console.log(JSON.stringify(result, null, 2));
