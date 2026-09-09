import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConversationTaskAction } from "./conversation-task-action";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const props = { engagementId: "space", messageId: "message", body: "Prepare a first chapter together", canCreate: true };

test("creates and colors the first shared tag inline before saving the task", async () => {
  let finishTag!: (value: unknown) => void;
  const tag = { id: "research", label: "Research", hexColor: "#506b46", isActive: true };
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, projectId: "nest", canCreateTags: true, tags: [] }) })
    .mockImplementationOnce(() => new Promise(resolve => { finishTag = resolve; }))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, entry: { id: "task", title: props.body, status: "OPEN", tags: [tag] } }) });
  globalThis.fetch = fetchMock;
  render(<ConversationTaskAction projectSlug="our-book" messageId="message" body={props.body} canCreate />);
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add tags" })); });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Research" } });
  fireEvent.change(screen.getByLabelText("New tag color"), { target: { value: "#506b46" } });
  fireEvent.click(screen.getByRole("button", { name: "Create “Research” tag" }));
  expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Creating tag…" })).toBeDisabled();
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ operation: "CREATE", projectId: "nest", label: "Research", hexColor: "#506b46" });
  await act(async () => { finishTag({ ok: true, json: async () => ({ ok: true, tag }) }); });
  expect(screen.getByRole("checkbox", { name: "Research" })).toBeChecked();
  expect(screen.getByRole("button", {name: "Remove Research tag"})).toHaveStyle({ backgroundColor: "#506b46" });
  expect(screen.getByRole("searchbox")).toHaveValue("");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add task" })); });
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ tags: { tagIds: ["research"] } });
  expect(screen.getByRole("link", { name: /Research/ })).toBeInTheDocument();
});

test("failed inline creation retains the name and color, and retry uses the canonical existing color", async () => {
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, projectId: "nest", canCreateTags: true, tags: [] }) })
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, created: false, tag: { id: "research", label: "Research", hexColor: "#23543a", isActive: true } }) });
  globalThis.fetch = fetchMock;
  render(<ConversationTaskAction {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add tags" })); });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Research" } });
  fireEvent.click(screen.getByRole("button", { name: "Use theme color" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Create “Research” tag" })); });
  expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
  expect(screen.getByRole("searchbox")).toHaveValue("Research");
  expect(screen.getByRole("button", { name: "Use theme color" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Create “Research” tag" })); });
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(JSON.parse(fetchMock.mock.calls[1][1].body));
  expect(JSON.parse(fetchMock.mock.calls[2][1].body).hexColor).toBeNull();
  expect(screen.getByRole("checkbox", { name: "Research" })).toBeChecked();
  expect(screen.getByRole("button", {name: "Remove Research tag"})).toHaveStyle({ backgroundColor: "#23543a" });
});

test("client-space access stages a new task tag without granting Nest vocabulary creation", async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, projectId: "nest", canCreateTags: false, tags: [] }) });
  render(<ConversationTaskAction {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add tags" })); });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Research" } });
  expect(screen.queryByLabelText("New tag color")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create “Research” tag" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Add “Research” tag"}));
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", {name: "Remove new Research tag"})).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Remove new Research tag"}));
  expect(screen.queryByRole("button", {name: "Remove new Research tag"})).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled();
});

test("saves a client's new chat tag atomically with the task and retains it across a lost reply", async () => {
  const fetchMock = jest.fn().mockResolvedValueOnce({ok: true, json: async () => ({ok: true, canCreateTags: false, tags: []})})
    .mockRejectedValueOnce(new Error("Reply lost"))
    .mockResolvedValueOnce({ok: true, json: async () => ({ok: true, entry: {id: "saved", title: props.body, status: "OPEN", tags: [{id: "new-tag", label: "Writing rhythm", hexColor: null, isActive: true}]}})});
  globalThis.fetch = fetchMock;
  render(<ConversationTaskAction {...props} />);
  fireEvent.click(screen.getByRole("button", {name: "Create task"}));
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Add tags"}));});
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "Writing rhythm"}});
  fireEvent.click(screen.getByRole("button", {name: "Add “Writing rhythm” tag"}));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Add task"}));});
  expect(screen.getByRole("alert")).toHaveTextContent("Reply lost");
  expect(screen.getByRole("button", {name: "Remove new Writing rhythm tag"})).toBeVisible();
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Add task"}));});
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({tags: {tagIds: [], newTagLabels: ["Writing rhythm"]}});
  expect(fetchMock.mock.calls[2][1].body).toBe(fetchMock.mock.calls[1][1].body);
  expect(screen.getByRole("link")).toHaveTextContent("Writing rhythm");
});

