import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BlockItem } from "./BlockItem";

jest.mock("@/components/EditorMargin", () => ({
  EditorMargin: () => null,
}));
jest.mock("./CommandPalette", () => () => null);
jest.mock("./Tagger", () => ({
  uniqueTagIds: (block: { tags: string[]; spans?: Array<{ tagSlug: string }> }) => Array.from(new Set([
    ...block.tags,
    ...(block.spans ?? []).map((span) => span.tagSlug),
  ])),
  canonicalBoundarySuggestion: () => null,
}));
jest.mock("./registry/EditorExtensionRegistry", () => ({
  useEditorExtensions: () => ({
    tagDefinitions: [
      {
        id: "proof-listen",
        label: "Proof listen",
        category: "workflow",
        icon: () => <span aria-hidden="true">#</span>,
        color: "border-sky-200 bg-sky-50 text-sky-900",
      },
      {
        id: "episode-8",
        label: "Episode 8",
        category: "meaning",
        icon: () => <span aria-hidden="true">#</span>,
        color: "border-rose-200 bg-rose-50 text-rose-900",
      },
    ],
    blockAccents: [],
    blockCards: [],
  }),
}));

function renderBlock(sourceEvidence?: {
  annotationId: string;
  citationLabel: string;
  sourcePath?: string;
  immutable?: boolean;
}) {
  const onToggleTag = jest.fn().mockResolvedValue({ ok: true, operation: "removed" });
  const body = "Proof-listen this Episode 8 source.";
  render(
    <BlockItem
      block={{
        id: "block-1",
        text: body,
        tags: [],
        spans: [
          {
            id: "span-proof",
            tagSlug: "proof-listen",
            startOffset: 0,
            endOffset: body.length,
            selectedText: body,
          },
          {
            id: "span-episode",
            tagSlug: "episode-8",
            startOffset: 18,
            endOffset: 27,
            selectedText: "Episode 8",
          },
        ],
        sourceEvidence,
      }}
      blockIndex={0}
      previousBlockIsImmutable={false}
      isOutlineFocused={false}
      isSaving={false}
      onTextChange={jest.fn()}
      onTextBlur={jest.fn()}
      onToggleTag={onToggleTag}
      onSplitBlock={jest.fn()}
      onMergeWithPrevious={jest.fn()}
      onPasteBlocks={jest.fn()}
      onClearTags={jest.fn()}
      onDeleteBlock={jest.fn()}
      onNormalizeHeading={jest.fn()}
      onAddComment={jest.fn().mockResolvedValue(true)}
      onCreatePassageTag={jest.fn().mockResolvedValue({ ok: true, created: false, tagLabel: "Proof listen" })}
      onFindSupportingQuote={jest.fn()}
      onSelectionChange={jest.fn()}
      registerTextareaRef={jest.fn()}
      registerWrapperRef={jest.fn()}
    />,
  );
  return { onToggleTag };
}

describe("applied writing tags", () => {
  it("makes discovery the tag-label action and removal a separate explicit control", async () => {
    const user = userEvent.setup();
    const { onToggleTag } = renderBlock();

    expect(screen.getByRole("link", { name: "Explore Proof listen tag in Quipsly Search" })).toHaveAttribute(
      "href",
      "/find?q=Proof%20listen",
    );
    expect(screen.getByRole("link", { name: "Explore Episode 8 tag in Quipsly Search" })).toHaveAttribute(
      "href",
      "/find?q=Episode%208",
    );
    expect(screen.queryByRole("button", { name: "Proof listen" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Proof listen from this block" }));
    expect(onToggleTag).toHaveBeenCalledWith("block-1", "proof-listen", null);

    await user.click(screen.getByRole("button", { name: "Remove Episode 8 from this tagged passage" }));
    expect(onToggleTag).toHaveBeenCalledWith("block-1", "episode-8", {
      startOffset: 18,
      endOffset: 27,
      selectedText: "Episode 8",
    });
  });

  it("returns source-linked writing to the exact canonical annotation instead of a repository path", () => {
    renderBlock({
      annotationId: "annotation-1",
      citationLabel: "Episode 4 audio-first publication goal",
      sourcePath: "docs/quipsly/episode-4-audio-publication-goal.md",
      immutable: false,
    });

    expect(screen.getByRole("link", { name: "Open exact source" })).toHaveAttribute(
      "href",
      "/research?annotation=annotation-1",
    );
    expect(screen.queryByRole("link", { name: "Open original source" })).not.toBeInTheDocument();
    expect(screen.getByText(/Source path:/)).toHaveTextContent(
      "docs/quipsly/episode-4-audio-publication-goal.md",
    );
  });

  it("labels immutable research evidence as source evidence rather than transcript evidence", () => {
    renderBlock({
      annotationId: "annotation-1",
      citationLabel: "Episode 4 audio-first publication goal",
      immutable: true,
    });

    expect(screen.getByText("Pinned source evidence")).toBeInTheDocument();
    expect(screen.queryByText("Pinned transcript evidence")).not.toBeInTheDocument();
  });

  it("keeps the transcript-specific label for immutable transcript evidence", () => {
    renderBlock({
      annotationId: "transcript:job-1:segment-1",
      citationLabel: "Recording-backed transcript evidence",
      immutable: true,
    });

    expect(screen.getByText("Pinned transcript evidence")).toBeInTheDocument();
    expect(screen.queryByText("Pinned source evidence")).not.toBeInTheDocument();
  });
});
