import type {
  EpisodeAudioProgram,
  EpisodeAudioProgramActivityEvidence,
  EpisodeAudioProgramTrack,
} from "./episode-audio-program";

export type EpisodeAudioActivityLane = {
  assetId: string;
  sourceId: string;
  title: string;
  kind: EpisodeAudioProgramTrack["kind"];
  role: string;
  participantId: string | null;
  participantLabel: string | null;
  mixDisposition: EpisodeAudioProgramTrack["mixDisposition"];
  alignment: "program-clock" | "qualified-candidate" | "unavailable";
  programOffsetSeconds: number | null;
  sourceDurationSeconds: number | null;
  activityThresholdDbfs: number | null;
  evidenceJobId: string | null;
  transcriptEvidenceJobId: string | null;
  transcriptWordCount: number;
  cells: Array<{
    index: number;
    programStartSeconds: number;
    programEndSeconds: number;
    sourceSeconds: number | null;
    rmsDbfs: number | null;
    intensity: number;
    energyActive: boolean;
    clippingObserved: boolean;
    providerWordActive: boolean;
  }>;
  agreement: { comparableCellCount: number; agreementCellCount: number; bothActiveCellCount: number; energyOnlyCellCount: number; transcriptOnlyCellCount: number; agreementRatio: number | null };
};

export type EpisodeAudioActivityMomentKind =
  | "possible-participant-overlap"
  | "same-participant-multidevice"
  | "unassigned-energy"
  | "dialogue-gap";

export type EpisodeAudioActivityMoment = {
  id: string;
  kind: EpisodeAudioActivityMomentKind;
  startSeconds: number;
  endSeconds: number;
  label: string;
  detail: string;
  assetIds: string[];
  requiresListening: true;
};

export type EpisodeAudioActivityMap = {
  schema: "quipsly-episode-audio-activity-map-v1";
  programFingerprintSha256: string | null;
  programClock: { assetId: string; sourceId: string } | null;
  programDurationSeconds: number;
  resolution: { cellCount: number; secondsPerCell: number };
  lanes: EpisodeAudioActivityLane[];
  moments: EpisodeAudioActivityMoment[];
  coverage: {
    trackCount: number;
    profiledTrackCount: number;
    plottedTrackCount: number;
    missingProfileCount: number;
    unalignedProfileCount: number;
    unidentifiedDialogueTrackCount: number;
    transcribedTrackCount: number;
    comparableTranscriptEnergyTrackCount: number;
  };
  transcriptEnergyAgreement: { comparableCellCount: number; agreementCellCount: number; bothActiveCellCount: number; energyOnlyCellCount: number; transcriptOnlyCellCount: number; agreementRatio: number | null };
  summary: {
    possibleOverlapCount: number;
    sameParticipantMultideviceCount: number;
    unassignedEnergyCount: number;
    dialogueGapCount: number;
  };
  boundaries: {
    energyIsNotSpeech: true;
    overlapRequiresListening: true;
    candidateAlignmentDoesNotMoveTimeline: true;
    noMixAutomationWritten: true;
    sourceBytesRemainImmutable: true;
    providerWordTimingIsNotVoiceActivity: true;
    agreementIsNotTranscriptionAccuracy: true;
  };
};

const CELL_COUNT = 180;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return -96;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)))];
}

export function episodeAudioEnergyActivityThreshold(evidence: EpisodeAudioProgramActivityEvidence) {
  const levels = evidence.waveform.map((window) => window.rmsDbfs).filter(Number.isFinite);
  const noiseFloor = percentile(levels, 0.2);
  const foreground = percentile(levels, 0.7);
  return Number(clamp(Math.max(noiseFloor + 9, foreground - 12, evidence.nearSilenceDbfs + 12), -56, -22).toFixed(3));
}

function alignmentFor(track: EpisodeAudioProgramTrack, clock: { assetId: string; sourceId: string } | null) {
  if (!clock) return { kind: "unavailable" as const, offset: null };
  if (track.assetId === clock.assetId && track.sourceId === clock.sourceId) return { kind: "program-clock" as const, offset: 0 };
  const alignment = track.processing.alignment;
  if (
    alignment.status === "completed"
    && alignment.integrityVerified
    && alignment.qualifiedForReview === true
    && alignment.spineAssetId === clock.assetId
    && alignment.openingOffsetSeconds !== null
    && Number.isFinite(alignment.openingOffsetSeconds)
  ) return { kind: "qualified-candidate" as const, offset: alignment.openingOffsetSeconds };
  return { kind: "unavailable" as const, offset: null };
}

