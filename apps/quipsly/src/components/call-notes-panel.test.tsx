import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CallNotesPanel } from "./call-notes-panel";

const note = { id: "note-1", title: "Next chapter", body: "Start with the introduction.", kind: "SESSION_NOTE", visibility: "SESSION_SHARED", author: { id: "coach", label: "Casey", isCurrentActor: true }, canEdit: true, canChangeVisibility: true, updatedAt: "2026-09-13T10:00:00.000Z", createdAt: "2026-09-13T10:00:00.000Z", revisionCount: 1, tags: [] };
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
let rows: typeof note[];
let write: jest.Mock;
const fetchMock = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  sessionStorage.clear(); rows = []; write = jest.fn(async (_url: string, options: RequestInit) => {
    const data = JSON.parse(options.body as string);
    const saved = { ...note, ...data, updatedAt: "2026-09-13T10:00:01.000Z" };
    rows = [saved]; return reply({ ok: true, note: saved });
  });
  fetchMock.mockReset().mockImplementation((url, options) => options?.method ? write(url, options) : Promise.resolve(reply({ ok: true, actorUserId: "coach", canCreate: true, notes: rows })));
  global.fetch = fetchMock;
});
afterEach(() => { global.fetch = originalFetch; });

async function createDraft() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "New note" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Note title" }), { target: { value: "Next chapter" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Note text" }), { target: { value: "Discuss the opening scene." } });
  return user;
}

it("autosaves shared notes through the canonical API while another tool is open", async () => {
  const view = render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await createDraft();
  view.rerender(<CallNotesPanel roomId="room" active={false} onOpenWorkspace={() => {}} />);
  await screen.findByText("Saved", {}, { timeout: 2500 });
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0][0]).toBe("/api/sessions/room/notes");
  expect(JSON.parse(write.mock.calls[0][1].body)).toMatchObject({ visibility: "SESSION_SHARED", body: "Discuss the opening scene.", kind: "SESSION_NOTE" });
});

it("creates private notes directly from Only me without an approval workflow", async () => {
  render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "Only me" }));
  await createDraft();
  await screen.findByText("Saved", {}, { timeout: 2500 });
  expect(JSON.parse(write.mock.calls[0][1].body).visibility).toBe("AUTHOR_PRIVATE");
});

it("edits shared notes using their version and retains typing during an in-flight save", async () => {
  rows = [note]; let finish: (response: Response) => void = () => {};
  write.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: /Next chapter/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Note text" }), { target: { value: "First revision." } });
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1), { timeout: 2500 });
  fireEvent.change(screen.getByRole("textbox", { name: "Note text" }), { target: { value: "Second revision while saving." } });
  finish(reply({ ok: true, note: { ...note, body: "First revision.", updatedAt: "2026-09-13T10:00:01.000Z" } }));
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2), { timeout: 2500 });
  expect(write.mock.calls[1][0]).toBe("/api/notes/note-1");
  expect(JSON.parse(write.mock.calls[1][1].body)).toMatchObject({ expectedUpdatedAt: "2026-09-13T10:00:01.000Z", body: "Second revision while saving.", tagIds: [], surface: "nest-session-notes" });
  expect(screen.getByRole("textbox", { name: "Note text" })).toHaveValue("Second revision while saving.");
});

it("retries the exact uncertain request after remount without creating a duplicate", async () => {
  write.mockRejectedValueOnce(new Error("Connection lost"));
  const view = render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await createDraft();
  await screen.findByRole("button", { name: "Retry save" }, { timeout: 2500 });
  const original = JSON.parse(write.mock.calls[0][1].body);
  view.unmount();
  render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: /Next chapter.*Retry needed/ }));
  await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await screen.findByText("Saved");
  expect(JSON.parse(write.mock.calls[1][1].body)).toEqual(original);
  expect(sessionStorage.getItem("quipsly.call-note-drafts.v1:coach:room")).toBeNull();
});

it("keeps conflicting words and saves a private copy without overwriting the collaborator", async () => {
  rows = [note]; write.mockResolvedValueOnce(reply({ ok: false, code: "CONFLICT", current: { ...note, body: "Riley's newer words." } }, 409));
  render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: /Next chapter/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Note text" }), { target: { value: "My draft remains." } });
  await userEvent.click(await screen.findByRole("button", { name: "Save my draft as a private copy" }, { timeout: 2500 }));
  await screen.findByText("Saved", {}, { timeout: 2500 });
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[1][0]).toBe("/api/sessions/room/notes");
  expect(JSON.parse(write.mock.calls[1][1].body)).toMatchObject({ body: "My draft remains.", visibility: "AUTHOR_PRIVATE" });
});

it("does not restore a different account's private draft", async () => {
  sessionStorage.setItem("quipsly.call-note-drafts.v1:other:room", JSON.stringify({ version: 1, drafts: [{ key: "private", title: "Hidden private draft", body: "Secret", version: 1, savedVersion: 0 }], attempts: [] }));
  render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await screen.findByRole("button", { name: "New note" });
  expect(screen.queryByText("Hidden private draft")).not.toBeInTheDocument();
  expect(write).not.toHaveBeenCalled();
});

it("clears the active editor when the authenticated account changes", async () => {
  const view = render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: "New note" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Note title" }), { target: { value: "Coach private draft" } });
  fetchMock.mockImplementation(() => Promise.resolve(reply({ ok: true, actorUserId: "client", canCreate: true, notes: [] })));
  view.rerender(<CallNotesPanel roomId="room" active={false} onOpenWorkspace={() => {}} />);
  view.rerender(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await screen.findByRole("button", { name: "New note" });
  expect(screen.queryByDisplayValue("Coach private draft")).not.toBeInTheDocument();
  expect(screen.queryByText("Coach private draft")).not.toBeInTheDocument();
  expect(write).not.toHaveBeenCalled();
});
