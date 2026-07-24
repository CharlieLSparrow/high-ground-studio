import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DocumentSafetyPanel from "./DocumentSafetyPanel";

jest.mock("./actions", () => ({
  createNamedDocumentCheckpointAction: jest.fn(),
  exportPortableDocumentAction: jest.fn(),
  listNamedDocumentCheckpointsAction: jest.fn().mockResolvedValue({
    ok: true,
    state: "persisted",
    checkpoints: [],
  }),
  restoreNamedDocumentCheckpointAction: jest.fn(),
  restorePortableDocumentAction: jest.fn(),
}));

describe("DocumentSafetyPanel accessibility", () => {
  it("offers one deliberate backup opener and keeps its implementation input out of the accessibility tree", async () => {
    const user = userEvent.setup();
    render(
      <DocumentSafetyPanel
        documentId="document-1"
        documentTitle="Episode 4 evidence"
        projectSlug="high-ground"
        saveState="saved"
      />,
    );

    await user.click(screen.getByTestId("document-safety-toggle"));

    expect(screen.getByRole("button", { name: "Open backup…" })).toBeInTheDocument();
    expect(screen.queryByText("Choose File")).not.toBeInTheDocument();
    expect(screen.getByTestId("document-portable-file")).toHaveAttribute("hidden");
    expect(screen.getByTestId("document-portable-file")).toHaveAttribute("tabindex", "-1");
  });
});
