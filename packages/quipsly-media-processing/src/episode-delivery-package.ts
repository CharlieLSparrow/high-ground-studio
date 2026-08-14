export const EPISODE_DELIVERY_PACKAGE_CONTRACT_VERSION = 1 as const;
export const EPISODE_DELIVERY_PACKAGE_MANIFEST_KIND =
  "quipsly-episode-delivery-package-manifest-v1" as const;
export const EPISODE_DELIVERY_PACKAGE_RESULT_KIND =
  "quipsly-episode-delivery-package-result-v1" as const;

const SHA256_REGEX = /^[0-9a-f]{64}$/;
const SAFE_ID_REGEX = /^[A-Za-z0-9_-]{8,128}$/;

export type EpisodeDeliveryCaptionAsset = {
  kind: "srt" | "vtt";
  language: string;
  sha256: string;
  sizeBytes: number;
  locator: string;
};

export type EpisodeDeliveryChapterMarker = {
  timeSeconds: number;
  title: string;
  synopsis?: string;
};

export type EpisodeDeliveryPackageManifest = {
  kind: typeof EPISODE_DELIVERY_PACKAGE_MANIFEST_KIND;
  version: typeof EPISODE_DELIVERY_PACKAGE_CONTRACT_VERSION;
  packageId: string;
  projectId: string;
  episodeProductionId: string;
  actorEmail: string;
  createdAt: string;
  promotedMaster: {
    promotionReceiptId: string;
    gcsBucket: string;
    gcsObjectName: string;
    gcsGeneration: string;
    sha256: string;
    sizeBytes: number;
  };
  metadata: {
    title: string;
    summary: string;
    durationSeconds: number;
    width: number;
    height: number;
    fps: number;
    captions: EpisodeDeliveryCaptionAsset[];
    chapters: EpisodeDeliveryChapterMarker[];
  };
  boundaries: {
    deliveryPackageIsImmutable: true;
    requiresPromotedGcsMaster: true;
  };
};

export function parseEpisodeDeliveryPackageManifest(
  value: unknown,
): EpisodeDeliveryPackageManifest {
  const row = record(value);
  if (
    row.kind !== EPISODE_DELIVERY_PACKAGE_MANIFEST_KIND ||
    row.version !== EPISODE_DELIVERY_PACKAGE_CONTRACT_VERSION
  ) {
    throw new Error("Episode delivery package manifest kind or version is invalid.");
  }

  const packageId = text(row.packageId);
  const projectId = text(row.projectId);
  const episodeProductionId = text(row.episodeProductionId);
  const actorEmail = text(row.actorEmail).toLowerCase();
  const createdAt = text(row.createdAt);

  if (
    !SAFE_ID_REGEX.test(packageId) ||
    !projectId ||
    !episodeProductionId ||
    !isEmail(actorEmail) ||
    !isIsoDate(createdAt)
  ) {
    throw new Error("Episode delivery package manifest identity fields are invalid.");
  }

  const masterRow = record(row.promotedMaster);
  const promotionReceiptId = text(masterRow.promotionReceiptId);
  const gcsBucket = text(masterRow.gcsBucket);
  const gcsObjectName = text(masterRow.gcsObjectName);
  const gcsGeneration = text(masterRow.gcsGeneration);
  const sha256 = text(masterRow.sha256).toLowerCase();
  const sizeBytes = positiveInteger(masterRow.sizeBytes);

  if (
    !promotionReceiptId ||
    !gcsBucket ||
    !gcsObjectName ||
    !gcsGeneration ||
    !SHA256_REGEX.test(sha256)
  ) {
    throw new Error("Episode delivery package promoted master binding is invalid.");
  }

  const metaRow = record(row.metadata);
  const title = text(metaRow.title);
  const summary = text(metaRow.summary);
  const durationSeconds = finitePositive(metaRow.durationSeconds);
  const width = positiveInteger(metaRow.width);
  const height = positiveInteger(metaRow.height);
  const fps = finitePositive(metaRow.fps);

  if (!title || width <= 0 || height <= 0) {
    throw new Error("Episode delivery package metadata is invalid.");
  }

  const captionsRow = Array.isArray(metaRow.captions) ? metaRow.captions : [];
  const captions: EpisodeDeliveryCaptionAsset[] = captionsRow.map((c) => {
    const r = record(c);
    const kind = text(r.kind) as "srt" | "vtt";
    const lang = text(r.language);
    const capSha = text(r.sha256).toLowerCase();
    const capSize = positiveInteger(r.sizeBytes);
    const loc = text(r.locator);
    if ((kind !== "srt" && kind !== "vtt") || !lang || !SHA256_REGEX.test(capSha) || !loc) {
      throw new Error("Delivery caption asset is invalid.");
    }
    return { kind, language: lang, sha256: capSha, sizeBytes: capSize, locator: loc };
  });

  const chaptersRow = Array.isArray(metaRow.chapters) ? metaRow.chapters : [];
  const chapters: EpisodeDeliveryChapterMarker[] = chaptersRow.map((ch) => {
    const r = record(ch);
    const timeSeconds = Number(r.timeSeconds);
    const chTitle = text(r.title);
    const syn = text(r.synopsis);
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || !chTitle) {
      throw new Error("Delivery chapter marker is invalid.");
    }
    return { timeSeconds, title: chTitle, synopsis: syn || undefined };
  });

  const bounds = record(row.boundaries);
  if (bounds.deliveryPackageIsImmutable !== true || bounds.requiresPromotedGcsMaster !== true) {
    throw new Error("Episode delivery package boundaries are invalid.");
  }

  return {
    kind: EPISODE_DELIVERY_PACKAGE_MANIFEST_KIND,
    version: EPISODE_DELIVERY_PACKAGE_CONTRACT_VERSION,
    packageId,
    projectId,
    episodeProductionId,
    actorEmail,
    createdAt,
    promotedMaster: {
      promotionReceiptId,
      gcsBucket,
      gcsObjectName,
      gcsGeneration,
      sha256,
      sizeBytes,
    },
    metadata: {
      title,
      summary,
      durationSeconds,
      width,
      height,
      fps,
      captions,
      chapters,
    },
    boundaries: {
      deliveryPackageIsImmutable: true,
      requiresPromotedGcsMaster: true,
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown) {
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new Error("Expected a positive safe integer.");
  }
  return num;
}

function finitePositive(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("Expected a positive finite number.");
  }
  return num;
}

function isEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isIsoDate(value: string) {
  return value.length > 0 && Number.isFinite(Date.parse(value));
}