test("counts pending client labels toward tag limits without making separate writes", async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({ok: true, canCreateTags: false,
    tags: Array.from({length: 17}, (_, index) => ({id: `tag-${index}`, label: `Existing ${index}`, hexColor: null, isActive: true})),
  })});
  render(<ConversationTaskAction {...props} />);
  fireEvent.click(screen.getByRole("button", {name: "Create task"}));
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Add tags"}));});
  for (let index = 0; index < 8; index++) {
    fireEvent.change(screen.getByRole("searchbox"), {target: {value: `New ${index}`}});
    fireEvent.click(screen.getByRole("button", {name: `Add “New ${index}” tag`}));
  }
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "Ninth"}});
  expect(screen.getByRole("button", {name: "Add “Ninth” tag"})).toBeDisabled();
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "new 0"}});
  expect(screen.queryByRole("button", {name: "Add “new 0” tag"})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: ""}});
  for (let index = 0; index < 16; index++) fireEvent.click(screen.getByRole("checkbox", {name: `Existing ${index}`}));
  expect(screen.getByRole("button", {name: "Tags (24)"})).toBeVisible();
  expect(screen.getByRole("checkbox", {name: "Existing 16"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button", {name: "Remove new New 0 tag"}));
  expect(screen.getByRole("checkbox", {name: "Existing 16"})).toBeEnabled();
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

test("creates a tagged task in the ordinary Nest conversation without a fake coaching space", async () => {
  const tag = { id: "research", label: "Research", hexColor: "#506b46", isActive: true };
  const fetchMock = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, tags: [tag] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, entry: { id: "task", title: props.body, status: "OPEN", tags: [tag] } }) });
  globalThis.fetch = fetchMock;
  render(<ConversationTaskAction projectSlug="our-book" messageId="message" body={props.body} canCreate />);
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add tags" })); });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/work/tags?entityKind=task&projectSlug=our-book");
  fireEvent.click(screen.getByRole("checkbox", { name: "Research" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add task" })); });
  expect(fetchMock.mock.calls[1][0]).toBe("/api/nest-chat/tasks");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ projectSlug: "our-book", sourceMessageId: "message", tags: { tagIds: ["research"] } });
  expect(screen.getByRole("link", { name: /Prepare a first chapter.*Research/ })).toBeInTheDocument();
});

test("creates normal shared work and keeps the same request after a lost response", async () => {
  const fetchMock = jest.fn().mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, entry: { id: "task", title: "Prepare chapter one", status: "OPEN" } }) });
  globalThis.fetch = fetchMock;
  render(<ConversationTaskAction {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Task title from message" }), { target: { value: "Prepare chapter one" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add task" })); });
  expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
  expect(screen.getByRole("textbox")).toHaveValue("Prepare chapter one");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add task" })); });
  const first = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(first).toMatchObject({ kind: "TASK", title: "Prepare chapter one", sourceMessageId: "message", body: props.body });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(first);
  expect(screen.getByRole("link", { name: /Prepare chapter one/ })).toHaveAttribute("href", "/coaching/engagements/space?work=task#relationship-work");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

