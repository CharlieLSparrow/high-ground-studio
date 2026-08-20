#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";

assert.equal(process.env.QUIPSLY_FRESH_COACHING_FLIGHT, "1", "Set QUIPSLY_FRESH_COACHING_FLIGHT=1 to run the complete local fresh-coach flight.");

function parsePacket(output, label) {
  for (let cursor = output.indexOf("{"); cursor >= 0; cursor = output.indexOf("{", cursor + 1)) {
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
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    "--import",
    "./scripts/register-ts-extension-loader.mjs",
    script,
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv, [flag]: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exitCode !== 0) throw new Error(`${label} failed with exit ${exitCode}.\n${stderr}\n${stdout}`);
  const packet = parsePacket(stdout.trim(), label);
  process.stderr.write(`[coaching flight] ${label} passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`);
  return packet;
}

const start = await run("Fresh signup, coach setup, appointment, and client entry", "scripts/quipsly-fresh-coaching-start-operation.mjs", "QUIPSLY_FRESH_COACHING_START_OPERATION");
const continuationEnv = { QUIPSLY_COACHING_ACCEPTANCE_CONTEXT: start.contextPath };
const call = await run("Two-endpoint call, consent, chat, and local source capture", "scripts/quipsly-local-live-room-operation.mjs", "QUIPSLY_LOCAL_LIVE_ROOM_OPERATION", continuationEnv);
const transcript = await run("Participant-attributed transcription and protected playback", "scripts/quipsly-local-coaching-transcript-operation.mjs", "QUIPSLY_LOCAL_COACHING_TRANSCRIPT_OPERATION", continuationEnv);
const work = await run("Shared and private relationship work", "scripts/quipsly-fresh-coaching-work-operation.mjs", "QUIPSLY_FRESH_COACHING_WORK_OPERATION", continuationEnv);
const share = await run("Light edit, private preview, client release, and revoke", "scripts/quipsly-local-recording-share-operation.mjs", "QUIPSLY_LOCAL_RECORDING_SHARE_OPERATION", continuationEnv);

for (const [label, packet] of Object.entries({ start, call, transcript, work, share })) {
  assert.equal(packet.testLane, "fresh-ui-automation", `${label} fell back to another test lane.`);
  assert.equal(packet.fixtureIdentifiersUsed, false, `${label} used fixture identifiers.`);
  assert.equal(packet.humanAcceptanceSatisfied, false, `${label} incorrectly claimed human acceptance.`);
  assert.equal(packet.roomId, start.roomId, `${label} operated another Session.`);
}

console.log(JSON.stringify({
  ok: true,
  localOnly: true,
  testLane: "fresh-ui-automation",
  fixtureIdentifiersUsed: false,
  humanAcceptanceSatisfied: false,
  contextPath: start.contextPath,
  roomId: start.roomId,
  bookingId: start.bookingId,
  engagementId: start.engagementId,
  freshAccountsCreated: true,
  exactRenderedClientEntryUsed: true,
  participantsConnected: call.participantsConnected,
  independentParticipantSourcesVerified: call.independentParticipantSourcesVerified,
  sourceOverlapMilliseconds: call.browserSourceOverlapMilliseconds,
  transcriptSourceCount: transcript.sourceCount,
  protectedTranscriptPlaybackDecoded: transcript.renderedTranscriptRuns.every((item) => item.protectedPlaybackDecoded),
  sharedAndPrivateWorkOperated: work.clientCreatedSharedNote && work.clientCreatedPrivateNote && work.privateNoteHiddenFromCoach,
  crossAccountTaskCompletionOperated: work.clientObservedCoachCompletion,
  lightEditPreviewAndRecipientPlaybackOperated: share.coachPreviewDecoded && share.clientPlaybackDecoded,
  releaseAndRevokeOperated: share.clientMediaStatusBeforeRevoke === 200 && share.clientMediaStatusAfterRevoke === 404,
  boundaries: {
    localMailboxAdapterUsed: true,
    realMailboxDeliveryProven: false,
    fakeBrowserMediaUsed: true,
    realSpeechQualityProven: false,
    physicalDeviceProven: false,
    humanListeningProven: false,
    minimallyInstructedHumanAcceptanceProven: false,
    productionScaleProven: false,
  },
}, null, 2));
