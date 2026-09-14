import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsClient } from "./settings-client";
import { createTagAction } from "./actions";

jest.mock("./actions", () => ({
  createTagAction: jest.fn(), deleteTagAction: jest.fn(),
  createWorkflowStageAction: jest.fn(), updateWorkflowStageAction: jest.fn(),
  deleteWorkflowStageAction: jest.fn(),
}));

test("creates a named, colored tag through labeled controls and displays its saved color", async () => {
  jest.mocked(createTagAction).mockResolvedValue({ ok: true, tag: {
    id: "research", label: "Research", hexColor: "#23543a", category: "meaning", uiCategory: "IDEA",
  } } as Awaited<ReturnType<typeof createTagAction>>);
  render(<SettingsClient project={{ id: "nest", name: "Writing" }} initialStages={[]} initialTags={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Custom Tags" }));
  fireEvent.click(screen.getByRole("button", { name: "New Tag" }));
  fireEvent.change(screen.getByLabelText("Tag name"), { target: { value: "Research" } });
  fireEvent.change(screen.getByLabelText("Tag color"), { target: { value: "#23543a" } });
  fireEvent.change(screen.getByLabelText("Tag type"), { target: { value: "IDEA" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(createTagAction).toHaveBeenCalledWith("nest", "Research", "#23543a", "meaning", "IDEA"));
  expect(await screen.findByText("#Research")).toHaveStyle({ backgroundColor: "#23543a", color: "#ffffff" });
});

test("stage controls are not mislabeled as tag controls", () => {
  render(<SettingsClient project={{ id: "nest", name: "Writing" }} initialStages={[]} initialTags={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "New Stage" }));
  expect(screen.getByLabelText("Stage name")).toBeInTheDocument();
  expect(screen.getByLabelText("Stage color")).toBeInTheDocument();
  expect(screen.queryByLabelText("Tag color")).not.toBeInTheDocument();
});
