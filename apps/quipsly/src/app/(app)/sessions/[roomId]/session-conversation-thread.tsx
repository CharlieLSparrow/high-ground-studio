"use client";

import {
  Check,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Reply,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type ConversationMessage = {
  id: string;
  body: string;
  revision: number;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    label: string;
    image: string | null;
    isCurrentActor: boolean;
  };
  replyTo: {
    id: string;
    body: string;
    authorLabel: string;
  } | null;
  canEdit: boolean;
};

type ConversationPayload = {
  ok?: boolean;
  error?: string;
  messages?: ConversationMessage[];
  message?: ConversationMessage;
  unreadCount?: number;
  capabilities?: {
    canWrite: boolean;
    canEditOwnMessages: boolean;
  };
};

type PendingSend = {
  id: string;
  body: string;
  replyToId: string | null;
};

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(date.toDateString() === new Date().toDateString()
      ? {}
      : { month: "short", day: "numeric" }),
  }).format(date);
}

function upsertMessage(
  messages: ConversationMessage[],
  message: ConversationMessage,
) {
  return [
    ...messages.filter((candidate) => candidate.id !== message.id),
    message,
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function payloadFor(response: Response) {
  return (await response.json().catch(() => ({}))) as ConversationPayload;
}

export function SessionConversationThread({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [canWrite, setCanWrite] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const [editing, setEditing] = useState<ConversationMessage | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingSend = useRef<PendingSend | null>(null);
  const markedReadMessageId = useRef<string | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const initialScrollComplete = useRef(false);

  const markRead = useCallback(
    async (messageId: string) => {
      if (markedReadMessageId.current === messageId) return;
      markedReadMessageId.current = messageId;
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(roomId)}/conversation`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "MARK_READ",
              lastReadMessageId: messageId,
            }),
          },
        );
        if (response.ok) setUnreadCount(0);
        else markedReadMessageId.current = null;
      } catch {
        markedReadMessageId.current = null;
      }
    },
    [roomId],
  );

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(roomId)}/conversation`,
          { cache: "no-store" },
        );
        const payload = await payloadFor(response);
        if (!response.ok || !payload.ok || !payload.messages) {
          throw new Error(
            payload.error || "The conversation could not be loaded.",
          );
        }
        setMessages(payload.messages);
        setUnreadCount(payload.unreadCount || 0);
        setCanWrite(payload.capabilities?.canWrite === true);
        if (!silent) setNotice(null);
        const latest = payload.messages.at(-1);
        if ((payload.unreadCount || 0) > 0 && latest) {
          void markRead(latest.id);
        }
      } catch (error) {
        if (!silent) {
          setNotice(
            error instanceof Error
              ? error.message
              : "The conversation could not be loaded.",
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [markRead, roomId],
  );

  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const interval = window.setInterval(refresh, 6_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  useEffect(() => {
    const node = scrollArea.current;
    if (!node) return;
    const nearBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    if (!initialScrollComplete.current || nearBottom) {
      if (typeof node.scrollTo === "function") {
        node.scrollTo({
          top: node.scrollHeight,
          behavior: initialScrollComplete.current ? "smooth" : "auto",
        });
      }
      initialScrollComplete.current = true;
    }
  }, [messages]);

  async function sendMessage() {
    const body = draft.trim();
    if (!body || busy || !canWrite) return;
    const replyToId = replyTo?.id || null;
    const identity =
      pendingSend.current?.body === body &&
      pendingSend.current.replyToId === replyToId
        ? pendingSend.current
        : { id: crypto.randomUUID(), body, replyToId };
    pendingSend.current = identity;
    setBusy("send");
    setNotice(null);
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/conversation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientRequestId: identity.id,
            body: identity.body,
            replyToId: identity.replyToId,
          }),
        },
      );
      const payload = await payloadFor(response);
      if (!response.ok || !payload.ok || !payload.message) {
        throw new Error(payload.error || "The message was not sent.");
      }
      setMessages((current) => upsertMessage(current, payload.message!));
      setDraft("");
      setReplyTo(null);
      pendingSend.current = null;
    } catch (error) {
      setNotice(
        `${error instanceof Error ? error.message : "The message was not sent."} Your draft is still here.`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    if (!editing || !editDraft.trim() || busy || !canWrite) return;
    setBusy(editing.id);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/conversation`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messageId: editing.id,
            body: editDraft,
            expectedRevision: editing.revision,
          }),
        },
      );
      const payload = await payloadFor(response);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "The message was not updated.");
      }
      if (payload.message) {
        setMessages((current) => upsertMessage(current, payload.message!));
      } else {
        await load(true);
      }
      setEditing(null);
      setEditDraft("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The message was not updated.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function removeMessage(message: ConversationMessage) {
    if (busy || !canWrite) return;
    setBusy(message.id);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(roomId)}/conversation`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messageId: message.id,
            expectedRevision: message.revision,
          }),
        },
      );
      const payload = await payloadFor(response);
      if (!response.ok || !payload.ok || !payload.message) {
        throw new Error(payload.error || "The message was not removed.");
      }
      setMessages((current) => upsertMessage(current, payload.message!));
      setConfirmRemoveId(null);
      if (replyTo?.id === message.id) setReplyTo(null);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The message was not removed.",
      );
    } finally {
      setBusy(null);
    }
  }

  function composerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    void sendMessage();
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-[#ddcdaf] bg-[#fffdf8] shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-[#eadfca] px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-800">
            <MessageSquareText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-xl font-black text-[#3d3122]">
              Session conversation
            </h2>
            <p className="truncate text-xs font-semibold text-[#765f40]">
              Coordinate here. Keep personal notes in Notes.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh conversation"
          className="grid min-h-11 min-w-11 place-items-center rounded-full border border-[#d9c7a5] bg-white text-[#5b472f] disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
        </button>
      </header>

      <div
        ref={scrollArea}
        className="min-h-64 max-h-[32rem] space-y-3 overflow-y-auto bg-[#fbf5e9] px-3 py-4 sm:px-5"
        aria-label="Session messages"
      >
        {loading && messages.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm font-bold text-[#765f40]">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading conversation…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
            <MessageSquareText
              className="h-8 w-8 text-violet-500"
              aria-hidden="true"
            />
            <p className="mt-3 font-serif text-lg font-black text-[#3d3122]">
              Start the conversation
            </p>
            <p className="mt-1 max-w-sm text-sm font-semibold leading-6 text-[#765f40]">
              Share an agenda, a link, or what you want to cover. Everyone in
              this Session can follow along.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`flex ${message.author.isCurrentActor ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] sm:max-w-[75%] ${message.author.isCurrentActor ? "items-end" : "items-start"}`}
              >
                {!message.author.isCurrentActor ? (
                  <p className="mb-1 px-2 text-[11px] font-black text-[#765f40]">
                    {message.author.label}
                  </p>
                ) : null}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 shadow-sm ${
                    message.author.isCurrentActor
                      ? "rounded-br-md bg-violet-700 text-white"
                      : "rounded-bl-md border border-[#e3d6bf] bg-white text-[#3d3122]"
                  }`}
                >
                  {message.replyTo ? (
                    <div
                      className={`mb-2 border-l-2 pl-2 text-xs ${message.author.isCurrentActor ? "border-violet-300 text-violet-100" : "border-violet-300 text-[#765f40]"}`}
                    >
                      <p className="font-black">
                        {message.replyTo.authorLabel}
                      </p>
                      <p className="line-clamp-2">{message.replyTo.body}</p>
                    </div>
                  ) : null}
                  {message.deletedAt ? (
                    <p
                      className={`text-sm italic ${message.author.isCurrentActor ? "text-violet-100" : "text-[#8b765c]"}`}
                    >
                      Message removed
                    </p>
                  ) : editing?.id === message.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                        rows={3}
                        maxLength={6_000}
                        autoFocus
                        className="w-full resize-y rounded-xl border border-violet-300 bg-white p-2 text-sm text-[#3d3122] outline-none ring-violet-300 focus:ring-2"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            setEditDraft("");
                          }}
                          className="inline-flex min-h-9 items-center gap-1 rounded-full border border-violet-300 px-3 text-xs font-black text-white"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit()}
                          disabled={!editDraft.trim() || busy === message.id}
                          className="inline-flex min-h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-black text-violet-800 disabled:opacity-50"
                        >
                          {busy === message.id ? (
                            <LoaderCircle
                              className="h-3.5 w-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6">
                      {message.body}
                    </p>
                  )}
                  {editing?.id !== message.id ? (
                    <div
                      className={`mt-1.5 flex items-center gap-1 text-[10px] font-bold ${message.author.isCurrentActor ? "text-violet-200" : "text-[#8b765c]"}`}
                    >
                      <time dateTime={message.createdAt}>
                        {messageTime(message.createdAt)}
                      </time>
                      {message.editedAt && !message.deletedAt ? (
                        <span>· Edited</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {!message.deletedAt &&
                editing?.id !== message.id &&
                canWrite ? (
                  <div
                    className={`mt-1 flex min-h-8 items-center gap-1 px-1 ${message.author.isCurrentActor ? "justify-end" : "justify-start"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setReplyTo(message)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-[11px] font-black text-[#765f40] hover:bg-white"
                    >
                      <Reply className="h-3.5 w-3.5" aria-hidden="true" /> Reply
                    </button>
                    {message.canEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(message);
                          setEditDraft(message.body);
                          setConfirmRemoveId(null);
                        }}
                        className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-[11px] font-black text-[#765f40] hover:bg-white"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                        Edit
                      </button>
                    ) : null}
                    {message.canEdit && confirmRemoveId !== message.id ? (
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(message.id)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-[11px] font-black text-[#765f40] hover:bg-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                        Remove
                      </button>
                    ) : null}
                    {confirmRemoveId === message.id ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 p-1 text-[11px] font-black text-rose-800">
                        Remove?
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(null)}
                          className="min-h-7 rounded-full px-2"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeMessage(message)}
                          disabled={busy === message.id}
                          className="min-h-7 rounded-full bg-rose-700 px-2 text-white disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>

      <div className="border-t border-[#eadfca] bg-white p-3 sm:p-4">
        {replyTo ? (
          <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
            <div className="min-w-0">
              <p className="font-black">Replying to {replyTo.author.label}</p>
              <p className="truncate font-semibold">{replyTo.body}</p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="grid min-h-8 min-w-8 place-items-center rounded-full hover:bg-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (pendingSend.current?.body !== event.target.value.trim())
                pendingSend.current = null;
            }}
            onKeyDown={composerKeyDown}
            rows={2}
            maxLength={6_000}
            disabled={!canWrite}
            placeholder={
              canWrite
                ? "Message everyone in this Session"
                : "View-only conversation"
            }
            aria-label={
              canWrite
                ? "Message everyone in this Session"
                : "View-only conversation"
            }
            className="min-h-12 flex-1 resize-none rounded-2xl border border-[#d9c7a5] bg-[#fffdf8] px-3.5 py-3 text-sm font-semibold text-[#3d3122] outline-none ring-violet-300 placeholder:text-[#9b886f] focus:ring-2"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!canWrite || !draft.trim() || busy !== null}
            aria-label="Send message"
            className="grid min-h-12 min-w-12 place-items-center rounded-2xl bg-violet-700 text-white shadow-sm disabled:opacity-50"
          >
            {busy === "send" ? (
              <LoaderCircle
                className="h-5 w-5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Send className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="mt-2 flex min-h-5 items-center justify-between gap-3 px-1 text-[11px] font-semibold text-[#8b765c]">
          <p aria-live="polite" className={notice ? "text-rose-700" : ""}>
            {notice ||
              (unreadCount > 0
                ? `${unreadCount} new ${unreadCount === 1 ? "message" : "messages"}`
                : canWrite
                  ? "Enter to send · Shift+Enter for a new line"
                  : "View-only conversation")}
          </p>
          <span>{draft.length}/6000</span>
        </div>
      </div>
    </section>
  );
}
