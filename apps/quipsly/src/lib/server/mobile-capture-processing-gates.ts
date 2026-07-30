import { mobileCaptureProcessingGateFromEvidence } from "./mobile-capture-processing-policy.js";

export { mobileCaptureProcessingGateFromEvidence } from "./mobile-capture-processing-policy.js";

async function finalizationReceiptsForRecordingAsset(args: {
  prisma: any;
  recordingAssetId: string;
}) {
  return args.prisma.mobileCaptureFinalizationReceipt.findMany({
    where: { recordingAssetId: args.recordingAssetId },
    orderBy: { createdAt: "asc" },
  });
}

async function mobileCaptureProcessingGate(args: {
  prisma: any;
  recordingAsset: any;
  transcript: boolean;
}) {
  const receipts = await finalizationReceiptsForRecordingAsset({
    prisma: args.prisma,
    recordingAssetId: args.recordingAsset.id,
  });
  // A release receipt proves what was authorized at finalization; it is not a
  // permanent substitute for the room's current consent state. Always read
  // the current participant ledger so later decline/revocation quarantines
  // new processing and transcript disclosure without rewriting source bytes.
  const room = await args.prisma.callRoom.findUnique({
    where: { id: args.recordingAsset.roomId },
    include: { participants: true, recordingConsents: true },
  });
  return mobileCaptureProcessingGateFromEvidence({
    recordingAsset: args.recordingAsset,
    receipts,
    room,
    transcript: args.transcript,
  });
}

export async function mobileCaptureMediaProcessingGate(args: {
  prisma: any;
  recordingAsset: any;
}) {
  return mobileCaptureProcessingGate({ ...args, transcript: false });
}

export async function mobileCaptureTranscriptProcessingGate(args: {
  prisma: any;
  recordingAsset: any;
}) {
  return mobileCaptureProcessingGate({ ...args, transcript: true });
}
