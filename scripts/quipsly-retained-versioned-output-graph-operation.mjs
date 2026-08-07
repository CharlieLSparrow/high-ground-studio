#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";

const requireFromQuipsly = createRequire(new URL("../apps/quipsly/package.json", import.meta.url));
const { PrismaClient } = requireFromQuipsly("@prisma/client");
const { PrismaPg } = requireFromQuipsly("@prisma/adapter-pg");

const PROJECT_SLUG = "home-quipsly-coach-retained-20260731-at-example-test";
const EPISODE_ID = "qa-calendar-episode-production-20260802";
const ROOM_ID = "cmsevqjre0009yixlurg2c04j";
const ASSET_ID = "retained-coaching-continuity-media-20260803";
const SOURCE_ID = "retained-coaching-continuity-source-20260803";
const JOB_ID = "qa-retained-program-mix-job-20260806";
const REVIEW_ID = "qa-retained-program-mix-review-20260806";
const PROMOTION_ID = "qa-retained-program-mix-promotion-20260806";
const ACTOR_EMAIL = "quipsly-coach-retained-20260731@example.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireLoopbackOrigin(value, label) {
  const url = new URL(String(value || ""));
  assert(url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname) && !url.username && !url.password, `${label} must be a credential-free loopback HTTP origin.`);
  return url.origin;
}

function requireLoopbackDatabase(value) {
  const url = new URL(String(value || ""));
  assert(["127.0.0.1", "localhost", "::1"].includes(url.hostname), "The retained output-graph operation refuses non-loopback PostgreSQL.");
  return url.toString();
}

function stableJson(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : stableJson(value)).digest("hex");
}

