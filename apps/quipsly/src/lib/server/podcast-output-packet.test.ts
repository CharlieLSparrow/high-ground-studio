/** @jest-environment node */

import { loadApprovedAudioDeliveryPacketEvidence } from "@/lib/server/audio-delivery";
import { loadApprovedEpisodeProgramDeliveryPacketEvidence } from "@/lib/server/episode-program-delivery";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

import { selectPodcastOutputPacket, withdrawPodcastOutputPacket } from "./podcast-output-packet";

jest.mock("@/lib/server/audio-delivery", () => ({
  AudioDeliveryError: class AudioDeliveryError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  loadApprovedAudioDeliveryPacketEvidence: jest.fn(),
}));
jest.mock("@/lib/server/episode-program-delivery", () => ({
  EpisodeProgramDeliveryError: class EpisodeProgramDeliveryError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } },
  loadApprovedEpisodeProgramDeliveryPacketEvidence: jest.fn(),
}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn() }));

const actor = { id: "producer-1", email: "Producer@Example.test" };
const selectInput = {
  actor,
  projectSlug: "high-ground-odyssey",
  episodeProductionId: "episode-9",
  assetId: "asset-1",
  deliveryJobId: "delivery-1",
  clientRequestId: "select-request-1",
  acknowledgements: { exactEncodedBytesProofListened: true, selectAsEpisodeEnclosureCandidate: true, metadataStillRequiresReview: true },
};

function approvedAudio() {
  return {
    authorityKind: "asset-master", projectId: "project-1", assetId: "asset-1", deliveryJobId: "delivery-1", masteryJobId: "master-1", mixJobId: null, promotionReceiptId: "promotion-1", masterReviewReceiptId: "master-review-1", mixReviewReceiptId: null, deliveryReviewReceiptId: "delivery-review-1", profileId: "apple-podcasts-aac-stereo-v1", programFingerprintSha256: null, candidateSha256: "a".repeat(64), deliverySha256: "b".repeat(64), playbackUrl: "/api/media/audio-1", sizeBytes: 123_456, durationSeconds: 600, contentType: "audio/mp4", codec: "aac", codecProfile: "LC", sampleRateHz: 48_000, channels: 2, bitrateBps: 128_000, fastStart: true, completeDecode: true, integratedLufs: -16, truePeakDbtp: -1.2,
    proofListen: { receiptId: "delivery-review-1", actorEmail: "listener@example.test", occurredAt: "2026-08-06T20:00:00.000Z", coverage: { beginning: true, midpoint: true, ending: true, approvalReady: true } },
  };
}

function approvedProgram() {
  return {
    ...approvedAudio(),
    authorityKind: "episode-program",
    masteryJobId: null,
    masterReviewReceiptId: null,
    mixJobId: "mix-1",
    mixReviewReceiptId: "mix-review-1",
    promotionReceiptId: "mix-promotion-1",
    deliveryReviewReceiptId: "program-delivery-review-1",
    programFingerprintSha256: "c".repeat(64),
  };
}

