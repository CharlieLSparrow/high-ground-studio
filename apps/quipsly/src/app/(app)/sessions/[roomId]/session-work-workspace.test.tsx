import React from "react";
import {render, screen, within, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {SessionWorkWorkspace} from "./session-work-workspace";
import type {SessionQuickEntry} from "./session-review-client";
import {updateWorkTaskStatus, editWorkTask} from "../../work/actions";

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({useRouter: () => ({refresh: mockRefresh})}));
jest.mock("../../work/actions", () => ({editWorkTask: jest.fn(), editWorkGoal: jest.fn(), updateWorkTaskStatus: jest.fn(), updateWorkGoalStatus: jest.fn()}));
const task: SessionQuickEntry = {id: "task-1", kind: "TASK", title: "Write one page", body: "Start with the main idea", status: "OPEN", createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-01T12:00:00Z", tags: [], visibility: "SESSION_SHARED", ownedByCurrentActor: true, canEdit: true};
const response = (data: unknown, status = 200) => ({ok: status < 400, json: async () => data}) as Response;
const originalFetch = global.fetch;

describe("Session work workspace", () => {
  beforeEach(() => {jest.clearAllMocks();});
  afterEach(() => {global.fetch = originalFetch;});

  it("finds work by words, person and tags while combining ownership and kind filters", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn(); global.fetch = fetchMock;
    render(<SessionWorkWorkspace roomId="room-1" compact entries={[
      {...task, ownerLabel: "Casey", tags: [{id: "tag-1", label: "Writing", slug: "writing"}]},
      {...task, id: "riley-task", title: "Draft reflection", ownerLabel: "Riley", ownedByCurrentActor: false, tags: [{id: "tag-1", label: "Writing", slug: "writing"}]},
      {...task, id: "goal-1", kind: "GOAL", title: "Finish the chapter", ownerLabel: "Casey", body: "Writing practice"},
    ]} />);
    const search = screen.getByRole("searchbox", {name: "Find a task or goal"});
    await user.type(search, "WRITING Casey");
    expect(screen.getByRole("heading", {name: "Write one page"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Finish the chapter"})).toBeVisible();
    expect(screen.queryByRole("heading", {name: "Draft reflection"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Tasks"}));
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3 items");
    await user.click(screen.getByRole("button", {name: "Clear search"}));
    await user.click(screen.getByRole("button", {name: "Assigned to me"}));
    expect(screen.getByRole("heading", {name: "Write one page"})).toBeVisible();
    expect(screen.queryByRole("heading", {name: "Draft reflection"})).not.toBeInTheDocument();
    await user.type(search, "missing");
    expect(screen.getByText(/No matching tasks or goals/)).toBeVisible();
    expect(screen.queryByText("You're caught up here.")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reveals a completed search result and keeps filters when canonical work refreshes", async () => {
    const user = userEvent.setup();
    const entries = [{...task, status: "DONE"}];
    const {rerender} = render(<SessionWorkWorkspace roomId="room-1" compact entries={entries} />);
    await user.type(screen.getByRole("searchbox", {name: "Find a task or goal"}), "one page");
    expect(screen.getByRole("heading", {name: task.title!})).toBeVisible();
    rerender(<SessionWorkWorkspace roomId="room-1" compact entries={[...entries, {...task, id: "new", title: "Another task"}]} />);
    expect(screen.getByRole("searchbox", {name: "Find a task or goal"})).toHaveValue("one page");
    expect(screen.queryByRole("heading", {name: "Another task"})).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 items");
  });

  it("puts title and save before optional administration and creates canonical work", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue(response({ok: true, entry: task})); global.fetch = fetchMock;
    render(<SessionWorkWorkspace roomId="room-1" entries={[]} />);
    expect(screen.getByRole("textbox", {name: "Task title"})).toBeVisible();
    expect(screen.getByLabelText("Context (optional)")).not.toBeVisible();
    await user.type(screen.getByRole("textbox", {name: "Task title"}), "Write one page");
    await user.click(screen.getByRole("button", {name: "Save task"}));
    expect(await screen.findByRole("heading", {name: task.title!})).toBeVisible();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({kind: "TASK", title: task.title, visibility: "SESSION_SHARED", body: "", targetAt: null});
    expect(fetchMock.mock.calls[0][0]).toBe("/api/sessions/room-1/work");
    expect(screen.getByRole("textbox", {name: "Task title"})).toHaveValue("");
  });
  it("shows work without unusable create controls to a read-only participant", () => {
    render(<SessionWorkWorkspace roomId="room-1" entries={[{...task, canEdit: false}]} canCreate={false} />);
    expect(screen.getByRole("heading", {name: task.title!})).toBeVisible();
    expect(screen.queryByRole("form", {name: "New session work"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Mark done"})).not.toBeInTheDocument();
  });

  it("assigns shared client-space work and returns private work to its creator", async () => {
    const context = {engagementId: "space-1", currentUserId: "coach-1", members: [
      {id: "coach-1", label: "Casey", role: "COACH"}, {id: "client-1", label: "Riley", role: "CLIENT"},
    ]};
    const fetchMock = jest.fn().mockResolvedValue(response({ok: true, entry: {...task, visibility: "ENGAGEMENT_SHARED", ownerUserId: "client-1", ownerLabel: "Riley", ownedByCurrentActor: false, engagementId: "space-1"}})); global.fetch = fetchMock;
    render(<SessionWorkWorkspace roomId="room-1" entries={[]} assignmentContext={context} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox", {name: "Assigned to"}), "client-1");
    await user.type(screen.getByRole("textbox", {name: "Task title"}), "A reflection for Riley");
    await user.click(screen.getByRole("button", {name: "Save task"}));
    await screen.findByRole("status");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ownerUserId: "client-1", visibility: "ENGAGEMENT_SHARED"});
    expect(screen.getByText("Shared client space · Riley")).toBeVisible();
    await user.click(screen.getByText(/Details, date and sharing/));
    await user.selectOptions(screen.getByRole("combobox", {name: "Who can see it"}), "AUTHOR_PRIVATE");
    expect(within(screen.getByRole("form", {name: "New session work"})).queryByRole("combobox", {name: "Assigned to"})).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", {name: "Task title"}), "My private preparation");
    await user.click(screen.getByRole("button", {name: "Save task"}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ownerUserId: "coach-1", visibility: "AUTHOR_PRIVATE"});
  });

  it("preserves the entire failed private goal and reuses its identity on retry", async () => {
    const user = userEvent.setup();
    const saved = {...task, kind: "GOAL" as const, status: "ACTIVE", visibility: "AUTHOR_PRIVATE" as const};
    const fetchMock = jest.fn().mockResolvedValueOnce(response({error: "Connection interrupted"}, 503)).mockResolvedValueOnce(response({ok: true, entry: saved})); global.fetch = fetchMock;
    render(<SessionWorkWorkspace roomId="room-1" entries={[]} />);
    await user.click(screen.getByRole("button", {name: "Goal"}));
    await user.type(screen.getByRole("textbox", {name: "Goal title"}), "Write one page");
    await user.click(screen.getByText(/Details, date and sharing/));
    await user.type(screen.getByRole("textbox", {name: "Context (optional)"}), "My own goal");
    await user.selectOptions(screen.getByRole("combobox", {name: "Who can see it"}), "AUTHOR_PRIVATE");
    await user.click(screen.getByRole("button", {name: "Save goal"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection interrupted");
    expect(screen.getByRole("textbox", {name: "Goal title"})).toHaveValue("Write one page");
    expect(screen.getByRole("textbox", {name: "Context (optional)"})).toHaveValue("My own goal");
    expect(screen.getByRole("combobox", {name: "Who can see it"})).toHaveValue("AUTHOR_PRIVATE");
    await user.click(screen.getByRole("button", {name: "Save goal"}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(JSON.parse(fetchMock.mock.calls[0][1].body));
    expect(await screen.findByRole("status")).toHaveTextContent("Only you can see it");
    expect(screen.getByRole("heading", {name: task.title!})).toBeVisible();
  });

  it("uses a new identity if the user changes a failed attempt", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue(response({error: "Offline"}, 503)); global.fetch = fetchMock;
    render(<SessionWorkWorkspace roomId="room-1" entries={[]} />);
    await user.type(screen.getByRole("textbox", {name: "Task title"}), "First idea");
    await user.click(screen.getByRole("button", {name: "Save task"}));
    await screen.findByRole("alert");
    await user.type(screen.getByRole("textbox", {name: "Task title"}), " revised");
    await user.click(screen.getByRole("button", {name: "Save task"}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).clientRequestId).not.toBe(JSON.parse(fetchMock.mock.calls[0][1].body).clientRequestId);
  });

  it("submits a native date-picker value even before a change event is delivered", async () => {
    const fetchMock = jest.fn().mockResolvedValue(response({ok: true, entry: {...task, dueAt: "2026-09-20T12:00:00Z"}})); global.fetch = fetchMock;
    render(<SessionWorkWorkspace roomId="room-1" entries={[]} />);
    await userEvent.type(screen.getByRole("textbox", {name: "Task title"}), "Write one page");
    await userEvent.click(screen.getByText(/Details, date and sharing/));
    (screen.getByLabelText("Due date (optional)") as HTMLInputElement).value = "2026-09-20";
    await userEvent.click(screen.getByRole("button", {name: "Save task"}));
    await screen.findByRole("status");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).targetAt).toBe(new Date("2026-09-20T12:00:00").toISOString());
    expect(document.querySelector("time")).toHaveAttribute("datetime", "2026-09-20T12:00:00Z");
  });

  it("shows generated source links, dates and open work first, with completed work available", async () => {
    const goal = {...task, id: "goal-1", kind: "GOAL" as const, title: "Write a chapter", status: "ACTIVE"};
    render(<SessionWorkWorkspace roomId="room-1" entries={[{...task, id: "done", title: "Finished reflection", status: "DONE"}, {...task, dueAt: "2026-09-20T12:00:00Z", sourceHref: "/sessions/room-1?mode=transcript&start=10"}, goal]} />);
    expect(screen.getByRole("heading", {name: task.title!})).toBeVisible();
    expect(screen.getByRole("link", {name: "From recording"})).toHaveAttribute("href", "/sessions/room-1?mode=transcript&start=10");
    expect(document.querySelector("time")).toHaveAttribute("dateTime", "2026-09-20T12:00:00Z");
    expect(screen.getByText("Finished reflection")).not.toBeVisible();
    await userEvent.click(screen.getByText("Completed (1)"));
    expect(screen.getByRole("heading", {name: "Finished reflection"})).toBeVisible();
    await userEvent.click(screen.getByRole("button", {name: "Goals"}));
    expect(screen.getByRole("heading", {name: "Write a chapter"})).toBeVisible();
    expect(screen.queryByRole("heading", {name: task.title!})).not.toBeInTheDocument();
  });

  it("completes and reopens the same canonical task in the workspace", async () => {
    jest.mocked(updateWorkTaskStatus).mockResolvedValueOnce({ok: true, taskId: task.id, status: "DONE", updatedAt: "2026-09-02T12:00:00Z", receiptId: "one"}).mockResolvedValueOnce({ok: true, taskId: task.id, status: "OPEN", updatedAt: "2026-09-03T12:00:00Z", receiptId: "two"});
    render(<SessionWorkWorkspace roomId="room-1" entries={[task]} />);
    await userEvent.click(screen.getByRole("button", {name: "Mark done"}));
    await screen.findByText("Completed (1)");
    expect(screen.getByText(task.title!)).not.toBeVisible();
    await userEvent.click(screen.getByText("Completed (1)"));
    await userEvent.click(screen.getByRole("button", {name: "Reopen"}));
    expect(await screen.findByRole("button", {name: "Mark done"})).toBeVisible();
    expect(updateWorkTaskStatus).toHaveBeenLastCalledWith({taskId: task.id, nextStatus: "OPEN", expectedUpdatedAt: "2026-09-02T12:00:00Z"});
  });

  it("edits a generated task without requiring a move to Work", async () => {
    jest.mocked(editWorkTask).mockResolvedValue({ok: true, taskId: task.id, title: "Write two pages", detail: "Updated context", dueAt: null, updatedAt: "2026-09-02T12:00:00Z", receiptId: "edit"});
    render(<SessionWorkWorkspace roomId="room-1" entries={[{...task, fromTranscript: true, ownedByCurrentActor: false}]} />);
    await userEvent.click(screen.getByText("Edit task"));
    const form = screen.getByRole("button", {name: "Save changes"}).closest("form")!;
    await userEvent.clear(within(form).getByRole("textbox", {name: "Title"}));
    await userEvent.type(within(form).getByRole("textbox", {name: "Title"}), "Write two pages");
    await userEvent.click(screen.getByRole("button", {name: "Save changes"}));
    expect(await screen.findByRole("heading", {name: "Write two pages"})).toBeVisible();
    expect(screen.queryByRole("link", {name: "Open in Work"})).not.toBeInTheDocument();
  });
});
