import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AssistantInbox } from "./AssistantInbox";
import type { StudioAssistantAction } from "./types";

jest.mock("@high-ground/quipsly-domain/source-aware", () => ({
  createTextQuoteSelector: jest.fn(() => ({ type: "TextQuoteSelector" })),
}), { virtual: true });

function proposal(status: StudioAssistantAction["status"]): StudioAssistantAction {
  return {
    id: "action-1",
    kind: "PROPOSE_ENTITY",
    label: "Courage theme",
    status,
    payloadJson: {
      name: "Courage",
      type: "THEME_MOTIF",
      sourceBlockId: "block-1",
      attributes: { sourceExcerpt: "Stay with the question." },
    },
    explanation: "The exact passage repeats a central theme.",
    riskLevel: "MEDIUM",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
  };
}

describe("Story Bible assistant inbox review boundary", () => {
  it("records review before offering a separate canonical commit", async () => {
    const onProcessAction = jest.fn().mockResolvedValue(undefined);
    const { rerender } = render(<AssistantInbox actions={[proposal("proposed")]} onProcessAction={onProcessAction} />);

    expect(screen.getByText(/Stay with the question/)).toBeInTheDocument();
    expect(screen.getByText("Exact block attached · rechecked at commit")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Commit to Story Bible" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review proposal" }));
    await waitFor(() => expect(onProcessAction).toHaveBeenCalledWith("action-1", "approved"));

    rerender(<AssistantInbox actions={[proposal("approved")]} onProcessAction={onProcessAction} />);
    expect(screen.getByRole("button", { name: "Commit to Story Bible" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo review" })).toBeInTheDocument();
  });
});
