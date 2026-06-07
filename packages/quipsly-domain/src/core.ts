export type QuipslyIsoDate = string;
export type QuipslyJsonRecord = Record<string, unknown>;

export const QUIPSLY_PRIMITIVE_KINDS = [
  "nest",
  "document",
  "source-unit",
  "asset",
  "asset-variant",
  "tag",
  "span",
  "annotation",
  "assistant-action",
  "production-room",
  "timeline",
  "output-packet",
  "workflow-job",
  "published-artifact",
  "analytics-snapshot",
] as const;

export type QuipslyPrimitiveKind = (typeof QUIPSLY_PRIMITIVE_KINDS)[number];

export const QUIPSLY_NEST_KINDS = [
  "home",
  "writing",
  "study",
  "production",
  "research",
  "course",
  "gallery",
  "fiction",
  "mixed",
] as const;

export type QuipslyNestKind = (typeof QUIPSLY_NEST_KINDS)[number];

export const QUIPSLY_WORKFLOW_LANES = [
  "intake",
  "understanding",
  "creation",
  "production",
  "publishing",
  "analytics",
] as const;

export type QuipslyWorkflowLane = (typeof QUIPSLY_WORKFLOW_LANES)[number];

export const QUIPSLY_ACCESS_ACTIONS = ["read", "write", "manage"] as const;
export type QuipslyAccessAction = (typeof QUIPSLY_ACCESS_ACTIONS)[number];

export const QUIPSLY_ACCESS_ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;
export type QuipslyAccessRole = (typeof QUIPSLY_ACCESS_ROLES)[number];

export type QuipslyActorRef = {
  readonly userId?: string;
  readonly email: string;
  readonly name?: string;
  readonly source?: "web-session" | "native-device-session" | "service" | "import" | "unknown";
};

export type QuipslyNestRef = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly kind: QuipslyNestKind;
};

export type QuipslyDocumentRef = {
  readonly id: string;
  readonly stableId: string;
  readonly nestSlug: string;
  readonly title: string;
  readonly kind?: string;
};

export type QuipslySourceUnitKind =
  | "book"
  | "chapter"
  | "article"
  | "web-page"
  | "pdf"
  | "transcript"
  | "video"
  | "audio"
  | "image"
  | "research-photo"
  | "course-page"
  | "quote-source"
  | "manual-note"
  | "unknown";

export type QuipslySourceUnitRef = {
  readonly id: string;
  readonly nestSlug: string;
  readonly kind: QuipslySourceUnitKind;
  readonly title: string;
  readonly sourceUrl?: string;
  readonly documentId?: string;
  readonly assetId?: string;
};

export type QuipslyAssetKind =
  | "audio"
  | "video"
  | "image"
  | "document"
  | "pdf"
  | "web-page"
  | "youtube-reference"
  | "render-output"
  | "dataset-item"
  | "other";

export type QuipslyAssetRef = {
  readonly id: string;
  readonly filename: string;
  readonly kind: QuipslyAssetKind;
  readonly url?: string;
  readonly mimeType?: string;
  readonly durationSeconds?: number;
  readonly attachedNestSlugs?: readonly string[];
};

export type QuipslyAssetVariantKind =
  | "raw"
  | "proxy"
  | "thumbnail"
  | "transcript"
  | "waveform"
  | "render"
  | "metadata"
  | "analysis";

export type QuipslyJobType =
  | "asset-probe"
  | "asset-proxy"
  | "asset-thumbnail"
  | "asset-upload"
  | "asset-register"
  | "transcript"
  | "file-triage"
  | "sync-suggestion"
  | "render"
  | "publish"
  | "analytics-sync"
  | "embedding"
  | "ml-labeling"
  | "ml-training"
  | "assistant-action";

export type QuipslyJobStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "held"
  | "canceled";

export type QuipslyWorkflowJob = {
  readonly id: string;
  readonly nestSlug?: string;
  readonly type: QuipslyJobType;
  readonly status: QuipslyJobStatus;
  readonly assetId?: string;
  readonly productionRoomId?: string;
  readonly outputPacketId?: string;
  readonly startedAt?: QuipslyIsoDate;
  readonly completedAt?: QuipslyIsoDate;
  readonly error?: string;
  readonly result?: QuipslyJsonRecord;
};

export type QuipslyProductionRoomKind =
  | "episode"
  | "podcast"
  | "video"
  | "course-lesson"
  | "story-scroll"
  | "gallery"
  | "research-presentation"
  | "general";

export type QuipslyProductionRoomRef = {
  readonly id: string;
  readonly nestSlug: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: QuipslyProductionRoomKind;
  readonly status: "draft" | "active" | "ready" | "published" | "held" | "archived";
};

export type QuipslyTimelineTrackKind = "video" | "audio" | "text" | "effect" | "data";

export type QuipslyTimelineClip = {
  readonly id: string;
  readonly trackId: string;
  readonly trackKind: QuipslyTimelineTrackKind;
  readonly assetId?: string;
  readonly sourceUnitId?: string;
  readonly label: string;
  readonly timelineStartSeconds: number;
  readonly timelineEndSeconds: number;
  readonly sourceStartSeconds?: number;
  readonly sourceEndSeconds?: number;
  readonly active: boolean;
  readonly syncMapId?: string;
};

export type QuipslyTimelinePacket = {
  readonly payloadVersion: 1;
  readonly id: string;
  readonly productionRoomId: string;
  readonly clips: readonly QuipslyTimelineClip[];
  readonly savedAt: QuipslyIsoDate;
  readonly savedByEmail?: string;
};

export type QuipslyAssistantActionRisk = "safe" | "review" | "destructive" | "publish";

export type QuipslyAssistantActionStatus =
  | "proposed"
  | "previewed"
  | "approved"
  | "executed"
  | "rejected"
  | "undone"
  | "failed";

export type QuipslyAssistantActionRef = {
  readonly id: string;
  readonly sessionId: string;
  readonly kind: string;
  readonly label: string;
  readonly explanation?: string;
  readonly riskLevel: QuipslyAssistantActionRisk;
  readonly status: QuipslyAssistantActionStatus;
};

export type QuipslyOutputPacketStatus =
  | "draft"
  | "packet-ready"
  | "queued"
  | "published"
  | "held"
  | "needs-review"
  | "failed";

export type QuipslyOutputPacketRef = {
  readonly id: string;
  readonly nestSlug: string;
  readonly outputId: string;
  readonly title: string;
  readonly status: QuipslyOutputPacketStatus;
  readonly sourceDocumentId?: string;
  readonly productionRoomId?: string;
};

export function isQuipslyNestKind(value: string | null | undefined): value is QuipslyNestKind {
  return QUIPSLY_NEST_KINDS.includes(String(value ?? "") as QuipslyNestKind);
}

export function normalizeQuipslyNestKind(value: string | null | undefined): QuipslyNestKind {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "book" || normalized === "article" || normalized === "podcast" || normalized === "talk") return "writing";
  if (normalized === "source" || normalized === "source-library" || normalized === "study-source") return "study";
  if (normalized === "media" || normalized === "episode" || normalized === "episode-production") return "production";
  if (normalized === "personal" || normalized === "vault") return "home";
  return isQuipslyNestKind(normalized) ? normalized : "writing";
}

export function quipslyLaneForNestKind(kind: QuipslyNestKind): QuipslyWorkflowLane {
  if (kind === "home" || kind === "study") return "intake";
  if (kind === "research") return "understanding";
  if (kind === "writing" || kind === "fiction" || kind === "course") return "creation";
  if (kind === "production" || kind === "gallery") return "production";
  return "understanding";
}