async function main() {
  assert(process.env.QUIPSLY_RETAINED_OUTPUT_GRAPH_OPERATION === "1", "Set QUIPSLY_RETAINED_OUTPUT_GRAPH_OPERATION=1 to authorize the local retained fixture operation.");
  const appOrigin = requireLoopbackOrigin(process.env.QUIPSLY_LOCAL_ORIGIN || "http://127.0.0.1:3012", "Nest origin");
  const authOrigin = requireLoopbackOrigin(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`, "Firebase emulator");
  const databaseURL = requireLoopbackDatabase(process.env.DATABASE_URL || "");
  const password = String(process.env.QUIPSLY_LOCAL_QA_PASSWORD || "");
  assert(password.length >= 12, "Provide the disposable retained-QA password through QUIPSLY_LOCAL_QA_PASSWORD.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseURL, max: 2 }) });
  try {
    const [project, episode, room, asset, source] = await Promise.all([
      prisma.studioProject.findFirst({ where: { slug: PROJECT_SLUG }, select: { id: true, slug: true } }),
      prisma.studioEpisodeProduction.findUnique({ where: { id: EPISODE_ID }, select: { id: true, projectId: true, slug: true } }),
      prisma.callRoom.findUnique({ where: { id: ROOM_ID }, select: { id: true, projectId: true, episodeProductionId: true } }),
      prisma.studioMediaAsset.findUnique({ where: { id: ASSET_ID }, select: { id: true, url: true, duration: true, sizeBytes: true } }),
      prisma.studioVideoSource.findUnique({ where: { id: SOURCE_ID }, select: { id: true, url: true, providerSourceId: true } }),
    ]);
    assert(project && episode && room && asset && source?.providerSourceId, "The retained Episode, Session, or exact local source fixture is unavailable.");
    assert(episode.projectId === project.id && room.projectId === project.id && room.episodeProductionId === episode.id, "The retained Session is not canonically bound to the selected Episode and Nest.");
    assert(asset.url === source.url, "The retained Studio asset and source no longer share one playback identity.");

    const bytes = await readFile(source.providerSourceId);
    const fileStat = await stat(source.providerSourceId);
    assert(fileStat.isFile() && BigInt(fileStat.size) === asset.sizeBytes, "The retained program fixture no longer matches its Studio asset size.");
    const previewSha256 = sha256(bytes);
    const programFingerprintSha256 = sha256({ episodeProductionId: episode.id, tracks: ["qa-charlie", "qa-homer"], clock: "qa-shared-program" });
    const proposal = {
      kind: "quipsly-retained-program-mix-projection-fixture-v1",
      episodeProductionId: episode.id,
      programFingerprintSha256,
      tracks: [
        { assetId: asset.id, participantLabel: "QA Charlie", role: "dialogue-primary" },
        { assetId: asset.id, participantLabel: "QA Homer", role: "dialogue-primary" },
      ],
      output: { assetId: asset.id, contentType: "audio/wav" },
      fixtureOnly: true,
    };
    const proposalSha256 = sha256(proposal);
    const baselineSha256 = previewSha256;
    const generation = `sha256:${previewSha256}`;
    const occurredAt = new Date("2026-08-06T23:40:00.000Z");

    await prisma.$transaction(async (tx) => {
      await tx.studioAssetAttachment.upsert({
        where: { projectId_assetId: { projectId: project.id, assetId: asset.id } },
        create: {
          projectId: project.id,
          assetId: asset.id,
          role: "episode-mix-preview",
          source: "episode-audio-mix-registration",
          createdByEmail: ACTOR_EMAIL,
          metadataJson: { schema: "quipsly-episode-audio-mix-attachment-v1", episodeProductionId: episode.id, mixJobId: JOB_ID, variantKind: "episode-mix-preview", sourceId: source.id, playbackUrl: source.url, output: { assetId: asset.id, sha256: previewSha256, generation, sizeBytes: fileStat.size, durationSeconds: asset.duration }, fixtureOnly: true },
        },
        update: {
          role: "episode-mix-preview",
          source: "episode-audio-mix-registration",
          metadataJson: { schema: "quipsly-episode-audio-mix-attachment-v1", episodeProductionId: episode.id, mixJobId: JOB_ID, variantKind: "episode-mix-preview", sourceId: source.id, playbackUrl: source.url, output: { assetId: asset.id, sha256: previewSha256, generation, sizeBytes: fileStat.size, durationSeconds: asset.duration }, fixtureOnly: true },
        },
      });
      await tx.studioAssetProcessingJob.upsert({
        where: { id: JOB_ID },
        create: { id: JOB_ID, projectId: project.id, assetId: asset.id, type: "episode-audio-mix", status: "completed", requestedByEmail: ACTOR_EMAIL, inputJson: proposal, resultJson: { receipt: { derivative: { assetId: asset.id, sha256: previewSha256, generation, sizeBytes: fileStat.size, durationSeconds: asset.duration }, baselineDerivative: { assetId: asset.id, sha256: baselineSha256, generation, sizeBytes: fileStat.size, durationSeconds: asset.duration } }, registration: { outputAssetId: asset.id, playbackUrl: source.url, sourceId: source.id }, fixtureOnly: true }, completedAt: occurredAt },
        update: { projectId: project.id, assetId: asset.id, type: "episode-audio-mix", status: "completed", inputJson: proposal, resultJson: { receipt: { derivative: { assetId: asset.id, sha256: previewSha256, generation, sizeBytes: fileStat.size, durationSeconds: asset.duration }, baselineDerivative: { assetId: asset.id, sha256: baselineSha256, generation, sizeBytes: fileStat.size, durationSeconds: asset.duration } }, registration: { outputAssetId: asset.id, playbackUrl: source.url, sourceId: source.id }, fixtureOnly: true }, error: null, completedAt: occurredAt },
      });
      await tx.studioEpisodeAudioMixReviewReceipt.upsert({
        where: { id: REVIEW_ID },
        create: { id: REVIEW_ID, projectId: project.id, episodeProductionId: episode.id, mixJobId: JOB_ID, actorEmail: ACTOR_EMAIL, clientRequestId: "qa-retained-program-mix-review-request-20260806", decision: "APPROVED", programFingerprintSha256, proposalSha256, baselineSha256, previewSha256, requestSha256: sha256({ id: REVIEW_ID, programFingerprintSha256, previewSha256 }), evidenceJson: { fixtureOnly: true, matchedBaselineAndProposalHeard: true }, note: "Retained output-graph projection fixture", occurredAt },
        update: { programFingerprintSha256, proposalSha256, baselineSha256, previewSha256, requestSha256: sha256({ id: REVIEW_ID, programFingerprintSha256, previewSha256 }), evidenceJson: { fixtureOnly: true, matchedBaselineAndProposalHeard: true }, occurredAt },
      });
      await tx.studioEpisodeAudioMixPromotionReceipt.upsert({
        where: { id: PROMOTION_ID },
        create: { id: PROMOTION_ID, projectId: project.id, episodeProductionId: episode.id, mixJobId: JOB_ID, reviewReceiptId: REVIEW_ID, actorEmail: ACTOR_EMAIL, clientRequestId: "qa-retained-program-mix-promotion-request-20260806", operation: "PROMOTE", programFingerprintSha256, proposalSha256, baselineSha256, previewSha256, requestSha256: sha256({ id: PROMOTION_ID, reviewReceiptId: REVIEW_ID, previewSha256 }), evidenceJson: { candidatePlaybackUrl: source.url, fixtureOnly: true, sourceTracksRemainImmutable: true, deliveryEncodingNotCreated: true, publicationNotStarted: true }, reason: "Retained output graph projection", occurredAt },
        update: { operation: "PROMOTE", programFingerprintSha256, proposalSha256, baselineSha256, previewSha256, requestSha256: sha256({ id: PROMOTION_ID, reviewReceiptId: REVIEW_ID, previewSha256 }), evidenceJson: { candidatePlaybackUrl: source.url, fixtureOnly: true, sourceTracksRemainImmutable: true, deliveryEncodingNotCreated: true, publicationNotStarted: true }, occurredAt },
      });
    });

    const signIn = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: ACTOR_EMAIL, password, returnSecureToken: true }) });
    const auth = await signIn.json().catch(() => ({}));
    assert(signIn.status === 200 && auth.idToken, "The retained coach could not sign in to the local emulator.");
    const session = await fetch(`${appOrigin}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json", "cache-control": "no-cache" },
      body: JSON.stringify({ idToken: auth.idToken }),
    });
    const sessionBody = await session.json().catch(() => ({}));
    const sessionCookie = session.headers.get("set-cookie");
    assert(session.status === 200 && sessionBody.success === true && sessionCookie, "The retained coach could not establish a first-party Quipsly session.");
    const rendered = await fetch(`${appOrigin}/sessions/${encodeURIComponent(room.id)}?mode=outputs`, { headers: { cookie: sessionCookie, "cache-control": "no-cache" } });
    const html = await rendered.text();
    assert(rendered.status === 200, `The retained Session output page returned HTTP ${rendered.status}.`);
    assert(html.includes("Episode program authority") && html.includes("Program mix active") && html.includes("Reviewed multitrack program"), "The retained Session did not render the canonical program branch.");
    assert(html.includes("The reviewed multitrack program stops before delivery encoding"), "The finishing cockpit hid the open program-delivery boundary.");

    process.stdout.write(`${JSON.stringify({
      ok: true,
      operation: "retained-versioned-output-graph",
      roomId: room.id,
      episodeProductionId: episode.id,
      program: { jobId: JOB_ID, promotionReceiptId: PROMOTION_ID, sourceTrackCount: 2, programFingerprintSha256, previewSha256 },
      rendered: { status: rendered.status, programAuthorityVisible: true, deliveryBoundaryVisible: true },
      boundaries: { sourceBytesUnchanged: true, fixtureOnly: true, deliveryEncodingNotCreated: true, outputPacketNotSelected: true, uploadNotStarted: true, publicationNotStarted: true },
    }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
