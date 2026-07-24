export type CollectionSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  snippetCount: number;
  bookmarkCount: number;
};

export type ResearchFilingSummary = {
  id: string;
  sourceUnitId: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  createdAt: string;
};

export type WritableResearchProject = {
  id: string;
  name: string;
  slug: string;
};

export type CaptureReceiptSummary = {
  id: string;
  capturedAt: string;
  title: string | null;
};

export type CollectionItem = {
  id: string;
  itemType: "snippet" | "bookmark";
  collectionId: string | null;
  collectionName: string | null;
  title: string;
  excerpt: string;
  note: string | null;
  sourceUrl: string | null;
  sourceLabel: string;
  updatedAt: string;
  lastCapturedAt: string;
  captureCount: number;
  captureHistory: CaptureReceiptSummary[];
  researchFilings: ResearchFilingSummary[];
};

export type CollectionsSnapshot =
  | {
      state: "ready";
      authState: "signed-in" | "local-operator";
      collections: CollectionSummary[];
      items: CollectionItem[];
      writableResearchProjects: WritableResearchProject[];
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

function searchable(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").toLocaleLowerCase();
}

export function filterCollectionItems(
  items: CollectionItem[],
  collectionId: string,
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const inCollection =
      collectionId === "all" ||
      (collectionId === "inbox"
        ? item.collectionId === null
        : item.collectionId === collectionId);
    if (!inCollection) return false;
    if (!normalizedQuery) return true;
    return searchable([
      item.title,
      item.excerpt,
      item.note,
      item.sourceLabel,
      item.collectionName,
    ]).includes(normalizedQuery);
  });
}

export function sourceLabelForUrl(value: string | null) {
  if (!value) return "No source URL saved";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Source URL needs review";
  }
}
