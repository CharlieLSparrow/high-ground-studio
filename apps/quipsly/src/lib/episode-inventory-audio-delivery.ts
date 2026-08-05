function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function object(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function iso(value: unknown) { return value && typeof (value as any).toISOString === "function" ? (value as any).toISOString() : text(value) || null; }

export function episodeInventoryAudioDeliveryArtifact(input: {
  jobs: any[];
  variants: any[];
  promotionEvents: any[];
}) {
  const job = input.jobs.find((candidate) => candidate?.type === "audio-delivery") || null;
  if (!job) return null;
  const contract = object(job.inputJson);
  const source = object(contract.source);
  const envelope = object(job.resultJson);
  const receipt = object(envelope.receipt);
  const output = object(receipt.output);
  const registration = object(envelope.registration);
  const latestReview = Array.isArray(job.audioDeliveryReviews) ? job.audioDeliveryReviews[0] || null : null;
  const latestPromotion = input.promotionEvents[0] || null;
  const promotionStillActive = Boolean(latestPromotion && latestPromotion.operation === "PROMOTE" && latestPromotion.id === source.promotionReceiptId);
  const variant = input.variants.find((candidate) => candidate?.kind === "audio-delivery-artifact" && candidate?.url === registration.playbackUrl) || null;
  const completed = job.status === "completed" && Boolean(text(output.sha256) && text(registration.playbackUrl) && variant);
  return {
    jobId: job.id,
    status: job.status,
    profileId: text(contract.profileId) || null,
    masteryJobId: text(source.masteryJobId) || null,
    promotionReceiptId: text(source.promotionReceiptId) || null,
    candidateSha256: text(source.sha256) || null,
    deliverySha256: text(output.sha256) || null,
    playbackUrl: completed ? text(registration.playbackUrl) : null,
    sizeBytes: output.sizeBytes == null ? null : String(output.sizeBytes),
    durationSeconds: Number.isFinite(Number(output.durationSeconds)) ? Number(output.durationSeconds) : null,
    technical: completed ? {
      codec: text(output.codec) || null,
      codecProfile: text(output.codecProfile) || null,
      sampleRateHz: Number(output.sampleRateHz) || null,
      channels: Number(output.channels) || null,
      bitrateBps: Number(output.bitrateBps) || null,
      fastStart: output.fastStart === true,
      completeDecode: output.completeDecode === true,
      integratedLufs: Number(object(output.verificationMeasurement).integratedLufs),
      truePeakDbtp: Number(object(output.verificationMeasurement).truePeakDbtp),
    } : null,
    review: latestReview ? {
      id: latestReview.id,
      decision: latestReview.decision === "APPROVED" ? "approved" : "rejected",
      reviewedAt: iso(latestReview.occurredAt),
      actorEmail: latestReview.actorEmail,
      note: text(latestReview.note) || null,
    } : null,
    promotionStillActive,
    readiness: {
      encodedAndVerified: completed,
      proofListenApproved: completed && promotionStillActive && latestReview?.decision === "APPROVED",
      outputPacketEligible: completed && promotionStillActive && latestReview?.decision === "APPROVED",
      uploadEligible: false,
      publicationEligible: false,
    },
    originalRemainsSourceTruth: true as const,
    outputPacketNotCreated: true as const,
    uploadNotStarted: true as const,
    publicationNotStarted: true as const,
  };
}
