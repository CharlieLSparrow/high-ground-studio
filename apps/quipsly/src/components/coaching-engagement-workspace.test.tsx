import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CoachingEngagementWorkspace } from "./coaching-engagement-workspace";

const members = [
  { id: "coach-1", label: "Morgan Coach", role: "COACH" },
  { id: "client-1", label: "Riley Client", role: "CLIENT" },
];

const sharedTask = {
  id: "dated-task", kind: "TASK" as const, title: "Keep a morning writing habit", body: "Ten minutes",
  status: "OPEN", owner: {id: "client-1", label: "Riley Client"}, visibility: "SHARED" as const,
  dueAt: "2026-09-20T15:30:00.000Z", canEdit: true,
  sourceHref: "/sessions/room-1?mode=transcript&source=asset-1&at=2.34",
  createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z",
};

describe("CoachingEngagementWorkspace", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("completes a task without silently changing its due time", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ok: true, json: async () => ({ok: true, entry: {...sharedTask, status: "DONE"}})});
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[sharedTask]} members={members} currentUserId="client-1" canWrite />);
    await userEvent.click(screen.getByRole("button", {name: "Complete"}));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({status: "DONE", targetAt: sharedTask.dueAt});
    expect(await screen.findByRole("button", {name: "Reopen"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: `From recording: ${sharedTask.title}`})).toHaveAttribute("href", sharedTask.sourceHref);
  });

  it("makes sources available to read-only members without adding fake links to manual notes", () => {
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[
      sharedTask, { ...sharedTask, id: "manual-note", kind: "NOTE", title: "My own words", sourceHref: null },
    ]} members={members} currentUserId="client-1" canWrite={false} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", {name: `From recording: ${sharedTask.title}`})).toHaveAttribute("href", sharedTask.sourceHref);
    expect(screen.queryByRole("button", {name: "Complete"})).not.toBeInTheDocument();
  });

  it("retains an edited draft after a failed save and preserves an unchanged due time", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ok: false, json: async () => ({ok: false, error: "Connection interrupted. Try saving again."})});
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[sharedTask]} members={members} currentUserId="client-1" canWrite />);
    await userEvent.click(screen.getByText("Edit"));
    await userEvent.clear(screen.getByRole("textbox", {name: "task name"}));
    await userEvent.type(screen.getByRole("textbox", {name: "task name"}), "A carefully rewritten commitment");
    await userEvent.click(screen.getByRole("button", {name: "Save changes"}));
    expect(await screen.findByText("Connection interrupted. Try saving again.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", {name: "task name"})).toHaveValue("A carefully rewritten commitment");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).targetAt).toBe(sharedTask.dueAt);
  });

  it("shows only the choices needed for the selected kind of work", () => {
    render(
      <CoachingEngagementWorkspace
        engagementId="engagement-1"
        initialEntries={[]}
        members={members}
        currentUserId="coach-1"
        canWrite
      />,
    );

    expect(screen.getByLabelText("Who can read it?")).toBeInTheDocument();
    expect(screen.queryByLabelText("Who owns it?")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Target date/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "TASK" },
    });

    expect(screen.getByLabelText("Who owns it?")).toBeInTheDocument();
    expect(screen.getByLabelText(/Target date/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Who can read it?")).not.toBeInTheDocument();
  });

  it("creates client-owned work through the relationship API and renders it", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        entry: {
          id: "task-1",
          kind: "TASK",
          title: "Practice reflective listening",
          body: "Try it twice before Friday.",
          status: "OPEN",
          owner: { id: "client-1", label: "Riley Client" },
          visibility: "SHARED",
          dueAt: null,
          canEdit: true,
          createdAt: "2026-08-19T21:00:00.000Z",
          updatedAt: "2026-08-19T21:00:00.000Z",
        },
      }),
    });
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });
    render(
      <CoachingEngagementWorkspace
        engagementId="engagement-1"
        initialEntries={[]}
        members={members}
        currentUserId="coach-1"
        canWrite
      />,
    );

    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "TASK" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Practice reflective listening" },
    });
    fireEvent.change(screen.getByLabelText("Details"), {
      target: { value: "Try it twice before Friday." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save to coaching home" }),
    );

    const heading = await screen.findByRole("heading", {
      name: "Practice reflective listening",
    });
    expect(
      within(heading.closest("article")!)
        .getAllByText("Riley Client")
        .some((node) => node.tagName === "SPAN"),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      kind: "TASK",
      title: "Practice reflective listening",
      ownerUserId: "client-1",
      visibility: "SHARED",
    });
    await waitFor(() =>
      expect(screen.getByText(/Task saved/i)).toBeInTheDocument(),
    );
  });

  it("removes an item without a confirmation ritual and offers immediate undo", async () => {
    const entry = {
      id: "task-1",
      kind: "TASK" as const,
      title: "Practice reflective listening",
      body: "Try it twice before Friday.",
      sourceHref: sharedTask.sourceHref,
      status: "OPEN",
      owner: { id: "client-1", label: "Riley Client" },
      visibility: "SHARED" as const,
      dueAt: null,
      canEdit: true,
      createdAt: "2026-08-19T21:00:00.000Z",
      updatedAt: "2026-08-19T21:00:00.000Z",
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          undoAvailable: true,
          removal: {
            id: entry.id,
            kind: entry.kind,
            updatedAt: "2026-08-19T21:01:00.000Z",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          entry: { ...entry, updatedAt: "2026-08-19T21:02:00.000Z" },
        }),
      });
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });
    render(
      <CoachingEngagementWorkspace
        engagementId="engagement-1"
        initialEntries={[entry]}
        members={members}
        currentUserId="coach-1"
        canWrite
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: entry.title }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      await screen.findByRole("heading", { name: entry.title }),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PUT" });
    expect(screen.getByRole("link", {name: `From recording: ${entry.title}`})).toHaveAttribute("href", sharedTask.sourceHref);
  });
});
