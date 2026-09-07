/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import WritingPageHeader from "./WritingPageHeader";

const props = { title: "A daily writing practice", nestName: "My writing", nestSlug: "my-writing", personal: true,
  saveState: "saved" as const, onClearScope: jest.fn(), exportLabel: "Export", onExport: jest.fn(), onRecentChanges: jest.fn() };

it("puts the page, its location, audience and save state before optional tools", () => {
  render(<WritingPageHeader {...props}><button>Restore version</button></WritingPageHeader>);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(props.title);
  expect(screen.getByRole("link", { name: "My writing" })).toHaveAttribute("href", "/notebooks/my-writing");
  expect(screen.getByText("Only you")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Saved");
  expect(screen.getByText("Restore version")).not.toBeVisible();
  fireEvent.click(screen.getByText("Tags, history & page tools"));
  expect(screen.getByRole("button", { name: "Restore version" })).toBeVisible();
});

it("keeps export, history and return-to-full-document actions functional", () => {
  render(<WritingPageHeader {...props} scope="Chapter 2">Tools</WritingPageHeader>);
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  fireEvent.click(screen.getByRole("button", { name: "Recent changes" }));
  fireEvent.click(screen.getByRole("button", { name: "Show full document" }));
  expect(props.onExport).toHaveBeenCalledTimes(1);
  expect(props.onRecentChanges).toHaveBeenCalledTimes(1);
  expect(props.onClearScope).toHaveBeenCalledTimes(1);
});

it("does not disguise unsaved edits or shared visibility", () => {
  render(<WritingPageHeader {...props} personal={false} saveState="unsaved">Tools</WritingPageHeader>);
  expect(screen.getByRole("status")).toHaveTextContent("Unsaved edits");
  expect(screen.getByText("Nest members")).toBeVisible();
  expect(screen.queryByText("Only you")).not.toBeInTheDocument();
});
