import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  createAndAssignDocumentTagAction,
  replaceDocumentTagsAction,
} from "./actions";
import DocumentTagEditor from "./DocumentTagEditor";

jest.mock("./actions", () => ({
  createAndAssignDocumentTagAction: jest.fn(),
  replaceDocumentTagsAction: jest.fn(),
}));

const projectTags = [
  { id: "tag-proof", slug: "proof-listen", label: "Proof listen", category: "review" },
  { id: "tag-testflight", slug: "testflight", label: "TestFlight", category: "meaning" },
];

function renderEditor() {
  return render(
    <DocumentTagEditor
      documentId="document-1"
      projectId="project-1"
      projectSlug="quipsly-product"
      projectTags={projectTags}
      initialDocumentTags={[projectTags[0]]}
      initialUpdatedAt="2026-07-28T20:00:00.000Z"
      initialTagRevision={2}
    />,
  );
}

describe("document-level tag editor", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps whole-document classification distinct and saves one canonical tag set", async () => {
    jest.mocked(replaceDocumentTagsAction).mockResolvedValue({
      ok: true,
      documentId: "document-1",
      projectId: "project-1",
      tagIds: ["tag-proof", "tag-testflight"],
      updatedAt: "2026-07-28T20:00:01.000Z",
      tagRevision: 3,
      receiptId: "receipt-1",
      idempotentReplay: false,
    });
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: /edit tags/i }));
    expect(screen.getByText(/select text inside the editor when you mean a specific passage/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("TestFlight"));
    fireEvent.click(screen.getByRole("button", { name: /save tags/i }));

    await waitFor(() => expect(replaceDocumentTagsAction).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "document-1",
      tagIds: ["tag-proof", "tag-testflight"],
      expectedUpdatedAt: "2026-07-28T20:00:00.000Z",
      expectedTagRevision: 2,
      clientRequestId: expect.any(String),
    })));
    expect(await screen.findByText(/saved everywhere this page appears/i)).toBeInTheDocument();
  });

  it("creates and applies reusable vocabulary without a second save", async () => {
    jest.mocked(createAndAssignDocumentTagAction).mockResolvedValue({
      ok: true,
      documentId: "document-1",
      projectId: "project-1",
      tag: { id: "tag-recording", slug: "recording-day", label: "Recording day", category: "meaning", projectId: "project-1" },
      created: true,
      assignmentChanged: true,
      updatedAt: "2026-07-28T20:00:02.000Z",
      tagRevision: 3,
      receiptId: "receipt-2",
    });
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: /edit tags/i }));
    fireEvent.change(screen.getByPlaceholderText(/for example: testflight/i), { target: { value: "Recording day" } });
    fireEvent.click(screen.getByRole("button", { name: /create and apply/i }));

    await waitFor(() => expect(createAndAssignDocumentTagAction).toHaveBeenCalledWith({
      documentId: "document-1",
      label: "Recording day",
      expectedUpdatedAt: "2026-07-28T20:00:00.000Z",
      expectedTagRevision: 2,
    }));
    expect(await screen.findByText(/created and applied #recording day/i)).toBeInTheDocument();
    expect(screen.getByText("#Recording day")).toBeInTheDocument();
  });

  it("keeps the visible revision truthful when an existing tag is already applied", async () => {
    jest.mocked(createAndAssignDocumentTagAction).mockResolvedValue({
      ok: true,
      documentId: "document-1",
      projectId: "project-1",
      tag: { ...projectTags[0], projectId: "project-1" },
      created: false,
      assignmentChanged: false,
      updatedAt: "2026-07-28T20:00:00.000Z",
      tagRevision: 2,
      receiptId: "receipt-no-op",
    });
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: /edit tags/i }));
    fireEvent.change(screen.getByPlaceholderText(/for example: testflight/i), { target: { value: "Proof listen" } });
    fireEvent.click(screen.getByRole("button", { name: /create and apply/i }));

    expect(await screen.findByText(/was already applied/i)).toBeInTheDocument();
    expect(screen.getByText(/revision 2/)).toBeInTheDocument();
  });

  it("keeps unsaved choices visible when persistence reports a conflict", async () => {
    jest.mocked(replaceDocumentTagsAction).mockResolvedValue({
      ok: false,
      code: "CONFLICT",
      error: "This record changed elsewhere. Refresh before changing tags.",
    });
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: /edit tags/i }));
    fireEvent.click(screen.getByText("TestFlight"));
    fireEvent.click(screen.getByRole("button", { name: /save tags/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/changed elsewhere/i);
    expect(screen.getByRole("checkbox", { name: "TestFlight" })).toBeChecked();
  });
});
