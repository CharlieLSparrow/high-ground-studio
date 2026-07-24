export type ResearchPacketRecord = {
  id: string;
  title: string;
  kind: string;
  status: string;
  projectName: string;
  projectSlug: string;
  documentTitle: string | null;
  hasLineage: boolean;
  approvedAt: string | null;
  updatedAt: string;
};

export type ResearchEvidenceRecord = {
  id: string;
  title: string;
  excerpt: string;
  sourceLabel: string | null;
  sourcePath: string | null;
  tagLabel: string;
  nodeType: string;
  reviewStatus: string;
  projectionStatus: string;
  projectName: string;
  projectSlug: string;
  documentTitle: string;
  updatedAt: string;
};

export type ResearchSourceTag = {
  id: string;
  label: string;
  slug: string;
};

export type ResearchProjectRecord = {
  id: string;
  name: string;
  slug: string;
  canWrite: boolean;
};

export type ResearchSourceAnnotationRecord = {
  id: string;
  kind: string;
  status: string;
  visibility: string;
  body: string;
  exactText: string;
  startOffset: number;
  endOffset: number;
  tagLabels: string[];
  createdByMe: boolean;
  updatedAt: string;
  writingUses: Array<{
    id: string;
    documentId: string;
    documentTitle: string;
    projectSlug: string;
  }>;
};

export type ResearchSourceRecord = {
  id: string;
  title: string;
  kind: string;
  author: string | null;
  sourceUrl: string | null;
  sourcePath: string | null;
  immutableText: string;
  contentTruncated: boolean;
  projectName: string;
  projectSlug: string;
  canWrite: boolean;
  tagCatalog: ResearchSourceTag[];
  annotations: ResearchSourceAnnotationRecord[];
  personalCaptureOrigin: {
    captureType: "SNIPPET" | "BOOKMARK";
    captureId: string | null;
    filedAt: string;
    ownedByMe: boolean;
  } | null;
  updatedAt: string;
};

export type ResearchLibrarySnapshot =
  | {
      state: "ready";
      authState: "signed-in" | "local-operator";
      accessibleNestCount: number;
      projects: ResearchProjectRecord[];
      sources: ResearchSourceRecord[];
      packets: ResearchPacketRecord[];
      evidence: ResearchEvidenceRecord[];
    }
  | {
      state: "unavailable";
      authState: "signed-in" | "local-operator";
      message: string;
    }
  | {
      state: "signed-out";
      message: string;
    };

function searchableText(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").toLocaleLowerCase();
}

export function humanizeResearchStatus(value: string) {
  const normalized = value.trim().replace(/[_-]+/g, " ");
  if (!normalized) return "Unknown";
  return normalized.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

export function filterResearchRecords(
  query: string,
  sources: ResearchSourceRecord[],
  packets: ResearchPacketRecord[],
  evidence: ResearchEvidenceRecord[],
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return { sources, packets, evidence };

  return {
    sources: sources.filter((source) => searchableText([
      source.title,
      source.kind,
      source.author,
      source.sourceUrl,
      source.sourcePath,
      source.projectName,
      source.immutableText,
      source.personalCaptureOrigin?.captureType,
      ...source.annotations.flatMap((annotation) => [annotation.body, annotation.exactText, ...annotation.tagLabels]),
    ]).includes(normalizedQuery)),
    packets: packets.filter((packet) => searchableText([
      packet.title,
      packet.kind,
      packet.status,
      packet.projectName,
      packet.documentTitle,
    ]).includes(normalizedQuery)),
    evidence: evidence.filter((node) => searchableText([
      node.title,
      node.excerpt,
      node.sourceLabel,
      node.sourcePath,
      node.tagLabel,
      node.nodeType,
      node.reviewStatus,
      node.projectionStatus,
      node.projectName,
      node.documentTitle,
    ]).includes(normalizedQuery)),
  };
}
