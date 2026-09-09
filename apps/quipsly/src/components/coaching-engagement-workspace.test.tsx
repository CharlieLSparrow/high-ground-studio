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

jest.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams(window.location.search)}));

const members = [
  { id: "coach-1", label: "Morgan Coach", role: "COACH" },
  { id: "client-1", label: "Riley Client", role: "CLIENT" },
];

const sharedTask = {
  id: "dated-task", kind: "TASK" as const, title: "Keep a morning writing habit", body: "Ten minutes",
  status: "OPEN", owner: {id: "client-1", label: "Riley Client"}, visibility: "SHARED" as const,
  dueAt: "2026-09-20T15:30:00.000Z", canEdit: true,
  sourceHref: "/sessions/room-1?mode=transcript&source=asset-1&at=2.34",
  sourceKind: "recording" as const,
  createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z",
};

describe("CoachingEngagementWorkspace", () => {
  it("keeps long task text full-width and places completion below its reading content", () => {
    const entry = {...sharedTask, title: "A long writing outline for our next coaching conversation", body: `Source: https://example.test/${"long-source-name".repeat(20)}`};
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[entry]} members={members} currentUserId="client-1" canWrite />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${entry.title}`}));
    const heading = screen.getByRole("heading", {name: entry.title});
    const card = heading.closest("article")!;
    const body = within(card).getByText(entry.body, {selector: "p"});
    const completion = within(card).getByRole("button", {name: "Complete"});
    // The former row let the action steal half the text width on a phone.
    expect(completion.parentElement).toHaveClass("flex-col");
    expect(completion.parentElement).not.toHaveClass("flex-wrap");
    expect(heading).toHaveClass("[overflow-wrap:anywhere]");
    expect(body).toHaveClass("[overflow-wrap:anywhere]");
    expect(card).toHaveClass("bg-card", "text-foreground");
  });

  it.each([true, false])("keeps canonical tag colors in the reading view without requiring edit access (%s)", (canWrite) => {
    const entry = {...sharedTask, tags: [
      {id: "research", label: "Research", hexColor: "#23543a", isActive: true},
      {id: "old", label: "Earlier work", hexColor: "url(https://example.test/track)", isActive: false},
    ]};
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[entry]} members={members} currentUserId="client-1" canWrite={canWrite} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${entry.title}`}));
    const tags = within(screen.getByRole("group", {name: "Tags on this work"}));
    expect(tags.getByText("Research")).toHaveStyle({backgroundColor: "#23543a", color: "#ffffff"});
    expect(tags.getByText("Earlier work · archived")).not.toHaveAttribute("style");
    expect(tags.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("group", {name: "Tags on this work"}).closest("details")).toBeNull();
    if (canWrite) expect(screen.getByRole("textbox", {name: "task name"}).closest("details")).not.toHaveAttribute("open");
    else expect(screen.queryByRole("textbox", {name: "task name"})).not.toBeInTheDocument();
  });

  it("opens a chat-linked task after client navigation without remounting the workspace", () => {
    const originalUrl = window.location.href;
    window.history.replaceState({}, "", "/coaching/engagements/engagement-1#relationship-conversation");
    try {
      const props = {engagementId: "engagement-1", initialEntries: [sharedTask], members, currentUserId: "client-1", canWrite: true};
      const {rerender} = render(<CoachingEngagementWorkspace {...props} />);
      expect(screen.queryByRole("heading", {name: sharedTask.title})).not.toBeInTheDocument();
      fireEvent.click(within(screen.getByRole("group", {name: "Filter work"})).getByRole("button", {name: "Goals"}));
      window.history.pushState({}, "", `/coaching/engagements/engagement-1?work=${sharedTask.id}#relationship-work`);
      rerender(<CoachingEngagementWorkspace {...props} />);
      expect(screen.getByRole("heading", {name: sharedTask.title})).toBeVisible();
      expect(screen.getByRole("button", {name: "All"})).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("link", {name: `From recording: ${sharedTask.title}`})).toHaveAttribute("href", sharedTask.sourceHref);
    } finally { window.history.replaceState({}, "", originalUrl); }
  });
  it("does not replace unchanged archived tags when editing task wording", async () => {
    const entry = {...sharedTask, tags: [{id: "archived", label: "Earlier research", hexColor: "#23543a", isActive: false}]};
    const fetchMock = jest.fn().mockResolvedValue({ok: true, json: async () => ({ok: true, entry: {...entry, body: "Revised wording"}})});
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[entry]} members={members} currentUserId="coach-1" canWrite />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${entry.title}`}));
    fireEvent.click(screen.getByText("Edit"));
    expect(screen.getByRole("button", {name: "Remove Earlier research tag"})).toBeVisible();
    fireEvent.change(screen.getByLabelText("task details"), {target: {value: "Revised wording"}});
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const command = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(command.body).toBe("Revised wording");
    expect(command).not.toHaveProperty("tags");
    await screen.findByText("Revised wording");
  });
  it.each(["TASK", "GOAL", "NOTE"] as const)("creates and edits a tagged %s with stable retries after lost responses", async (kind) => {
    const tag = {id: "research", label: "Research", hexColor: "#23543a", isActive: true};
    const saved = {...sharedTask, kind, status: kind === "TASK" ? "OPEN" : "ACTIVE", tags: [tag]};
    let attempts = 0;
    let editAttempts = 0;
    const fetchMock = jest.fn(async (url: string, options?: RequestInit) => {
      if (url.startsWith("/api/work/tags?")) return {ok: true, json: async () => ({ok: true, tags: [tag]})};
      if (options?.method === "POST" && ++attempts === 1) throw new Error("Response lost");
      if (options?.method === "PATCH" && ++editAttempts === 1) throw new Error("Edit response lost");
      return {ok: true, json: async () => ({ok: true, entry: options?.method === "PATCH" ? {...saved, tags: [], body: "Three examples"} : saved})};
    });
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[]} members={members} currentUserId="coach-1" canWrite />);
    fireEvent.change(screen.getByLabelText("Type"), {target: {value: kind}});
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: sharedTask.title}});
    fireEvent.click(screen.getByRole("button", {name: "Add tags"}));
    fireEvent.click(await screen.findByRole("checkbox", {name: "Research"}));
    fireEvent.click(screen.getByRole("button", {name: "Save to coaching home"}));
    await screen.findByText("Response lost");
    expect(screen.getByRole("checkbox", {name: "Research"})).toBeChecked();
    fireEvent.click(screen.getByRole("button", {name: "Save to coaching home"}));
    await screen.findByRole("heading", {name: sharedTask.title});
    const creates = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(creates).toHaveLength(2);
    expect(creates[0][1]?.body).toBe(creates[1][1]?.body);
    expect(JSON.parse(String(creates[0][1]?.body))).toMatchObject({kind, tags: {tagIds: [tag.id]}});
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByRole("button", {name: "Remove Research tag"}));
    fireEvent.change(screen.getByLabelText(`${kind.toLowerCase()} details`), {target: {value: "Three examples"}});
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await screen.findByText("Edit response lost");
    expect(screen.getByLabelText(`${kind.toLowerCase()} details`)).toHaveValue("Three examples");
    expect(screen.queryByRole("button", {name: "Remove Research tag"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await screen.findByText("Three examples");
    const updates = fetchMock.mock.calls.filter(([, options]) => options?.method === "PATCH");
    expect(updates).toHaveLength(2);
    expect(updates[0][1]?.body).toBe(updates[1][1]?.body);
    expect(JSON.parse(String(updates[0][1]?.body))).toMatchObject({kind, clientRequestId: expect.any(String), body: "Three examples", tags: {tagIds: []}, expectedUpdatedAt: saved.updatedAt});
  });
  it("restores a selected item from its space URL without exposing an unknown item", () => {
    const originalUrl = window.location.href;
    window.history.replaceState({}, "", `/coaching/engagements/engagement-1?work=${sharedTask.id}#relationship-work`);
    try {
      render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[sharedTask]} members={members} currentUserId="client-1" canWrite />);
      expect(screen.getByRole("heading", {name: sharedTask.title})).toBeVisible();
      fireEvent.click(screen.getByRole("button", {name: "Back to work"}));
      expect(new URL(window.location.href).searchParams.has("work")).toBe(false);
      fireEvent.click(screen.getByRole("button", {name: `Open task: ${sharedTask.title}`}));
      expect(new URL(window.location.href).searchParams.get("work")).toBe(sharedTask.id);
      window.history.replaceState({}, "", "/coaching/engagements/engagement-1?work=another-accounts-note#relationship-work");
      fireEvent(window, new PopStateEvent("popstate"));
      expect(screen.queryByRole("heading", {name: sharedTask.title})).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox", {name: "task details"})).not.toBeInTheDocument();
    } finally { window.history.replaceState({}, "", originalUrl); }
  });
  it.each(["TASK", "GOAL"] as const)("keeps the saved %s calendar day identical in the card and date editor", (kind) => {
    const item = {...sharedTask, kind, dueAt: "2026-09-10T00:00:00.000Z"};
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[item]} members={members} currentUserId="client-1" canWrite />);
    fireEvent.click(screen.getByRole("button", {name: `Open ${kind.toLowerCase()}: ${item.title}`}));
    const card = within(screen.getByRole("heading", {name: item.title}).closest("article")!);
    expect(card.getByText(`${kind === "TASK" ? "Due" : "Target"} Sep 10, 2026`)).toBeVisible();
    fireEvent.click(card.getByText("Edit"));
    expect(card.getByLabelText(kind === "TASK" ? "Due date" : "Target date")).toHaveValue("2026-09-10");
  });

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("finds tasks without scrolling through notes and keeps drafts when switching work filters", async () => {
    const note = {...sharedTask, id: "note-1", kind: "NOTE" as const, title: "Our conversation", status: null};
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[note, sharedTask]} members={members} currentUserId="client-1" canWrite />);
    const filters = within(screen.getByRole("group", {name: "Filter work"}));
    fireEvent.click(filters.getByRole("button", {name: "Tasks"}));
    expect(screen.queryByRole("heading", {name: note.title})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${sharedTask.title}`}));
    expect(screen.getByRole("heading", {name: sharedTask.title})).toBeVisible();
    const task = within(screen.getByRole("heading", {name: sharedTask.title}).closest("article")!);
    fireEvent.click(task.getByText("Edit"));
    fireEvent.change(task.getByRole("textbox", {name: "task details"}), {target: {value: "Keep my unfinished thought"}});
    fireEvent.click(filters.getByRole("button", {name: "Notes"}));
    fireEvent.click(screen.getByRole("button", {name: `Open note: ${note.title}`}));
    expect(screen.getByRole("heading", {name: note.title})).toBeVisible();
    expect(screen.queryByRole("heading", {name: sharedTask.title})).not.toBeInTheDocument();
    fireEvent.click(filters.getByRole("button", {name: "Goals"}));
    expect(screen.getByText("Finding your work…")).toBeVisible();
    fireEvent.click(filters.getByRole("button", {name: "Tasks"}));
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${sharedTask.title}`}));
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
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${sharedTask.title}`}));
    const first = within(screen.getByRole("heading", {name: sharedTask.title}).closest("article")!);
    fireEvent.click(first.getByText("Edit"));
    const firstForm = first.getByLabelText("task name").closest("form")!;
    act(() => {fireEvent.submit(firstForm); fireEvent.submit(firstForm);});
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${otherTask.title}`}));
    const second = within(screen.getByRole("heading", {name: otherTask.title}).closest("article")!);
    fireEvent.click(second.getByRole("button", {name: "Complete"}));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.getByLabelText("task name")).toBeDisabled();
    expect(first.getByRole("button", {name: "Remove", hidden: true})).toBeDisabled();
    expect(second.getByRole("button", {name: "Complete"})).toBeDisabled();
    await act(async () => finishes[1]!({ok: true, json: async () => ({ok: true, entry: {...otherTask, status: "DONE"}})}));
    expect(second.getByRole("button", {name: "Reopen"})).toBeEnabled();
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${sharedTask.title}`}));
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
    await userEvent.click(screen.getByRole("button", {name: `Open task: ${sharedTask.title}`}));
    await userEvent.click(screen.getByRole("button", {name: "Complete"}));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({status: "DONE", targetAt: sharedTask.dueAt});
    expect(await screen.findByRole("button", {name: "Reopen"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: `From recording: ${sharedTask.title}`})).toHaveAttribute("href", sharedTask.sourceHref);
  });

  it("labels a chat-created task with its actual conversation source", () => {
    const entry = {...sharedTask, sourceKind: "conversation" as const,
      sourceHref: "/coaching/engagements/engagement-1?message=idea-1#relationship-conversation"};
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[entry]} members={members} currentUserId="client-1" canWrite />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${entry.title}`}));
    expect(screen.getByRole("link", {name: `From conversation: ${entry.title}`})).toHaveAttribute("href", entry.sourceHref);
    expect(screen.queryByRole("link", {name: /From recording/})).not.toBeInTheDocument();
  });

  it("makes sources available to read-only members without adding fake links to manual notes", () => {
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[
      sharedTask, { ...sharedTask, id: "manual-note", kind: "NOTE", title: "My own words", sourceHref: null },
    ]} members={members} currentUserId="client-1" canWrite={false} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${sharedTask.title}`}));
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", {name: `From recording: ${sharedTask.title}`})).toHaveAttribute("href", sharedTask.sourceHref);
    expect(screen.queryByRole("button", {name: "Complete"})).not.toBeInTheDocument();
  });

  it("retains an edited draft after a failed save and preserves an unchanged due time", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ok: false, json: async () => ({ok: false, error: "Connection interrupted. Try saving again."})});
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
    render(<CoachingEngagementWorkspace engagementId="engagement-1" initialEntries={[sharedTask]} members={members} currentUserId="client-1" canWrite />);
    await userEvent.click(screen.getByRole("button", {name: `Open task: ${sharedTask.title}`}));
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
    expect(screen.getByLabelText(/Due date/)).toBeInTheDocument();
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
      sourceKind: sharedTask.sourceKind,
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

    fireEvent.click(screen.getByRole("button", {name: `Open task: ${entry.title}`}));
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
