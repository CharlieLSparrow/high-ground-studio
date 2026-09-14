"use client";

import { ArrowDown, LoaderCircle, MessageCircle, Send } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import LocalDateTime from "@/components/LocalDateTime";
import { ConversationTaskAction, type ConversationLinkedTask } from "./conversation-task-action";
import { useWorkspacePanelActive } from "./workspace-panel-activity";
import { SESSION_CHAT_READ_EVENT } from "@/hooks/use-session-chat-activity";
import {
  CHAT_PERSISTED_INCOMING_EVENT,
  chatPersistedLiveHint,
  dispatchChatPersistedOutgoing,
  parseChatPersistedLiveHint,
} from "@/lib/live-collaboration/chat-live-hint";

type SessionMessage = {
  id: string;
  authorName?: string | null;
  authorEmail?: string | null;
  body: string;
  gifUrl: string | null;
  createdAt: string;
  linkedTasks?: ConversationLinkedTask[];
  revision?: number;
  deletedAt?: string | null;
  canEdit?: boolean;
  replyTo?: { id: string; body: string; authorLabel: string } | null;
  author?: { id: string | null; label: string; isCurrentActor: boolean };
};

type ThreadResponse = {
  ok?: boolean;
  error?: string;
  messages?: SessionMessage[];
  message?: SessionMessage;
  nextCursor?: string | null;
  unreadCount?: number;
  capabilities?: { canWrite: boolean };
};

function author(message: SessionMessage) {
  return message.author?.label || message.authorName || message.authorEmail?.split("@")[0] || "Collaborator";
}

export function CollaborationThread(props: Parameters<typeof ScopedCollaborationThread>[0]) {
  return <ScopedCollaborationThread key={JSON.stringify([props.projectSlug, props.threadKey])} {...props} />;
}

