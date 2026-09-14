import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CallNoteBrowser } from "./call-note-browser";
import type { SessionWorkspaceNote } from "@/app/(app)/sessions/[roomId]/session-notes-model";

const note: SessionWorkspaceNote = { id: "recent", title: "Our next conversation", body: "First line\nSecond line\nThird line", kind: "SESSION_NOTE", visibility: "SESSION_SHARED", author: { id: "coach", label: "Casey", isCurrentActor: true }, originLabel: "Session note", canEdit: true, revisionCount: 0, createdAt: "2026-09-13T10:00:00Z", updatedAt: "2026-09-13T10:00:00Z", tags: [{id: "writing", label: "Writing", slug: "writing", hexColor: "#785034"}] };
const older = { ...note, id: "older", title: "Earlier reflection" };
const cursor = { before: note.updatedAt, afterId: note.id };
const response = (notes: SessionWorkspaceNote[], extra: Record<string, unknown> = {}) => ({ ok: true, status: 200, json: async () => ({ ok: true, roomId: "room", actorUserId: "coach", notes, nextCursor: null, ...extra }) }) as Response;
const originalFetch = global.fetch;
const fetchMock = jest.fn();
const onAccessLost = jest.fn();
const onOpen = jest.fn();
function panel(overrides: Partial<Parameters<typeof CallNoteBrowser>[0]> = {}) {
  return <CallNoteBrowser roomId="room" actorId="coach" active audience="shared" notes={[note]} cursor={cursor}
    onOpen={onOpen} onAccessLost={onAccessLost} unsavedIds={new Set()} {...overrides} />;
}
beforeEach(() => { fetchMock.mockReset(); onAccessLost.mockReset(); onOpen.mockReset(); global.fetch = fetchMock; });
afterEach(() => { global.fetch = originalFetch; });

it("keeps previews compact and displays canonical tag colors", () => {
  render(panel());
  expect(screen.getByText(/First line/)).toHaveClass("line-clamp-2");
  expect(screen.getByText(/First line/)).not.toHaveClass("block");
  expect(screen.getByText("#Writing")).toHaveStyle({ backgroundColor: "#785034" });
});

it("searches the scoped server rather than only the recent page, then opens the exact result", async () => {
  fetchMock.mockResolvedValue(response([older]));
  render(panel());
  fireEvent.change(screen.getByRole("searchbox", { name: "Search session notes" }), { target: { value: "reflection" } });
  fireEvent.click(await screen.findByRole("button", { name: /Earlier reflection/ }));
  expect(onOpen).toHaveBeenCalledWith(older);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/sessions/room/notes?audience=shared&q=reflection");
});

it("paginates without dropping existing notes or duplicating changed rows", async () => {
  fetchMock.mockResolvedValue(response([note, older]));
  render(panel());
  fireEvent.click(screen.getByRole("button", { name: "Load more notes" }));
  await screen.findByRole("button", { name: /Earlier reflection/ });
  expect(screen.getAllByRole("button", { name: /Our next conversation/ })).toHaveLength(1);
  expect(fetchMock.mock.calls[0][0]).toContain("afterId=recent");
  expect(screen.queryByRole("button", { name: "Load more notes" })).not.toBeInTheDocument();
});

it("retries the failed page without replacing the current page", async () => {
  fetchMock.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(response([older]));
  render(panel());
  fireEvent.click(screen.getByRole("button", { name: "Load more notes" }));
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: /Earlier reflection/ });
  expect(screen.getByRole("button", { name: /Our next conversation/ })).toBeVisible();
  expect(fetchMock.mock.calls[0][0]).toBe(fetchMock.mock.calls[1][0]);
});

it("ignores a stale search when a new query supersedes it", async () => {
  let finish: (result: Response) => void = () => {};
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(response([older]));
  render(panel());
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "first" } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "second" } });
  await screen.findByRole("button", { name: /Earlier reflection/ });
  await act(async () => finish(response([{ ...note, title: "Stale result" }])));
  expect(screen.queryByRole("button", { name: /Stale result/ })).not.toBeInTheDocument();
});

it.each([401, 403, 404])("clears the parent editor when access changes (%s)", async status => {
  fetchMock.mockResolvedValue({ ok: false, status });
  render(panel());
  fireEvent.click(screen.getByRole("button", { name: "Load more notes" }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
});

it("does not display results from a different actor or room", async () => {
  fetchMock.mockResolvedValue(response([{ ...older, title: "Other actor's note" }], { actorUserId: "someone-else" }));
  render(panel()); fireEvent.click(screen.getByRole("button", { name: "Load more notes" }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("button", { name: /Other actor/ })).not.toBeInTheDocument();
});
