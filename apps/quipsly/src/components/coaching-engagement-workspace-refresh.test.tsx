import {act, cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {CoachingEngagementWorkspace, type CoachingEngagementWorkEntry} from "./coaching-engagement-workspace";

const members = [{id: "client", label: "Riley", role: "CLIENT"}, {id: "coach", label: "Morgan", role: "COACH"}];
const original = {id: "task", kind: "TASK", title: "Bring one page", body: "Original details",
  status: "OPEN", owner: {id: "client", label: "Riley"}, visibility: "SHARED", dueAt: null, canEdit: true,
  createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z"} satisfies CoachingEngagementWorkEntry;
const next = {...original, body: "Updated on another device", updatedAt: "2026-09-07T01:00:00Z"};
const props = {engagementId: "space", currentUserId: "client", members, canWrite: true, initialEntries: [original]};
const snapshot = (entries: CoachingEngagementWorkEntry[], extra: Record<string, unknown> = {}) => ({ok: true,
  engagement: {id: "space", currentUserId: "client", members, canWrite: true, entries, ...extra}});
const response = (body: unknown, status = 200) => ({ok: status >= 200 && status < 300, status, json: async () => body});

describe("client-space live refresh", () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn();
    Object.defineProperty(globalThis, "fetch", {value: fetchMock, writable: true, configurable: true});
  });
  afterEach(() => {cleanup(); jest.useRealTimers(); jest.restoreAllMocks();});

  it("refreshes visible work without remounting an unfinished edit, then merges a different field", async () => {
    fetchMock.mockResolvedValueOnce(response(snapshot([next])))
      .mockResolvedValueOnce(response({ok: true, entry: {...next, title: "My clearer title"}}));
    render(<CoachingEngagementWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${original.title}`}));
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByLabelText("task name"), {target: {value: "My clearer title"}});
    await act(async () => {jest.advanceTimersByTime(15_000);});
    expect(screen.getByText(next.body, {selector: "p"})).toBeVisible();
    expect(screen.getByLabelText("task name")).toHaveValue("My clearer title");
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Save changes"})));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      title: "My clearer title", body: next.body, expectedUpdatedAt: next.updatedAt,
    });
  });

  it("ignores an old in-flight snapshot after a local completion", async () => {
    let finishRead!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => {finishRead = resolve;}))
      .mockResolvedValueOnce(response({ok: true, entry: {...next, status: "DONE"}}));
    render(<CoachingEngagementWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${original.title}`}));
    fireEvent.click(screen.getByRole("button", {name: "Refresh work"}));
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Complete"})));
    expect(screen.getByRole("button", {name: "Reopen"})).toBeVisible();
    await act(async () => finishRead(response(snapshot([original]))));
    expect(screen.getByRole("button", {name: "Reopen"})).toBeVisible();
    expect(screen.queryByRole("button", {name: "Complete"})).not.toBeInTheDocument();
  });

  it("does not overlap background reads or poll hidden work", async () => {
    let finishRead!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => {finishRead = resolve;}));
    const {rerender} = render(<div hidden><CoachingEngagementWorkspace {...props} /></div>);
    await act(async () => {jest.advanceTimersByTime(30_000);});
    expect(fetchMock).not.toHaveBeenCalled();
    rerender(<div><CoachingEngagementWorkspace {...props} /></div>);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${original.title}`}));
    await act(async () => {jest.advanceTimersByTime(15_000);});
    await act(async () => {window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online"));});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finishRead(response(snapshot([next]))));
    expect(screen.getByText(next.body, {selector: "p"})).toBeVisible();
  });

  it("keeps loaded work after a temporary failure and recovers on reconnect", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(response(snapshot([next])));
    render(<CoachingEngagementWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${original.title}`}));
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Refresh work"})));
    expect(screen.getByRole("heading", {name: original.title})).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Updates paused");
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(screen.getByText(next.body, {selector: "p"})).toBeVisible();
    expect(screen.queryByText(/Updates paused/)).not.toBeInTheDocument();
  });

  it("bounds a stalled read and allows retry without losing work", async () => {
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {once: true});
    })).mockResolvedValue(response(snapshot([next])));
    render(<CoachingEngagementWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${original.title}`}));
    fireEvent.click(screen.getByRole("button", {name: "Refresh work"}));
    await act(async () => {jest.advanceTimersByTime(10_000);});
    expect(screen.getByRole("status")).toHaveTextContent("Updates paused");
    expect(screen.getByRole("heading", {name: original.title})).toBeVisible();
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Refresh work"})));
    expect(screen.getByText(next.body, {selector: "p"})).toBeVisible();
  });

  it("does not poll offline and resumes when the browser reports a connection", async () => {
    const online = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fetchMock.mockResolvedValue(response(snapshot([next])));
    render(<CoachingEngagementWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${original.title}`}));
    await act(async () => {jest.advanceTimersByTime(30_000); window.dispatchEvent(new Event("focus"));});
    expect(fetchMock).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(screen.getByText(next.body, {selector: "p"})).toBeVisible();
  });

  it.each([401, 403, 404])("removes protected work and drafts when access is lost (%s)", async (status) => {
    fetchMock.mockResolvedValue(response({ok: false}, status));
    render(<CoachingEngagementWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${original.title}`}));
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByLabelText("task details"), {target: {value: "My old-space draft"}});
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Refresh work"})));
    expect(screen.queryByRole("heading", {name: original.title})).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("My old-space draft")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("no longer available");
  });

  it.each([{currentUserId: "other-account"}, {id: "other-space"}])("does not accept a snapshot from another account or space: %j", async (identity) => {
    fetchMock.mockResolvedValue(response(snapshot([{...next, title: "Other private work"}], identity)));
    render(<CoachingEngagementWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${original.title}`}));
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Refresh work"})));
    expect(screen.queryByRole("heading", {name: "Other private work"})).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", {name: original.title})).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("updates write permissions and drops entries no longer included in the authorized snapshot", async () => {
    fetchMock.mockResolvedValue(response(snapshot([{...next, canEdit: false}], {canWrite: false})));
    render(<CoachingEngagementWorkspace {...props} initialEntries={[original, {...original, id: "gone", title: "No longer shared"}]} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${original.title}`}));
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Refresh work"})));
    expect(screen.queryByRole("heading", {name: "No longer shared"})).not.toBeInTheDocument();
    expect(screen.getByText(next.body, {selector: "p"})).toBeVisible();
    expect(screen.queryByRole("button", {name: "Complete"})).not.toBeInTheDocument();
    expect(screen.queryByText("Add note, task, or goal")).not.toBeInTheDocument();
  });

  it("refreshes after a save conflict, retaining the draft so a subsequent save can resolve it", async () => {
    fetchMock.mockResolvedValueOnce(response({ok: false, error: "Changed elsewhere"}, 409))
      .mockResolvedValueOnce(response(snapshot([next])))
      .mockResolvedValueOnce(response({ok: true, entry: {...next, body: "My new details"}}));
    render(<CoachingEngagementWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${original.title}`}));
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByLabelText("task details"), {target: {value: "My new details"}});
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Save changes"})));
    expect(screen.getByText(next.body, {selector: "p"})).toBeVisible();
    expect(screen.getByLabelText("task details")).toHaveValue("My new details");
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    expect(screen.getByRole("alert")).toHaveTextContent("details changed elsewhere too");
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Save my changes"})));
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({body: "My new details", expectedUpdatedAt: next.updatedAt});
  });

  it("cancels an obsolete read when navigating to another client space", async () => {
    let finishRead!: (value: unknown) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => {finishRead = resolve;}));
    const {rerender} = render(<CoachingEngagementWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", {name: `Open task: ${original.title}`}));
    fireEvent.click(screen.getByRole("button", {name: "Refresh work"}));
    const signal = fetchMock.mock.calls[0][1].signal;
    rerender(<CoachingEngagementWorkspace {...props} engagementId="next-space" initialEntries={[]} />);
    expect(signal.aborted).toBe(true);
    await act(async () => finishRead(response(snapshot([next]))));
    expect(screen.queryByRole("heading", {name: original.title})).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", {name: "Filter work"})).getByRole("button", {name: "All"})).toHaveAttribute("aria-pressed", "true");
  });
});
