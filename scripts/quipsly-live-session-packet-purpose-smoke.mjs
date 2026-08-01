#!/usr/bin/env node

const baseUrl = String(process.env.QUIPSLY_PACKET_SMOKE_BASE_URL || "https://nest.quipsly.com")
  .trim()
  .replace(/\/+$/, "");
const email = String(process.env.QUIPSLY_PACKET_SMOKE_EMAIL || "").trim().toLowerCase();
const password = String(process.env.QUIPSLY_PACKET_SMOKE_PASSWORD || "");
const coachingRoomId = String(process.env.QUIPSLY_PACKET_SMOKE_COACHING_ROOM_ID || "").trim();
const podcastRoomId = String(process.env.QUIPSLY_PACKET_SMOKE_PODCAST_ROOM_ID || "").trim();

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function trustedOrigin(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const trusted = hostname === "nest.quipsly.com"
    || hostname.endsWith("---studio-hm2odnvjga-uc.a.run.app")
    || ((hostname === "127.0.0.1" || hostname === "localhost") && url.protocol === "http:");
  assert(
    trusted && (url.protocol === "https:" || hostname === "127.0.0.1" || hostname === "localhost"),
    "Packet acceptance target is outside the trusted Quipsly runtime boundary.",
  );
  return url.origin;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { response, text, body };
}

function sessionCookie(setCookie) {
  return String(setCookie || "")
    .split(",")
    .map((value) => value.trim())
    .find((value) => value.startsWith("session="))
    ?.split(";")[0] || "";
}

async function firebaseApiKey(origin) {
  const result = await request(`${origin}/api/mac/firebase-client-config`);
  assert(
    result.response.status === 200 && result.body?.firebase?.apiKey,
    "Quipsly did not expose its public Firebase client configuration.",
    { status: result.response.status },
  );
  return result.body.firebase.apiKey;
}

