import {
  act,
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

  it("finds tasks without scrolling through notes and keeps drafts when switching work filters", async () => {
    const note = {...sharedTask, id: "note-1", kind: "NOTE" as const, title: "Our conversation", status: null};
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[note, sharedTask]} members={members} currentUserId="client-1" canWrite />);
    const filters = within(screen.getByRole("group", {name: "Filter work"}));
    fireEvent.click(filters.getByRole("button", {name: "Tasks"}));
    expect(screen.queryByRole("heading", {name: note.title})).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {name: sharedTask.title})).toBeVisible();
    const task = within(screen.getByRole("heading", {name: sharedTask.title}).closest("article")!);
    fireEvent.click(task.getByText("Edit"));
    fireEvent.change(task.getByRole("textbox", {name: "task details"}), {target: {value: "Keep my unfinished thought"}});
    fireEvent.click(filters.getByRole("button", {name: "Notes"}));
    expect(screen.getByRole("heading", {name: note.title})).toBeVisible();
    expect(screen.queryByRole("heading", {name: sharedTask.title})).not.toBeInTheDocument();
    fireEvent.click(filters.getByRole("button", {name: "Goals"}));
    expect(screen.getByText("No goals yet.")).toBeVisible();
    fireEvent.click(filters.getByRole("button", {name: "Tasks"}));
    expect(task.getByRole("textbox", {name: "task details"})).toHaveValue("Keep my unfinished thought");
    expect(filters.getByRole("button", {name: "Tasks"})).toHaveAttribute("aria-pressed", "true");
  });

  it("reveals newly created work even when a different type was being viewed", async () => {
    const note = {...sharedTask, id: "created-note", kind: "NOTE", title: "A newly saved note", status: null};
    const fetchMock = jest.fn().mockResolvedValue({ok: true, json: async () => ({ok: true, entry: note})});
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[sharedTask]} members={members} currentUserId="client-1" canWrite />);
    const filters = within(screen.getByRole("group", {name: "Filter work"}));
    fireEvent.click(filters.getByRole("button", {name: "Tasks"}));
    fireEvent.click(screen.getByText("Add note, task, or goal"));
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: note.title}});
    fireEvent.click(screen.getByRole("button", {name: "Save to coaching home"}));
    expect(await screen.findByRole("heading", {name: note.title})).toBeVisible();
    expect(filters.getByRole("button", {name: "Notes"})).toHaveAttribute("aria-pressed", "true");
  });

  it("retries a lost create response with the same request, then gives deliberate new work a new identity", async () => {
    const savedNote = {...sharedTask, id: "new-note", kind: "NOTE", title: "A useful thought", status: null};
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValue({ok: true, json: async () => ({ok: true, entry: savedNote})});
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[]} members={members} currentUserId="client-1" canWrite />);
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: savedNote.title}});
    fireEvent.change(screen.getByLabelText("Details"), {target: {value: "Remember this tomorrow"}});
    const submit = screen.getByRole("button", {name: "Save to coaching home"});
    fireEvent.click(submit);
    expect(await screen.findByText("Connection interrupted")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue(savedNote.title);
    fireEvent.click(submit);
    expect(await screen.findByRole("heading", {name: savedNote.title})).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
    // The same words can intentionally be saved again after a confirmed save.
    fireEvent.click(screen.getByText("Add note, task, or goal"));
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: savedNote.title}});
    fireEvent.change(screen.getByLabelText("Details"), {target: {value: "Remember this tomorrow"}});
    fireEvent.click(screen.getByRole("button", {name: "Save to coaching home"}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).clientRequestId)
      .not.toBe(JSON.parse(fetchMock.mock.calls[0][1].body).clientRequestId);
  });

  it("gives an altered draft a new request identity after a failed save", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("Connection interrupted"));
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[]} members={members} currentUserId="client-1" canWrite />);
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "First thought"}});
    fireEvent.click(screen.getByRole("button", {name: "Save to coaching home"}));
    await screen.findByText("Connection interrupted");
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "A different thought"}});
    fireEvent.click(screen.getByRole("button", {name: "Save to coaching home"}));
    await screen.findByText("Connection interrupted");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({title: "A different thought"});
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).clientRequestId)
      .not.toBe(JSON.parse(fetchMock.mock.calls[0][1].body).clientRequestId);
  });

  it("holds creation fields while saving and rejects repeated submissions before React rerenders", async () => {
    let finish!: (response: unknown) => void;
    const fetchMock = jest.fn(() => new Promise((resolve) => {finish = resolve;}));
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[]} members={members} currentUserId="client-1" canWrite />);
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Keep this"}});
    const form = screen.getByLabelText("Name").closest("form")!;
    act(() => {fireEvent.submit(form); fireEvent.submit(form);});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByLabelText("Type")).toBeDisabled();
    expect(screen.getByLabelText("Details")).toBeDisabled();
    await act(async () => finish({ok: false, json: async () => ({error: "Try again"})}));
    expect(screen.getByLabelText("Name")).toBeEnabled();
    expect(screen.getByLabelText("Name")).toHaveValue("Keep this");
  });

  it("keeps each pending item locked while other items save independently", async () => {
    const finishes: Array<(response: unknown) => void> = [];
    const fetchMock = jest.fn(() => new Promise((resolve) => finishes.push(resolve)));
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
    const otherTask = {...sharedTask, id: "other-task", title: "Another commitment"};
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[sharedTask, otherTask]} members={members} currentUserId="client-1" canWrite />);
    const first = within(screen.getByRole("heading", {name: sharedTask.title}).closest("article")!);
    const second = within(screen.getByRole("heading", {name: otherTask.title}).closest("article")!);
    fireEvent.click(first.getByText("Edit"));
    const firstForm = first.getByLabelText("task name").closest("form")!;
    act(() => {fireEvent.submit(firstForm); fireEvent.submit(firstForm);});
    fireEvent.click(second.getByRole("button", {name: "Complete"}));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.getByLabelText("task name")).toBeDisabled();
    expect(first.getByRole("button", {name: "Remove"})).toBeDisabled();
    expect(second.getByRole("button", {name: "Complete"})).toBeDisabled();
    await act(async () => finishes[1]!({ok: true, json: async () => ({ok: true, entry: {...otherTask, status: "DONE"}})}));
    expect(second.getByRole("button", {name: "Reopen"})).toBeEnabled();
    expect(first.getByRole("button", {name: "Complete"})).toBeDisabled();
    await act(async () => finishes[0]!({ok: true, json: async () => ({ok: true, entry: sharedTask})}));
    expect(first.getByLabelText("task name")).toBeEnabled();
  });

  it.each(["relationship", "account"])("does not carry entries or a pending draft into another %s", async (scope) => {
    let finish!: (response: unknown) => void;
    const fetchMock = jest.fn(() => new Promise((resolve) => {finish = resolve;}));
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
    const props = {engagementId: "engagement-1", initialEntries: [sharedTask], members, currentUserId: "client-1", canWrite: true};
    const {rerender} = render(<CoachingEngagementWorkspace {...props} />);
    fireEvent.click(screen.getByText("Add note, task, or goal"));
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Private draft for the old space"}});
    fireEvent.click(screen.getByRole("button", {name: "Save to coaching home"}));
    rerender(<CoachingEngagementWorkspace {...props} initialEntries={[]}
      engagementId={scope === "relationship" ? "engagement-2" : props.engagementId}
      currentUserId={scope === "account" ? "coach-1" : props.currentUserId} />);
    expect(screen.queryByRole("heading", {name: sharedTask.title})).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByRole("button", {name: "Save to coaching home"})).toBeEnabled();
    await act(async () => finish({ok: true, json: async () => ({ok: true, entry: sharedTask})}));
    expect(screen.queryByRole("heading", {name: sharedTask.title})).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
