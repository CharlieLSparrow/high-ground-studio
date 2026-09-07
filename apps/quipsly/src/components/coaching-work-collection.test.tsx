import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { CoachingWorkCollection } from "./coaching-work-collection";
import type { CoachingEngagementWorkEntry } from "./coaching-engagement-workspace";

const note: CoachingEngagementWorkEntry = { id: "note", kind: "NOTE", title: "A useful beginning", body: "A reflection about practicing listening.",
  owner: {id: "client", label: "Riley"}, status: null, visibility: "PRIVATE", dueAt: null, canEdit: true,
  createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z" };
const task = {...note, id: "task", kind: "TASK" as const, title: "Practice tomorrow", status: "DONE", visibility: "SHARED" as const};

function Collection() {
  const [selected, setSelected] = useState<string | null>(null);
  return <CoachingWorkCollection entries={[note, task]} selectedId={selected} onSelect={setSelected}>
    <div hidden={selected !== note.id}><label>My writing<textarea defaultValue="My unfinished idea" /></label></div>
    <div hidden={selected !== task.id}>Task content</div>
  </CoachingWorkCollection>;
}

it("searches words in title, content, and author without opening every item", () => {
  render(<Collection />);
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "Riley listening useful"}});
  expect(screen.getByRole("button", {name: `Open note: ${note.title}`})).toBeVisible();
  expect(screen.queryByRole("button", {name: `Open task: ${task.title}`})).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", {name: "My writing"})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "unmatched"}});
  expect(screen.getByRole("status")).toHaveTextContent("No matching work");
});

it("keeps the search and unfinished writing when returning to the list, and restores keyboard focus", async () => {
  render(<Collection />);
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "useful"}});
  fireEvent.click(screen.getByRole("button", {name: `Open note: ${note.title}`}));
  expect(screen.getByRole("heading", {name: "Note details"})).toHaveFocus();
  fireEvent.change(screen.getByRole("textbox", {name: "My writing"}), {target: {value: "Keep this thought"}});
  fireEvent.click(screen.getByRole("button", {name: "Back to work"}));
  await waitFor(() => expect(screen.getByRole("button", {name: `Open note: ${note.title}`})).toHaveFocus());
  expect(screen.getByRole("searchbox")).toHaveValue("useful");
  fireEvent.click(screen.getByRole("button", {name: `Open note: ${note.title}`}));
  expect(screen.getByRole("textbox", {name: "My writing"})).toHaveValue("Keep this thought");
});

it("shows privacy and completion at a glance, with a bounded preview rather than the full transcript", () => {
  const long = {...note, body: "A long source passage. ".repeat(100)};
  render(<CoachingWorkCollection entries={[long, task]} selectedId={null} onSelect={jest.fn()}>{null}</CoachingWorkCollection>);
  expect(screen.getByText("Only me")).toBeVisible();
  expect(screen.getByText("Completed")).toBeVisible();
  expect(screen.getByRole("button", {name: `Open note: ${note.title}`})).not.toHaveTextContent(long.body);
});

it("allows completing a task from the list without opening its editor", () => {
  const toggle = jest.fn();
  const select = jest.fn();
  const {rerender} = render(<CoachingWorkCollection entries={[task]} selectedId={null} onSelect={select} onToggleTask={toggle}>{null}</CoachingWorkCollection>);
  fireEvent.click(screen.getByRole("button", {name: `Reopen task: ${task.title}`}));
  expect(toggle).toHaveBeenCalledWith(task);
  expect(select).not.toHaveBeenCalled();
  rerender(<CoachingWorkCollection entries={[task]} selectedId={null} onSelect={select} onToggleTask={toggle} busyIds={new Set([task.id])}>{null}</CoachingWorkCollection>);
  expect(screen.getByRole("button", {name: `Reopen task: ${task.title}`})).toBeDisabled();
});
