import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import {
  AudioDeliveryError,
  loadApprovedAudioDeliveryPacketEvidence,
} from "@/lib/server/audio-delivery";
import {
  EpisodeProgramDeliveryError,
  loadApprovedEpisodeProgramDeliveryPacketEvidence,
} from "@/lib/server/episode-program-delivery";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";

export const PODCAST_OUTPUT_PACKET_KIND = "podcast-rss-episode";
export const PODCAST_OUTPUT_PACKET_SCHEMA = "quipsly-podcast-rss-output-packet-v1";

type Actor = { id: string; email: string };

export class PodcastOutputPacketError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

function text(value: unknown, maximum = Number.POSITIVE_INFINITY) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function packetSlug(episodeSlug: string, deliverySha256: string, deliveryReviewReceiptId: string) {
  const safeEpisode = episodeSlug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "episode";
  const reviewVersion = createHash("sha256").update(deliveryReviewReceiptId).digest("hex").slice(0, 10);
  return `podcast-rss-${safeEpisode}-${deliverySha256.slice(0, 16)}-${reviewVersion}`;
}

function publicSelection(receipt: any) {
  return {
    id: String(receipt.id),
    operation: receipt.operation === "SELECT" ? "selected" as const : "withdrawn" as const,
    packetId: String(receipt.outputPacketId),
    packetDigestSha256: String(receipt.packetDigestSha256),
    artifactSha256: String(receipt.artifactSha256),
    reason: text(receipt.reason) || null,
    occurredAt: receipt.occurredAt?.toISOString?.() ?? String(receipt.occurredAt),
    actorEmail: String(receipt.actorEmail),
  };
}

function publicPacket(packet: any) {
  const packetJson = object(packet.packetJson);
  const audio = object(packetJson.audio);
  const readiness = object(packetJson.readiness);
  return {
    id: String(packet.id),
    slug: String(packet.slug),
    kind: String(packet.kind),
    title: String(packet.title),
    status: String(packet.status),
    episodeProductionId: packet.episodeProductionId ? String(packet.episodeProductionId) : null,
    deliveryJobId: text(audio.deliveryJobId) || null,
    artifactSha256: text(audio.sha256) || null,
    playbackUrl: text(audio.playbackUrl) || null,
    metadataComplete: readiness.metadataComplete === true,
    enclosurePublic: readiness.enclosurePublic === true,
    publicationEligible: readiness.publicationEligible === true,
    packetDigestSha256: text(object(packetJson.integrity).digest) || null,
    updatedAt: packet.updatedAt?.toISOString?.() ?? String(packet.updatedAt),
  };
}

