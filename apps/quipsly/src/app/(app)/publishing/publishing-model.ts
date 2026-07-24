export type PublishingTone = "neutral" | "positive" | "warning" | "danger";

export type PublishingAttemptRecord = {
  id: string;
  destination: string;
  status: string;
  requestedByEmail: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  errorRecorded: boolean;
};

export type PublishingArtifactRecord = {
  id: string;
  projectId: string;
  outputPacketId: string | null;
  projectName: string;
  projectSlug: string;
  destination: string;
  status: string;
  externalId: string | null;
  publicUrl: string | null;
  publicUrlHost: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublishingPacketRecord = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  status: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  documentTitle: string | null;
  productionRoomTitle: string | null;
  createdByEmail: string | null;
  approvedByEmail: string | null;
  approvedAt: string | null;
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineageKeys: string[];
  attempts: PublishingAttemptRecord[];
  artifacts: PublishingArtifactRecord[];
};

export type PublishingRunwaySnapshot =
  | {
      state: "ready";
      authState: "signed-in" | "local-operator";
      accessibleNestCount: number;
      packets: PublishingPacketRecord[];
      unmatchedArtifacts: PublishingArtifactRecord[];
      attemptCount: number;
      artifactCount: number;
      plannedCount: number;
    }
  | {
      state: "unavailable";
      authState: "signed-in" | "local-operator";
      message: string;
    }
  | {
      state: "signed-out";
      message: string;
    };

export function humanizePublishingValue(value: string | null | undefined) {
  const normalized = (value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[_-]+/g, " ");
  if (!normalized) return "Not recorded";
  return normalized.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

export function lineageKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>)
    .filter((key) => key.trim().length > 0)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 8);
}

export function normalizeRecordedPublicUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !parsed.hostname) {
      return null;
    }
    return {
      url: parsed.toString(),
      host: parsed.hostname,
    };
  } catch {
    return null;
  }
}

export function describePacketReadiness(
  status: string,
  approvedAt: string | null,
  approvedByEmail: string | null,
): { label: string; detail: string; tone: PublishingTone } {
  if (approvedAt) {
    return {
      label: "Approval recorded",
      detail: approvedByEmail
        ? `Quipsly recorded internal packet approval by ${approvedByEmail}. This is not an external publication receipt.`
        : "Quipsly recorded an internal packet approval timestamp without an approving actor. This is not an external publication receipt.",
      tone: "positive",
    };
  }

  const normalized = status.trim().toLocaleLowerCase().replace(/[\s_]+/g, "-");
  if (["ready", "packet-ready", "prepared"].includes(normalized)) {
    return {
      label: "Packet marked ready",
      detail: "The stored packet status says it is ready for review or handoff. No approval timestamp is recorded.",
      tone: "warning",
    };
  }
  if (["failed", "blocked", "rejected"].includes(normalized)) {
    return {
      label: "Packet needs attention",
      detail: "The stored packet status is blocked or failed. No external action is implied.",
      tone: "danger",
    };
  }
  if (["draft", "working", "in-progress", "review"].includes(normalized)) {
    return {
      label: "Working packet",
      detail: "This is persisted internal work. It has no recorded approval or publication receipt.",
      tone: "neutral",
    };
  }
  return {
    label: "Stored packet state",
    detail: "Quipsly has a packet record, but its status does not establish approval or external publication.",
    tone: "neutral",
  };
}

export function describeAttemptStatus(status: string): {
  label: string;
  detail: string;
  tone: PublishingTone;
} {
  const normalized = status.trim().toLocaleLowerCase().replace(/[\s_]+/g, "-");
  if (["failed", "error", "rejected", "canceled", "cancelled"].includes(normalized)) {
    return {
      label: "Attempt failed",
      detail: "A provider attempt failed. The source packet and any other destination remain separate.",
      tone: "danger",
    };
  }
  if (["completed", "succeeded", "success"].includes(normalized)) {
    return {
      label: "Attempt completed",
      detail: "The request ledger says the attempt completed. External publication still requires an artifact receipt.",
      tone: "positive",
    };
  }
  if (["running", "uploading", "processing", "started"].includes(normalized)) {
    return {
      label: "Attempt in progress",
      detail: "The provider-request ledger shows active work. This is not a published state.",
      tone: "warning",
    };
  }
  if (["queued", "pending"].includes(normalized)) {
    return {
      label: "Attempt queued",
      detail: "Quipsly recorded a pending request. This is not a provider schedule or publication receipt.",
      tone: "neutral",
    };
  }
  return {
    label: "Attempt status recorded",
    detail: "The request ledger has a status, but Quipsly does not infer an external outcome from it.",
    tone: "neutral",
  };
}

export function describeArtifactEvidence(artifact: PublishingArtifactRecord): {
  label: string;
  detail: string;
  tone: PublishingTone;
} {
  if (artifact.publicUrl && artifact.publicUrlHost) {
    return {
      label: "Recorded public URL",
      detail: `The artifact receipt points to ${artifact.publicUrlHost}. This page has not rechecked the live response.`,
      tone: "positive",
    };
  }
  if (artifact.externalId) {
    return {
      label: "Provider artifact ID recorded",
      detail: "The receipt has a provider identifier but no safe public HTTP(S) URL.",
      tone: "positive",
    };
  }
  if (artifact.publishedAt) {
    return {
      label: "Publication timestamp recorded",
      detail: "The receipt has a publication time but no provider ID or safe public URL to open.",
      tone: "warning",
    };
  }
  return {
    label: "Artifact row recorded",
    detail: "No provider ID, publication timestamp, or safe public URL is present, so external delivery is not verifiable here.",
    tone: "neutral",
  };
}
