import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionNotesWorkspace } from "./session-notes-workspace";
import type { SessionWorkspaceNote } from "./session-notes-model";

function note(input: Partial<SessionWorkspaceNote> & Pick<SessionWorkspaceNote, "id">): SessionWorkspaceNote {
  return {
    id: input.id,
    title: input.title ?? "Session observation",
    body: input.body ?? "Keep the exact useful context.",
    kind: input.kind ?? "SESSION_NOTE",
    visibility: input.visibility ?? "AUTHOR_PRIVATE",
    author: input.author ?? { id: "actor-1", label: "Charlie", isCurrentActor: true },
    originLabel: input.originLabel ?? "iPhone Capture",
    canEdit: input.canEdit ?? true,
    canChangeVisibility: input.canChangeVisibility ?? true,
    revisionCount: input.revisionCount ?? 1,
    createdAt: input.createdAt ?? "2026-07-24T12:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-07-24T12:00:00.000Z",
    tags: input.tags ?? [],
    sourceAnchor: input.sourceAnchor ?? null,
  };
}

function jsonResponse(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}

describe("Session Notes workspace", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("shows existing notes first and keeps a collapsed composer draft intact", async () => {
    const user = userEvent.setup();
    render(<SessionNotesWorkspace roomId="room-1" activeView="all" taxonomy={null} canUseProjectTeamNotes={false}
      initialNotes={[note({id: "recap", title: "Our recap"})]} />);
    expect(screen.getByRole("heading", {name: "Our recap"})).toBeVisible();
    expect(screen.getByRole("form", {name: "New session note"})).not.toBeVisible();
    await user.click(screen.getByText("Add a note"));
    const form = screen.getByRole("form", {name: "New session note"});
    await user.type(within(form).getByRole("textbox", {name: "Note"}), "A thought to keep");
    await user.click(screen.getByText("Add a note"));
    await user.click(screen.getByText("Add a note"));
    expect(within(form).getByRole("textbox", {name: "Note"})).toHaveValue("A thought to keep");
  });

  it("creates a private note directly from the private view", async () => {
    const user = userEvent.setup();
    const saved = note({id: "private-note", body: "My private reflection"});
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ok: true, note: saved}));
    global.fetch = fetchMock as typeof fetch;
    render(<SessionNotesWorkspace roomId="room-1" activeView="private" taxonomy={null} canUseProjectTeamNotes={false} initialNotes={[]} />);
    expect(screen.getByTestId("new-note-audience")).toHaveTextContent("Only you.");
    await user.type(screen.getByRole("textbox", {name: "Note"}), "My private reflection");
    await user.click(screen.getByRole("button", {name: "Save note"}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({body: "My private reflection", visibility: "AUTHOR_PRIVATE"});
    expect(await screen.findByRole("status")).toHaveTextContent("Note saved. Only you.");
  });

  it("does not change a written draft's audience when the view changes", async () => {
    const user = userEvent.setup();
    const props = {roomId: "room-1", taxonomy: null, canUseProjectTeamNotes: false, initialNotes: []};
    const view = render(<SessionNotesWorkspace {...props} activeView="private" />);
    await user.type(screen.getByRole("textbox", {name: "Note"}), "Private draft");
    view.rerender(<SessionNotesWorkspace {...props} activeView="shared" />);
    expect(screen.getByRole("textbox", {name: "Note"})).toHaveValue("Private draft");
    expect(screen.getByTestId("new-note-audience")).toHaveTextContent("Only you.");
  });

  it("retains a failed note and reuses its request identity on retry", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValueOnce(jsonResponse({ok: false, error: "Connection interrupted."}, 503))
      .mockResolvedValueOnce(jsonResponse({ok: true, idempotentReplay: true, note: note({id: "saved-once", title: "A decision", body: "Keep this text", kind: "DECISION"})}));
    global.fetch = fetchMock as typeof fetch;
    render(<SessionNotesWorkspace roomId="room-1" activeView="private" taxonomy={null} canUseProjectTeamNotes={false} initialNotes={[]} />);
    await user.type(screen.getByRole("textbox", {name: "Note"}), "Keep this text");
    await user.type(screen.getByRole("textbox", {name: /^Title/}), "A decision");
    await user.click(screen.getByText("Note type and sharing"));
    await user.selectOptions(screen.getByRole("combobox", {name: "Note type"}), "DECISION");
    await user.click(screen.getByRole("button", {name: "Save note"}));
    expect(await screen.findByRole("status")).toHaveTextContent("Connection interrupted.");
    expect(screen.getByRole("textbox", {name: "Note"})).toHaveValue("Keep this text");
    expect(screen.getByRole("textbox", {name: /^Title/})).toHaveValue("A decision");
    expect(screen.getByRole("combobox", {name: "Note type"})).toHaveValue("DECISION");
    expect(screen.getByRole("combobox", {name: "Who can read it"})).toHaveValue("AUTHOR_PRIVATE");
    await user.click(screen.getByRole("button", {name: "Save note"}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(first);
    expect(first.clientRequestId).toBeTruthy();
    expect(await screen.findByRole("status")).toHaveTextContent("This note was already saved.");
    expect(screen.getAllByRole("heading", {name: "A decision"})).toHaveLength(1);
  });

  it("makes every visibility lane explicit and lets collaborators edit shared note content", () => {
    render(<SessionNotesWorkspace
      roomId="room-1"
      activeView="all"
      taxonomy={null}
      canUseProjectTeamNotes
      initialNotes={[
        note({ id: "private", visibility: "AUTHOR_PRIVATE" }),
        note({
          id: "shared",
          title: "Shared coaching context",
          visibility: "SESSION_SHARED",
          author: { id: "actor-2", label: "Homer", isCurrentActor: false },
          canEdit: true,
          canChangeVisibility: false,
        }),
        note({ id: "client", visibility: "CLIENT_SAFE" }),
        note({ id: "production", kind: "PRODUCTION", visibility: "PROJECT_TEAM" }),
        note({ id: "decision", kind: "DECISION", visibility: "SESSION_SHARED" }),
      ]}
    />);

    expect(screen.getByRole("heading", { name: "5 notes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Private 1" })).toHaveAttribute("href", "/sessions/room-1?mode=notes&view=private");
    expect(screen.getByRole("link", { name: "Shared 2" })).toHaveAttribute("href", "/sessions/room-1?mode=notes&view=shared");
    expect(screen.getByRole("link", { name: "Client-safe 1" })).toHaveAttribute("href", "/sessions/room-1?mode=notes&view=client-safe");
    expect(screen.getByRole("link", { name: "Production 1" })).toHaveAttribute("href", "/sessions/room-1?mode=notes&view=production");
    expect(screen.getByRole("link", { name: "Decisions 1" })).toHaveAttribute("href", "/sessions/room-1?mode=notes&view=decisions");
    const shared = screen.getByRole("heading", { name: "Shared coaching context" }).closest("article")!;
    expect(within(shared).getByText("Edit note, audience, and tags")).toBeInTheDocument();
    expect(within(shared).getByText("Session", { selector: "p" })).toBeInTheDocument();
    expect(within(shared).queryByRole("combobox", { name: "Who can read it" })).not.toBeInTheDocument();
    expect(screen.getByText(/By you · Only you\./i)).toBeInTheDocument();
  });

  it.each(["SUMMARY", "HIGHLIGHT"] as const)("edits generated %s directly without changing its source type", async (kind) => {
    const original = note({ id: "generated-note", kind, title: "Generated recap", visibility: "SESSION_SHARED" });
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ ok: true, note: { ...original, body: "Our edited recap.", updatedAt: "2026-07-24T13:00:00.000Z", revisionCount: 2 } })) as typeof fetch;
    const user = userEvent.setup();
    render(<SessionNotesWorkspace roomId="room-1" activeView="all" taxonomy={null} canUseProjectTeamNotes={false} initialNotes={[original]} />);
    const card = screen.getByRole("heading", { name: "Generated recap" }).closest("article")!;
    await user.click(within(card).getByText("Edit note, audience, and tags"));
    expect(within(card).queryByRole("combobox", { name: "Note type" })).not.toBeInTheDocument();
    await user.clear(within(card).getByRole("textbox", { name: "Note" }));
    await user.type(within(card).getByRole("textbox", { name: "Note" }), "Our edited recap.");
    await user.click(within(card).getByRole("button", { name: "Save revision" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({ kind, body: "Our edited recap.", expectedUpdatedAt: original.updatedAt });
    expect(await screen.findByText("Our edited recap.", { selector: "p" })).toBeInTheDocument();
  });

  it.each([200, 409])("undoes a generated recap edit without overwriting a newer collaborator revision (%s)", async (status) => {
    const original = note({ id: "recap", kind: "SUMMARY", title: "Our recap", body: "Original recap.", visibility: "SESSION_SHARED" });
    const saved = { ...original, body: "Edited recap.", updatedAt: "2026-07-24T13:00:00.000Z", revisionCount: 2 };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, note: saved }))
      .mockResolvedValueOnce(status === 200
        ? jsonResponse({ ok: true, note: { ...original, updatedAt: "2026-07-24T14:00:00.000Z", revisionCount: 3 } })
        : jsonResponse({ ok: false, error: "Someone updated this note. Reload before editing." }, 409));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionNotesWorkspace roomId="room-1" activeView="all" taxonomy={null} canUseProjectTeamNotes={false} initialNotes={[original]} />);
    const card = screen.getByRole("heading", { name: "Our recap" }).closest("article")!;
    await user.click(within(card).getByText("Edit note, audience, and tags"));
    await user.clear(within(card).getByRole("textbox", { name: "Note" }));
    await user.type(within(card).getByRole("textbox", { name: "Note" }), saved.body);
    await user.click(within(card).getByRole("button", { name: "Save revision" }));
    await user.click(await screen.findByRole("button", { name: "Undo last edit" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      title: original.title, body: original.body, kind: "SUMMARY", visibility: "SESSION_SHARED", expectedUpdatedAt: saved.updatedAt,
    });
    if (status === 200) {
      expect(await screen.findByText("Previous version restored.")).toBeInTheDocument();
      expect(within(card).getByText(original.body, { selector: "p" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Undo last edit" })).not.toBeInTheDocument();
    } else {
      expect(await screen.findByText("Someone updated this note. Reload before editing.")).toBeInTheDocument();
      expect(within(card).getByText(saved.body, { selector: "p" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Undo last edit" })).toBeEnabled();
    }
  });

  it("shows only notes in the selected URL-addressable view", () => {
    render(<SessionNotesWorkspace
      roomId="room-1"
      activeView="private"
      taxonomy={null}
      canUseProjectTeamNotes={false}
      initialNotes={[
        note({ id: "private", title: "Private reflection", visibility: "AUTHOR_PRIVATE" }),
        note({ id: "shared", title: "Shared context", visibility: "SESSION_SHARED" }),
      ]}
    />);

    expect(screen.getByRole("heading", { name: "Private reflection" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Shared context" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Production note" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Project team" })).not.toBeInTheDocument();
  });

  it("returns a transcript-derived note to its exact reviewed recording moment", () => {
    render(<SessionNotesWorkspace
      roomId="room-1"
      activeView="all"
      taxonomy={null}
      canUseProjectTeamNotes={false}
      initialNotes={[note({
        id: "source-note",
        title: "Coaching insight",
        originLabel: "Transcript review",
        sourceAnchor: {
          schema: "quipsly-transcript-derived-note-v1",
          roomId: "room-1",
          transcriptJobId: "job-1",
          segmentId: "segment-1",
          startSeconds: 3.66,
          endSeconds: 4.84,
          providerTextSha256: "a".repeat(64),
          providerSpeakerLabel: "Speaker",
          effectiveTextSnapshot: "Welcome, everybody.",
          effectiveSpeakerLabelSnapshot: "Charlie",
          speakerAuthority: "attribution",
          acceptedCorrectionId: "correction-1",
          recordingAssetId: "asset-1",
          playbackSourceId: "source-1",
        },
      })]}
    />);

    expect(screen.getByText("Transcript source")).toBeInTheDocument();
    expect(screen.getByText("Charlie: Welcome, everybody.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Speaker reviewed\. A person matched this voice to a Session participant\./i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /return to 00:03–00:04/i })).toHaveAttribute(
      "href",
      "/sessions/room-1?mode=transcript#transcript-segment-segment-1",
    );
  });

  it("creates one explicitly shared canonical note without claiming delivery", async () => {
    const created = note({
      id: "created",
      title: "Opening decision",
      body: "Lead with the listener question.",
      kind: "DECISION",
      visibility: "SESSION_SHARED",
      originLabel: "Nest Session note",
    });
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      ok: true,
      idempotentReplay: false,
      note: created,
    }));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionNotesWorkspace
      roomId="room-1"
      activeView="all"
      taxonomy={null}
      canUseProjectTeamNotes
      initialNotes={[]}
    />);

    await user.click(screen.getByText("Note type and sharing"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Note type" }), "DECISION");
    await user.selectOptions(screen.getByRole("combobox", { name: "Who can read it" }), "SESSION_SHARED");
    await user.type(screen.getByRole("textbox", { name: /^Title/ }), "Opening decision");
    await user.type(screen.getByRole("textbox", { name: "Note" }), "Lead with the listener question.");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/sessions/room-1/notes");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      title: "Opening decision",
      body: "Lead with the listener question.",
      kind: "DECISION",
      visibility: "SESSION_SHARED",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Note saved. Everyone in this Session.");
    expect(screen.getByRole("heading", { name: "Opening decision" })).toBeInTheDocument();
  });

  it("edits the same note, changes audience, and reads back retained revisions", async () => {
    const initial = note({ id: "note-1", title: "Private reflection", revisionCount: 1 });
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      ok: true,
      note: {
        title: "Shared reflection",
        body: initial.body,
        kind: "SESSION_NOTE",
        visibility: "CLIENT_SAFE",
        updatedAt: "2026-07-24T13:00:00.000Z",
        revisionCount: 2,
        tags: [],
      },
    }));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionNotesWorkspace
      roomId="room-1"
      activeView="all"
      taxonomy={null}
      canUseProjectTeamNotes={false}
      initialNotes={[initial]}
    />);

    const article = screen.getByRole("heading", { name: "Private reflection" }).closest("article")!;
    await user.click(within(article).getByText("Edit note, audience, and tags"));
    const title = within(article).getByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Shared reflection");
    await user.selectOptions(within(article).getByRole("combobox", { name: "Who can read it" }), "CLIENT_SAFE");
    await user.click(within(article).getByRole("button", { name: "Save revision" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      title: "Shared reflection",
      visibility: "CLIENT_SAFE",
      expectedUpdatedAt: initial.updatedAt,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Note updated.");
    expect(screen.getByRole("button", { name: "Undo last edit" })).toBeInTheDocument();
    const updated = screen.getByRole("heading", { name: "Shared reflection" }).closest("article")!;
    expect(updated).toBeInTheDocument();
    expect(screen.getByText(/2 versions/)).toBeInTheDocument();
    expect(within(updated).getByRole("combobox", { name: "Who can read it" })).toHaveValue("CLIENT_SAFE");
  });

  it("keeps an existing note's unsaved revision after a failed save", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ok: false, error: "Could not save. Try again."}, 503)) as typeof fetch;
    render(<SessionNotesWorkspace roomId="room-1" activeView="all" taxonomy={null} canUseProjectTeamNotes={false}
      initialNotes={[note({id: "existing", title: "Original title", body: "Original body"})]} />);
    const article = screen.getByRole("heading", {name: "Original title"}).closest("article")!;
    await user.click(within(article).getByText("Edit note, audience, and tags"));
    const title = within(article).getByRole("textbox", {name: "Title"});
    const body = within(article).getByRole("textbox", {name: "Note"});
    await user.clear(title); await user.type(title, "Changed title");
    await user.clear(body); await user.type(body, "An important change");
    await user.click(within(article).getByRole("button", {name: "Save revision"}));
    expect(await screen.findByRole("status")).toHaveTextContent("Could not save. Try again.");
    expect(title).toHaveValue("Changed title");
    expect(body).toHaveValue("An important change");
    expect(within(article).getByText("Original body", {selector: "p"})).toBeInTheDocument();
  });
});
