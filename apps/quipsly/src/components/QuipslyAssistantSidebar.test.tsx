import { fireEvent, render, screen } from "@testing-library/react";

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

function renderSidebar(actions: AssistantAction[], previews: any[] = [], open = true) {
  const assistant = assistantFor(actions, previews);
  const rendered = render(
    <QuipslyAssistantSidebar
      projectId="project-1"
      projectSlug="high-ground-odyssey"
      documentId="document-1"
      documentTitle="Episode 4"
      activeView={{ id: "everything", name: "Everything" } as any}
      visibleBlocks={[]}
      assistant={assistant}
    />,
  );
  if (open) fireEvent.click(screen.getByRole("button", {name: "Open Quipsly assistant"}));
  return {...rendered, assistant};
}

describe("assistant work, recovery, and optional details", () => {
  it("keeps the assistant launcher above Nest Chat and names the control clearly", () => {
    renderSidebar([], [], false);

    expect(screen.getByRole("button", { name: "Open Quipsly assistant" })).toHaveClass(
      "bottom-[8.75rem]",
      "md:bottom-20",
    );
  });

  it("labels document mutation as a persisted edit rather than a local approval", () => {
    renderSidebar([action("PROPOSE_REWRITE", "proposed")]);

    expect(screen.getByRole("button", { name: "Apply edit" })).toBeInTheDocument();
    expect(screen.queryByText("Save to QuipLore")).not.toBeInTheDocument();
    expect(screen.getByText(/Requested writing is saved to your page/)).toBeInTheDocument();
  });

  it("does not add a separate review click before a Story Bible save", () => {
    renderSidebar([action("PROPOSE_ENTITY", "proposed")]);

    expect(screen.getByRole("button", { name: "Add to Story Bible" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review proposal" })).not.toBeInTheDocument();
  });

  it("keeps a reviewed entity separate from its explicit canonical commit", () => {
    renderSidebar([action("PROPOSE_ENTITY", "approved")]);

    expect(screen.getByRole("button", { name: "Commit to Story Bible" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo approval" })).toBeInTheDocument();
    expect(screen.getByText("Block attached · rechecked at commit")).toBeInTheDocument();
  });

  it("shows a durable receipt boundary after manuscript application", () => {
    const saved = action("PROPOSE_REWRITE", "applied");
    const {assistant} = renderSidebar([saved]);

    expect(screen.getByText("Saved to your writing.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo edit" }));
    expect(assistant.undoAction).toHaveBeenCalledWith(saved);
    expect(screen.queryByRole("button", { name: "Apply edit" })).not.toBeInTheDocument();
  });

  it("makes the shared action capability and review policy inspectable without adding another approval step", () => {
    const governed = action("PROPOSE_REWRITE", "ready");
    governed.governance = {
      actionId: "governed-action-12345678",
      runId: "governed-run-87654321",
      capabilityId: "quipsly.writing.rewrite.propose",
      decisionPolicy: "DELEGATED",
      decisionStatus: "NOT_REQUIRED",
      status: "READY",
    };
    renderSidebar([governed]);

    expect(screen.getByText("Details · no approval needed")).toBeInTheDocument();
    expect(screen.getByText("quipsly.writing.rewrite.propose")).toBeInTheDocument();
    expect(screen.getByText(/run 87654321 · action 12345678 · ready/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /approve|apply edit|review proposal/i})).not.toBeInTheDocument();
  });

  it("shows read-only work as automatic instead of an approval proposal", () => {
    const readOnly = action("find-examples", "running");
    readOnly.governance = {
      actionId: "governed-action-read",
      runId: "governed-run-read",
      capabilityId: "quipsly.writing.examples.find",
      decisionPolicy: "READ_ONLY",
      decisionStatus: "NOT_REQUIRED",
      status: "EXECUTING",
    };
    renderSidebar([readOnly]);

    expect(screen.getByText(/Read-Only Search/i)).toBeInTheDocument();
    expect(screen.getByText("Details · no approval needed")).toBeInTheDocument();
    expect(screen.getByText("Finding the useful result…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve|execute search/i })).not.toBeInTheDocument();
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
