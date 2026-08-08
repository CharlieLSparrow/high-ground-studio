import { fireEvent, render, screen } from "@testing-library/react";

import { SourceQuickSelectComposer } from "./SourceQuickSelectComposer";

const boards = [
  { id: "board-main", title: "Episode selects", revision: 4 },
  { id: "board-shorts", title: "Shorts", revision: 2 },
];

describe("SourceQuickSelectComposer", () => {
  it("keeps the common range-to-card path immediate while preserving the canonical board choice", () => {
    const onTitleChange = jest.fn();
    const onNotesChange = jest.fn();
    const onBoardChange = jest.fn();
    const onSave = jest.fn();

    render(
      <SourceQuickSelectComposer
        canWrite
        sourceLabel="Episode 5 · lakeside walk · segment 4"
        inPoint={12.25}
        outPoint={24.5}
        title="Homer spots the shoreline"
        notes="Possible cold-open visual."
        selectedBoardId="board-main"
        boards={boards}
        pending={false}
        canSave
        onTitleChange={onTitleChange}
        onNotesChange={onNotesChange}
        onBoardChange={onBoardChange}
        onSave={onSave}
      >
        <p>Advanced provenance-preserving details</p>
      </SourceQuickSelectComposer>,
    );

    expect(screen.getByText("00:12.25 – 00:24.50")).toBeInTheDocument();
    expect(screen.getByText("12.25 seconds")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("What happens here?"), {
      target: { value: "A clearer title" },
    });
    fireEvent.change(screen.getByLabelText(/Quick note/), {
      target: { value: "Keep the reaction." },
    });
    fireEvent.change(screen.getByLabelText("Save to"), {
      target: { value: "board-shorts" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save to Episode selects" }),
    );

    expect(onTitleChange).toHaveBeenCalledWith("A clearer title");
    expect(onNotesChange).toHaveBeenCalledWith("Keep the reaction.");
    expect(onBoardChange).toHaveBeenCalledWith("board-shorts");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Add story details, tags, and camera direction"),
    ).toBeInTheDocument();
  });

  it("explains each missing requirement and refuses a title-only card", () => {
    render(
      <SourceQuickSelectComposer
        canWrite
        sourceLabel="VID_001.LRV"
        inPoint={10}
        outPoint={null}
        title="An unfinished select"
        notes=""
        selectedBoardId={null}
        boards={boards}
        pending={false}
        canSave={false}
        onTitleChange={jest.fn()}
        onNotesChange={jest.fn()}
        onBoardChange={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    expect(screen.getByText("Mark In and Out above")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Mark an exact In and Out point before saving this select.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save select" })).toBeDisabled();
  });

  it("keeps collaboration playback readable for viewers without implying write access", () => {
    render(
      <SourceQuickSelectComposer
        canWrite={false}
        sourceLabel="VID_001.LRV"
        inPoint={1}
        outPoint={3}
        title=""
        notes=""
        selectedBoardId={null}
        boards={boards}
        pending={false}
        canSave={false}
        onTitleChange={jest.fn()}
        onNotesChange={jest.fn()}
        onBoardChange={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    expect(
      screen.getByText(/Viewer access preserves playback and board reading/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("What happens here?"),
    ).not.toBeInTheDocument();
  });
});