function database(jobType = "audio-delivery") {
  let packet: any = null;
  let latestSelection: any = null;
  const requests = new Map<string, any>();
  const project = { id: "project-1", slug: "high-ground-odyssey", name: "High Ground Odyssey" };
  const episode = { id: "episode-9", projectId: project.id, documentId: "document-1", slug: "episode-9", title: "Episode 9", status: "recorded" };
  const attachment = jobType === "episode-program-delivery"
    ? { id: "attachment-1", role: "episode-mix-preview", source: "episode-audio-mix-registration", metadataJson: { episodeProductionId: episode.id } }
    : { id: "attachment-1", role: "primary-audio", source: "session", metadataJson: { callRoomId: "room-episode-9" } };
  let packetSequence = 0;
  let selectionSequence = 0;
  const findRequest = jest.fn(async ({ where }: any) => requests.get(where.projectId_actorEmail_clientRequestId.clientRequestId) ?? null);
  const findLatest = jest.fn(async () => latestSelection);
  const tx: any = {
    studioEpisodeOutputSelectionReceipt: {
      findUnique: findRequest,
      findFirst: findLatest,
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `selection-${++selectionSequence}`, ...data, createdAt: new Date(), outputPacket: packet };
        latestSelection = row;
        requests.set(data.clientRequestId, row);
        return row;
      }),
    },
    studioAudioMasterPromotionReceipt: { findFirst: jest.fn().mockResolvedValue({ id: "promotion-1", operation: "PROMOTE" }) },
    studioAudioDeliveryReviewReceipt: { findFirst: jest.fn().mockResolvedValue({ id: "delivery-review-1", decision: "APPROVED" }) },
    studioEpisodeAudioMixPromotionReceipt: { findFirst: jest.fn().mockResolvedValue({ id: "mix-promotion-1", operation: "PROMOTE" }) },
    studioEpisodeProgramDeliveryReviewReceipt: { findFirst: jest.fn().mockResolvedValue({ id: "program-delivery-review-1", decision: "APPROVED" }) },
    studioOutputPacket: {
      findUnique: jest.fn(async () => packet),
      create: jest.fn(async ({ data }: any) => {
        packet = { id: `packet-${++packetSequence}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        return packet;
      }),
    },
  };
  const prisma: any = {
    studioProject: { findFirst: jest.fn().mockResolvedValue(project) },
    studioEpisodeProduction: { findFirst: jest.fn().mockResolvedValue(episode) },
    studioAssetAttachment: { findUnique: jest.fn().mockResolvedValue(attachment) },
    callRoom: { findFirst: jest.fn().mockResolvedValue({ id: "room-episode-9" }) },
    recordingAsset: { findFirst: jest.fn().mockResolvedValue({ id: "recording-episode-9" }) },
    studioAssetProcessingJob: { findFirst: jest.fn().mockResolvedValue({ type: jobType }) },
    studioEpisodeOutputSelectionReceipt: { findUnique: findRequest, findFirst: findLatest },
    $transaction: jest.fn(async (callback: any) => callback(tx)),
  };
  return { prisma, tx, state: { get packet() { return packet; }, get latestSelection() { return latestSelection; } } };
}

describe("canonical podcast Episode packet selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadApprovedAudioDeliveryPacketEvidence).mockReset();
    jest.mocked(loadApprovedAudioDeliveryPacketEvidence).mockResolvedValue(approvedAudio() as never);
    jest.mocked(loadApprovedEpisodeProgramDeliveryPacketEvidence).mockReset();
    jest.mocked(loadApprovedEpisodeProgramDeliveryPacketEvidence).mockResolvedValue(approvedProgram() as never);
  });

  it("creates an immutable packet and append-only selection without uploading or publishing", async () => {
    const { prisma, tx } = database();
    const result = await selectPodcastOutputPacket({ prisma, ...selectInput });

    expect(result).toMatchObject({ ok: true, idempotentReplay: false, packet: { episodeProductionId: "episode-9", artifactSha256: "b".repeat(64), metadataComplete: false, enclosurePublic: false, publicationEligible: false }, selection: { operation: "selected", artifactSha256: "b".repeat(64) } });
    expect(tx.studioOutputPacket.create).toHaveBeenCalledWith({ data: expect.objectContaining({ episodeProductionId: "episode-9", kind: "podcast-rss-episode", status: "needs-review", packetJson: expect.objectContaining({
      episode: expect.objectContaining({ guid: "urn:quipsly:podcast-episode:episode-9" }),
      audio: expect.objectContaining({ enclosure: expect.objectContaining({ url: null, length: 123_456, type: "audio/mp4", publicUrlRequired: true }) }),
      readiness: { exactAudioApproved: true, metadataComplete: false, enclosurePublic: false, publicationEligible: false },
      boundaries: expect.objectContaining({ uploadNotStarted: true, rssNotChanged: true, publicationNotStarted: true }),
    }) }) });
    expect(tx.studioEpisodeOutputSelectionReceipt.create).toHaveBeenCalledWith({ data: expect.objectContaining({ operation: "SELECT", outputKind: "podcast-rss-episode", clientRequestId: "select-request-1" }) });
    expect(tx.studioOutputPacket.create.mock.calls[0][0].data.slug).toMatch(/^podcast-rss-episode-9-b{16}-[a-f0-9]{10}$/);
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledWith(tx, "podcast-output:episode-9:podcast-rss-episode");
  });

  it("replays the same selection before re-reading mutable mastering state", async () => {
    const { prisma } = database();
    await selectPodcastOutputPacket({ prisma, ...selectInput });
    jest.mocked(loadApprovedAudioDeliveryPacketEvidence).mockRejectedValueOnce(new Error("promotion changed"));
    const replay = await selectPodcastOutputPacket({ prisma, ...selectInput });

    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, selection: { operation: "selected" } });
    expect(loadApprovedAudioDeliveryPacketEvidence).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("selects an approved Episode program without collapsing it into a single-asset master", async () => {
    const { prisma, tx } = database("episode-program-delivery");
    const result = await selectPodcastOutputPacket({ prisma, ...selectInput });

    expect(result).toMatchObject({ ok: true, packet: { artifactSha256: "b".repeat(64) } });
    expect(loadApprovedEpisodeProgramDeliveryPacketEvidence).toHaveBeenCalledWith(expect.objectContaining({
      episodeProductionId: "episode-9",
      assetId: "asset-1",
      deliveryJobId: "delivery-1",
    }));
    expect(loadApprovedAudioDeliveryPacketEvidence).not.toHaveBeenCalled();
    expect(tx.studioOutputPacket.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      packetJson: expect.objectContaining({ audio: expect.objectContaining({
        authorityKind: "episode-program",
        masteryJobId: null,
        mixJobId: "mix-1",
        mixReviewReceiptId: "mix-review-1",
        programFingerprintSha256: "c".repeat(64),
      }) }),
      lineageJson: expect.objectContaining({ authorityKind: "episode-program", mixJobId: "mix-1" }),
    }) });
    expect(tx.studioEpisodeAudioMixPromotionReceipt.findFirst).toHaveBeenCalled();
    expect(tx.studioEpisodeProgramDeliveryReviewReceipt.findFirst).toHaveBeenCalled();
    expect(tx.studioAudioMasterPromotionReceipt.findFirst).not.toHaveBeenCalled();
    expect(prisma.callRoom.findFirst).not.toHaveBeenCalled();
  });

  it("rejects proof-listened audio that belongs to another Episode in the same Nest", async () => {
    const { prisma, tx } = database();
    prisma.callRoom.findFirst.mockResolvedValue(null);

    await expect(selectPodcastOutputPacket({ prisma, ...selectInput })).rejects.toMatchObject({
      code: "PODCAST_PACKET_ASSET_EPISODE_MISMATCH",
      status: 409,
    });
    expect(loadApprovedAudioDeliveryPacketEvidence).not.toHaveBeenCalled();
    expect(tx.studioOutputPacket.create).not.toHaveBeenCalled();
    expect(tx.studioEpisodeOutputSelectionReceipt.create).not.toHaveBeenCalled();
  });

  it("accepts an older retained attachment through its canonical recording-to-room relation", async () => {
    const { prisma } = database();
    prisma.studioAssetAttachment.findUnique.mockResolvedValue({
      id: "attachment-legacy",
      role: "primary-audio",
      source: "mobile-capture-finalization",
      metadataJson: { recordingAssetId: "recording-episode-9" },
    });

    const result = await selectPodcastOutputPacket({ prisma, ...selectInput });

    expect(result).toMatchObject({ ok: true, packet: { episodeProductionId: "episode-9" } });
    expect(prisma.recordingAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "recording-episode-9", room: { projectId: "project-1", episodeProductionId: "episode-9" } },
      select: { id: true },
    });
  });

  it("appends a withdrawal, preserves the packet, and replays the withdrawal after state changes", async () => {
    const { prisma, tx, state } = database();
    await selectPodcastOutputPacket({ prisma, ...selectInput });
    const result = await withdrawPodcastOutputPacket({ prisma, actor, projectSlug: selectInput.projectSlug, episodeProductionId: selectInput.episodeProductionId, clientRequestId: "withdraw-request-1", reason: "Replace the current mix" });
    const replay = await withdrawPodcastOutputPacket({ prisma, actor, projectSlug: selectInput.projectSlug, episodeProductionId: selectInput.episodeProductionId, clientRequestId: "withdraw-request-1", reason: "Replace the current mix" });

    expect(result).toMatchObject({ ok: true, idempotentReplay: false, packet: { id: "packet-1" }, selection: { operation: "withdrawn", reason: "Replace the current mix" } });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, selection: { operation: "withdrawn" } });
    expect(state.packet.id).toBe("packet-1");
    expect(tx.studioOutputPacket.create).toHaveBeenCalledTimes(1);
    expect(tx.studioEpisodeOutputSelectionReceipt.create).toHaveBeenCalledTimes(2);
  });
});