function windowAt(evidence: EpisodeAudioProgramActivityEvidence, sourceSeconds: number) {
  return evidence.waveform.find((window) => sourceSeconds >= window.startSeconds && sourceSeconds < window.startSeconds + window.durationSeconds) ?? null;
}

function wordActiveAt(track: EpisodeAudioProgramTrack, sourceStartSeconds: number, sourceEndSeconds: number) {
  return Boolean(track.transcriptActivityEvidence?.words.some((word) => word.endSeconds > sourceStartSeconds && word.startSeconds < sourceEndSeconds));
}

function agreement(cells: EpisodeAudioActivityLane["cells"], comparable: boolean) {
  if (!comparable) return { comparableCellCount: 0, agreementCellCount: 0, bothActiveCellCount: 0, energyOnlyCellCount: 0, transcriptOnlyCellCount: 0, agreementRatio: null };
  const coveredCells = cells.filter((cell) => cell.sourceSeconds !== null);
  const bothActiveCellCount = coveredCells.filter((cell) => cell.energyActive && cell.providerWordActive).length;
  const energyOnlyCellCount = coveredCells.filter((cell) => cell.energyActive && !cell.providerWordActive).length;
  const transcriptOnlyCellCount = coveredCells.filter((cell) => !cell.energyActive && cell.providerWordActive).length;
  const comparableCellCount = coveredCells.length;
  const agreementCellCount = comparableCellCount - energyOnlyCellCount - transcriptOnlyCellCount;
  return { comparableCellCount, agreementCellCount, bothActiveCellCount, energyOnlyCellCount, transcriptOnlyCellCount, agreementRatio: comparableCellCount ? agreementCellCount / comparableCellCount : null };
}

function momentText(kind: EpisodeAudioActivityMomentKind, laneLabels: string[]) {
  if (kind === "possible-participant-overlap") return {
    label: "Possible participant overlap",
    detail: `Measured energy is concurrent on assigned dialogue tracks for ${laneLabels.join(" and ")}. Listen before calling this crosstalk or an edit problem.`,
  };
  if (kind === "same-participant-multidevice") return {
    label: "Same-person multi-device energy",
    detail: `${laneLabels.join(" and ")} carry concurrent measured energy for one assigned participant. This may be expected redundancy, bleed, or a useful sync comparison.`,
  };
  if (kind === "unassigned-energy") return {
    label: "Active energy needs identity",
    detail: `${laneLabels.join(" and ")} contain measured energy but do not have a canonical participant assignment.`,
  };
  return {
    label: "Possible dialogue gap",
    detail: "No included dialogue track crossed its own measured-energy threshold. Silence, a dropout, or quiet speech must be distinguished by listening.",
  };
}

