export type SourceLibraryCollection = "working" | "all" | "attention";
export type SourceLibraryMediaFilter = "all" | "360" | "video" | "audio" | "image" | "browse-ready" | "render-ready";
export type SourceLibraryGroupMode = "capture-day" | "source-type" | "provider";
export type SourceLibrarySortMode = "newest" | "name" | "selects";

export type SourceLibraryAsset = {
  id: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: string | null;
  duration: number | null;
  thumbnailUrl: string | null;
  isProxy: boolean;
  updatedAt: string;
};

export type SourceLibraryExternal = {
  id: string;
  provider: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: string | null;
  providerCreatedAt: string | null;
  providerModifiedAt: string | null;
  createdAt: string;
  accessState: string;
  capabilityState: string;
  latestSourceRevision: null | {
    id: string;
    durationSeconds: number | null;
    collaborationProxy: null | { id: string };
    visualOverview?: null | { id: string; playbackUrl: string };
  };
};

export type SourceLibrarySet = {
  id: string;
  kind: string;
  captureKey: string;
  displayName: string;
  completeness: string;
  createdAt: string;
  sourceClockRevision: {
    id: string;
    durationSeconds: number | null;
    externalReference: null | { id: string; fileName: string; provider: string };
    collaborationProxy: null | { id: string };
    spatialStitchMaster: null | { id: string };
    visualOverview?: null | { id: string; playbackUrl: string };
  };
  members: Array<{
    requiredForRender: boolean;
    sourceRevision: {
      id: string;
      sizeBytes: string | null;
      externalReference: null | { id: string; provider: string; fileName: string; accessState: string };
    };
  }>;
};

export type SourceLibraryCard = {
  id: string;
  status: string;
  sourceRange: null | {
    sourceSet: null | { id: string };
    sourceRevision: {
      mediaAsset: null | { id: string };
      externalReference: null | { id: string };
    };
  };
};

export type SourceLibraryBoard = {
  id: string;
  placements: Array<{ cardId: string }>;
};

export type SourceLibraryItem = {
  key: string;
  kind: "source-set" | "external" | "asset";
  id: string;
  name: string;
  provider: string;
  mimeFamily: "360" | "video" | "audio" | "image" | "other";
  timestamp: string;
  durationSeconds: number | null;
  sizeBytes: string | null;
  thumbnailUrl: string | null;
  health: "render-ready" | "browse-ready" | "needs-attention";
  healthLabel: string;
  selectCount: number;
  selectedCount: number;
  boardCount: number;
  isWorking: boolean;
  searchText: string;
};

export type SourceLibraryGroup = {
  key: string;
  label: string;
  items: SourceLibraryItem[];
};

function safeTimestamp(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (value && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  }
  return new Date(0).toISOString();
}

function cameraTimestamp(value: string) {
  const match = value.match(/(?:^|[^0-9])(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])(?:[_-]?([0-2]\d)([0-5]\d)([0-5]\d))?/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const timestamp = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
  return Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}

