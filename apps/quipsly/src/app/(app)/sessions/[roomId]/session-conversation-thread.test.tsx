import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionConversationThread } from "./session-conversation-thread";

const roomId = "room-1";

function message(
  overrides: Partial<{
    id: string;
    body: string;
    revision: number;
    editedAt: string | null;
    deletedAt: string | null;
    createdAt: string;
    updatedAt: string;
    isCurrentActor: boolean;
    canEdit: boolean;
    replyTo: { id: string; body: string; authorLabel: string } | null;
  }> = {},
) {
  return {
    id: "message-1",
    body: "What would make this Session useful?",
    revision: 1,
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-08-24T19:00:00.000Z",
    updatedAt: "2026-08-24T19:00:00.000Z",
    author: {
      id: overrides.isCurrentActor ? "actor-1" : "actor-2",
      label: overrides.isCurrentActor ? "You" : "Coach",
      image: null,
      isCurrentActor: overrides.isCurrentActor || false,
    },
    replyTo: overrides.replyTo || null,
    canEdit: overrides.canEdit || false,
    ...overrides,
  };
}

function response(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("SessionConversationThread", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("keeps replies in the Session and uses a familiar composer", async () => {
    const first = message();
    const sent = message({
      id: "message-2",
      body: "I want to leave with one clear next step.",
      isCurrentActor: true,
      canEdit: true,
      replyTo: { id: first.id, body: first.body, authorLabel: "Coach" },
      createdAt: "2026-08-24T19:01:00.000Z",
      updatedAt: "2026-08-24T19:01:00.000Z",
    });
    const requests: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (!init?.method) {
        return response({
          ok: true,
          messages: [first],
          unreadCount: 0,
          capabilities: { canWrite: true, canEditOwnMessages: true },
        });
      }
      requests.push(JSON.parse(String(init.body)));
      return response({ ok: true, message: sent }, 201);
    }) as jest.MockedFunction<typeof fetch>;
    const user = userEvent.setup();

    render(<SessionConversationThread roomId={roomId} />);
    expect(await screen.findByText(first.body)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Replying to Coach")).toBeInTheDocument();

    const composer = screen.getByRole("textbox", {
      name: "Message everyone in this Session",
    });
    await user.type(composer, sent.body);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      body: sent.body,
      replyToId: first.id,
    });
    expect(await screen.findByText(sent.body)).toBeInTheDocument();
    expect(composer).toHaveValue("");
    expect(screen.queryByText("Replying to Coach")).not.toBeInTheDocument();
  });

  it("retains both the draft and send identity when a retry is needed", async () => {
    const sent = message({
      id: "message-retry",
      body: "Here is the agenda link.",
      isCurrentActor: true,
      canEdit: true,
    });
    const sends: Array<Record<string, unknown>> = [];
    let attempt = 0;
    global.fetch = jest.fn(async (_url, init) => {
      if (!init?.method) {
        return response({
          ok: true,
          messages: [],
          unreadCount: 0,
          capabilities: { canWrite: true, canEditOwnMessages: true },
        });
      }
      const body = JSON.parse(String(init.body));
      sends.push(body);
      attempt += 1;
      if (attempt === 1) {
        return response({ ok: false, error: "Connection interrupted." }, 503);
      }
      return response({ ok: true, message: sent }, 201);
    }) as jest.MockedFunction<typeof fetch>;
    const user = userEvent.setup();

    render(<SessionConversationThread roomId={roomId} />);
    const composer = await screen.findByRole("textbox", {
      name: "Message everyone in this Session",
    });
    await user.type(composer, sent.body);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText(/your draft is still here/i),
    ).toBeInTheDocument();
    expect(composer).toHaveValue(sent.body);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(sends).toHaveLength(2));
    expect(sends[1].clientRequestId).toBe(sends[0].clientRequestId);
    expect(await screen.findByText(sent.body)).toBeInTheDocument();
    expect(composer).toHaveValue("");
  });

  it("edits only the exact displayed revision", async () => {
    const own = message({ isCurrentActor: true, canEdit: true });
    const edited = message({
      isCurrentActor: true,
      canEdit: true,
      body: "What would make today useful?",
      revision: 2,
      editedAt: "2026-08-24T19:02:00.000Z",
      updatedAt: "2026-08-24T19:02:00.000Z",
    });
    const requests: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (!init?.method) {
        return response({
          ok: true,
          messages: [own],
          unreadCount: 0,
          capabilities: { canWrite: true, canEditOwnMessages: true },
        });
      }
      requests.push(JSON.parse(String(init.body)));
      return response({ ok: true, message: edited });
    }) as jest.MockedFunction<typeof fetch>;
    const user = userEvent.setup();

    render(<SessionConversationThread roomId={roomId} />);
    expect(await screen.findByText(own.body)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getAllByRole("textbox")[0];
    await user.clear(editor);
    await user.type(editor, edited.body);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      messageId: own.id,
      body: edited.body,
      expectedRevision: 1,
    });
    expect(await screen.findByText(edited.body)).toBeInTheDocument();
    expect(screen.getByText("· Edited")).toBeInTheDocument();
  });

  it("does not expose mutation controls in a read-only conversation", async () => {
    global.fetch = jest.fn(async (_url, _init) =>
      response({
        ok: true,
        messages: [message()],
        unreadCount: 0,
        capabilities: { canWrite: false, canEditOwnMessages: false },
      }),
    ) as jest.MockedFunction<typeof fetch>;

    render(<SessionConversationThread roomId={roomId} />);

    expect(
      await screen.findByText("What would make this Session useful?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reply" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "View-only conversation" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("does not let a slower refresh replace a newer conversation snapshot", async () => {
    const older = message({ body: "Older agenda" });
    const newer = message({
      id: "message-2",
      body: "Newer agenda and next step",
      createdAt: "2026-08-24T19:01:00.000Z",
      updatedAt: "2026-08-24T19:01:00.000Z",
    });
    const first = deferred<Response>();
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(
        response({
          ok: true,
          messages: [older, newer],
          unreadCount: 0,
          capabilities: { canWrite: true, canEditOwnMessages: true },
        }),
      ) as jest.MockedFunction<typeof fetch>;

    render(<SessionConversationThread roomId={roomId} />);
    window.dispatchEvent(new Event("focus"));

    expect(await screen.findByText(newer.body)).toBeInTheDocument();
    first.resolve(
      response({
        ok: true,
        messages: [older],
        unreadCount: 0,
        capabilities: { canWrite: true, canEditOwnMessages: true },
      }),
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText(newer.body)).toBeInTheDocument();
    expect(screen.getByText(older.body)).toBeInTheDocument();
  });

  it("does not let an in-flight refresh roll back a confirmed edit", async () => {
    const own = message({ isCurrentActor: true, canEdit: true });
    const edited = message({
      isCurrentActor: true,
      canEdit: true,
      body: "Confirmed agenda",
      revision: 2,
      editedAt: "2026-08-24T19:02:00.000Z",
      updatedAt: "2026-08-24T19:02:00.000Z",
    });
    const staleRefresh = deferred<Response>();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response({
          ok: true,
          messages: [own],
          unreadCount: 0,
          capabilities: { canWrite: true, canEditOwnMessages: true },
        }),
      )
      .mockImplementationOnce(() => staleRefresh.promise)
      .mockResolvedValueOnce(response({ ok: true, message: edited })) as jest.MockedFunction<
      typeof fetch
    >;
    const user = userEvent.setup();

    render(<SessionConversationThread roomId={roomId} />);
    expect(await screen.findByText(own.body)).toBeInTheDocument();
    window.dispatchEvent(new Event("focus"));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getAllByRole("textbox")[0];
    await user.clear(editor);
    await user.type(editor, edited.body);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(edited.body)).toBeInTheDocument();

    staleRefresh.resolve(
      response({
        ok: true,
        messages: [own],
        unreadCount: 0,
        capabilities: { canWrite: true, canEditOwnMessages: true },
      }),
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(screen.getByText(edited.body)).toBeInTheDocument();
    expect(screen.queryByText(own.body)).not.toBeInTheDocument();
  });
});