function buildMoments(lanes: EpisodeAudioActivityLane[], secondsPerCell: number) {
  const flags = Array.from({ length: CELL_COUNT }, (_, index) => {
    const active = lanes.filter((lane) => lane.cells[index]?.energyActive);
    const activeIncludedDialogue = active.filter((lane) => lane.mixDisposition === "include" && lane.kind === "dialogue");
    const identified = activeIncludedDialogue.filter((lane) => lane.participantId);
    const participants = new Set(identified.map((lane) => lane.participantId));
    const repeatedParticipant = [...participants].find((participantId) => identified.filter((lane) => lane.participantId === participantId).length > 1) ?? null;
    const values: Array<{ kind: EpisodeAudioActivityMomentKind; lanes: EpisodeAudioActivityLane[] }> = [];
    if (participants.size > 1) values.push({ kind: "possible-participant-overlap", lanes: identified });
    if (repeatedParticipant) values.push({ kind: "same-participant-multidevice", lanes: identified.filter((lane) => lane.participantId === repeatedParticipant) });
    const unassigned = activeIncludedDialogue.filter((lane) => !lane.participantId);
    if (unassigned.length) values.push({ kind: "unassigned-energy", lanes: unassigned });
    if (activeIncludedDialogue.length === 0) values.push({ kind: "dialogue-gap", lanes: [] });
    return values;
  });
  const moments: EpisodeAudioActivityMoment[] = [];
  for (const kind of ["possible-participant-overlap", "same-participant-multidevice", "unassigned-energy", "dialogue-gap"] as const) {
    let start = -1;
    let laneIds = new Set<string>();
    const finish = (endIndex: number) => {
      if (start < 0) return;
      const duration = (endIndex - start) * secondsPerCell;
      if (kind === "dialogue-gap" && duration < Math.max(2, secondsPerCell)) { start = -1; laneIds = new Set(); return; }
      const involved = lanes.filter((lane) => laneIds.has(lane.assetId));
      const labels = involved.map((lane) => lane.participantLabel || lane.title);
      const copy = momentText(kind, labels);
      moments.push({
        id: `${kind}-${start}-${endIndex}`,
        kind,
        startSeconds: Number((start * secondsPerCell).toFixed(3)),
        endSeconds: Number((endIndex * secondsPerCell).toFixed(3)),
        label: copy.label,
        detail: copy.detail,
        assetIds: [...laneIds].sort(),
        requiresListening: true,
      });
      start = -1;
      laneIds = new Set();
    };
    for (let index = 0; index <= flags.length; index += 1) {
      const match = flags[index]?.find((flag) => flag.kind === kind) ?? null;
      if (match) {
        if (start < 0) start = index;
        for (const lane of match.lanes) laneIds.add(lane.assetId);
      } else finish(index);
    }
  }
  return moments.sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind)).slice(0, 2_000);
}