async function loadEpisodeContext(input: {
  prisma: any;
  projectSlug: string;
  episodeProductionId: string;
  assetId?: string;
}) {
  const project = await input.prisma.studioProject.findFirst({
    where: { slug: input.projectSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!project) throw new PodcastOutputPacketError("Nest not found for podcast packaging.", 404, "PODCAST_PACKET_PROJECT_NOT_FOUND");
  const episode = await input.prisma.studioEpisodeProduction.findFirst({
    where: { id: input.episodeProductionId, projectId: project.id },
    select: { id: true, projectId: true, documentId: true, slug: true, title: true, status: true },
  });
  if (!episode) throw new PodcastOutputPacketError("The canonical Episode was not found in this Nest.", 404, "PODCAST_PACKET_EPISODE_NOT_FOUND");
  if (input.assetId) {
    const attachment = await input.prisma.studioAssetAttachment.findUnique({
      where: { projectId_assetId: { projectId: project.id, assetId: input.assetId } },
      select: { id: true, role: true, source: true },
    });
    if (!attachment) throw new PodcastOutputPacketError("The approved audio artifact is not attached to this Nest.", 409, "PODCAST_PACKET_ASSET_NOT_ATTACHED");
    return { project, episode, attachment };
  }
  return { project, episode, attachment: null };
}

export async function selectPodcastOutputPacket(input: {
  prisma: any;
  actor: Actor;
  projectSlug: string;
  episodeProductionId: string;
  assetId: string;
  deliveryJobId: string;
  clientRequestId: string;
  acknowledgements: {
    exactEncodedBytesProofListened: boolean;
    selectAsEpisodeEnclosureCandidate: boolean;
    metadataStillRequiresReview: boolean;
  };
}) {
  const clientRequestId = text(input.clientRequestId, 160);
  if (!clientRequestId) throw new PodcastOutputPacketError("A stable client request id is required.", 400, "PODCAST_PACKET_REQUEST_ID_REQUIRED");
  if (input.acknowledgements.exactEncodedBytesProofListened !== true
      || input.acknowledgements.selectAsEpisodeEnclosureCandidate !== true
      || input.acknowledgements.metadataStillRequiresReview !== true) {
    throw new PodcastOutputPacketError(
      "Select the exact proof-listened bytes deliberately and keep episode metadata in review.",
      409,
      "PODCAST_PACKET_ACKNOWLEDGEMENT_REQUIRED",
    );
  }
  const actorEmail = text(input.actor.email, 320).toLowerCase();
  if (!actorEmail || !text(input.actor.id, 240)) throw new PodcastOutputPacketError("A signed-in actor identity is required.", 401, "PODCAST_PACKET_ACTOR_REQUIRED");
  const context = await loadEpisodeContext(input);
  const existingRequest = await input.prisma.studioEpisodeOutputSelectionReceipt.findUnique({
    where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } },
    include: { outputPacket: true },
  });
  if (existingRequest) {
    const replayJson = object(existingRequest.outputPacket.packetJson);
    const replayAudio = object(replayJson.audio);
    const replayIntegrity = object(replayJson.integrity);
    const replayRequest = {
      schema: "quipsly-podcast-output-selection-request-v1",
      action: "SELECT",
      projectId: context.project.id,
      episodeProductionId: context.episode.id,
      slug: existingRequest.outputPacket.slug,
      packetDigestSha256: text(replayIntegrity.digest),
      artifactSha256: text(replayAudio.sha256),
      actorUserId: input.actor.id,
      actorEmail,
      clientRequestId,
    };
    if (existingRequest.operation !== "SELECT"
        || existingRequest.episodeProductionId !== context.episode.id
        || existingRequest.outputPacket.episodeProductionId !== context.episode.id
        || text(replayAudio.assetId) !== input.assetId
        || text(replayAudio.deliveryJobId) !== input.deliveryJobId
        || existingRequest.requestSha256 !== sha256(replayRequest)) {
      throw new PodcastOutputPacketError("That request id belongs to a different Episode package decision.", 409, "PODCAST_PACKET_IDEMPOTENCY_CONFLICT");
    }
    return { ok: true, idempotentReplay: true, packet: publicPacket(existingRequest.outputPacket), selection: publicSelection(existingRequest) };
  }
  const selectedDeliveryJob = await input.prisma.studioAssetProcessingJob.findFirst({
    where: { id: input.deliveryJobId, projectId: context.project.id, assetId: input.assetId },
    select: { type: true },
  });
  let audio;
  try {
    audio = selectedDeliveryJob?.type === "episode-program-delivery"
      ? await loadApprovedEpisodeProgramDeliveryPacketEvidence({
          prisma: input.prisma,
          projectSlug: context.project.slug,
          episodeProductionId: context.episode.id,
          assetId: input.assetId,
          deliveryJobId: input.deliveryJobId,
        })
      : await loadApprovedAudioDeliveryPacketEvidence({
          prisma: input.prisma,
          projectSlug: context.project.slug,
          assetId: input.assetId,
          deliveryJobId: input.deliveryJobId,
        });
  } catch (error) {
    if (error instanceof AudioDeliveryError || error instanceof EpisodeProgramDeliveryError) {
      throw new PodcastOutputPacketError(error.message, error.status, error.code);
    }
    throw error;
  }
  if (audio.projectId !== context.project.id) {
    throw new PodcastOutputPacketError("The approved audio belongs to another Nest.", 409, "PODCAST_PACKET_AUDIO_PROJECT_MISMATCH");
  }

  const preparedAt = audio.proofListen.occurredAt;
  const guid = `urn:quipsly:podcast-episode:${context.episode.id}`;
  const packetWithoutIntegrity = {
    schema: PODCAST_OUTPUT_PACKET_SCHEMA,
    version: 1,
    preparedAt,
    purpose: "Versioned podcast RSS episode package candidate. No upload or publication is authorized.",
    project: { id: context.project.id, slug: context.project.slug, name: context.project.name },
    episode: {
      id: context.episode.id,
      slug: context.episode.slug,
      title: context.episode.title,
      status: context.episode.status,
      guid,
      episodeType: "full",
      episodeNumber: null,
      seasonNumber: null,
      description: null,
      publishAt: null,
    },
    audio: {
      authorityKind: audio.authorityKind,
      assetId: input.assetId,
      attachmentRole: context.attachment?.role ?? null,
      attachmentSource: context.attachment?.source ?? null,
      masteryJobId: audio.masteryJobId,
      masterReviewReceiptId: audio.masterReviewReceiptId,
      mixJobId: audio.mixJobId,
      mixReviewReceiptId: audio.mixReviewReceiptId,
      programFingerprintSha256: audio.programFingerprintSha256,
      promotionReceiptId: audio.promotionReceiptId,
      deliveryJobId: audio.deliveryJobId,
      deliveryReviewReceiptId: audio.deliveryReviewReceiptId,
      profileId: audio.profileId,
      candidateSha256: audio.candidateSha256,
      sha256: audio.deliverySha256,
      playbackUrl: audio.playbackUrl,
      sizeBytes: audio.sizeBytes,
      durationSeconds: audio.durationSeconds,
      contentType: audio.contentType,
      codec: audio.codec,
      codecProfile: audio.codecProfile,
      sampleRateHz: audio.sampleRateHz,
      channels: audio.channels,
      bitrateBps: audio.bitrateBps,
      fastStart: audio.fastStart,
      completeDecode: audio.completeDecode,
      integratedLufs: audio.integratedLufs,
      truePeakDbtp: audio.truePeakDbtp,
      proofListen: audio.proofListen,
      enclosure: {
        url: null,
        length: audio.sizeBytes,
        type: audio.contentType,
        publicUrlRequired: true,
        headAndByteRangeSupportRequired: true,
      },
    },
    supporting: { transcript: null, chapters: null, artwork: null },
    readiness: {
      exactAudioApproved: true,
      metadataComplete: false,
      enclosurePublic: false,
      publicationEligible: false,
    },
    boundaries: {
      immutableSourceUnchanged: true,
      masteredCandidateUnchanged: true,
      encodedArtifactUnchanged: true,
      packetSelectionIsReversible: true,
      uploadNotStarted: true,
      rssNotChanged: true,
      publicationNotStarted: true,
      humanMetadataReviewRequired: true,
    },
  };
  const packetDigestSha256 = sha256(packetWithoutIntegrity);
  const packetJson = {
    ...packetWithoutIntegrity,
    integrity: { algorithm: "sha256", digest: packetDigestSha256 },
  };
  const lineageJson = {
    schema: "quipsly-podcast-output-lineage-v1",
    episodeProductionId: context.episode.id,
    assetId: input.assetId,
    authorityKind: audio.authorityKind,
    masteryJobId: audio.masteryJobId,
    masterReviewReceiptId: audio.masterReviewReceiptId,
    mixJobId: audio.mixJobId,
    mixReviewReceiptId: audio.mixReviewReceiptId,
    programFingerprintSha256: audio.programFingerprintSha256,
    promotionReceiptId: audio.promotionReceiptId,
    deliveryJobId: audio.deliveryJobId,
    deliveryReviewReceiptId: audio.deliveryReviewReceiptId,
    candidateSha256: audio.candidateSha256,
    artifactSha256: audio.deliverySha256,
    packetDigestSha256,
  };
  const slug = packetSlug(context.episode.slug, audio.deliverySha256, audio.deliveryReviewReceiptId);
  const request = {
    schema: "quipsly-podcast-output-selection-request-v1",
    action: "SELECT",
    projectId: context.project.id,
    episodeProductionId: context.episode.id,
    slug,
    packetDigestSha256,
    artifactSha256: audio.deliverySha256,
    actorUserId: input.actor.id,
    actorEmail,
    clientRequestId,
  };
  const requestSha256 = sha256(request);
  return input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `podcast-output:${context.episode.id}:${PODCAST_OUTPUT_PACKET_KIND}`);
    const replay = await tx.studioEpisodeOutputSelectionReceipt.findUnique({
      where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } },
      include: { outputPacket: true },
    });
    if (replay) {
      if (replay.requestSha256 !== requestSha256) throw new PodcastOutputPacketError("That request id won a race with different Episode package evidence.", 409, "PODCAST_PACKET_IDEMPOTENCY_CONFLICT");
      return { ok: true, idempotentReplay: true, packet: publicPacket(replay.outputPacket), selection: publicSelection(replay) };
    }
    const [latestPromotion, latestReview] = audio.authorityKind === "episode-program"
      ? await Promise.all([
          tx.studioEpisodeAudioMixPromotionReceipt.findFirst({ where: { episodeProductionId: context.episode.id }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
          tx.studioEpisodeProgramDeliveryReviewReceipt.findFirst({ where: { deliveryJobId: audio.deliveryJobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
        ])
      : await Promise.all([
          tx.studioAudioMasterPromotionReceipt.findFirst({ where: { projectId: context.project.id, assetId: input.assetId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
          tx.studioAudioDeliveryReviewReceipt.findFirst({ where: { deliveryJobId: audio.deliveryJobId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
        ]);
    if (latestPromotion?.id !== audio.promotionReceiptId || latestPromotion.operation !== "PROMOTE"
        || latestReview?.id !== audio.deliveryReviewReceiptId || latestReview.decision !== "APPROVED") {
      throw new PodcastOutputPacketError("The audio selection changed before the Episode packet could be committed.", 409, "PODCAST_PACKET_AUDIO_CHANGED");
    }
    let packet = await tx.studioOutputPacket.findUnique({ where: { projectId_slug: { projectId: context.project.id, slug } } });
    if (packet) {
      const integrity = object(object(packet.packetJson).integrity);
      if (packet.kind !== PODCAST_OUTPUT_PACKET_KIND
          || packet.episodeProductionId !== context.episode.id
          || text(integrity.digest) !== packetDigestSha256) {
        throw new PodcastOutputPacketError("That packet identity is occupied by different or stale lineage.", 409, "PODCAST_PACKET_IDENTITY_CONFLICT");
      }
    } else {
      packet = await tx.studioOutputPacket.create({
        data: {
          projectId: context.project.id,
          documentId: context.episode.documentId,
          episodeProductionId: context.episode.id,
          slug,
          kind: PODCAST_OUTPUT_PACKET_KIND,
          title: `${context.episode.title} · podcast RSS package`,
          status: "needs-review",
          packetJson: json(packetJson),
          lineageJson: json(lineageJson),
          createdByEmail: actorEmail,
        },
      });
    }
    const selection = await tx.studioEpisodeOutputSelectionReceipt.create({
      data: {
        projectId: context.project.id,
        episodeProductionId: context.episode.id,
        outputPacketId: packet.id,
        actorUserId: input.actor.id,
        actorEmail,
        clientRequestId,
        operation: "SELECT",
        outputKind: PODCAST_OUTPUT_PACKET_KIND,
        packetDigestSha256,
        artifactSha256: audio.deliverySha256,
        requestSha256,
        occurredAt: new Date(),
      },
    });
    return { ok: true, idempotentReplay: false, packet: publicPacket(packet), selection: publicSelection(selection) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function withdrawPodcastOutputPacket(input: {
  prisma: any;
  actor: Actor;
  projectSlug: string;
  episodeProductionId: string;
  clientRequestId: string;
  reason: string;
}) {
  const clientRequestId = text(input.clientRequestId, 160);
  const reason = text(input.reason, 2_000);
  if (!clientRequestId) throw new PodcastOutputPacketError("A stable client request id is required.", 400, "PODCAST_PACKET_REQUEST_ID_REQUIRED");
  if (reason.length < 3) throw new PodcastOutputPacketError("Withdrawing an Episode package requires a short reason.", 409, "PODCAST_PACKET_WITHDRAW_REASON_REQUIRED");
  const actorEmail = text(input.actor.email, 320).toLowerCase();
  if (!actorEmail || !text(input.actor.id, 240)) throw new PodcastOutputPacketError("A signed-in actor identity is required.", 401, "PODCAST_PACKET_ACTOR_REQUIRED");
  const context = await loadEpisodeContext(input);
  const existingRequest = await input.prisma.studioEpisodeOutputSelectionReceipt.findUnique({
    where: { projectId_actorEmail_clientRequestId: { projectId: context.project.id, actorEmail, clientRequestId } },
    include: { outputPacket: true },
  });
  if (existingRequest) {
    const replayRequest = {
      schema: "quipsly-podcast-output-selection-request-v1",
      action: "WITHDRAW",
      projectId: context.project.id,
      episodeProductionId: context.episode.id,
      outputPacketId: existingRequest.outputPacketId,
      packetDigestSha256: existingRequest.packetDigestSha256,
      artifactSha256: existingRequest.artifactSha256,
      actorUserId: input.actor.id,
      actorEmail,
      clientRequestId,
      reason,
    };
    if (existingRequest.operation !== "WITHDRAW"
        || existingRequest.episodeProductionId !== context.episode.id
        || existingRequest.requestSha256 !== sha256(replayRequest)) {
      throw new PodcastOutputPacketError("That request id belongs to a different Episode package decision.", 409, "PODCAST_PACKET_IDEMPOTENCY_CONFLICT");
    }
    return { ok: true, idempotentReplay: true, packet: publicPacket(existingRequest.outputPacket), selection: publicSelection(existingRequest) };
  }
  const current = await input.prisma.studioEpisodeOutputSelectionReceipt.findFirst({
    where: { episodeProductionId: context.episode.id, outputKind: PODCAST_OUTPUT_PACKET_KIND },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    include: { outputPacket: true },
  });
  if (!current || current.operation !== "SELECT") throw new PodcastOutputPacketError("No selected podcast Episode packet is currently active.", 409, "PODCAST_PACKET_NOT_SELECTED");
  const request = {
    schema: "quipsly-podcast-output-selection-request-v1",
    action: "WITHDRAW",
    projectId: context.project.id,
    episodeProductionId: context.episode.id,
    outputPacketId: current.outputPacketId,
    packetDigestSha256: current.packetDigestSha256,
    artifactSha256: current.artifactSha256,
    actorUserId: input.actor.id,
    actorEmail,
    clientRequestId,
    reason,
  };
  const requestSha256 = sha256(request);
  return input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `podcast-output:${context.episode.id}:${PODCAST_OUTPUT_PACKET_KIND}`);
    const latest = await tx.studioEpisodeOutputSelectionReceipt.findFirst({
      where: { episodeProductionId: context.episode.id, outputKind: PODCAST_OUTPUT_PACKET_KIND },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    });
    if (!latest || latest.id !== current.id || latest.operation !== "SELECT") throw new PodcastOutputPacketError("The selected Episode packet changed before withdrawal.", 409, "PODCAST_PACKET_SELECTION_CHANGED");
    const selection = await tx.studioEpisodeOutputSelectionReceipt.create({
      data: {
        projectId: context.project.id,
        episodeProductionId: context.episode.id,
        outputPacketId: current.outputPacketId,
        actorUserId: input.actor.id,
        actorEmail,
        clientRequestId,
        operation: "WITHDRAW",
        outputKind: PODCAST_OUTPUT_PACKET_KIND,
        packetDigestSha256: current.packetDigestSha256,
        artifactSha256: current.artifactSha256,
        requestSha256,
        reason,
        occurredAt: new Date(),
      },
    });
    return { ok: true, idempotentReplay: false, packet: publicPacket(current.outputPacket), selection: publicSelection(selection) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
