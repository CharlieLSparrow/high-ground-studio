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

it("keeps a failed non-JSON response understandable and retries the exact save", async () => {
  write.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } });
  render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await createDraft();
  await screen.findByText("Not saved yet. Your draft is still here. Try again.", {}, { timeout: 2500 });
  const original = JSON.parse(write.mock.calls[0][1].body);
  await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await screen.findByText("Saved");
  expect(JSON.parse(write.mock.calls[1][1].body)).toEqual(original);
  expect(screen.queryByText(/JSON input/)).not.toBeInTheDocument();
});

it("does not restore a missing note or repeatedly save after note access is revoked", async () => {
  rows = [note];
  write.mockImplementationOnce(async () => { rows = []; return reply({ ok: false }, 404); });
  const view = render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: /Next chapter/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Note text" }), { target: { value: "Retain my draft without revealing the removed note." } });
  await screen.findByText("Your note access changed. Refresh before continuing.", {}, { timeout: 2500 });
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("button", { name: "New note" });
  expect(screen.queryByDisplayValue(/Retain my draft/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Next chapter/ })).not.toBeInTheDocument();
  expect(sessionStorage.getItem("quipsly.call-note-drafts.v1:coach:room")).toContain("Retain my draft");
  await createDraft();
  await screen.findByText("Saved", {}, { timeout: 2500 });
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[1][0]).toBe("/api/sessions/room/notes");
  view.unmount();
});

it("retains a pending draft but respects a refreshed read-only projection", async () => {
  rows = [note];
  const view = render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: /Next chapter/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Note text" }), { target: { value: "Still my draft." } });
  rows = [{ ...note, canEdit: false }];
  view.rerender(<CallNotesPanel roomId="room" active={false} onOpenWorkspace={() => {}} />);
  view.rerender(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await screen.findByText("Read-only note");
  expect(screen.getByRole("textbox", { name: "Note text" })).toHaveAttribute("readonly");
  expect(screen.getByRole("textbox", { name: "Note text" })).toHaveValue("Still my draft.");
  expect(write).not.toHaveBeenCalled();
});

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

it("reconciles independent shared edits and newer typing without a review step", async () => {
  rows = [note];
  let finish: (value: Response) => void = () => {};
  write.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: /Next chapter/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Note text" }), { target: { value: "Start with the introduction. Then outline the next chapter." } });
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1), { timeout: 2500 });
  fireEvent.change(screen.getByRole("textbox", { name: "Note text" }), { target: { value: "Start with the introduction. Then outline the next chapter. Keep it brief." } });
  const remote = { ...note, title: "Our next chapter", updatedAt: "2026-09-13T10:00:02.000Z", tags: [{id: "writing", label: "Writing", slug: "writing"}] };
  finish(reply({ ok: false, code: "CONFLICT", current: remote }, 409));
  await screen.findByText("Saved", {}, { timeout: 3000 });
  expect(write).toHaveBeenCalledTimes(2);
  expect(JSON.parse(write.mock.calls[1][1].body)).toMatchObject({
    title: remote.title, body: "Start with the introduction. Then outline the next chapter. Keep it brief.",
    expectedUpdatedAt: remote.updatedAt, tagIds: ["writing"],
  });
  expect(JSON.parse(write.mock.calls[1][1].body).clientRequestId).not.toBe(JSON.parse(write.mock.calls[0][1].body).clientRequestId);
  expect(screen.queryByRole("region", { name: "Note updated elsewhere" })).not.toBeInTheDocument();
  expect(screen.getByText("Includes your changes and the latest shared edits.")).toBeVisible();
});

it.each([401, 403, 404])("hides inaccessible notes on %s and retains this actor's unsaved recovery copy", async status => {
  rows = [note];
  const view = render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: /Next chapter/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Note title" }), { target: { value: "My unsaved preparation" } });
  fetchMock.mockImplementation(() => Promise.resolve(reply({ok: false}, status)));
  view.rerender(<CallNotesPanel roomId="room" active={false} onOpenWorkspace={() => {}} />);
  view.rerender(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await screen.findByRole("alert");
  expect(screen.queryByDisplayValue("My unsaved preparation")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "New note"})).not.toBeInTheDocument();
  expect(sessionStorage.getItem("quipsly.call-note-drafts.v1:coach:room")).toContain("My unsaved preparation");
  expect(write).not.toHaveBeenCalled();
});

it("ignores a stale denied read after a newer authorized refresh", async () => {
  let deny: (value: Response) => void = () => {};
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { deny = resolve; }));
  const view = render(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  rows = [note];
  view.rerender(<CallNotesPanel roomId="room" active={false} onOpenWorkspace={() => {}} />);
  view.rerender(<CallNotesPanel roomId="room" active onOpenWorkspace={() => {}} />);
  await screen.findByRole("button", {name: /Next chapter/});
  deny(reply({ok: false}, 403));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(screen.getByRole("button", {name: /Next chapter/})).toBeVisible();
});