function mergeMessages(current: SessionMessage[], incoming: SessionMessage[]) {
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    if ((merged.get(message.id)?.revision ?? 0) <= (message.revision ?? 0)) merged.set(message.id, message);
  }
  return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function ScopedCollaborationThread({
  projectSlug,
  threadKey,
  collaborationTitle,
  heading = "Shared thread",
  clientSurface = "nest-chat-web",
  composerPlaceholder = "Write to everyone here…",
  viewOnlyPlaceholder = "View-only collaboration thread",
  canPost = true,
  scopeLabel = "Shared collaboration",
  scopeDescription,
  liveHintThreadKey = null,
  fillHeight = false,
  presentation = "workspace",
  onOpenWork,
  onOpenTask,
  messageToOpen,
}: {
  projectSlug: string;
  threadKey: string;
  collaborationTitle: string;
  heading?: string;
  clientSurface?: "session-room-web" | "engagement-room-web" | "nest-chat-web";
  composerPlaceholder?: string;
  viewOnlyPlaceholder?: string;
  canPost?: boolean;
  scopeLabel?: string;
  scopeDescription?: string;
  liveHintThreadKey?: string | null;
  fillHeight?: boolean;
  presentation?: "workspace" | "call";
  onOpenWork?: () => void;
  onOpenTask?: (taskId: string) => void;
  messageToOpen?: {id: string; request: number} | null;
}) {
  const panelActive = useWorkspacePanelActive();
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "idle" | "sending" | "error">("loading");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [serverCanWrite, setServerCanWrite] = useState(true);
  const [replyTo, setReplyTo] = useState<SessionMessage | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [mutating, setMutating] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [atLatest, setAtLatest] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const activeRef = useRef(true);
  const refreshingRef = useRef(false);
  const sendingRef = useRef(false);
  const historyLoadedRef = useRef(false);
  const followLatestRef = useRef(true);
  const previousScrollRef = useRef<{ top: number; height: number } | null>(null);
  const pendingSendRef = useRef<{ body: string; id: string; replyToId: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seenLiveHintIdsRef = useRef(new Set<string>());
  const headingId = `collaboration-thread-${threadKey.replace(/[^a-z0-9_-]/gi, "-")}`;
  const engagementId = threadKey.startsWith("engagement:") ? threadKey.slice("engagement:".length) : null;
  const sessionRoomId = threadKey.startsWith("session:") ? threadKey.slice("session:".length) : null;
  const endpoint = sessionRoomId ? `/api/sessions/${encodeURIComponent(sessionRoomId)}/conversation` : "/api/nest-chat";
  const writable = canPost && serverCanWrite;
  const focusedMessageRef = useRef<string | null>(null);
  const markedReadRef = useRef<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams(sessionRoomId ? { limit: "50" } : { projectSlug, threadKey });
      const requestedMessage = messageToOpen?.id || new URL(window.location.href).searchParams.get("message");
      if (requestedMessage) params.set("message", requestedMessage);
      const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as ThreadResponse;
      if (!response.ok || !payload.ok) {
        if (activeRef.current && [401, 403, 404].includes(response.status)) {
          setMessages([]); setUnreadCount(0); setServerCanWrite(false);
        }
        throw new Error(payload.error || "Session thread could not load.");
      }
      if (!activeRef.current) return;
      // A poll started before a send must not discard its acknowledged message
      // or the older history the reader has already loaded.
      setMessages((current) => mergeMessages(current, payload.messages ?? []));
      if (payload.capabilities) setServerCanWrite(payload.capabilities.canWrite);
      if (!historyLoadedRef.current) setNextCursor(payload.nextCursor ?? null);
      setLoadError("");
      setUnreadCount(Math.max(0, payload.unreadCount ?? 0));
    } catch (nextError) {
      if (activeRef.current) setLoadError(nextError instanceof Error ? nextError.message : "Conversation could not load.");
    } finally {
      refreshingRef.current = false;
      if (activeRef.current) setLoading(false);
    }
  }, [projectSlug, threadKey, endpoint, sessionRoomId, messageToOpen]);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  useEffect(() => {
    if (!panelActive) return;
    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine) void refresh(true);
    };
    const interval = window.setInterval(refreshWhenVisible, 3_000);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh, panelActive]);

  useEffect(() => {
    const visible = () => setPageVisible(document.visibilityState !== "hidden");
    visible();
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, []);

  useEffect(() => {
    if (!panelActive || !liveHintThreadKey || liveHintThreadKey !== threadKey) return;
    const receivePersistedHint = (event: Event) => {
      const hint = parseChatPersistedLiveHint(
        (event as CustomEvent<unknown>).detail,
        liveHintThreadKey,
      );
      if (!hint || seenLiveHintIdsRef.current.has(hint.messageId)) return;
      seenLiveHintIdsRef.current.add(hint.messageId);
      if (seenLiveHintIdsRef.current.size > 256) {
        seenLiveHintIdsRef.current.delete(seenLiveHintIdsRef.current.values().next().value as string);
      }
      void refresh(true);
    };
    window.addEventListener(CHAT_PERSISTED_INCOMING_EVENT, receivePersistedHint);
    return () => window.removeEventListener(CHAT_PERSISTED_INCOMING_EVENT, receivePersistedHint);
  }, [liveHintThreadKey, refresh, threadKey, panelActive]);

  useEffect(() => {
    if (!panelActive) return;
    const thread = scrollRef.current;
    const requestedMessage = messageToOpen?.id || new URL(window.location.href).searchParams.get("message");
    const focusKey = messageToOpen ? `${messageToOpen.id}:${messageToOpen.request}` : requestedMessage;
    if (requestedMessage && focusedMessageRef.current !== focusKey && messages.some(message => message.id === requestedMessage)) {
      const target = thread && Array.from(thread.querySelectorAll<HTMLElement>("article[id]"))
        .find(article => article.id === `conversation-message-${requestedMessage}`);
      if (target && !target.closest("[hidden]")) {
        target.scrollIntoView({ block: "nearest" });
        target.focus({ preventScroll: true });
        followLatestRef.current = false;
        setAtLatest(false);
        focusedMessageRef.current = focusKey;
        return;
      }
    }
    if (thread && previousScrollRef.current) {
      thread.scrollTop = previousScrollRef.current.top + thread.scrollHeight - previousScrollRef.current.height;
      previousScrollRef.current = null;
    } else if (thread && followLatestRef.current) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, [messages, panelActive, messageToOpen]);

  useEffect(() => {
    const latest = messages.at(-1);
    const scroll = scrollRef.current;
    if (!sessionRoomId || !panelActive || !pageVisible || !atLatest || !unreadCount || !latest
      || !scroll || scroll.clientHeight <= 0 || markedReadRef.current === latest.id
      || !followLatestRef.current) return;
    // A fetch is not a read. Only acknowledge the bottom of a visible thread.
    markedReadRef.current = latest.id;
    void fetch(endpoint, {method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({action: "MARK_READ", lastReadMessageId: latest.id}),
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) { markedReadRef.current = null; return; }
      if (activeRef.current) {
        // Refresh both projections: a newer message may have arrived meanwhile.
        void refresh(true);
        window.dispatchEvent(new CustomEvent(SESSION_CHAT_READ_EVENT, {detail: {roomId: sessionRoomId}}));
      }
    }, () => { markedReadRef.current = null; });
  }, [messages, unreadCount, panelActive, pageVisible, atLatest, endpoint, sessionRoomId, refresh]);

  function jumpToLatest() {
    followLatestRef.current = true;
    setAtLatest(true);
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!writable || !body || sendingRef.current) return;
    // Reuse the request identity when the server saved a message but its
    // response was lost. Polling cannot unlock this in-flight send.
    const replyToId = replyTo?.id ?? null;
    const pending = pendingSendRef.current?.body === body && pendingSendRef.current.replyToId === replyToId
      ? pendingSendRef.current : { body, id: crypto.randomUUID(), replyToId };
    pendingSendRef.current = pending;
    sendingRef.current = true;
    setStatus("sending");
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sessionRoomId ? { body, clientRequestId: pending.id, replyToId } : {
          projectSlug,
          threadKey,
          body,
          clientMessageId: pending.id,
          clientSurface,
        }),
      });
      const payload = await response.json().catch(() => ({})) as ThreadResponse;
      if (!response.ok || !payload.ok || !payload.message) throw new Error(payload.error || "Message could not send.");
      if (!activeRef.current) return;
      followLatestRef.current = true;
      setMessages((current) => mergeMessages(current, [payload.message!]));
      if (liveHintThreadKey === threadKey) {
        const hint = chatPersistedLiveHint(threadKey, payload.message.id, payload.message.createdAt);
        if (hint) dispatchChatPersistedOutgoing(hint);
      }
      setDraft((current) => current.trim() === body ? "" : current);
      setReplyTo(null);
      pendingSendRef.current = null;
      setStatus("idle");
    } catch (nextError) {
      if (!activeRef.current) return;
      setError(nextError instanceof Error ? nextError.message : "Message could not send.");
      setStatus("error");
    } finally {
      sendingRef.current = false;
    }
  }

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const params = new URLSearchParams(sessionRoomId ? { limit: "50", cursor: nextCursor } : { projectSlug, threadKey, cursor: nextCursor });
      const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as ThreadResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Earlier messages could not load.");
      if (!activeRef.current) return;
      if (scrollRef.current) previousScrollRef.current = { top: scrollRef.current.scrollTop, height: scrollRef.current.scrollHeight };
      historyLoadedRef.current = true;
      setMessages((current) => mergeMessages(current, payload.messages ?? []));
      setNextCursor(payload.nextCursor ?? null);
      setLoadError("");
    } catch (nextError) {
      if (activeRef.current) setLoadError(nextError instanceof Error ? nextError.message : "Earlier messages could not load.");
    } finally {
      if (activeRef.current) setLoadingOlder(false);
    }
  }

  async function changeMessage(message: SessionMessage, method: "PATCH" | "DELETE") {
    if (!sessionRoomId || !writable || mutating || !message.canEdit) return;
    setMutating(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId: message.id, expectedRevision: message.revision, ...(method === "PATCH" ? { body: editDraft } : {}) }),
      });
      const payload = await response.json().catch(() => ({})) as ThreadResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Message could not update.");
      if (!activeRef.current) return;
      if (!payload.message) { setEditing(null); await refresh(true); return; }
      setMessages((current) => mergeMessages(current, [payload.message!]));
      setEditing(null);
      const hint = chatPersistedLiveHint(threadKey, payload.message.id, payload.message.createdAt);
      if (hint) dispatchChatPersistedOutgoing(hint);
    } catch (nextError) {
      if (activeRef.current) setError(nextError instanceof Error ? nextError.message : "Message could not update.");
    } finally {
      if (activeRef.current) setMutating(false);
    }
  }

  return (
    <section className={`flex min-w-0 w-full flex-col overflow-hidden border border-border bg-card text-card-foreground ${presentation === "call" ? "rounded-xl" : "rounded-[1.75rem] shadow-sm"} ${fillHeight ? "h-full min-h-0" : "min-h-[30rem]"}`} aria-labelledby={headingId}>
      <header className={`shrink-0 border-b border-border ${presentation === "call" ? "px-3 py-2" : fillHeight ? "px-4 py-3" : "px-5 py-4"}`}>
        {presentation !== "call" ? <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{scopeLabel}</p> : null}
        <h2 id={headingId} className={`flex items-center gap-2 text-foreground ${presentation === "call" ? "text-sm font-semibold" : "mt-1 font-serif text-2xl font-black"}`}><MessageCircle size={presentation === "call" ? 16 : 20} aria-hidden="true" /> {heading}</h2>
        {presentation !== "call" ? <p className="mt-2 text-xs font-semibold leading-5 text-muted-foreground">{scopeDescription || `Discuss ${collaborationTitle} and keep the conversation beside your work.`}</p> : null}
      </header>
      <div ref={scrollRef} className={`min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 ${fillHeight ? "" : "max-h-[32rem]"}`} role="log" aria-label={heading}
        onScroll={() => { const el = scrollRef.current; if (el) { followLatestRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32; setAtLatest(followLatestRef.current); } }}>
        {nextCursor ? <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="min-h-11 w-full rounded-xl border border-border px-3 text-sm">{loadingOlder ? "Loading…" : "Earlier messages"}</button> : null}
        {loading ? <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><LoaderCircle size={16} className="animate-spin" /> Loading conversation…</p> : null}
        {!loading && !loadError && messages.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Start the conversation when you're ready.</p> : null}
        {messages.map((message) => <article key={message.id} id={`conversation-message-${message.id}`} tabIndex={-1} className={`focus:outline focus:outline-2 focus:outline-ring ${presentation === "call" ? "border-b border-border pb-3 last:border-0" : "rounded-2xl border border-border bg-background p-3"}`}>
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-black text-foreground">{author(message)}</p><LocalDateTime value={message.createdAt} mode="time" className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground" /></div>
          {message.replyTo && <blockquote className="mt-2 border-l-2 border-primary pl-3 text-xs text-muted-foreground"><strong>{message.replyTo.authorLabel}</strong><p className="line-clamp-2">{message.replyTo.body}</p></blockquote>}
          {editing === message.id ? <form className="mt-2 space-y-2" onSubmit={(event) => { event.preventDefault(); void changeMessage(message, "PATCH"); }}>
            <textarea aria-label="Edit message" value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={6000} className="min-h-24 w-full rounded-xl border border-border bg-background p-3" />
            <button type="submit" disabled={mutating || !editDraft.trim()} className="min-h-11 rounded-xl bg-primary px-4 text-primary-foreground">Save</button>
            <button type="button" disabled={mutating} onClick={() => setEditing(null)} className="min-h-11 px-4">Cancel</button>
          </form> : message.deletedAt ? <p className="mt-2 text-sm italic text-muted-foreground">Message removed</p> : message.body ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{message.body}</p> : null}
          {message.gifUrl ? <img src={message.gifUrl} alt="Shared GIF" className="mt-3 max-h-48 w-full rounded-xl object-contain" /> : null}
          {sessionRoomId && writable && !message.deletedAt && <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
            <button type="button" className="min-h-11" onClick={() => setReplyTo(message)}>Reply</button>
            {message.canEdit && <><button type="button" className="min-h-11" onClick={() => { setEditing(message.id); setEditDraft(message.body); }}>Edit</button><button type="button" className="min-h-11" disabled={mutating} onClick={() => void changeMessage(message, "DELETE")}>Remove</button></>}
          </div>}
          {engagementId && <ConversationTaskAction engagementId={engagementId} messageId={message.id} body={message.body} canCreate={canPost} tasks={message.linkedTasks} />}
          {sessionRoomId && !message.deletedAt && <ConversationTaskAction roomId={sessionRoomId} messageId={message.id} body={message.body} canCreate={writable} tasks={message.linkedTasks} onOpenWork={onOpenWork} onOpenTask={onOpenTask} />}
          {threadKey === "default" && <ConversationTaskAction projectSlug={projectSlug} messageId={message.id} body={message.body} canCreate={canPost} tasks={message.linkedTasks} />}
        </article>)}
      </div>
      {!atLatest && unreadCount > 0 ? <button type="button" onClick={jumpToLatest} className="mx-auto my-2 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"><ArrowDown size={16} aria-hidden="true" />New messages</button> : null}
      {loadError ? <div role="alert" className="px-4 py-2 text-sm text-destructive">{loadError} <button type="button" onClick={() => void refresh()} className="min-h-11 underline">Retry loading</button></div> : null}
      <form onSubmit={send} className="shrink-0 border-t border-border p-3">
        {replyTo && <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-muted px-3 text-xs"><p className="min-w-0 truncate">Replying to {author(replyTo)}: {replyTo.body}</p><button type="button" className="min-h-11 shrink-0" onClick={() => setReplyTo(null)}>Cancel reply</button></div>}
        {error ? <p role="alert" className="mb-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">{error} Your draft is retained.</p> : null}
        <div className="flex items-end gap-2">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Message" rows={presentation === "call" ? 2 : 3} maxLength={sessionRoomId ? 6000 : 4000} disabled={!writable || status === "sending"} placeholder={writable ? composerPlaceholder : viewOnlyPlaceholder} className={`${presentation === "call" ? "min-h-11 rounded-xl" : "min-h-20 rounded-2xl"} min-w-0 flex-1 resize-none border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/20 disabled:bg-muted`} />
          <button type="submit" disabled={!writable || !draft.trim() || status === "sending"} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 font-black text-primary-foreground disabled:opacity-45" aria-label="Send collaboration message">{status === "sending" ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}</button>
        </div>
        {!writable ? <p className="mt-2 text-xs font-bold text-muted-foreground">View-only conversation</p> : null}
      </form>
    </section>
  );
}

export function SessionThread({
  projectSlug = "",
  roomId,
  sessionTitle,
  canPost = true,
  scopeLabel = "This meeting only",
  scopeDescription,
  fillHeight = false,
  presentation = "workspace",
  heading = "Session thread",
  onOpenWork,
  onOpenTask,
  messageToOpen,
}: {
  projectSlug?: string;
  roomId: string;
  sessionTitle: string;
  canPost?: boolean;
  scopeLabel?: string;
  scopeDescription?: string;
  fillHeight?: boolean;
  presentation?: "workspace" | "call";
  heading?: string;
  onOpenWork?: () => void;
  onOpenTask?: (taskId: string) => void;
  messageToOpen?: {id: string; request: number} | null;
}) {
  return <CollaborationThread
    projectSlug={projectSlug}
    threadKey={`session:${roomId}`}
    liveHintThreadKey={`session:${roomId}`}
    collaborationTitle={sessionTitle}
    heading={heading}
    onOpenWork={onOpenWork}
    onOpenTask={onOpenTask}
    messageToOpen={messageToOpen}
    fillHeight={fillHeight}
    presentation={presentation}
    clientSurface="session-room-web"
    canPost={canPost}
    scopeLabel={scopeLabel}
    scopeDescription={scopeDescription || `Coordinate ${sessionTitle} before, during, and after the call. Your notes, tasks, and recording stay together in this Session.`}
    composerPlaceholder="Write to everyone in this Session…"
    viewOnlyPlaceholder="View-only Session thread"
  />;
}
