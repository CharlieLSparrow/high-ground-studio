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

export type WorkbenchBlockPayload = {
  id: string;
  text: string;
  tags: string[];
  spans?: {
    tagSlug: string;
    label?: string;
    category?: string;
    startOffset: number;
    endOffset: number;
    selectedText: string;
  }[];
};

export type WorkbenchScopeProjectSummary = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  projectNestKind?: string;
  workflowSystem?: "data-ingestion" | "knowledge-processing" | "content-creation" | "content-publishing";
  status: "connected" | "missing" | "denied" | "unavailable";
  documentId?: string;
  documentTitle?: string;
  persistenceMode: "database" | "offline";
  reason?: string;
};

export type WorkbenchBaseState = {
  blocks: WorkbenchBlockPayload[];
  views: ViewDefinition[];
  projectId: string;
  projectSlug: string;
  projectName: string;
  documentId: string;
  documentTitle?: string;
  projectNestKind?: string;
  workflowSystem?: "data-ingestion" | "knowledge-processing" | "content-creation" | "content-publishing";
  persistenceMode: "database" | "offline";
};

export type WorkbenchScopedState = WorkbenchBaseState & {
  linkedProjects: WorkbenchScopeProjectSummary[];
};

export type DocumentBoundary = {
  id: string;
  blockId: string;
  label: string;
  kind: "episode" | "chapter" | "section";
  startIndex: number;
  endIndex: number;
};
