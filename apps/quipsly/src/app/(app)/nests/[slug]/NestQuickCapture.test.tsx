import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createNestQuickNoteAction, createNestQuickWorkAction } from "./actions";
import { NestQuickCapture } from "./NestQuickCapture";

const push = jest.fn();
const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));
jest.mock("./actions", () => ({
  createNestQuickNoteAction: jest.fn(),
  createNestQuickWorkAction: jest.fn(),
}));

const tags = [
  { id: "tag-charlie", label: "Charlie", slug: "charlie", category: "person" },
  { id: "tag-homer", label: "Homer", slug: "homer", category: "person" },
  { id: "tag-episode", label: "Episode", slug: "episode", category: "meaning" },
  { id: "tag-episode-4", label: "Episode 4", slug: "episode-4", category: "meaning" },
  { id: "tag-episode-8", label: "Episode 8", slug: "episode-8", category: "meaning" },
  { id: "tag-proof", label: "Proof listen", slug: "proof-listen", category: "workflow" },
  { id: "tag-coaching", label: "Coaching follow-up", slug: "coaching-follow-up", category: "workflow" },
  { id: "tag-source", label: "Source", slug: "source", category: "evidence" },
  { id: "tag-draft", label: "Draft", slug: "draft", category: "workflow" },
];

function renderCapture() {
  return render(
    <NestQuickCapture
      projectId="project-1"
      projectSlug="high-ground"
      projectName="High Ground"
      tags={tags}
    />,
  );
}

describe("Nest project quick capture", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("searches canonical vocabulary and atomically submits selected and new Task tags", async () => {
    const user = userEvent.setup();
    jest.mocked(createNestQuickWorkAction).mockResolvedValue({
      ok: true,
      entityKind: "TASK",
      entityId: "task-1",
      projectSlug: "high-ground",
      href: "/work?task=task-1",
      tags: [
        { id: "tag-episode-8", slug: "episode-8", label: "Episode 8" },
        { id: "tag-next", slug: "next-recording", label: "Next recording" },
      ],
      idempotentReplay: false,
      externalSideEffects: false,
    });
    renderCapture();

    await user.click(screen.getByRole("tab", { name: "Task" }));
    await user.type(screen.getByLabelText("Action"), "Prepare the Episode 8 proof listen");
    await user.type(screen.getByLabelText("Useful detail · optional"), "Return to the canonical session and media.");
    await user.type(screen.getByPlaceholderText("Find a tag"), "Episode 8");
    await user.click(screen.getByRole("checkbox", { name: "#Episode 8" }));
    await user.type(screen.getByLabelText("New reusable tag"), "Next recording");
    await user.click(screen.getByRole("button", { name: "Save task" }));

    await waitFor(() => expect(createNestQuickWorkAction).toHaveBeenCalledWith({
      entityKind: "TASK",
      projectSlug: "high-ground",
      title: "Prepare the Episode 8 proof listen",
      body: "Return to the canonical session and media.",
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      tagIds: ["tag-episode-8"],
      newTagLabels: ["Next recording"],
    }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Task saved in High Ground with #Episode 8, #Next recording",
    );
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute("href", "/work?task=task-1");
    expect(refresh).toHaveBeenCalled();
  });

  it("passes canonical tags into the private document-note transaction before opening it", async () => {
    const user = userEvent.setup();
    jest.mocked(createNestQuickNoteAction).mockResolvedValue({
      ok: true,
      documentId: "document-1",
      blockId: "block-1",
      projectSlug: "high-ground",
      href: "/create?project=high-ground&document=document-1&block=block-1",
      idempotentReplay: false,
      externalSideEffects: false,
    });
    renderCapture();

    await user.type(screen.getByLabelText("Note title"), "Episode 8 opening thought");
    await user.type(screen.getByLabelText("Note"), "The cold open needs the exact source clip beside it.");
    await user.type(screen.getByPlaceholderText("Find a tag"), "Proof");
    await user.click(screen.getByRole("checkbox", { name: "#Proof listen" }));
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(createNestQuickNoteAction).toHaveBeenCalledWith({
      projectSlug: "high-ground",
      title: "Episode 8 opening thought",
      body: "The cold open needs the exact source clip beside it.",
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      tagIds: ["tag-proof"],
      newTagLabels: [],
    }));
    expect(push).toHaveBeenCalledWith("/create?project=high-ground&document=document-1&block=block-1");
  });

  it("keeps the destination and no-side-effects boundary visible beside tag capture", () => {
    renderCapture();

    expect(screen.getByText("Saved to High Ground")).toBeInTheDocument();
    expect(screen.getByText(/applies the selected reusable tags atomically/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is sent, scheduled, or published/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage vocabulary" })).toHaveAttribute(
      "href",
      "/work?manage=tags&project=project-1",
    );
  });
});
