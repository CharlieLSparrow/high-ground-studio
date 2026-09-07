/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ViewFilter from "./ViewFilter";
import { createDocumentAction, renameDocumentAction } from "../nests/[slug]/actions";
import { DEFAULT_VIEW } from "./Workspace";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }));
jest.mock("./Workspace", () => ({ DEFAULT_VIEW: { id: "default", name: "All", type: "default", filters: { tagSlugs: [], includeCategories: [] }, display: { mode: "standard" } } }));
jest.mock("../nests/[slug]/actions", () => ({ createDocumentAction: jest.fn().mockResolvedValue(undefined),
  renameDocumentAction: jest.fn().mockResolvedValue(undefined), duplicateDocumentAsDraftAction: jest.fn(), promoteNoteToWritingPageAction: jest.fn() }));
const docs = [
  { id: "draft", title: "Morning writing", sourceLabel: "document-kind:draft", updatedAt: new Date(), personal: true },
  { id: "note", title: "Coaching ideas", sourceLabel: "document-kind:note", updatedAt: new Date(), personal: false },
];
const props = { activeView: DEFAULT_VIEW, setActiveView: jest.fn(), views: [], documentBoundaries: [],
  activeBoundaryId: null, setActiveBoundaryId: jest.fn(), workflowSystem: "content-creation" as const,
  projectDocuments: docs, activeDocumentId: "draft", projectSlug: "writing" };
beforeEach(() => {
  localStorage.clear(); jest.clearAllMocks();
  window.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

it("uses a modal page browser on compact screens and closes on Escape", () => {
  render(<ViewFilter {...props} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Browse pages" }));
  const dialog = screen.getByRole("dialog", { name: "Browse pages" });
  expect(dialog).toHaveAttribute("open");
  fireEvent(dialog, new Event("cancel", { bubbles: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Browse pages" })).toHaveAttribute("aria-expanded", "false");
});

it("keeps pages alongside the document on wide screens without a modal", () => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() });
  render(<ViewFilter {...props} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Pages" })).toBeVisible();
  expect(screen.getByRole("link", { name: /Morning writing/ })).toBeVisible();
});

it("browses and searches actual pages without opening administrative controls", () => {
  render(<ViewFilter {...props} />);
  // The mobile drawer is explicitly named; CSS keeps the same navigation visible on desktop.
  fireEvent.click(screen.getByRole("button", { name: "Browse pages" }));
  expect(screen.getByRole("link", { name: /Morning writing/ })).toHaveAttribute("href", "/create?project=writing&document=draft");
  expect(screen.getByLabelText("Page title")).not.toBeVisible();
  fireEvent.change(screen.getByLabelText("Find a page"), { target: { value: "Coaching" } });
  expect(screen.queryByRole("link", { name: /Morning writing/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Coaching ideas/ })).toBeInTheDocument();
});

it("creates a page directly and keeps rename available in page actions", async () => {
  render(<ViewFilter {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Browse pages" }));
  fireEvent.click(screen.getByRole("button", { name: "New page" }));
  expect(createDocumentAction).toHaveBeenCalledWith("writing", "draft");
  fireEvent.click(screen.getByText("Page actions"));
  fireEvent.change(screen.getByLabelText("Page title"), { target: { value: "A writing habit" } });
  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  await waitFor(() => expect(renameDocumentAction).toHaveBeenCalledWith("writing", "draft", "A writing habit"));
});
