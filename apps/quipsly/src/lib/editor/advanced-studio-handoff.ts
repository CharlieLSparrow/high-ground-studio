import type { EpisodeEditDeskPayload } from "./program-edit-contract";

export const ADVANCED_STUDIO_HANDOFF_SCHEMA = "quipsly-episode-studio-handoff-v1" as const;

export type AdvancedStudioHandoffRequest = {
  schema: typeof ADVANCED_STUDIO_HANDOFF_SCHEMA;
  projectSlug: string;
  episodeSlug: string;
  branchId: string;
  branchRevision: number;
  branchFingerprint: string;
  timelineFingerprintSha256: string;
  sourceProjectionFingerprint: string;
  sequenceAtSeconds: number;
  storyCardId: string | null;
  storyPlacementId: string | null;
};

export type AdvancedStudioHandoffValidation =
  | { status: "verified"; request: AdvancedStudioHandoffRequest }
  | { status: "stale"; reason: string };

type SearchParamsReader = Pick<URLSearchParams, "get">;

function boundedIdentity(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized && normalized.length <= 240 ? normalized : null;
}

function sha256Identity(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function boundedSequenceSeconds(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 86_400
    ? Math.round(parsed * 1_000) / 1_000
    : null;
}

function positiveRevision(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function advancedStudioHandoffHref(input: {
  projectSlug: string;
  episodeSlug: string;
  branch: EpisodeEditDeskPayload["branch"];
  timelineFingerprintSha256: string | null;
  sourceProjectionFingerprint?: string | null;
  sequenceAtSeconds: number;
  storyCardId?: string | null;
  storyPlacementId?: string | null;
}) {
  const params = new URLSearchParams({
    project: input.projectSlug,
    episode: input.episodeSlug,
  });
  const branchFingerprint = sha256Identity(input.branch?.stateFingerprint);
  const timelineFingerprintSha256 = sha256Identity(
    input.timelineFingerprintSha256,
  );
  const sourceProjectionFingerprint = sha256Identity(
    input.sourceProjectionFingerprint,
  );
  if (
    input.branch &&
    branchFingerprint &&
    timelineFingerprintSha256 &&
    sourceProjectionFingerprint
  ) {
    params.set("handoff", ADVANCED_STUDIO_HANDOFF_SCHEMA);
    params.set("editBranch", input.branch.id);
    params.set("editRevision", String(input.branch.headRevision));
    params.set("editFingerprint", branchFingerprint);
    params.set("timelineSha256", timelineFingerprintSha256);
    params.set("sourceFingerprint", sourceProjectionFingerprint);
    params.set(
      "sequenceAt",
      String(Math.round(Math.max(0, input.sequenceAtSeconds) * 1_000) / 1_000),
    );
    if (input.storyCardId) params.set("storyCard", input.storyCardId);
    if (input.storyPlacementId)
      params.set("storyPlacement", input.storyPlacementId);
  }
  return `/editor?${params.toString()}`;
}

export function parseAdvancedStudioHandoff(
  params: SearchParamsReader,
): AdvancedStudioHandoffRequest | null {
  if (params.get("handoff") !== ADVANCED_STUDIO_HANDOFF_SCHEMA) return null;
  const projectSlug = boundedIdentity(params.get("project"));
  const episodeSlug = boundedIdentity(params.get("episode"));
  const branchId = boundedIdentity(params.get("editBranch"));
  const branchRevision = positiveRevision(params.get("editRevision"));
  const branchFingerprint = sha256Identity(params.get("editFingerprint"));
  const timelineFingerprintSha256 = sha256Identity(
    params.get("timelineSha256"),
  );
  const sourceProjectionFingerprint = sha256Identity(
    params.get("sourceFingerprint"),
  );
  const sequenceAtSeconds = boundedSequenceSeconds(params.get("sequenceAt"));
  if (
    !projectSlug ||
    !episodeSlug ||
    !branchId ||
    branchRevision === null ||
    !branchFingerprint ||
    !timelineFingerprintSha256 ||
    !sourceProjectionFingerprint ||
    sequenceAtSeconds === null
  ) {
    return null;
  }
  return {
    schema: ADVANCED_STUDIO_HANDOFF_SCHEMA,
    projectSlug,
    episodeSlug,
    branchId,
    branchRevision,
    branchFingerprint,
    timelineFingerprintSha256,
    sourceProjectionFingerprint,
    sequenceAtSeconds,
    storyCardId: boundedIdentity(params.get("storyCard")),
    storyPlacementId: boundedIdentity(params.get("storyPlacement")),
  };
}

export function validateAdvancedStudioHandoff(
  request: AdvancedStudioHandoffRequest,
  payload: Pick<
    EpisodeEditDeskPayload,
    "selectedEpisode" | "branch" | "timelineFingerprintSha256" | "state"
  >,
): AdvancedStudioHandoffValidation {
  if (payload.selectedEpisode?.slug !== request.episodeSlug) {
    return {
      status: "stale",
      reason:
        "The authenticated Episode projection does not match this handoff. No sequence focus was applied.",
    };
  }
  if (!payload.branch) {
    return {
      status: "stale",
      reason:
        "The shared edit branch is no longer available. Return to the Episode workspace before continuing.",
    };
  }
  if (payload.branch.id !== request.branchId) {
    return {
      status: "stale",
      reason:
        "The shared edit branch identity changed. Advanced Studio refused to guess another branch.",
    };
  }
  if (
    payload.branch.headRevision !== request.branchRevision ||
    payload.branch.stateFingerprint !== request.branchFingerprint
  ) {
    return {
      status: "stale",
      reason:
        "The shared edit changed after this handoff was opened. Refresh from the Episode workspace before applying its sequence focus.",
    };
  }
  if (
    payload.timelineFingerprintSha256 !== request.timelineFingerprintSha256
  ) {
    return {
      status: "stale",
      reason:
        "The canonical Episode timeline changed after this handoff was opened. No stale focus or edit decision was applied.",
    };
  }
  if (
    payload.state.sourceProjectionFingerprint !==
    request.sourceProjectionFingerprint
  ) {
    return {
      status: "stale",
      reason:
        "The canonical Episode source projection changed after this handoff was opened. Advanced Studio did not substitute different media.",
    };
  }
  return { status: "verified", request };
}

export function advancedStudioReturnHref(
  request: AdvancedStudioHandoffRequest,
) {
  const params = new URLSearchParams({ mode: "edit" });
  if (request.storyCardId) params.set("storyCard", request.storyCardId);
  if (request.storyPlacementId)
    params.set("storyPlacement", request.storyPlacementId);
  return `/nests/${encodeURIComponent(request.projectSlug)}/episodes/${encodeURIComponent(request.episodeSlug)}?${params.toString()}`;
}
