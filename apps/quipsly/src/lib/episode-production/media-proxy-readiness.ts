export type ImportedMediaProxyReadiness = {
  ready: boolean;
  needed: boolean;
  status: "ready" | "needed" | "unknown";
  source: "media-asset" | "import-metadata" | "unknown";
};

type ImportedMediaProxyEvidence = {
  proxyStatus?: string | null;
  asset?: {
    readiness?: {
      hasProxy?: boolean;
      needsProxy?: boolean;
    } | null;
  } | null;
};

export function importedMediaProxyReadiness(
  item: ImportedMediaProxyEvidence,
): ImportedMediaProxyReadiness {
  const assetReadiness = item.asset?.readiness;
  if (assetReadiness) {
    if (assetReadiness.hasProxy === true) {
      return { ready: true, needed: false, status: "ready", source: "media-asset" };
    }
    if (assetReadiness.needsProxy === true) {
      return { ready: false, needed: true, status: "needed", source: "media-asset" };
    }
    return { ready: false, needed: false, status: "unknown", source: "media-asset" };
  }

  if (item.proxyStatus === "ready") {
    return { ready: true, needed: false, status: "ready", source: "import-metadata" };
  }
  if (item.proxyStatus === "queued") {
    return { ready: false, needed: true, status: "needed", source: "import-metadata" };
  }
  return { ready: false, needed: false, status: "unknown", source: "unknown" };
}
