function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function iso(value: unknown) {
  if (value && typeof (value as any).toISOString === "function") {
    return (value as any).toISOString();
  }
  return text(value) || null;
}

export function episodeInventoryAudioMasterCandidate(events: any[]) {
  const latest = Array.isArray(events) ? events[0] || null : null;
  if (!latest) return null;
  const evidence = object(latest.evidenceJson);
  const active = latest.operation === "PROMOTE";
  return {
    active,
    eventId: latest.id,
    jobId: latest.masteryJobId,
    reviewReceiptId: latest.reviewReceiptId,
    operation: text(latest.operation).toLowerCase(),
    profileId: latest.profileId,
    playbackUrl: active ? text(evidence.candidatePlaybackUrl) || null : null,
    reason: text(latest.reason) || null,
    occurredAt: iso(latest.occurredAt),
    actorEmail: latest.actorEmail,
    historicalEventCount: events.length,
    originalRemainsSourceTruth: true as const,
    episodeSpineUnchanged: true as const,
    deliveryEncodingNotCreated: true as const,
    publicationNotStarted: true as const,
  };
}
