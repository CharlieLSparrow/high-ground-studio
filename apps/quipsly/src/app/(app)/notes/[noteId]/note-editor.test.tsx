import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NoteEditor } from "./note-editor";

const initial = {
  id: "note", stableId: "stable-note", projectId: "nest", projectSlug: "my-nest", projectName: "My nest",
  title: "New Note", blocks: [{ id: "block", stableId: "stable-block", order: 0, body: "" }],
  contentRevision: "a".repeat(64), updatedAt: "2026-09-06T00:00:00Z", canEditContent: true, contentEditBoundary: "",
};
const key = "quipsly:note:actor:note";
const response = (revision = "b".repeat(64)) => ({ ok: true, status: 200, json: async () => ({ ok: true, note: { contentRevision: revision } }) });

describe("focused note editor", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  it("saves the existing block and title, then clears its local recovery copy", async () => {
    jest.mocked(fetch).mockResolvedValue(response() as Response);
    render(<NoteEditor initial={initial} actorId="actor" />);
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "A useful idea" } });
    fireEvent.change(screen.getByLabelText("Note text"), { target: { value: "Start with what the client wants to change." } });
    expect(JSON.parse(localStorage.getItem(key)!).draft.blocks[0].body).toContain("client");
    fireEvent.blur(screen.getByLabelText("Note text"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/^Saved$/));
    expect(fetch).toHaveBeenCalledWith("/api/mobile/capture/work/notes/note", expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({
      expectedContentRevision: initial.contentRevision, title: "A useful idea",
      blocks: [{ id: "block", stableId: "stable-block", body: "Start with what the client wants to change." }],
    });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("replays a lost response with the same request identity before saving newer words", async () => {
    jest.mocked(fetch).mockRejectedValueOnce(new Error("connection lost"));
    render(<NoteEditor initial={initial} actorId="actor" />);
    fireEvent.change(screen.getByLabelText("Note text"), { target: { value: "First words" } });
    fireEvent.blur(screen.getByLabelText("Note text"));
    await screen.findByRole("alert");
    const firstRequest = String(jest.mocked(fetch).mock.calls[0][1]?.body);
    jest.mocked(fetch).mockResolvedValueOnce(response() as Response).mockResolvedValueOnce(response("c".repeat(64)) as Response);
    fireEvent.change(screen.getByLabelText("Note text"), { target: { value: "First words, then a better thought" } });
    fireEvent.blur(screen.getByLabelText("Note text"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(jest.mocked(fetch).mock.calls[1][1]?.body).toBe(firstRequest);
    const newest = JSON.parse(String(jest.mocked(fetch).mock.calls[2][1]?.body));
    expect(newest.expectedContentRevision).toBe("b".repeat(64));
    expect(newest.blocks[0].body).toBe("First words, then a better thought");
    expect(newest.clientRequestId).not.toBe(JSON.parse(firstRequest).clientRequestId);
    await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
  });

  it("keeps another account's unsaved note out of the editor", () => {
    localStorage.setItem(key, JSON.stringify({ version: 1, revision: initial.contentRevision, draft: { title: "Private draft", blocks: [{ ...initial.blocks[0], body: "Only the author sees this" }] }, request: null }));
    render(<NoteEditor initial={initial} actorId="neighbor" />);
    expect(screen.getByLabelText("Note text")).toHaveValue("");
    expect(screen.getByLabelText("Note title")).toHaveValue("New Note");
    expect(localStorage.getItem(key)).toContain("Only the author");
  });

  it("restores unsaved text but never automatically overwrites a newer server revision", async () => {
    localStorage.setItem(key, JSON.stringify({ version: 1, revision: "old", draft: { title: "My draft", blocks: [{ ...initial.blocks[0], body: "Keep these words" }] }, request: null }));
    render(<NoteEditor initial={initial} actorId="actor" />);
    expect(screen.getByLabelText("Note text")).toHaveValue("Keep these words");
    expect(screen.getByRole("alert")).toHaveTextContent("changed on another device");
    await act(async () => { fireEvent.blur(screen.getByLabelText("Note text")); });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps recoverable words visible when another editor changed the block structure", async () => {
    localStorage.setItem(key, JSON.stringify({ version: 1, revision: "old", draft: { title: "My draft", blocks: [{ id: "retired-block", stableId: "retired-stable-block", order: 0, body: "Do not strand these words" }] }, request: null }));
    render(<NoteEditor initial={initial} actorId="actor" />);
    expect(screen.getByLabelText("Note text")).toHaveValue("Do not strand these words");
    expect(screen.getByRole("alert")).toHaveTextContent("changed on another device");
    await act(async () => { fireEvent.blur(screen.getByLabelText("Note text")); });
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toContain("Do not strand");
  });

  it("replays a persisted uncertain save after reload before writing the newer draft", async () => {
    const request = { expectedContentRevision: "old", clientRequestId: "previous-request", title: "My draft", blocks: [{ id: "block", stableId: "stable-block", body: "First version" }] };
    localStorage.setItem(key, JSON.stringify({ version: 1, revision: "old", draft: { title: "My draft", blocks: [{ ...initial.blocks[0], body: "Newer version" }] }, request }));
    jest.mocked(fetch).mockResolvedValueOnce(response(initial.contentRevision) as Response).mockResolvedValueOnce(response() as Response);
    render(<NoteEditor initial={initial} actorId="actor" />);
    fireEvent.blur(screen.getByLabelText("Note text"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]?.body))).toEqual(request);
    expect(JSON.parse(String(jest.mocked(fetch).mock.calls[1][1]?.body))).toMatchObject({ expectedContentRevision: initial.contentRevision, blocks: [{ body: "Newer version" }] });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/^Saved$/));
  });

  it("shows a readable note without editing or replaying a draft for a read-only member", () => {
    render(<NoteEditor initial={{ ...initial, canEditContent: false }} actorId="actor" />);
    expect(screen.getByLabelText("Note title")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Note text")).toHaveAttribute("readonly");
    expect(screen.getByRole("status")).toHaveTextContent("Read only");
    expect(fetch).not.toHaveBeenCalled();
  });
});
