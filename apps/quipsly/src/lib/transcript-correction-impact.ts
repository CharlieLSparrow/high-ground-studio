export type TranscriptImpactArtifactKind = "note" | "task" | "goal" | "follow-up";

export type TranscriptImpactArtifact = {
  id: string;
  kind: TranscriptImpactArtifactKind;
  label: string;
  status: string | null;
  evidence: unknown[];
};

export type TranscriptImpactState = "current" | "needs-review" | "snapshot-unavailable";

export type TranscriptSegmentImpact = {
  artifactId: string;
  artifactKind: TranscriptImpactArtifactKind;
  label: string;
  status: string | null;
  state: TranscriptImpactState;
  evidenceSnapshotCount: number;
};

type CorrectionSnapshot = {
  segmentId: string;
  acceptedCorrectionId: string | null;
  correctionSnapshotPresent: boolean;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Reads existing Quipsly provenance without treating arbitrary matching IDs as
 * dependencies. Segment anchors count only inside an object subtree explicitly
 * bound to the selected transcript job. A nested transcriptJobId replaces the
 * inherited scope, which keeps packets containing historical receipts honest.
 */
export function transcriptCorrectionSnapshots(
  value: unknown,
  transcriptJobId: string,
) {
  const snapshots: CorrectionSnapshot[] = [];
  let visited = 0;

  function visit(candidate: unknown, inheritedJobMatch: boolean, depth: number) {
    if (candidate == null || depth > 24 || visited >= 20_000) return;
    visited += 1;
    if (Array.isArray(candidate)) {
      for (const entry of candidate) visit(entry, inheritedJobMatch, depth + 1);
      return;
    }
    if (typeof candidate !== "object") return;
    const row = candidate as Record<string, unknown>;
    const declaredJobId = text(row.transcriptJobId);
    const jobMatches = declaredJobId
      ? declaredJobId === transcriptJobId
      : inheritedJobMatch;

    if (jobMatches) {
      const ids = new Set<string>();
      const primaryId = text(row.segmentId);
      if (primaryId) ids.add(primaryId);
      if (Array.isArray(row.segmentIds)) {
        for (const entry of row.segmentIds) {
          const id = text(entry);
          if (id) ids.add(id);
        }
      }
      const correctionSnapshotPresent = Object.prototype.hasOwnProperty.call(
        row,
        "acceptedCorrectionId",
      );
      const acceptedCorrectionId = text(row.acceptedCorrectionId) || null;
      for (const segmentId of ids) {
        snapshots.push({
          segmentId,
          acceptedCorrectionId,
          correctionSnapshotPresent,
        });
      }
    }

    for (const child of Object.values(row)) visit(child, jobMatches, depth + 1);
  }

  visit(value, false, 0);
  return snapshots;
}

export function buildTranscriptCorrectionImpact(input: {
  transcriptJobId: string;
  segments: Array<{ id: string; acceptedCorrectionId: string | null }>;
  artifacts: TranscriptImpactArtifact[];
}) {
  const currentCorrectionBySegment = new Map(
    input.segments.map((segment) => [segment.id, segment.acceptedCorrectionId]),
  );
  const impactsBySegment = new Map<string, TranscriptSegmentImpact[]>();

  for (const artifact of input.artifacts) {
    const snapshots = artifact.evidence.flatMap((evidence) =>
      transcriptCorrectionSnapshots(evidence, input.transcriptJobId));
    const snapshotsBySegment = new Map<string, CorrectionSnapshot[]>();
    for (const snapshot of snapshots) {
      if (!currentCorrectionBySegment.has(snapshot.segmentId)) continue;
      const existing = snapshotsBySegment.get(snapshot.segmentId) ?? [];
      existing.push(snapshot);
      snapshotsBySegment.set(snapshot.segmentId, existing);
    }
    for (const [segmentId, segmentSnapshots] of snapshotsBySegment) {
      const currentCorrectionId = currentCorrectionBySegment.get(segmentId) ?? null;
      const versioned = segmentSnapshots.filter((snapshot) => snapshot.correctionSnapshotPresent);
      const state: TranscriptImpactState = versioned.length === 0
        ? "snapshot-unavailable"
        : versioned.some((snapshot) => snapshot.acceptedCorrectionId === currentCorrectionId)
          ? "current"
          : "needs-review";
      const impact: TranscriptSegmentImpact = {
        artifactId: artifact.id,
        artifactKind: artifact.kind,
        label: artifact.label,
        status: artifact.status,
        state,
        evidenceSnapshotCount: segmentSnapshots.length,
      };
      const existing = impactsBySegment.get(segmentId) ?? [];
      existing.push(impact);
      impactsBySegment.set(segmentId, existing);
    }
  }

  for (const impacts of impactsBySegment.values()) {
    impacts.sort((left, right) =>
      impactStateRank(left.state) - impactStateRank(right.state)
      || left.artifactKind.localeCompare(right.artifactKind)
      || left.label.localeCompare(right.label));
  }

  return impactsBySegment;
}

function impactStateRank(state: TranscriptImpactState) {
  if (state === "needs-review") return 0;
  if (state === "snapshot-unavailable") return 1;
  return 2;
}
