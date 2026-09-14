import React from "react";
import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {CallWorkPanel} from "./call-work-panel";
import {updateWorkTaskStatus} from "@/app/(app)/work/actions";

jest.mock("next/navigation", () => ({useRouter: () => ({refresh: jest.fn()})}));
jest.mock("@/app/(app)/work/actions", () => ({editWorkTask: jest.fn(), editWorkGoal: jest.fn(), updateWorkTaskStatus: jest.fn(), updateWorkGoalStatus: jest.fn()}));
const task = {id: "task-1", kind: "TASK", title: "Send the reflection", body: null, status: "OPEN", createdAt: "2026-09-13T12:00:00Z", updatedAt: "2026-09-13T12:00:00Z", tags: [], visibility: "SESSION_SHARED", ownedByCurrentActor: true, canEdit: true};
const collection = (entries: unknown[] = []) => ({ok: true, actorUserId: "coach-1", entries, canCreate: true, assignmentContext: null});
const response = (data: unknown, status = 200) => ({ok: status < 400, status, json: async () => data}) as Response;
const originalFetch = global.fetch;

describe("Call work panel", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {global.fetch = originalFetch;});

  it("finds an older linked task outside the recent list and reveals it even when completed", async () => {
    global.fetch = jest.fn(async url => String(url).includes("entryId=")
      ? response({ok: true, roomId: "room-1", actorUserId: "coach-1", entry: {...task, status: "DONE"}})
      : response(collection()));
    render(<CallWorkPanel roomId="room-1" active entryToOpen={{id: task.id, request: 1}} onOpenWorkspace={jest.fn()} />);
    const heading = await screen.findByRole("heading", {name: task.title});
    await waitFor(() => expect(heading).toBeVisible());
    await waitFor(() => expect(document.activeElement).toBe(heading.closest("article")));
    expect(fetch).toHaveBeenCalledWith("/api/sessions/room-1/work?entryId=task-1", {cache: "no-store"});
  });

  it("does not merge a linked-task response from another identity with visible work", async () => {
    global.fetch = jest.fn(async url => String(url).includes("entryId=")
      ? response({ok: true, roomId: "room-1", actorUserId: "other-actor", entry: task})
      : response(collection()));
    render(<CallWorkPanel roomId="room-1" active entryToOpen={{id: task.id, request: 1}} onOpenWorkspace={jest.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your account changed");
    expect(screen.queryByRole("heading", {name: task.title})).not.toBeInTheDocument();
  });

  it("clears visible work on non-JSON access failures", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(response(collection([task])))
      .mockResolvedValueOnce({status: 401, ok: false, json: async () => {throw new SyntaxError("HTML sign-in page");}});
    global.fetch = fetchMock;
    render(<CallWorkPanel roomId="room-1" active onOpenWorkspace={jest.fn()} />);
    await screen.findByRole("heading", {name: task.title});
    act(() => window.dispatchEvent(new Event("focus")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again");
    expect(screen.queryByRole("heading", {name: task.title})).not.toBeInTheDocument();
  });

  it("creates canonical work and retains unfinished input while its pane is hidden", async () => {
    let entries: unknown[] = [];
    const fetchMock = jest.fn(async (_url, options) => {
      if (options?.method === "POST") {entries = [task]; return response({ok: true, entry: task});}
      return response(collection(entries));
    }); global.fetch = fetchMock;
    const user = userEvent.setup();
    const opened = jest.fn();
    const view = render(<CallWorkPanel roomId="room-1" active onOpenWorkspace={opened} />);
    await user.click(await screen.findByRole("button", {name: "Add task or goal"}));
    await user.type(await screen.findByRole("textbox", {name: "Task title"}), "Send the reflection");
    view.rerender(<CallWorkPanel roomId="room-1" active={false} onOpenWorkspace={opened} />);
    view.rerender(<CallWorkPanel roomId="room-1" active onOpenWorkspace={opened} />);
    expect(screen.getByRole("textbox", {name: "Task title"})).toHaveValue(task.title);
    await user.click(screen.getByRole("button", {name: "Save task"}));
    expect(await screen.findByRole("heading", {name: task.title})).toBeVisible();
    expect(screen.queryByRole("textbox", {name: "Task title"})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Add task or goal"})).toBeVisible();
    const write = fetchMock.mock.calls.find(([, options]) => options?.method === "POST")!;
    expect(write[0]).toBe("/api/sessions/room-1/work");
    expect(JSON.parse(write[1].body)).toMatchObject({title: task.title, visibility: "SESSION_SHARED", kind: "TASK"});
    expect(opened).not.toHaveBeenCalled();
  });

  it("can close and continue an unsaved private goal without changing its audience", async () => {
    global.fetch = jest.fn(async () => response(collection()));
    const user = userEvent.setup();
    render(<CallWorkPanel roomId="room-1" active onOpenWorkspace={jest.fn()} />);
    await user.click(await screen.findByRole("button", {name: "Add task or goal"}));
    await user.click(screen.getByRole("button", {name: /^Goal$/}));
    await user.type(screen.getByRole("textbox", {name: "Goal title"}), "My private practice");
    await user.click(screen.getByText(/Details, date and sharing/));
    await user.selectOptions(screen.getByRole("combobox", {name: "Who can see it"}), "AUTHOR_PRIVATE");
    await user.click(screen.getByRole("button", {name: "Close draft"}));
    expect(screen.queryByRole("textbox", {name: "Goal title"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Continue draft"}));
    expect(screen.getByRole("textbox", {name: "Goal title"})).toHaveValue("My private practice");
    expect(screen.getByRole("combobox", {name: "Who can see it"})).toHaveValue("AUTHOR_PRIVATE");
  });

  it("completes work in place and refreshes work created from conversation", async () => {
    let entries = [task];
    global.fetch = jest.fn(async () => response(collection(entries)));
    jest.mocked(updateWorkTaskStatus).mockImplementation(async () => {
      entries = [{...task, status: "DONE", updatedAt: "2026-09-13T12:01:00Z"}];
      return {ok: true, status: "DONE", updatedAt: entries[0].updatedAt} as any;
    });
    const user = userEvent.setup();
    render(<CallWorkPanel roomId="room-1" active onOpenWorkspace={jest.fn()} />);
    await user.click(await screen.findByRole("button", {name: "Mark done"}));
    await waitFor(() => expect(screen.getByText("Completed (1)")).toBeVisible());
    expect(updateWorkTaskStatus).toHaveBeenCalledWith({taskId: task.id, nextStatus: "DONE", expectedUpdatedAt: task.updatedAt});
    entries = [...entries, {...task, id: "from-chat", title: "Try the practice from chat"}];
    act(() => window.dispatchEvent(new CustomEvent("quipsly-coaching-work-changed", {detail: {roomId: "room-1"}})));
    expect(await screen.findByRole("heading", {name: "Try the practice from chat"})).toBeVisible();
  });

  it("keeps visible work after a transient error but removes it when access is revoked", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(response(collection([task])))
      .mockResolvedValueOnce(response({error: "Temporarily unavailable"}, 503))
      .mockResolvedValueOnce(response({error: "This session isn't available to this account."}, 404));
    global.fetch = fetchMock;
    const user = userEvent.setup();
    render(<CallWorkPanel roomId="room-1" active onOpenWorkspace={jest.fn()} />);
    expect(await screen.findByRole("heading", {name: task.title})).toBeVisible();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Temporarily unavailable");
    expect(screen.getByRole("heading", {name: task.title})).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Try again"}));
    await waitFor(() => expect(screen.queryByRole("heading", {name: task.title})).not.toBeInTheDocument());
    expect(screen.queryByRole("textbox", {name: "Task title"})).not.toBeInTheDocument();
  });
});
