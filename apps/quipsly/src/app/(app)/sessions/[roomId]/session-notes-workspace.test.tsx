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

  it("makes every visibility lane explicit and keeps another author's shared note read-only", () => {
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
          canEdit: false,
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
    expect(screen.getByText("Read-only here. Only the note author can edit its text or audience.")).toBeInTheDocument();
    expect(screen.getByText(/only the author can read this note—even staff do not get an override/i)).toBeInTheDocument();
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
    expect(await screen.findByRole("status")).toHaveTextContent("Note saved. People who can access this Session can read it. Nothing is messaged or delivered.");
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
    expect(await screen.findByRole("status")).toHaveTextContent("Note updated. Its earlier versions remain available in the history.");
    const updated = screen.getByRole("heading", { name: "Shared reflection" }).closest("article")!;
    expect(updated).toBeInTheDocument();
    expect(screen.getByText(/2 retained revisions/)).toBeInTheDocument();
    expect(within(updated).getByRole("combobox", { name: "Who can read it" })).toHaveValue("CLIENT_SAFE");
  });
});
