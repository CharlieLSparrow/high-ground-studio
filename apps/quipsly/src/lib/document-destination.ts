/** Choose the same editing surface regardless of where a document is found. */
export function documentWorkspaceHref(document: {
  documentId: string;
  projectSlug: string;
  sourceLabel?: string | null;
  blockId?: string;
}): string {
  if (document.sourceLabel?.split(";").some((tag) => tag.trim().toLowerCase() === "document-kind:note")) {
    const fragment = document.blockId ? `#note-block-${encodeURIComponent(document.blockId)}` : "";
    return `/notes/${encodeURIComponent(document.documentId)}${fragment}`;
  }
  const params = new URLSearchParams({ project: document.projectSlug, document: document.documentId });
  if (document.blockId) params.set("block", document.blockId);
  return `/create?${params.toString()}`;
}