export function buildEpisodeAudioActivityMap(program: EpisodeAudioProgram): EpisodeAudioActivityMap {
  const clockDecision = program.activeDecisions.find((decision) => decision.kind === "program-clock") ?? null;
  const programClock = clockDecision ? { assetId: clockDecision.assetId, sourceId: clockDecision.sourceId } : null;
  const trackKey = (track: Pick<EpisodeAudioProgramTrack, "assetId" | "sourceId">) => `${track.assetId}:${track.sourceId}`;
  const alignment = new Map(program.tracks.map((track) => [trackKey(track), alignmentFor(track, programClock)]));
  const clockTrack = program.tracks.find((track) => track.assetId === programClock?.assetId && track.sourceId === programClock.sourceId) ?? null;
  const eligible = program.tracks.filter((track) => track.activityEvidence && alignment.get(trackKey(track))?.offset !== null);
  const programDurationSeconds = Math.max(
    0.001,
    clockTrack?.activityEvidence?.durationSeconds ?? 0,
    ...eligible.map((track) => (alignment.get(trackKey(track))?.offset ?? 0) + (track.activityEvidence?.durationSeconds ?? 0)),
  );
  const secondsPerCell = programDurationSeconds / CELL_COUNT;
  const lanes = program.tracks.map((track): EpisodeAudioActivityLane => {
    const evidence = track.activityEvidence;
    const aligned = alignment.get(trackKey(track)) ?? { kind: "unavailable" as const, offset: null };
    const threshold = evidence ? episodeAudioEnergyActivityThreshold(evidence) : null;
    const cells = Array.from({ length: CELL_COUNT }, (_, index) => {
      const programStartSeconds = index * secondsPerCell;
      const programEndSeconds = (index + 1) * secondsPerCell;
      const sourceSeconds = aligned.offset === null ? null : (programStartSeconds + programEndSeconds) / 2 - aligned.offset;
      const sourceStartSeconds = aligned.offset === null ? null : programStartSeconds - aligned.offset;
      const sourceEndSeconds = aligned.offset === null ? null : programEndSeconds - aligned.offset;
      const window = evidence && sourceSeconds !== null && sourceSeconds >= 0 ? windowAt(evidence, sourceSeconds) : null;
      return {
        index,
        programStartSeconds,
        programEndSeconds,
        sourceSeconds: window ? sourceSeconds : null,
        rmsDbfs: window?.rmsDbfs ?? null,
        intensity: window ? clamp((window.rmsDbfs - evidence!.nearSilenceDbfs) / Math.max(1, 0 - evidence!.nearSilenceDbfs), 0, 1) : 0,
        energyActive: Boolean(window && threshold !== null && window.rmsDbfs >= threshold),
        clippingObserved: Boolean(window && window.clippedFrameCount > 0),
        providerWordActive: Boolean(sourceStartSeconds !== null && sourceEndSeconds !== null && sourceEndSeconds >= 0 && wordActiveAt(track, Math.max(0, sourceStartSeconds), Math.max(0, sourceEndSeconds))),
      };
    });
    const comparable = Boolean(evidence && track.transcriptActivityEvidence && aligned.offset !== null);
    return {
      assetId: track.assetId,
      sourceId: track.sourceId,
      title: track.title,
      kind: track.kind,
      role: track.role,
      participantId: track.participantId,
      participantLabel: track.participantLabel,
      mixDisposition: track.mixDisposition,
      alignment: aligned.kind,
      programOffsetSeconds: aligned.offset,
      sourceDurationSeconds: evidence?.durationSeconds ?? track.durationSeconds,
      activityThresholdDbfs: threshold,
      evidenceJobId: evidence?.jobId ?? null,
      transcriptEvidenceJobId: track.transcriptActivityEvidence?.jobId ?? null,
      transcriptWordCount: track.transcriptActivityEvidence?.timedWordCount ?? 0,
      cells,
      agreement: agreement(cells, comparable),
    };
  });
  const plottedLanes = lanes.filter((lane) => lane.evidenceJobId && lane.programOffsetSeconds !== null);
  const moments = programClock ? buildMoments(plottedLanes, secondsPerCell) : [];
  const comparableLanes = lanes.filter((lane) => lane.agreement.comparableCellCount > 0);
  const aggregateAgreement = comparableLanes.reduce((total, lane) => ({
    comparableCellCount: total.comparableCellCount + lane.agreement.comparableCellCount,
    agreementCellCount: total.agreementCellCount + lane.agreement.agreementCellCount,
    bothActiveCellCount: total.bothActiveCellCount + lane.agreement.bothActiveCellCount,
    energyOnlyCellCount: total.energyOnlyCellCount + lane.agreement.energyOnlyCellCount,
    transcriptOnlyCellCount: total.transcriptOnlyCellCount + lane.agreement.transcriptOnlyCellCount,
  }), { comparableCellCount: 0, agreementCellCount: 0, bothActiveCellCount: 0, energyOnlyCellCount: 0, transcriptOnlyCellCount: 0 });
  return {
    schema: "quipsly-episode-audio-activity-map-v1",
    programFingerprintSha256: program.fingerprintSha256,
    programClock,
    programDurationSeconds,
    resolution: { cellCount: CELL_COUNT, secondsPerCell },
    lanes,
    moments,
    coverage: {
      trackCount: program.tracks.length,
      profiledTrackCount: program.tracks.filter((track) => track.activityEvidence).length,
      plottedTrackCount: plottedLanes.length,
      missingProfileCount: program.tracks.filter((track) => !track.activityEvidence).length,
      unalignedProfileCount: program.tracks.filter((track) => track.activityEvidence && alignment.get(trackKey(track))?.offset === null).length,
      unidentifiedDialogueTrackCount: program.tracks.filter((track) => track.kind === "dialogue" && !track.participantId).length,
      transcribedTrackCount: program.tracks.filter((track) => track.transcriptActivityEvidence).length,
      comparableTranscriptEnergyTrackCount: comparableLanes.length,
    },
    transcriptEnergyAgreement: { ...aggregateAgreement, agreementRatio: aggregateAgreement.comparableCellCount ? aggregateAgreement.agreementCellCount / aggregateAgreement.comparableCellCount : null },
    summary: {
      possibleOverlapCount: moments.filter((moment) => moment.kind === "possible-participant-overlap").length,
      sameParticipantMultideviceCount: moments.filter((moment) => moment.kind === "same-participant-multidevice").length,
      unassignedEnergyCount: moments.filter((moment) => moment.kind === "unassigned-energy").length,
      dialogueGapCount: moments.filter((moment) => moment.kind === "dialogue-gap").length,
    },
    boundaries: { energyIsNotSpeech: true, overlapRequiresListening: true, candidateAlignmentDoesNotMoveTimeline: true, noMixAutomationWritten: true, sourceBytesRemainImmutable: true, providerWordTimingIsNotVoiceActivity: true, agreementIsNotTranscriptionAccuracy: true },
  };
}
