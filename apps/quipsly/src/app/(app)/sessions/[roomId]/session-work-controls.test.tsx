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
const originalFetch = global.fetch;

describe("in-session work controls", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {global.fetch = originalFetch;});
  it("reassigns shared work through the existing client-space endpoint and retries without losing the draft", async () => {
    const entry = {...task, engagementId: "space-1", ownerUserId: "coach-1"};
    const context = {engagementId: "space-1", currentUserId: "coach-1", members: [
      {id: "coach-1", label: "Casey", role: "COACH"}, {id: "client-1", label: "Riley", role: "CLIENT"},
    ]};
    const fetchMock = jest.fn().mockResolvedValueOnce({ok: false, json: async () => ({error: "Connection interrupted"})})
      .mockResolvedValueOnce({ok: true, json: async () => ({ok: true, entry: {id: entry.id, title: entry.title,
        body: entry.body, dueAt: null, status: "OPEN", updatedAt: "2026-09-09T00:00:00Z", owner: {id: "client-1", label: "Riley"}}})});
    global.fetch = fetchMock;
    const onUpdate = jest.fn();
    render(<SessionWorkControls entry={entry} onUpdate={onUpdate} assignmentContext={context} />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Edit task"));
    await user.selectOptions(screen.getByRole("combobox", {name: "Assigned to"}), "client-1");
    await user.click(screen.getByRole("button", {name: "Save changes"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection interrupted");
    expect(screen.getByRole("combobox", {name: "Assigned to"})).toHaveValue("client-1");
    await user.click(screen.getByRole("button", {name: "Save changes"}));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/coaching/engagements/space-1/work");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(JSON.parse(fetchMock.mock.calls[0][1].body));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ownerUserId: "client-1", ownerLabel: "Riley", ownedByCurrentActor: false}));
    expect(editWorkTask).not.toHaveBeenCalled();
  });
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
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({status: "DONE", updatedAt: "2026-09-07T01:00:00Z"}, {restoreFocus: false}));
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
  it("keeps the draft's original revision when another collaborator refreshes the entry", async () => {
    jest.mocked(editWorkTask).mockResolvedValue({ok: false, code: "CONFLICT", error: "Another person updated this task."});
    const onUpdate = jest.fn();
    const view = render(<SessionWorkControls entry={task} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText("Edit task"));
    await userEvent.type(screen.getByRole("textbox", {name: "Title"}), " tomorrow");
    view.rerender(<SessionWorkControls entry={{...task, title: "A collaborator's new title", updatedAt: "2026-09-08T00:00:00Z"}} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByRole("button", {name: "Save changes"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Another person updated");
    expect(editWorkTask).toHaveBeenCalledWith(expect.objectContaining({expectedUpdatedAt: task.updatedAt, title: "Draft one page tomorrow"}));
    expect(screen.getByRole("textbox", {name: "Title"})).toHaveValue("Draft one page tomorrow");
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
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({status: "ACHIEVED", updatedAt: "2026-09-07T01:00:00Z"}, {restoreFocus: false}));
    view.rerender(<SessionWorkControls entry={{...goal, status: "ACHIEVED", updatedAt: "2026-09-07T01:00:00Z"}} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByRole("button", {name: "Reopen"}));
    expect(updateWorkGoalStatus).toHaveBeenLastCalledWith({goalId: goal.id, nextStatus: "ACTIVE", expectedUpdatedAt: "2026-09-07T01:00:00Z"});
  });
});
