export type ViewDefinition = {
  id: string;
  name: string;
  type: "episode" | "chapter" | "database" | "review" | "default";
  filters: {
    tagIds?: string[];
    tagSlugs: string[];
    excludeTagSlugs?: string[];
    includeCategories: string[];
    excludeCategories?: string[];
  };
  display: {
    mode: "focus" | "standard";
    showContext: boolean;
    collapseUnmatched: boolean;
  };
};

export type DocumentBoundary = {
  id: string;
  blockId: string;
  label: string;
  kind: "episode" | "chapter" | "section";
  startIndex: number;
  endIndex: number;
};
