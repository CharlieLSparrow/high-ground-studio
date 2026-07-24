export const PROGRAM_EDIT_VERSION = "quipsly-program-edit.v1" as const;

export const PROGRAM_DECISION_KINDS = [
  "primary",
  "secondary",
  "both",
  "skip",
  "primaryWithClip",
  "secondaryWithClip",
  "bothWithClip",
  "custom",
] as const;

export type ProgramDecisionKind = (typeof PROGRAM_DECISION_KINDS)[number];
export type EditActorType = "human" | "agent" | "import";
export type EditSourceRole = "primary" | "secondary" | "clip" | "audio" | "reference";

export type ProgramEditSource = {
  id: string;
  label: string;
  role: EditSourceRole;
  playbackUrl?: string;
  proxyUrl?: string;
  offsetSeconds: number;
  durationSeconds: number;
  syncStatus?: string;
};

export type ProgramDecision = {
  id: string;
  startTime: number;
  kind: ProgramDecisionKind;
  sourceLaneIDs: string[];
  clipLaneID?: string;
  clipMotion?: "playing" | "holdFrame";
  clipHoldSourceTime?: number;
  audioPolicy?: "hostMix" | "selectedSources" | "hostMixAndSelectedSources" | "silence";
  audioSourceLaneIDs?: string[];
  actor?: {
    userId?: string;
    email?: string;
    label?: string;
    type: EditActorType;
  };
  createdAt?: string;
  provenance?: {
    timestampPrecision: "exact" | "before-cutoff";
    createdBefore?: string;
  };
};

export type ProgramEditState = {
  version: typeof PROGRAM_EDIT_VERSION;
  durationSeconds: number;
  sources: ProgramEditSource[];
  listenAudioUrl?: string;
  programDecisions: ProgramDecision[];
};

export type EpisodeDeskEpisode = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
};

export type EpisodeDeskAnnotation = {
  id: string;
  startSeconds: number;
  endSeconds?: number | null;
  kind: string;
  title?: string | null;
  body?: string | null;
  hookKey?: string | null;
  tags: Array<{ id: string; slug: string; label: string }>;
  createdByEmail?: string | null;
  createdByActorType: string;
  createdAt: string;
};

export type EpisodeEditDeskPayload = {
  projectSlug: string;
  episodes: EpisodeDeskEpisode[];
  selectedEpisode: EpisodeDeskEpisode | null;
  baseline: null | {
    id: string;
    label: string;
    version: number;
    durationSeconds: number;
    sourceFingerprint?: string | null;
    syncSummary: Record<string, unknown>;
    importReceipt: Record<string, unknown>;
  };
  branch: null | {
    id: string;
    slug: string;
    name: string;
    headRevision: number;
    updatedAt: string;
  };
  state: ProgramEditState;
  annotations: EpisodeDeskAnnotation[];
  transcript: unknown;
  document: { id: string; title: string } | null;
  canEdit: boolean;
};

export const DECISION_SHORTCUTS: Array<{
  key: string;
  kind: ProgramDecisionKind;
  label: string;
}> = [
  { key: "1", kind: "primary", label: "Charlie" },
  { key: "2", kind: "secondary", label: "Homer" },
  { key: "3", kind: "both", label: "Both" },
  { key: "4", kind: "skip", label: "Skip" },
  { key: "5", kind: "primaryWithClip", label: "Charlie + Clip" },
  { key: "6", kind: "secondaryWithClip", label: "Homer + Clip" },
  { key: "7", kind: "bothWithClip", label: "Both + Clip" },
];

export function decisionAt(decisions: ProgramDecision[], time: number): ProgramDecision | null {
  let result: ProgramDecision | null = null;
  for (const decision of decisions) {
    if (decision.startTime <= time + 0.0001) result = decision;
    else break;
  }
  return result;
}

export function formatEditClock(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe - Math.floor(safe)) * 30);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export function sourceIDsForDecision(kind: ProgramDecisionKind, sources: ProgramEditSource[]): {
  sourceLaneIDs: string[];
  clipLaneID?: string;
} {
  const primary = sources.find((source) => source.role === "primary")?.id;
  const secondary = sources.find((source) => source.role === "secondary")?.id;
  const clip = sources.find((source) => source.role === "clip")?.id;
  const hosts = [primary, secondary].filter((value): value is string => Boolean(value));
  if (kind === "skip") return { sourceLaneIDs: [] };
  if (kind === "primary") return { sourceLaneIDs: primary ? [primary] : hosts.slice(0, 1) };
  if (kind === "secondary") return { sourceLaneIDs: secondary ? [secondary] : hosts.slice(1, 2) };
  if (kind === "both") return { sourceLaneIDs: hosts };
  if (kind === "primaryWithClip") return { sourceLaneIDs: primary ? [primary] : hosts.slice(0, 1), clipLaneID: clip };
  if (kind === "secondaryWithClip") return { sourceLaneIDs: secondary ? [secondary] : hosts.slice(1, 2), clipLaneID: clip };
  if (kind === "bothWithClip") return { sourceLaneIDs: hosts, clipLaneID: clip };
  return { sourceLaneIDs: hosts };
}
