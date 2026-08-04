import { normalizeSessionPurpose } from "@/lib/session-experience";

export type SessionCollaborationContext = {
  project: { id: string; name: string; slug: string } | null;
  episode: { id: string; title: string; slug: string } | null;
  binding: "EPISODE" | "PROJECT" | "STANDALONE";
  episodeRepair?: SessionEpisodeBindingRepairState | null;
  episodeBindingHistory?: Array<{
    id: string;
    action: "BIND" | "REBIND" | "NOOP";
    previousEpisodeSlug: string | null;
    nextEpisodeSlug: string;
    reason: string | null;
    createdAt: string;
  }>;
};

export type SessionEpisodeBindingRepairState = {
  canRepair: boolean;
  roomUpdatedAt: string;
  currentEpisodeProductionId: string | null;
  currentRelationshipInvalid: boolean;
  candidates: Array<{
    id: string;
    slug: string;
    title: string;
    status: string;
    updatedAt: string;
  }>;
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function episodeSlugFromSessionMetadata(purpose: unknown, metadataJson: unknown) {
  if (normalizeSessionPurpose(purpose) !== "PODCAST") return null;
  const value = record(metadataJson).episodeSlug;
  if (typeof value !== "string") return null;
  const slug = value.trim();
  return slug && slug.length <= 200 ? slug : null;
}

export function buildSessionCollaborationContext(input: {
  project?: { id: string; name: string; slug: string } | null;
  episode?: { id: string; title: string; slug: string } | null;
  episodeRepair?: SessionEpisodeBindingRepairState | null;
  episodeBindingHistory?: SessionCollaborationContext["episodeBindingHistory"];
}): SessionCollaborationContext {
  const project = input.project ?? null;
  const episode = project ? input.episode ?? null : null;
  return {
    project,
    episode,
    binding: episode ? "EPISODE" : project ? "PROJECT" : "STANDALONE",
    episodeRepair: input.episodeRepair ?? null,
    episodeBindingHistory: input.episodeBindingHistory ?? [],
  };
}

export function episodeRoomHref(context: SessionCollaborationContext) {
  if (!context.project || !context.episode) return null;
  return `/nests/${encodeURIComponent(context.project.slug)}/episodes/${encodeURIComponent(context.episode.slug)}`;
}
