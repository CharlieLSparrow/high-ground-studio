import { Fragment, type ReactNode } from "react";

import {
  cn,
  panelCopyClassName,
  StudioChip,
  StudioGlyph,
} from "@/app/studio-ui";
import {
  collectBlockSummaries,
  collectStructureRegionSummaries,
  getManuscriptAuthorDefinition,
  getSemanticHighlightDefinition,
  isManuscriptAuthorId,
  isSemanticHighlightType,
  type ManuscriptAuthorId,
  type ManuscriptDraft,
  type ManuscriptEditorJson,
  type ManuscriptStructureRegionSummary,
  type SemanticHighlightType,
} from "../../manuscript-editor-model";

type StudioManuscriptLiveReaderProps = {
  snapshot: {
    id: string;
    title: string;
    wordCount: number;
    blockCount: number;
    createdAt: string;
    updatedAt: string;
    draft: ManuscriptDraft;
  };
};

function formatLiveDate(value: string | null | undefined) {
  if (!value) {
    return "Not saved yet";
  }

  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function hasAuthorMark(
  node: ManuscriptEditorJson,
  authorId: ManuscriptAuthorId,
): boolean {
  if (
    node.marks?.some(
      (mark) =>
        mark.type === "authorMark" && mark.attrs?.authorId === authorId,
    )
  ) {
    return true;
  }

  return Boolean(node.content?.some((child) => hasAuthorMark(child, authorId)));
}

function hasUnassignedAuthorMark(node: ManuscriptEditorJson): boolean {
  if (
    node.marks?.some((mark) => {
      if (mark.type !== "authorMark") {
        return false;
      }

      const authorId = String(mark.attrs?.authorId ?? "unassigned");
      return !isManuscriptAuthorId(authorId) || authorId === "unassigned";
    })
  ) {
    return true;
  }

  return Boolean(node.content?.some((child) => hasUnassignedAuthorMark(child)));
}

function getLiveBlockClassName(
  node: ManuscriptEditorJson,
  regions: ManuscriptStructureRegionSummary[],
) {
  const hasCharlie = hasAuthorMark(node, "charlie");
  const hasHomer = hasAuthorMark(node, "homer");
  const hasUnassigned = hasUnassignedAuthorMark(node);
  const blockId = typeof node.attrs?.blockId === "string" ? node.attrs.blockId : "";
  const matchingRegions = blockId
    ? regions.filter((region) => region.blockIds.includes(blockId))
    : [];

  return cn(
    (hasCharlie || hasHomer || hasUnassigned) && "manuscript-author-block",
    hasCharlie && hasHomer && "manuscript-author-block-mixed",
    hasCharlie && !hasHomer && "manuscript-author-block-charlie",
    hasHomer && !hasCharlie && "manuscript-author-block-homer",
    !hasCharlie &&
      !hasHomer &&
      hasUnassigned &&
      "manuscript-author-block-unassigned",
    matchingRegions.length > 0 && "manuscript-structure-block",
    matchingRegions.some((region) => region.colorKey === "chapter") &&
      "manuscript-structure-chapter",
    matchingRegions.some((region) => region.colorKey === "episode") &&
      "manuscript-structure-episode",
    matchingRegions.some((region) => region.colorKey === "section") &&
      "manuscript-structure-section",
  );
}

function renderTextMarks(
  node: ManuscriptEditorJson,
  key: string,
): ReactNode {
  let content: ReactNode = node.text ?? "";

  for (const [markIndex, mark] of [...(node.marks ?? [])].reverse().entries()) {
    if (mark.type === "bold") {
      content = <strong key={`${key}-bold-${markIndex}`}>{content}</strong>;
      continue;
    }

    if (mark.type === "italic") {
      content = <em key={`${key}-italic-${markIndex}`}>{content}</em>;
      continue;
    }

    if (mark.type === "authorMark") {
      const rawAuthorId = String(mark.attrs?.authorId ?? "unassigned");
      const authorId = isManuscriptAuthorId(rawAuthorId)
        ? rawAuthorId
        : "unassigned";
      const authorLabel =
        typeof mark.attrs?.authorLabel === "string" &&
        mark.attrs.authorLabel.trim()
          ? mark.attrs.authorLabel
          : getManuscriptAuthorDefinition(authorId).label;

      content = (
        <span
          className={`manuscript-author-mark manuscript-author-${authorId}`}
          data-author-id={authorId}
          data-author-label={authorLabel}
          key={`${key}-author-${markIndex}`}
        >
          {content}
        </span>
      );
      continue;
    }

    if (mark.type === "semanticHighlightMark") {
      const rawTagType = String(mark.attrs?.tagType ?? "insight");
      const tagType: SemanticHighlightType = isSemanticHighlightType(rawTagType)
        ? rawTagType
        : "insight";
      const definition = getSemanticHighlightDefinition(tagType);
      const label = definition.label;
      const colorKey =
        typeof mark.attrs?.colorKey === "string" && mark.attrs.colorKey.trim()
          ? mark.attrs.colorKey
          : definition.colorKey;

      content = (
        <span
          className={`manuscript-semantic-mark manuscript-semantic-${colorKey}`}
          data-semantic-label={label}
          data-semantic-tag-type={tagType}
          key={`${key}-semantic-${markIndex}`}
          title={label}
        >
          {content}
        </span>
      );
    }
  }

  return content;
}

function renderLiveNode(
  node: ManuscriptEditorJson,
  key: string,
  regions: ManuscriptStructureRegionSummary[],
): ReactNode {
  if (typeof node.text === "string") {
    return renderTextMarks(node, key);
  }

  const children =
    node.content?.map((child, index) =>
      renderLiveNode(child, `${key}-${index}`, regions),
    ) ?? [];

  if (node.type === "hardBreak") {
    return <br key={key} />;
  }

  if (node.type === "paragraph") {
    return (
      <p className={getLiveBlockClassName(node, regions)} key={key}>
        {children.length ? children : <br />}
      </p>
    );
  }

  if (node.type === "heading") {
    const level = Number(node.attrs?.level ?? 2);
    const className = getLiveBlockClassName(node, regions);

    if (level <= 1) {
      return (
        <h1 className={className} key={key}>
          {children}
        </h1>
      );
    }

    if (level === 3) {
      return (
        <h3 className={className} key={key}>
          {children}
        </h3>
      );
    }

    return (
      <h2 className={className} key={key}>
        {children}
      </h2>
    );
  }

  if (node.type === "bulletList") {
    return <ul key={key}>{children}</ul>;
  }

  if (node.type === "orderedList") {
    return <ol key={key}>{children}</ol>;
  }

  if (node.type === "listItem") {
    return (
      <li className={getLiveBlockClassName(node, regions)} key={key}>
        {children}
      </li>
    );
  }

  return <Fragment key={key}>{children}</Fragment>;
}

export function StudioManuscriptLiveReader({
  snapshot,
}: StudioManuscriptLiveReaderProps) {
  const draft = snapshot.draft;
  const blocks = collectBlockSummaries(draft.editorJson);
  const regions = collectStructureRegionSummaries({
    json: draft.editorJson,
    regions: draft.structureRegions,
  });

  return (
    <main className="min-h-screen px-3.5 py-4 md:px-6 md:py-6">
      <article className="mx-auto grid max-w-[980px] gap-5">
        <header className="grid gap-3 rounded-lg border border-studio-line bg-studio-panel/72 p-4 shadow-[0_14px_38px_rgba(0,0,0,0.2)] backdrop-blur-md md:grid-cols-[auto_1fr] md:items-start">
          <StudioGlyph />
          <div className="grid min-w-0 gap-2">
            <p className="m-0 text-[0.72rem] font-black uppercase leading-tight text-studio-dim">
              Shared manuscript
            </p>
            <h1 className="m-0 text-[1.6rem] leading-tight text-studio-ink md:text-[2rem]">
              {draft.title || snapshot.title || "Untitled manuscript"}
            </h1>
            <div className="flex flex-wrap gap-1.5">
              <StudioChip tone="source">
                Saved {formatLiveDate(snapshot.updatedAt)}
              </StudioChip>
              <StudioChip tone="node">
                {snapshot.wordCount.toLocaleString()} words
              </StudioChip>
              <StudioChip tone="review">
                {blocks.length.toLocaleString()} blocks
              </StudioChip>
            </div>
          </div>
        </header>

        <section
          aria-label="Read-only manuscript"
          className="manuscript-live-reader manuscript-prosemirror min-w-0 text-[1rem] leading-8 text-studio-ink outline-none md:text-[1.05rem]"
        >
          {renderLiveNode(draft.editorJson, "live-root", regions)}
        </section>

        <footer className="rounded-lg border border-studio-line bg-studio-panel/52 p-3.5">
          <p className={cn(panelCopyClassName, "mt-0")}>
            Read-only shared copy. Edits and saved backups still live in Studio.
          </p>
        </footer>
      </article>
    </main>
  );
}