test("shows canonical linked work to readers without offering creation", () => {
  render(<ConversationTaskAction {...props} canCreate={false} tasks={[{ id: "task", title: "Chapter drafted", status: "DONE" }]} />);
  expect(screen.getByRole("link", { name: /Chapter drafted.*done task/ })).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("keeps shared tag colors visible in chat and follows canonical label and color changes", () => {
  const task = { id: "task", title: "Chapter drafted", status: "DONE", tags: [
    {id: "research", label: "Research", hexColor: "#23543a", isActive: true},
    {id: "old", label: "Earlier work", hexColor: "url(https://example.test/track)", isActive: false},
  ] };
  const { rerender } = render(<ConversationTaskAction {...props} tasks={[task]} />);
  expect(screen.getByText("Research")).toHaveStyle({backgroundColor: "#23543a", color: "#ffffff"});
  expect(screen.getByText("Earlier work")).not.toHaveAttribute("style");
  expect(screen.getByText("(archived tag)")).toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link", {name: /Chapter drafted.*Research.*Earlier work/})).toBeInTheDocument();
  rerender(<ConversationTaskAction {...props} tasks={[{...task, tags: [
    {...task.tags[0], label: "Sources", hexColor: "#f2e4c5"},
  ]}]} />);
  expect(screen.queryByText("Research")).not.toBeInTheDocument();
  expect(screen.getByText("Sources")).toHaveStyle({backgroundColor: "#f2e4c5", color: "#000000"});
});

test("a confirmed task follows canonical edits and removal instead of retaining a stale saved link", async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, entry: { id: "task", title: props.body, status: "OPEN" } }) });
  const { rerender } = render(<ConversationTaskAction {...props} tasks={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add task" })); });
  expect(screen.getByRole("link")).toHaveTextContent(props.body);
  rerender(<ConversationTaskAction {...props} tasks={[{ id: "task", title: "Chapter ready", status: "DONE" }]} />);
  expect(screen.getByRole("link")).toHaveTextContent("Chapter ready");
  rerender(<ConversationTaskAction {...props} tasks={[]} />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

test("a pending save cannot be submitted twice or canceled into a second request", async () => {
  let finish!: (value: unknown) => void;
  const fetchMock = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  globalThis.fetch = fetchMock as typeof fetch;
  render(<ConversationTaskAction {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
  expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ ok: true, json: async () => ({ ok: true, entry: { id: "task", title: props.body, status: "OPEN" } }) }); });
});

test("chooses shared colored tags while creating a task from chat and retains them on retry", async () => {
  const tag = { id: "research", label: "Research", hexColor: "#23543a", isActive: true };
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, tags: [tag, { ...tag, id: "archived", label: "Old", isActive: false }] }) })
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, entry: { id: "task", title: props.body, status: "OPEN", tags: [tag] } }) });
  globalThis.fetch = fetchMock;
  render(<ConversationTaskAction {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add tags" })); });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/work/tags?entityKind=task&engagementId=space");
  expect(screen.queryByRole("checkbox", { name: "Old" })).not.toBeInTheDocument();
  expect(screen.getByText("Research")).toHaveStyle({ backgroundColor: "#23543a", color: "#ffffff" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Research" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add task" })); });
  expect(screen.getByRole("checkbox", { name: "Research" })).toBeChecked();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add task" })); });
  const command = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(command).toMatchObject({ sourceMessageId: "message", tags: { tagIds: ["research"] } });
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(command);
  expect(screen.getByRole("link", { name: /Research/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create another task" }));
  expect(screen.getByRole("button", { name: "Add tags" })).toBeInTheDocument();
});

test("tag loading failure does not prevent task creation", async () => {
  const fetchMock = jest.fn().mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, entry: { id: "task", title: props.body, status: "OPEN" } }) });
  globalThis.fetch = fetchMock;
  render(<ConversationTaskAction {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add tags" })); });
  expect(screen.getByRole("status")).toHaveTextContent("You can still save your task");
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "Research"}});
  expect(screen.queryByRole("button", {name: "Add “Research” tag"})).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add task" })); });
  expect(screen.getByRole("link", { name: /Prepare a first chapter/ })).toBeInTheDocument();
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty("tags");
});

test("searching tags never clears a hidden selection and cancel aborts a pending tag read", async () => {
  let finish!: (value: unknown) => void;
  const fetchMock = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, tags: [
    { id: "research", label: "Research", hexColor: "#23543a", isActive: true },
    { id: "writing", label: "Writing", hexColor: null, isActive: true },
  ] }) }).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  globalThis.fetch = fetchMock;
  render(<ConversationTaskAction {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add tags" })); });
  fireEvent.click(screen.getByRole("checkbox", { name: "Research" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "writing" } });
  expect(screen.queryByRole("checkbox", { name: "Research" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tags (1)" }));
  expect(screen.getByText("Research")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tags (1)" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  await act(async () => { finish({ ok: true, json: async () => ({ ok: true, tags: [] }) }); });
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
});
