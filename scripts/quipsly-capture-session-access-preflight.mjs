#!/usr/bin/env node
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// firebase-admin is owned by the Nest application rather than the workspace
// root. Resolve it from that package boundary so this operator can run from a
// clean collaborator checkout and from pnpm's strict node_modules layout.
const requireFromNest = createRequire(
  new URL("../apps/quipsly/package.json", import.meta.url),
);
const { initializeApp } = requireFromNest("firebase-admin/app");
const { getAuth } = requireFromNest("firebase-admin/auth");

function parseArgs(argv) {
  const input = {
    baseUrl: "https://nest.quipsly.com",
    emails: [],
    expectedSession: "Episode 9: The Swear Jar",
    expectedRoomId: "",
    firebaseProjectId: "quipsly-reef",
    serviceAccountId: "firebase-adminsdk-fbsvc@quipsly-reef.iam.gserviceaccount.com",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--") continue;
    else if (arg === "--base-url") input.baseUrl = value, index += 1;
    else if (arg === "--email") input.emails.push(String(value || "").trim().toLowerCase()), index += 1;
    else if (arg === "--expect-session") input.expectedSession = value, index += 1;
    else if (arg === "--expect-room-id") input.expectedRoomId = String(value || "").trim(), index += 1;
    else if (arg === "--firebase-project-id") input.firebaseProjectId = value, index += 1;
    else if (arg === "--service-account-id") input.serviceAccountId = value, index += 1;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (input.emails.length === 0) throw new Error("At least one --email is required.");
  if (!input.expectedSession && !input.expectedRoomId) {
    throw new Error("Provide --expect-session or --expect-room-id.");
  }
  input.baseUrl = input.baseUrl.replace(/\/$/, "");
  return input;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${response.url} returned non-JSON status ${response.status}.`);
  }
}

async function preflightIdentity({ auth, apiKey, baseUrl, email, expectedSession, expectedRoomId }) {
  const firebaseUser = await auth.getUserByEmail(email);
  if (firebaseUser.disabled || !firebaseUser.emailVerified) {
    throw new Error(`${email} is not an enabled, verified Firebase identity.`);
  }

  // This token exists only in memory for the duration of the preflight. Never
  // print it or persist it in a receipt.
  const customToken = await auth.createCustomToken(firebaseUser.uid);
  const exchangeResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const exchange = await readJson(exchangeResponse);
  if (!exchangeResponse.ok || !exchange.idToken) {
    throw new Error(`Firebase custom-token exchange failed for ${email}: ${exchange.error?.message || exchangeResponse.status}`);
  }

  const sessionsResponse = await fetch(`${baseUrl}/api/mobile/capture/sessions`, {
    headers: { authorization: `Bearer ${exchange.idToken}` },
  });
  const body = await readJson(sessionsResponse);
  const sessions = Array.isArray(body.sessions) ? body.sessions : [];
  const expected = expectedRoomId
    ? sessions.find((session) => session.id === expectedRoomId || session.callRoomId === expectedRoomId)
    : sessions.find((session) => session.title === expectedSession);
  const source = Array.isArray(expected?.captureSources)
    ? expected.captureSources[0] || null
    : null;

  return {
    email,
    firebase: {
      uid: firebaseUser.uid,
      providers: firebaseUser.providerData.map((provider) => provider.providerId),
      emailVerified: firebaseUser.emailVerified,
    },
    api: {
      status: sessionsResponse.status,
      error: typeof body.error === "string" ? body.error : null,
      canonicalUser: body.user ? {
        id: body.user.id,
        email: body.user.email,
        name: body.user.name,
      } : null,
      sessionCount: sessions.length,
      expectedSession: expected ? {
        id: expected.id,
        title: expected.title,
        status: expected.status,
        projectId: expected.projectId,
        recordingConsentStatus: expected.recordingConsentStatus || null,
        recordingConsentGranted: expected.recordingConsentGranted === true,
        recordingConsentCanRecordAudio: expected.recordingConsentCanRecordAudio === true,
        recordingConsentCanTranscribe: expected.recordingConsentCanTranscribe === true,
        allRegisteredParticipantConsentGranted: expected.allRegisteredParticipantConsentGranted === true,
        allRegisteredParticipantTranscriptionConsentGranted:
          expected.allRegisteredParticipantTranscriptionConsentGranted === true,
        recordingCount: Number(expected.recordingCount || 0),
        latestRecordingAssetStatus: expected.latestRecordingAssetStatus || null,
        latestTranscriptStatus: expected.latestTranscriptStatus || null,
        latestTranscriptSegmentCount: Number(expected.latestTranscriptSegmentCount || 0),
        captureSourceCount: Array.isArray(expected.captureSources) ? expected.captureSources.length : 0,
        latestCaptureSource: source ? {
          recordingStatus: source.recordingStatus || null,
          exactBytesVerified: source.exactBytesVerified === true,
          byteVerificationKind: source.byteVerificationKind || null,
          processingDisposition: source.processingDisposition || null,
          transcriptDisposition: source.transcriptDisposition || null,
          durationSeconds: Number(source.durationSeconds || 0),
          transcript: source.transcript ? {
            status: source.transcript.status || null,
            provider: source.transcript.provider || null,
            recognitionExecution: source.transcript.recognitionExecution || null,
            deviceTranscriptExpected: source.transcript.deviceTranscriptExpected === true,
            segmentCount: Number(source.transcript.segmentCount || 0),
            wordCount: Number(source.transcript.wordCount || 0),
          } : null,
        } : null,
      } : null,
    },
    passed: sessionsResponse.ok && body.ok === true && Boolean(expected),
  };
}

async function main() {
  const input = parseArgs(process.argv);
  const configResponse = await fetch(`${input.baseUrl}/api/mac/firebase-client-config`);
  const config = await readJson(configResponse);
  const apiKey = config.firebase?.apiKey;
  if (!configResponse.ok || !apiKey) {
    throw new Error(`Firebase client configuration is unavailable from ${input.baseUrl}.`);
  }

  const app = initializeApp({
    projectId: input.firebaseProjectId,
    serviceAccountId: input.serviceAccountId,
  });
  const auth = getAuth(app);
  const identities = [];
  for (const email of input.emails) {
    identities.push(await preflightIdentity({
      auth,
      apiKey,
      baseUrl: input.baseUrl,
      email,
      expectedSession: input.expectedSession,
      expectedRoomId: input.expectedRoomId,
    }));
  }

  const receipt = {
    ok: identities.every((identity) => identity.passed),
    operation: "quipsly-capture-session-access-preflight-v1",
    readOnly: true,
    baseUrl: input.baseUrl,
    expectedSession: input.expectedSession,
    expectedRoomId: input.expectedRoomId || null,
    identities,
    checkedAt: new Date().toISOString(),
    tokenHandling: "Short-lived tokens remained in memory and were not printed or persisted.",
  };
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.ok) process.exitCode = 2;
}

export { parseArgs };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`QUIPSLY_CAPTURE_SESSION_ACCESS_PREFLIGHT_FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
