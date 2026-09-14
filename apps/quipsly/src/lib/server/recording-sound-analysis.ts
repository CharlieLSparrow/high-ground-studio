import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import { audibleEventDetectorReceiptMatchesSource, parseAudibleEventDetectorReceipt } from "@/lib/audio/audible-event-analysis";
import { sessionActorAccessWhere, type SessionAccessActor } from "./session-access";

export class RecordingSoundAnalysisError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Device observations extend the canonical recording, not its immutable bytes.
 * Call access alone does not let a participant replace another person's detector output.
 */
export async function attachRecordingSoundAnalysis(input: {
  prisma: PrismaClient;
  actor: SessionAccessActor;
  recordingAssetId: string;
  analysis: unknown;
}) {
  const analysis = parseAudibleEventDetectorReceipt(input.analysis);
  if (!analysis || analysis.status !== "completed" || !analysis.sourceSHA256) {
    throw new RecordingSoundAnalysisError(400, "INVALID_SOUND_ANALYSIS", "Sound analysis must describe a completed scan of the original recording.");
  }
  return input.prisma.$transaction(async tx => {
    const access = await tx.recordingAsset.findFirst({
      where: { id: input.recordingAssetId, room: sessionActorAccessWhere(input.actor) }, select: { roomId: true },
    });
    if (!access) throw new RecordingSoundAnalysisError(404, "RECORDING_UNAVAILABLE", "This recording is unavailable.");
    // Upload finalization takes this same row lock before writing its manifest.
    // Re-read after locking so a late finalizer and device delivery cannot lose one another's work.
    await tx.$queryRaw`SELECT "id" FROM "CallRoom" WHERE "id" = ${access.roomId} FOR UPDATE`;
    const asset = await tx.recordingAsset.findFirst({
      where: { id: input.recordingAssetId, room: sessionActorAccessWhere(input.actor) },
      include: { participant: { select: { userId: true } } },
    });
    if (!asset) throw new RecordingSoundAnalysisError(404, "RECORDING_UNAVAILABLE", "This recording is unavailable.");
    const manifest = object(asset.localManifestJson);
    if ((asset.participant?.userId && asset.participant.userId !== input.actor.id)
      || (manifest.actorUserId && manifest.actorUserId !== input.actor.id)
      || (!asset.participant?.userId && manifest.actorUserId !== input.actor.id)) {
      throw new RecordingSoundAnalysisError(403, "RECORDING_OWNER_REQUIRED", "Only the recording owner can synchronize its device analysis.");
    }
    if (asset.status !== "VERIFIED" || !asset.verifiedAt || !asset.checksum
      || !["LOCAL_AUDIO", "LOCAL_VIDEO"].includes(asset.kind)
      || !audibleEventDetectorReceiptMatchesSource(analysis, asset.checksum, Number(asset.byteSize))) {
      throw new RecordingSoundAnalysisError(409, "RECORDING_SOURCE_NOT_VERIFIED", "The analysis must match the verified original recording.");
    }
    const profile = object(manifest.reportedSourceProfile);
    const existing = parseAudibleEventDetectorReceipt(profile.audibleEventAnalysis);
    let applied = false;
    if (existing?.analysisId === analysis.analysisId) {
      // The parser gives both objects the same field order and discards unknown fields.
      if (JSON.stringify(existing) !== JSON.stringify(analysis)) {
        throw new RecordingSoundAnalysisError(409, "ANALYSIS_ID_CONFLICT", "This analysis identifier already describes different results.");
      }
    } else if (!existing || existing.status !== "completed" || Date.parse(analysis.analyzedAt) > Date.parse(existing.analyzedAt)) {
      await tx.recordingAsset.update({
        where: { id: asset.id },
        data: { localManifestJson: { ...manifest, reportedSourceProfile: {
          ...profile, audibleEventAnalysis: analysis,
        } } as Prisma.InputJsonValue },
      });
      applied = true;
    }
    // An older delivery is acknowledged without rolling back a newer analysis.
    return { ok: true, recordingAssetId: asset.id, analysisId: analysis.analysisId,
      sourceSHA256: asset.checksum, sourceByteCount: Number(asset.byteSize), applied };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Episode tools resolve current Capture observations through the recording,
 * rather than trusting the analysis snapshot taken when an upload began.
 * Caller has already authorized the exact project/media-source coordinates.
 */
export async function readRecordingSoundAnalyses(input: {
  prisma: Pick<PrismaClient, "recordingAsset">;
  projectId: string;
  assetId: string;
  sourceId: string;
  sha256: string;
  sizeBytes: number;
}) {
  const recordings = await input.prisma.recordingAsset.findMany({
    where: { status: "VERIFIED", checksum: input.sha256, byteSize: BigInt(input.sizeBytes),
      room: { projectId: input.projectId }, OR: [
        { AND: [{ localManifestJson: { path: ["mediaAssetId"], equals: input.assetId } },
          { localManifestJson: { path: ["sourceId"], equals: input.sourceId } }] },
        { AND: [{ localManifestJson: { path: ["promotion", "mediaAssetId"], equals: input.assetId } },
          { localManifestJson: { path: ["promotion", "sourceId"], equals: input.sourceId } }] },
      ] },
    select: { localManifestJson: true }, take: 100,
  });
  return recordings.flatMap(recording => {
    const profile = object(object(recording.localManifestJson).reportedSourceProfile);
    const analysis = parseAudibleEventDetectorReceipt(profile.audibleEventAnalysis);
    return analysis?.status === "completed"
      && audibleEventDetectorReceiptMatchesSource(analysis, input.sha256, input.sizeBytes) ? [analysis] : [];
  }).sort((a, b) => Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt));
}
