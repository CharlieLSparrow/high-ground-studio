#!/usr/bin/env node

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { readRetainedQAPassword } from "./lib/retained-qa-keychain.mjs";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const KEYCHAIN_SERVICE = "com.quipsly.qa.retained-product";
const OPERATOR_EMAIL = "quipsly-media-ms8ct81g@example.test";
const ROOM_ID = "cmsfpfwrt000db9xld8ppuon4";
const RECORDING_ASSET_ID = "cmsi2v4l4000rlqxl78h1w8t3";
const MATCHED_REFERENCE_JOB_ID = "cmsi382hw000wlqxlez2w0a46";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLoopbackURL(value, label) {
  const url = new URL(String(value || ""));
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), `${label} must use loopback.`);
  if (url.protocol === "http:") {
    assert(!url.username && !url.password, `${label} must be credential-free loopback HTTP.`);
    return url.origin;
  }
  return url.toString();
}

async function authenticate(authOrigin, password) {
  const response = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: OPERATOR_EMAIL, password, returnSecureToken: true }),
  });
  const body = await response.json().catch(() => null);
  assert(response.status === 200 && typeof body?.idToken === "string", "The retained media operator could not authenticate with the local emulator.");
  return body.idToken;
}

async function requestJSON(baseURL, idToken, pathname, options = {}) {
  const response = await fetch(new URL(pathname, baseURL), {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${idToken}`,
      "cache-control": "no-cache",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

export function normalizedWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function wordErrorRate(referenceText, candidateText) {
  const reference = normalizedWords(referenceText);
  const candidate = normalizedWords(candidateText);
  assert(reference.length > 0, "Matched reference transcript has no words.");
  const previous = Array.from({ length: candidate.length + 1 }, (_, index) => index);
  for (let row = 1; row <= reference.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= candidate.length; column += 1) {
      const above = previous[column];
      previous[column] = reference[row - 1] === candidate[column - 1]
        ? diagonal
        : Math.min(diagonal, above, previous[column - 1]) + 1;
      diagonal = above;
    }
  }
  return { edits: previous[candidate.length], referenceWords: reference.length, candidateWords: candidate.length, rate: previous[candidate.length] / reference.length };
}

async function waitForTerminalJob(prisma, timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const job = await prisma.transcriptJob.findFirst({
      where: { assetId: RECORDING_ASSET_ID },
      orderBy: { createdAt: "desc" },
      include: {
        segments: { orderBy: { startSeconds: "asc" }, select: { id: true, startSeconds: true, endSeconds: true, text: true, confidence: true } },
        _count: { select: { words: true } },
      },
    });
    if (job && ["COMPLETED", "FAILED", "HELD"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The retained transcript job did not reach a terminal state within 120 seconds.");
}

async function main() {
  assert(process.env.QUIPSLY_RETAINED_TRANSCRIPT_QUALITY_OPERATION === "1", "Set QUIPSLY_RETAINED_TRANSCRIPT_QUALITY_OPERATION=1 to create and evaluate the retained local QA transcript.");
  const baseURL = requireLoopbackURL(process.env.QUIPSLY_LOCAL_ORIGIN || "http://127.0.0.1:3012", "Nest origin");
  const authOrigin = requireLoopbackURL(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`, "Firebase emulator");
  const databaseURL = requireLoopbackURL(process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio", "PostgreSQL");
  const password = readRetainedQAPassword({ service: KEYCHAIN_SERVICE, account: OPERATOR_EMAIL });
  assert(password, "The retained media operator has no Keychain password.");
  const idToken = await authenticate(authOrigin, password);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }) });
  try {
    const [asset, referenceJob, before] = await Promise.all([
      prisma.recordingAsset.findFirst({
        where: { id: RECORDING_ASSET_ID, roomId: ROOM_ID },
        select: { id: true, fileName: true, status: true, durationSeconds: true, byteSize: true, contentType: true },
      }),
      prisma.transcriptJob.findUnique({
        where: { id: MATCHED_REFERENCE_JOB_ID },
        include: { segments: { orderBy: { startSeconds: "asc" }, select: { text: true } } },
      }),
      Promise.all([
        prisma.transcriptJob.count({ where: { assetId: RECORDING_ASSET_ID } }),
        prisma.coachingNote.count({ where: { roomId: ROOM_ID } }),
        prisma.actionItem.count({ where: { roomId: ROOM_ID } }),
        prisma.goal.count({ where: { roomId: ROOM_ID } }),
      ]),
    ]);
    assert(asset?.status === "VERIFIED" && asset.durationSeconds && asset.durationSeconds < 30, "The retained QA source is not the expected short verified audio fixture.");
    assert(referenceJob?.status === "COMPLETED" && referenceJob.assetId !== RECORDING_ASSET_ID, "The matched reference transcript is unavailable or not independent.");

    const run = await requestJSON(baseURL, idToken, "/api/mobile/capture/transcripts/run", {
      method: "POST",
      body: { recordingAssetId: RECORDING_ASSET_ID },
    });
    assert([200, 202].includes(run.status) && run.body?.ok === true, `Source-bound transcript start failed (${run.status}): ${run.body?.error || "unknown"}`);
    assert(run.body?.transcriptJobId, "Transcript start returned no durable job identity.");

    const job = await waitForTerminalJob(prisma);
    assert(job.id === run.body.transcriptJobId, "The worker completed a different transcript job than the explicit request.");
    assert(job.status === "COMPLETED", `Local transcript ended ${job.status}: ${job.errorMessage || "no error detail"}`);
    assert(job.provider === "openai-whisper-local", `Unexpected local transcript provider ${job.provider}.`);
    assert(job.segments.length > 0 && job._count.words > 20, "Completed transcript lacks substantial immutable timing evidence.");
    const candidateText = job.segments.map((segment) => segment.text).join(" ").trim();
    const referenceText = referenceJob.segments.map((segment) => segment.text).join(" ").trim();
    const consistency = wordErrorRate(referenceText, candidateText);
    assert(consistency.rate <= 0.25, `Matched-source transcript consistency regressed to ${(consistency.rate * 100).toFixed(1)}% WER.`);

    const packet = await requestJSON(
      baseURL,
      idToken,
      `/api/mobile/capture/transcripts/packet?callRoomId=${encodeURIComponent(ROOM_ID)}&recordingAssetId=${encodeURIComponent(RECORDING_ASSET_ID)}`,
    );
    assert(packet.status === 200 && packet.body?.transcriptJob?.id === job.id, "Exact-source Session readback did not select the completed transcript.");
    assert(packet.body?.transcriptJob?.segmentCount === job.segments.length, "Session readback lost immutable transcript segments.");

    const after = await Promise.all([
      prisma.transcriptJob.count({ where: { assetId: RECORDING_ASSET_ID } }),
      prisma.coachingNote.count({ where: { roomId: ROOM_ID } }),
      prisma.actionItem.count({ where: { roomId: ROOM_ID } }),
      prisma.goal.count({ where: { roomId: ROOM_ID } }),
    ]);
    assert(after[0] === Math.max(1, before[0]), "Transcript operation created an unexpected number of versions.");
    assert(after[1] === before[1] && after[2] === before[2] && after[3] === before[3], "Transcription silently created a note, task, or goal.");

    console.log(JSON.stringify({
      ok: true,
      localOnly: true,
      roomId: ROOM_ID,
      recordingAssetId: RECORDING_ASSET_ID,
      transcriptJobId: job.id,
      sourceDurationSeconds: asset.durationSeconds,
      sourceByteSize: asset.byteSize.toString(),
      provider: job.provider,
      language: job.language,
      segmentCount: job.segments.length,
      wordCount: job._count.words,
      coverage: {
        startSeconds: job.segments[0].startSeconds,
        endSeconds: job.segments.at(-1).endSeconds,
      },
      matchedSourceConsistency: {
        referenceTranscriptJobId: referenceJob.id,
        edits: consistency.edits,
        referenceWords: consistency.referenceWords,
        candidateWords: consistency.candidateWords,
        wordErrorRate: Number(consistency.rate.toFixed(6)),
        humanAccuracyClaimed: false,
      },
      providerText: candidateText,
      exactSourceHTTPReadback: true,
      createdTranscriptVersions: after[0] - before[0],
      createdNotes: after[1] - before[1],
      createdTasks: after[2] - before[2],
      createdGoals: after[3] - before[3],
      publicationStarted: false,
      secretsPrinted: false,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
