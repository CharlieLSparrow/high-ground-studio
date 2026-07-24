import { render, screen } from "@testing-library/react";

import type { AssistantAction, AssistantActionStatus } from "./assistant-types";
import { QuipslyAssistantSidebar } from "./QuipslyAssistantSidebar";

jest.mock("@/app/(app)/create/actions", () => ({ syncEmbeddingsAction: jest.fn() }));
jest.mock("./story-bible", () => ({ StoryBibleSidebar: () => null }));

function action(kind: string, status: AssistantActionStatus): AssistantAction {
  return {
    id: `${kind}-${status}`,
    kind,
    label: `${kind} proposal`,
    explanation: "Exact evidence was reviewed.",
    riskLevel: "high",
    payload: kind === "PROPOSE_ENTITY"
      ? { name: "Courage", type: "THEME_MOTIF", sourceBlockId: "block-1", attributes: { sourceExcerpt: "Stay with the question.", sourceBlockId: "block-1" } }
      : { blockId: "block-1", originalText: "Before", rewriteText: "After" },
    status,
    createdAt: "2026-07-19T12:00:00.000Z",
  };
}

function assistantFor(actions: AssistantAction[], previews: any[] = []) {
  return {
    sessionId: "session-1",
    message: "Review this",
    setMessage: jest.fn(),
    assistantMessage: "One reviewed proposal.",
    suggestions: [],
    actions,
    previews,
    recentChanges: [],
    status: "idle",
    warning: null,
    recentTags: [],
    askAssistant: jest.fn(),
    approveAction: jest.fn(),
    rejectAction: jest.fn(),
    undoAction: jest.fn(),
    saveAction: jest.fn(),
    undoSaveAction: jest.fn(),
  } as any;
}

function renderSidebar(actions: AssistantAction[], previews: any[] = []) {
  return render(
    <QuipslyAssistantSidebar
      projectId="project-1"
      projectSlug="high-ground-odyssey"
      documentId="document-1"
      documentTitle="Episode 4"
      activeView={{ id: "everything", name: "Everything" } as any}
      visibleBlocks={[]}
      assistant={assistantFor(actions, previews)}
    />,
  );
}

describe("assistant human-review truth", () => {
  it("keeps the assistant launcher above Nest Chat and names the control clearly", () => {
    renderSidebar([]);

    expect(screen.getByRole("button", { name: "Open Quipsly assistant" })).toHaveClass(
      "bottom-[8.75rem]",
      "md:bottom-20",
    );
  });

  it("labels document mutation as a persisted edit rather than a local approval", () => {
    renderSidebar([action("PROPOSE_REWRITE", "proposed")]);

    expect(screen.getByRole("button", { name: "Apply persisted edit" })).toBeInTheDocument();
    expect(screen.queryByText("Save to QuipLore")).not.toBeInTheDocument();
    expect(screen.getByText(/authorized server receipt commits/i)).toBeInTheDocument();
  });

  it("keeps a reviewed entity separate from its explicit canonical commit", () => {
    renderSidebar([action("PROPOSE_ENTITY", "approved")]);

    expect(screen.getByRole("button", { name: "Commit to Story Bible" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo approval" })).toBeInTheDocument();
    expect(screen.getByText("Block attached · rechecked at commit")).toBeInTheDocument();
  });

  it("shows a durable receipt boundary after manuscript application", () => {
    renderSidebar([action("PROPOSE_REWRITE", "applied")]);

    expect(screen.getByText("Persisted manuscript edit · reversible operation recorded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo persisted edit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply persisted edit" })).not.toBeInTheDocument();
  });

  it("keeps research results attached to an exact continuation route", () => {
    renderSidebar([], [{
      id: "preview-1",
      actionId: "research-1",
      title: "Related blocks",
      kind: "find-examples",
      detail: "One source-aware match.",
      items: [{
        label: "Episode 4 / Active Document",
        detail: "Stay with the question.",
        source: "Episode 4 · block opening-stable",
        href: "/create?project=high-ground-odyssey&document=document-1&block=block-1",
      }],
      createdAt: "2026-07-19T12:00:00.000Z",
    }]);

    expect(screen.getByText("Episode 4 · block opening-stable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open exact block" })).toHaveAttribute(
      "href",
      "/create?project=high-ground-odyssey&document=document-1&block=block-1",
    );
  });
});
