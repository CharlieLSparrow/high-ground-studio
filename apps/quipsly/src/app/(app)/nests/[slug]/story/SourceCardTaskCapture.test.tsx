import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createNestQuickWorkAction } from "../actions";
import { SourceCardTaskCapture } from "./SourceStoryClient";

jest.mock("../actions", () => ({ createNestQuickWorkAction: jest.fn() }));

const card = {
  id: "card-1",
  stableId: "source-card:lake-reveal",
  title: "Lake reveal",
  synopsis: "",
  notes: "",
  purpose: "select",
  status: "candidate",
  visibility: "project",
  revision: 3,
  updatedAt: "2026-08-07T12:00:00.000Z",
  tags: [
    { id: "tag-episode", label: "Episode", slug: "episode" },
    { id: "tag-b-roll", label: "B-roll", slug: "b-roll" },
  ],
  sourceRange: null,
};

describe("SourceCardTaskCapture", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createNestQuickWorkAction).mockResolvedValue({
      ok: true,
      entityKind: "TASK",
      entityId: "task-1",
      projectSlug: "high-ground",
      href: "/work?task=task-1",
      tags: card.tags,
      idempotentReplay: false,
      externalSideEffects: false,
    });
  });

  it("creates explicit canonical Work with card, board, and visible tag provenance", async () => {
    const user = userEvent.setup();
    render(
      <SourceCardTaskCapture
        projectSlug="high-ground"
        boardId="board-1"
        card={card as never}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create follow-through task" }));
    expect(screen.getByText("Carries #Episode, #B-roll into Work.")).toBeInTheDocument();
    const title = screen.getByRole("textbox", { name: "Task title" });
    await user.clear(title);
    await user.type(title, "Review the lake reveal reframe");
    await user.type(screen.getByRole("textbox", { name: /What does done look like/ }), "Approve the camera direction before conform.");
    await user.click(screen.getByRole("button", { name: "Create Work task" }));

    await waitFor(() => expect(createNestQuickWorkAction).toHaveBeenCalledWith(expect.objectContaining({
      projectSlug: "high-ground",
      entityKind: "TASK",
      title: "Review the lake reveal reframe",
      body: "Approve the camera direction before conform.",
      tagIds: ["tag-episode", "tag-b-roll"],
      sourceCardId: "card-1",
      sourceBoardId: "board-1",
    })));
    expect(screen.getByRole("link", { name: "Open task" })).toHaveAttribute("href", "/work?task=task-1");
    expect(screen.getByText("Task saved in Work with #Episode, #B-roll.")).toBeInTheDocument();
  });
});