function mimeFamily(mimeType: string | null) {
  if (mimeType?.startsWith("video/")) return "video" as const;
  if (mimeType?.startsWith("audio/")) return "audio" as const;
  if (mimeType?.startsWith("image/")) return "image" as const;
  return "other" as const;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceIdentity(card: SourceLibraryCard) {
  const range = card.sourceRange;
  if (!range) return null;
  if (range.sourceSet) return `source-set:${range.sourceSet.id}`;
  if (range.sourceRevision.mediaAsset) return `asset:${range.sourceRevision.mediaAsset.id}`;
  if (range.sourceRevision.externalReference) return `external:${range.sourceRevision.externalReference.id}`;
  return null;
}

function usageBySource(cards: SourceLibraryCard[], boards: SourceLibraryBoard[]) {
  const boardIdsByCard = new Map<string, Set<string>>();
  for (const board of boards) {
    for (const placement of board.placements) {
      const boardIds = boardIdsByCard.get(placement.cardId) ?? new Set<string>();
      boardIds.add(board.id);
      boardIdsByCard.set(placement.cardId, boardIds);
    }
  }
  const usage = new Map<string, { selectCount: number; selectedCount: number; boardIds: Set<string> }>();
  for (const card of cards) {
    const identity = sourceIdentity(card);
    if (!identity) continue;
    const current = usage.get(identity) ?? { selectCount: 0, selectedCount: 0, boardIds: new Set<string>() };
    current.selectCount += 1;
    if (["selected", "used"].includes(card.status)) current.selectedCount += 1;
    for (const boardId of boardIdsByCard.get(card.id) ?? []) current.boardIds.add(boardId);
    usage.set(identity, current);
  }
  return usage;
}

function usageFields(key: string, usage: ReturnType<typeof usageBySource>) {
  const value = usage.get(key);
  const selectCount = value?.selectCount ?? 0;
  const selectedCount = value?.selectedCount ?? 0;
  const boardCount = value?.boardIds.size ?? 0;
  return { selectCount, selectedCount, boardCount, isWorking: selectCount > 0 || boardCount > 0 };
}

export function buildSourceLibraryItems(input: {
  assets: SourceLibraryAsset[];
  externalSources: SourceLibraryExternal[];
  sourceSets: SourceLibrarySet[];
  cards: SourceLibraryCard[];
  boards: SourceLibraryBoard[];
}) {
  const usage = usageBySource(input.cards, input.boards);
  const packagedRevisionIds = new Set(input.sourceSets.flatMap((sourceSet) => sourceSet.members.map((member) => member.sourceRevision.id)));
  const items: SourceLibraryItem[] = [];

  for (const sourceSet of input.sourceSets) {
    const key = `source-set:${sourceSet.id}`;
    const requiredMembers = sourceSet.members.filter((member) => member.requiredForRender);
    const unavailableMember = requiredMembers.some((member) => {
      const accessState = member.sourceRevision.externalReference?.accessState;
      return accessState ? accessState !== "available" : false;
    });
    const browseReady = Boolean(sourceSet.sourceClockRevision.collaborationProxy);
    const renderReady = sourceSet.completeness === "complete"
      && !unavailableMember
      && Boolean(sourceSet.sourceClockRevision.spatialStitchMaster);
    const health = renderReady ? "render-ready" : browseReady ? "browse-ready" : "needs-attention";
    const provider = sourceSet.sourceClockRevision.externalReference?.provider
      ?? sourceSet.members.find((member) => member.sourceRevision.externalReference)?.sourceRevision.externalReference?.provider
      ?? "camera package";
    const sizeBytes = sourceSet.members.reduce((total, member) => total + BigInt(member.sourceRevision.sizeBytes ?? 0), 0n).toString();
    items.push({
      key,
      kind: "source-set",
      id: sourceSet.id,
      name: sourceSet.displayName,
      provider,
      mimeFamily: sourceSet.kind === "insta360-360" ? "360" : "video",
      timestamp: safeTimestamp(cameraTimestamp(sourceSet.captureKey), cameraTimestamp(sourceSet.displayName), sourceSet.createdAt),
      durationSeconds: sourceSet.sourceClockRevision.durationSeconds,
      sizeBytes,
      thumbnailUrl: sourceSet.sourceClockRevision.visualOverview?.playbackUrl ?? null,
      health,
      healthLabel: renderReady
        ? "Browse and final render ready"
        : browseReady
          ? "Browse ready · final master pending"
          : unavailableMember
            ? "Original package access needs repair"
            : sourceSet.completeness !== "complete"
              ? "Camera package is incomplete"
              : "Browse proxy required",
      ...usageFields(key, usage),
      searchText: `${sourceSet.displayName} ${sourceSet.captureKey} ${sourceSet.kind} ${provider} ${sourceSet.members.map((member) => member.sourceRevision.externalReference?.fileName ?? "").join(" ")}`.toLowerCase(),
    });
  }

  for (const source of input.externalSources) {
    if (source.latestSourceRevision && packagedRevisionIds.has(source.latestSourceRevision.id)) continue;
    const key = `external:${source.id}`;
    const proxyReady = Boolean(source.latestSourceRevision?.collaborationProxy);
    const accessReady = source.accessState === "available" && source.capabilityState === "downloadable";
    const health = accessReady && proxyReady ? "render-ready" : proxyReady ? "browse-ready" : "needs-attention";
    items.push({
      key,
      kind: "external",
      id: source.id,
      name: source.fileName,
      provider: source.provider,
      mimeFamily: mimeFamily(source.mimeType),
      timestamp: safeTimestamp(source.providerCreatedAt, cameraTimestamp(source.fileName), source.providerModifiedAt, source.createdAt),
      durationSeconds: source.latestSourceRevision?.durationSeconds ?? null,
      sizeBytes: source.sizeBytes,
      thumbnailUrl: source.latestSourceRevision?.visualOverview?.playbackUrl ?? null,
      health,
      healthLabel: accessReady && proxyReady
        ? "Browse and original access ready"
        : proxyReady
          ? "Browse ready · original access needs repair"
          : source.capabilityState === "needs-reauth" || source.accessState === "revoked"
            ? "Reconnect source vault"
            : source.capabilityState === "metadata-only"
              ? "Metadata only · proxy held"
              : "Browse proxy required",
      ...usageFields(key, usage),
      searchText: `${source.fileName} ${source.provider} ${source.mimeType ?? ""} ${source.accessState} ${source.capabilityState}`.toLowerCase(),
    });
  }

  for (const asset of input.assets) {
    const key = `asset:${asset.id}`;
    items.push({
      key,
      kind: "asset",
      id: asset.id,
      name: asset.filename,
      provider: "Quipsly media",
      mimeFamily: mimeFamily(asset.mimeType),
      timestamp: safeTimestamp(cameraTimestamp(asset.filename), asset.updatedAt),
      durationSeconds: asset.duration,
      sizeBytes: asset.sizeBytes,
      thumbnailUrl: asset.thumbnailUrl,
      health: asset.isProxy ? "browse-ready" : "render-ready",
      healthLabel: asset.isProxy ? "Browse proxy" : "Registered source ready",
      ...usageFields(key, usage),
      searchText: `${asset.filename} ${asset.mimeType ?? ""} Quipsly media`.toLowerCase(),
    });
  }

  return items;
}

export function filterSourceLibraryItems(items: SourceLibraryItem[], input: {
  collection: SourceLibraryCollection;
  mediaFilter: SourceLibraryMediaFilter;
  query: string;
  sort: SourceLibrarySortMode;
}) {
  const query = input.query.trim().toLowerCase();
  return items
    .filter((item) => input.collection === "all" || (input.collection === "working" ? item.isWorking : item.health === "needs-attention"))
    .filter((item) => {
      if (input.mediaFilter === "all") return true;
      if (input.mediaFilter === "browse-ready") return item.health !== "needs-attention";
      if (input.mediaFilter === "render-ready") return item.health === "render-ready";
      return item.mimeFamily === input.mediaFilter;
    })
    .filter((item) => !query || item.searchText.includes(query))
    .sort((left, right) => {
      if (input.sort === "name") return left.name.localeCompare(right.name) || left.key.localeCompare(right.key);
      if (input.sort === "selects") return right.selectCount - left.selectCount || right.timestamp.localeCompare(left.timestamp) || left.key.localeCompare(right.key);
      return right.timestamp.localeCompare(left.timestamp) || left.key.localeCompare(right.key);
    });
}

export function groupSourceLibraryItems(items: SourceLibraryItem[], mode: SourceLibraryGroupMode): SourceLibraryGroup[] {
  const groups = new Map<string, SourceLibraryGroup>();
  for (const item of items) {
    let key: string;
    let label: string;
    if (mode === "capture-day") {
      key = item.timestamp.slice(0, 10);
      label = key === "1970-01-01" ? "Date not retained" : new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(item.timestamp));
    } else if (mode === "source-type") {
      key = item.kind;
      label = item.kind === "source-set" ? "Camera packages" : item.kind === "external" ? "Connected vault" : "Quipsly media";
    } else {
      key = item.provider;
      label = humanize(item.provider);
    }
    const group = groups.get(key) ?? { key, label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function sourceLibraryStats(items: SourceLibraryItem[]) {
  return {
    total: items.length,
    working: items.filter((item) => item.isWorking).length,
    attention: items.filter((item) => item.health === "needs-attention").length,
    browseReady: items.filter((item) => item.health !== "needs-attention").length,
    renderReady: items.filter((item) => item.health === "render-ready").length,
    selects: items.reduce((total, item) => total + item.selectCount, 0),
  };
}
