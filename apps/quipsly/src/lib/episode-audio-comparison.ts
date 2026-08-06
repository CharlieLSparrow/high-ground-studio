import type {
  EpisodeAudioActivityLane,
  EpisodeAudioActivityMap,
  EpisodeAudioActivityMoment,
} from "./episode-audio-activity-map";

export type EpisodeAudioComparisonPlaybackSource = {
  assetId: string;
  sourceId: string;
  playbackUrl: string;
};

export type EpisodeAudioComparisonSource = {
  assetId: string;
  sourceId: string;
  title: string;
  participantLabel: string | null;
  role: string;
  alignment: EpisodeAudioActivityLane["alignment"];
  programOffsetSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  playbackUrl: string;
};

export type EpisodeAudioComparisonPlan = {
  schema: "quipsly-episode-audio-comparison-plan-v1";
  momentId: string;
  momentKind: EpisodeAudioActivityMoment["kind"];
  label: string;
  detail: string;
  programStartSeconds: number;
  programEndSeconds: number;
  durationSeconds: number;
  sources: EpisodeAudioComparisonSource[];
  omitted: Array<{ assetId: string; reason: string }>;
  boundaries: {
    protectedSourcePlaybackOnly: true;
    monitorGainDoesNotChangeMedia: true;
    playbackDoesNotConfirmClassification: true;
    candidateAlignmentDoesNotMoveTimeline: true;
  };
};

const MAXIMUM_SOURCES = 4;
const MAXIMUM_REGION_SECONDS = 12;
const MINIMUM_REGION_SECONDS = 2;
const CONTEXT_SECONDS = 1.5;

function candidateLanes(map: EpisodeAudioActivityMap, moment: EpisodeAudioActivityMoment) {
  const requested = new Set(moment.assetIds);
  const lanes = moment.assetIds.length > 0
    ? map.lanes.filter((lane) => requested.has(lane.assetId))
    : map.lanes.filter((lane) => lane.kind === "dialogue" && lane.mixDisposition === "include");
  return lanes.sort((left, right) => {
    const leftClock = left.alignment === "program-clock" ? 0 : 1;
    const rightClock = right.alignment === "program-clock" ? 0 : 1;
    return leftClock - rightClock || (left.participantLabel || left.title).localeCompare(right.participantLabel || right.title);
  });
}

export function buildEpisodeAudioComparisonPlan(input: {
  map: EpisodeAudioActivityMap;
  moment: EpisodeAudioActivityMoment;
  playbackSources: EpisodeAudioComparisonPlaybackSource[];
}): EpisodeAudioComparisonPlan | null {
  if (!input.map.programClock) return null;
  const playbackByTrack = new Map(input.playbackSources.map((source) => [`${source.assetId}:${source.sourceId}`, source]));
  const omitted: EpisodeAudioComparisonPlan["omitted"] = [];
  const allEligible = candidateLanes(input.map, input.moment).flatMap((lane) => {
    const playback = playbackByTrack.get(`${lane.assetId}:${lane.sourceId}`);
    if (lane.programOffsetSeconds === null) {
      omitted.push({ assetId: lane.assetId, reason: "No qualified mapping to the current program clock." });
      return [];
    }
    if (!lane.sourceDurationSeconds || lane.sourceDurationSeconds <= 0) {
      omitted.push({ assetId: lane.assetId, reason: "No complete source duration is available." });
      return [];
    }
    if (!playback?.playbackUrl) {
      omitted.push({ assetId: lane.assetId, reason: "Protected playback is unavailable for this retained source." });
      return [];
    }
    return [{ lane, playback }];
  });
  for (const candidate of allEligible.slice(MAXIMUM_SOURCES)) {
    omitted.push({ assetId: candidate.lane.assetId, reason: "The comparison desk is limited to four simultaneous retained sources." });
  }
  const eligible = allEligible.slice(0, MAXIMUM_SOURCES);
  if (eligible.length === 0) return null;
  if (["possible-participant-overlap", "same-participant-multidevice"].includes(input.moment.kind) && eligible.length < 2) return null;

  const requestedDuration = Math.min(
    MAXIMUM_REGION_SECONDS,
    Math.max(MINIMUM_REGION_SECONDS, input.moment.endSeconds - input.moment.startSeconds + CONTEXT_SECONDS * 2),
  );
  const center = (input.moment.startSeconds + input.moment.endSeconds) / 2;
  const requestedStart = Math.max(0, center - requestedDuration / 2);
  const requestedEnd = Math.min(input.map.programDurationSeconds, requestedStart + requestedDuration);
  const commonStart = Math.max(requestedStart, ...eligible.map(({ lane }) => lane.programOffsetSeconds!));
  const commonEnd = Math.min(requestedEnd, ...eligible.map(({ lane }) => lane.programOffsetSeconds! + lane.sourceDurationSeconds!));
  if (!Number.isFinite(commonStart) || !Number.isFinite(commonEnd) || commonEnd - commonStart < 0.5) return null;

  const sources = eligible.map(({ lane, playback }) => ({
    assetId: lane.assetId,
    sourceId: lane.sourceId,
    title: lane.title,
    participantLabel: lane.participantLabel,
    role: lane.role,
    alignment: lane.alignment,
    programOffsetSeconds: lane.programOffsetSeconds!,
    sourceStartSeconds: Number((commonStart - lane.programOffsetSeconds!).toFixed(3)),
    sourceEndSeconds: Number((commonEnd - lane.programOffsetSeconds!).toFixed(3)),
    playbackUrl: playback.playbackUrl,
  }));
  return {
    schema: "quipsly-episode-audio-comparison-plan-v1",
    momentId: input.moment.id,
    momentKind: input.moment.kind,
    label: input.moment.label,
    detail: input.moment.detail,
    programStartSeconds: Number(commonStart.toFixed(3)),
    programEndSeconds: Number(commonEnd.toFixed(3)),
    durationSeconds: Number((commonEnd - commonStart).toFixed(3)),
    sources,
    omitted,
    boundaries: {
      protectedSourcePlaybackOnly: true,
      monitorGainDoesNotChangeMedia: true,
      playbackDoesNotConfirmClassification: true,
      candidateAlignmentDoesNotMoveTimeline: true,
    },
  };
}