async function signIn(origin) {
  assert(email && password, "Packet acceptance requires the retained test email and password in environment variables.");
  const apiKey = await firebaseApiKey(origin);
  const firebase = await request(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  assert(
    firebase.response.status === 200 && firebase.body?.idToken,
    `Retained Firebase reviewer login failed. HTTP ${firebase.response.status}`,
  );
  const exchange = await request(`${origin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: firebase.body.idToken }),
  });
  const cookie = sessionCookie(exchange.response.headers.get("set-cookie"));
  assert(
    exchange.response.status === 200 && exchange.body?.user?.email === email && cookie,
    `Quipsly reviewer session exchange failed. HTTP ${exchange.response.status}`,
  );
  return { idToken: firebase.body.idToken, cookie };
}

const laneIdsByPurpose = {
  COACHING: [
    "client-follow-up",
    "coaching-insights",
    "obstacles-and-support",
    "goals-and-tasks",
    "next-session-prep",
  ],
  PODCAST: [
    "goals-and-tasks",
    "next-session-prep",
    "podcast-production",
    "fact-checks-and-rights",
    "quote-candidates",
    "article-seeds",
    "clip-candidates",
  ],
};

async function getPacket(origin, idToken, roomId) {
  return request(
    `${origin}/api/mobile/capture/transcripts/packet?callRoomId=${encodeURIComponent(roomId)}`,
    { headers: { authorization: `Bearer ${idToken}` } },
  );
}

async function discoverEligibleRoom(origin, idToken, purpose, preferredRoomId) {
  if (preferredRoomId) return preferredRoomId;
  const result = await request(`${origin}/api/mobile/capture/sessions`, {
    headers: { authorization: `Bearer ${idToken}` },
  });
  assert(
    result.response.status === 200 && result.body?.ok === true && Array.isArray(result.body?.sessions),
    `Could not discover ${purpose} sessions for packet acceptance. HTTP ${result.response.status}`,
  );
  const candidates = result.body.sessions.filter((session) => session.purpose === purpose);
  const diagnostics = [];
  for (const candidate of candidates) {
    const roomId = candidate.callRoomId || candidate.id;
    if (!roomId) continue;
    const packet = await getPacket(origin, idToken, roomId);
    diagnostics.push({
      roomId,
      title: candidate.title || null,
      status: packet.response.status,
      transcriptStatus: packet.body?.transcriptJob?.status || null,
      transcriptProcessingAllowed: packet.body?.transcriptProcessingGate?.allowed === true,
      transcriptGateErrorCode: packet.body?.transcriptProcessingGate?.errorCode || null,
      packetStatus: packet.body?.packet?.status || null,
    });
    if (
      packet.response.status === 200 &&
      packet.body?.room?.purpose === purpose &&
      packet.body?.transcriptJob?.status === "COMPLETED" &&
      packet.body?.transcriptProcessingGate?.allowed === true
    ) {
      return roomId;
    }
  }
  throw Object.assign(new Error(`No accessible ${purpose} room has released completed transcript evidence.`), {
    details: { candidates: diagnostics },
  });
}

async function operatePacket(origin, idToken, roomId, purpose) {
  const before = await getPacket(origin, idToken, roomId);
  assert(
    before.response.status === 200 && before.body?.ok === true,
    `${purpose} packet could not be read. HTTP ${before.response.status}`,
    { roomId, body: before.body },
  );
  assert(before.body?.room?.purpose === purpose, `${purpose} room purpose did not match retained evidence.`, {
    roomId,
    actual: before.body?.room?.purpose || null,
  });
  assert(
    before.body?.transcriptJob?.status === "COMPLETED" && before.body?.transcriptProcessingGate?.allowed === true,
    `${purpose} packet is not backed by released completed transcript evidence.`,
    {
      roomId,
      transcriptStatus: before.body?.transcriptJob?.status || null,
      processingGate: before.body?.transcriptProcessingGate || null,
    },
  );

  const build = await request(`${origin}/api/mobile/capture/transcripts/packet`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ transcriptJobId: before.body.transcriptJob.id, force: true }),
  });
  assert(
    build.response.status === 200 && build.body?.ok === true && build.body?.packetPurpose === purpose,
    `${purpose} packet v2 build failed. HTTP ${build.response.status}`,
    { roomId, body: build.body },
  );

  const after = await getPacket(origin, idToken, roomId);
  const source = after.body?.packet?.summary?.source || {};
  const reviewLanes = Array.isArray(after.body?.packet?.reviewLanes)
    ? after.body.packet.reviewLanes
    : [];
  const laneIds = reviewLanes.map((lane) => lane.id);
  const expectedLaneIds = laneIdsByPurpose[purpose];
  assert(
    after.response.status === 200 && after.body?.packet?.status === "READY_FOR_REVIEW",
    `${purpose} packet was not readable after its v2 build.`,
    { roomId, status: after.body?.packet?.status || null },
  );
  assert(
    source.packetPurpose === purpose && source.packetTemplateVersion === "quipsly-session-packet-v2",
    `${purpose} packet did not preserve its purpose and v2 template stamp.`,
    { roomId, packetPurpose: source.packetPurpose || null, packetTemplateVersion: source.packetTemplateVersion || null },
  );
  assert(
    laneIds.length === expectedLaneIds.length && expectedLaneIds.every((laneId) => laneIds.includes(laneId)),
    `${purpose} packet exposed the wrong review lanes.`,
    { roomId, laneIds, expectedLaneIds },
  );
  assert(
    reviewLanes.every((lane) => lane.humanApprovalRequired === true && lane.externalSideEffects === false),
    `${purpose} packet lost the human-review or no-side-effects boundary.`,
    { roomId },
  );

  return {
    roomId,
    purpose,
    transcriptJobId: before.body.transcriptJob.id,
    packetBuildId: build.body.packetBuildId,
    packetTemplateVersion: source.packetTemplateVersion,
    packetStatus: after.body.packet.status,
    laneIds,
    readyLaneCount: after.body.packet.counts?.readyReviewLanes ?? null,
    actionCandidateCount: after.body.packet.counts?.actionCandidates ?? null,
    goalCandidateCount: after.body.packet.counts?.goalCandidates ?? null,
    humanReviewRequired: true,
    externalSideEffects: false,
  };
}

async function main() {
  const origin = trustedOrigin(baseUrl);
  const auth = await signIn(origin);
  try {
    const [coachingResolution, podcastResolution] = await Promise.allSettled([
      discoverEligibleRoom(origin, auth.idToken, "COACHING", coachingRoomId),
      discoverEligibleRoom(origin, auth.idToken, "PODCAST", podcastRoomId),
    ]);
    if (coachingResolution.status === "rejected" || podcastResolution.status === "rejected") {
      throw Object.assign(new Error("Released transcript evidence is not ready for both packet-purpose lanes."), {
        details: {
          coaching: coachingResolution.status === "fulfilled"
            ? { roomId: coachingResolution.value, eligible: true }
            : {
                eligible: false,
                error: coachingResolution.reason?.message || String(coachingResolution.reason),
                diagnostics: coachingResolution.reason?.details || null,
              },
          podcast: podcastResolution.status === "fulfilled"
            ? { roomId: podcastResolution.value, eligible: true }
            : {
                eligible: false,
                error: podcastResolution.reason?.message || String(podcastResolution.reason),
                diagnostics: podcastResolution.reason?.details || null,
              },
        },
      });
    }
    const resolvedCoachingRoomId = coachingResolution.value;
    const resolvedPodcastRoomId = podcastResolution.value;
    const coaching = await operatePacket(origin, auth.idToken, resolvedCoachingRoomId, "COACHING");
    const podcast = await operatePacket(origin, auth.idToken, resolvedPodcastRoomId, "PODCAST");
    console.log(JSON.stringify({
      ok: true,
      schema: "quipsly-live-session-packet-purpose-smoke-v1",
      baseUrl: origin,
      reviewerEmailRedacted: email.replace(/^(.{2}).*(@.*)$/, "$1***$2"),
      coaching,
      podcast,
      boundaries: {
        transcriptEvidenceRequired: true,
        authorPrivatePacketNotes: true,
        humanApprovalRequired: true,
        externalSideEffects: false,
        noActionItemsCreatedByPacketBuild: true,
      },
    }, null, 2));
  } finally {
    await request(`${origin}/api/auth/session`, {
      method: "DELETE",
      headers: { cookie: auth.cookie },
    }).catch(() => null);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    details: error?.details || undefined,
  }, null, 2));
  process.exit(1);
});
