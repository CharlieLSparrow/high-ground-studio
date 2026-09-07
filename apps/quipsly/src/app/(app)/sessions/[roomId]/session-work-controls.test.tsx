import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionWorkControls } from "./session-work-controls";
import { editWorkGoal, editWorkTask, updateWorkGoalStatus, updateWorkTaskStatus } from "../../work/actions";
import type { SessionQuickEntry } from "./session-review-client";

jest.mock("../../work/actions", () => ({ editWorkTask: jest.fn(), editWorkGoal: jest.fn(), updateWorkTaskStatus: jest.fn(), updateWorkGoalStatus: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({refresh: jest.fn()}) }));
const task: SessionQuickEntry = {
  id: "generated-task", kind: "TASK", title: "Draft one page", body: "From the coaching recording",
  status: "OPEN", createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z", tags: [],
  ownedByCurrentActor: false, canEdit: true, visibility: "ENGAGEMENT_SHARED", fromTranscript: true,
};

describe("in-session work controls", () => {
  beforeEach(() => jest.clearAllMocks());
  it("edits a generated shared task in place through the canonical action", async () => {
    const onUpdate = jest.fn();
    jest.mocked(editWorkTask).mockResolvedValue({ok: true, taskId: task.id, title: "Write two pages", detail: "Keep it simple", dueAt: null, updatedAt: "2026-09-07T01:00:00Z", receiptId: "edit-1"});
    render(<SessionWorkControls entry={task} onUpdate={onUpdate} />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Edit task"));
    await user.clear(screen.getByRole("textbox", {name: "Title"}));
    await user.type(screen.getByRole("textbox", {name: "Title"}), "Write two pages");
    await user.clear(screen.getByRole("textbox", {name: "Details"}));
    await user.type(screen.getByRole("textbox", {name: "Details"}), "Keep it simple");
    await user.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(editWorkTask).toHaveBeenCalledWith(expect.objectContaining({taskId: task.id, title: "Write two pages", detail: "Keep it simple", expectedUpdatedAt: task.updatedAt})));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({title: "Write two pages", updatedAt: "2026-09-07T01:00:00Z"}));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });
  it("completes and reopens without making another task", async () => {
    jest.mocked(updateWorkTaskStatus).mockResolvedValue({ok: true, taskId: task.id, status: "DONE", updatedAt: "2026-09-07T01:00:00Z", receiptId: "status-1"});
    const onUpdate = jest.fn();
    const view = render(<SessionWorkControls entry={task} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByRole("button", {name: "Mark done"}));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({status: "DONE", updatedAt: "2026-09-07T01:00:00Z"}));
    view.rerender(<SessionWorkControls entry={{...task, status: "DONE", updatedAt: "2026-09-07T01:00:00Z"}} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByRole("button", {name: "Reopen"}));
    expect(updateWorkTaskStatus).toHaveBeenLastCalledWith({taskId: task.id, nextStatus: "OPEN", expectedUpdatedAt: "2026-09-07T01:00:00Z"});
  });
  it("retains the draft and exposes a recoverable conflict", async () => {
    jest.mocked(editWorkTask).mockResolvedValue({ok: false, code: "CONFLICT", error: "This task changed elsewhere. Refresh before editing again."});
    render(<SessionWorkControls entry={task} onUpdate={jest.fn()} />);
    await userEvent.click(screen.getByText("Edit task"));
    await userEvent.type(screen.getByRole("textbox", {name: "Title"}), " tomorrow");
    await userEvent.click(screen.getByRole("button", {name: "Save changes"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(screen.getByRole("textbox", {name: "Title"})).toHaveValue("Draft one page tomorrow");
    expect(screen.getByRole("button", {name: "Save changes"})).toBeEnabled();
  });
  it("does not offer writes to a read-only collaborator", () => {
    render(<SessionWorkControls entry={{...task, canEdit: false}} onUpdate={jest.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("edits a shared goal without inventing a deadline", async () => {
    const goal = {...task, id: "generated-goal", kind: "GOAL" as const, status: "ACTIVE"};
    const onUpdate = jest.fn();
    jest.mocked(editWorkGoal).mockResolvedValue({ok: true, goalId: goal.id, title: "Write each morning", description: "Ten minutes is enough", targetAt: null, updatedAt: "2026-09-07T01:00:00Z", receiptId: "goal-edit"});
    render(<SessionWorkControls entry={goal} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText("Edit goal"));
    await userEvent.clear(screen.getByRole("textbox", {name: "Title"}));
    await userEvent.type(screen.getByRole("textbox", {name: "Title"}), "Write each morning");
    await userEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(editWorkGoal).toHaveBeenCalledWith(expect.objectContaining({goalId: goal.id, title: "Write each morning", targetDecision: "KEEP", targetLocalDate: null, expectedUpdatedAt: goal.updatedAt})));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({title: "Write each morning", dueAt: null}));
  });
  it("achieves and reopens the same shared goal", async () => {
    const goal = {...task, id: "generated-goal", kind: "GOAL" as const, status: "ACTIVE"};
    jest.mocked(updateWorkGoalStatus).mockResolvedValue({ok: true, goalId: goal.id, status: "ACHIEVED", updatedAt: "2026-09-07T01:00:00Z", receiptId: "goal-status"});
    const onUpdate = jest.fn();
    const view = render(<SessionWorkControls entry={goal} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByRole("button", {name: "Mark achieved"}));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({status: "ACHIEVED", updatedAt: "2026-09-07T01:00:00Z"}));
    view.rerender(<SessionWorkControls entry={{...goal, status: "ACHIEVED", updatedAt: "2026-09-07T01:00:00Z"}} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByRole("button", {name: "Reopen"}));
    expect(updateWorkGoalStatus).toHaveBeenLastCalledWith({goalId: goal.id, nextStatus: "ACTIVE", expectedUpdatedAt: "2026-09-07T01:00:00Z"});
  });
});
