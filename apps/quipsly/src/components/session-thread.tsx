"use client";

import { LoaderCircle, MessageCircle, Send } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import LocalDateTime from "@/components/LocalDateTime";
import {
  CHAT_PERSISTED_INCOMING_EVENT,
  chatPersistedLiveHint,
  dispatchChatPersistedOutgoing,
  parseChatPersistedLiveHint,
} from "@/lib/live-collaboration/chat-live-hint";

type SessionMessage = {
  id: string;
  authorName: string | null;
  authorEmail: string | null;
  body: string;
  gifUrl: string | null;
  createdAt: string;
};

type ThreadResponse = {
  ok?: boolean;
  error?: string;
  messages?: SessionMessage[];
  message?: SessionMessage;
  nextCursor?: string | null;
};

function author(message: SessionMessage) {
  return message.authorName || message.authorEmail?.split("@")[0] || "Collaborator";
}

export function CollaborationThread(props: Parameters<typeof ScopedCollaborationThread>[0]) {
  return <ScopedCollaborationThread key={JSON.stringify([props.projectSlug, props.threadKey])} {...props} />;
}

function mergeMessages(current: SessionMessage[], incoming: SessionMessage[]) {
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) merged.set(message.id, message);
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
}) {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "idle" | "sending" | "error">("loading");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const activeRef = useRef(true);
  const refreshingRef = useRef(false);
  const sendingRef = useRef(false);
  const historyLoadedRef = useRef(false);
  const followLatestRef = useRef(true);
  const previousScrollRef = useRef<{ top: number; height: number } | null>(null);
  const pendingSendRef = useRef<{ body: string; id: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seenLiveHintIdsRef = useRef(new Set<string>());
  const headingId = `collaboration-thread-${threadKey.replace(/[^a-z0-9_-]/gi, "-")}`;

  const refresh = useCallback(async (quiet = false) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ projectSlug, threadKey });
      const response = await fetch(`/api/nest-chat?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as ThreadResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Session thread could not load.");
      if (!activeRef.current) return;
      // A poll started before a send must not discard its acknowledged message
      // or the older history the reader has already loaded.
      setMessages((current) => mergeMessages(current, payload.messages ?? []));
      if (!historyLoadedRef.current) setNextCursor(payload.nextCursor ?? null);
      setLoadError("");
    } catch (nextError) {
      if (activeRef.current) setLoadError(nextError instanceof Error ? nextError.message : "Conversation could not load.");
    } finally {
      refreshingRef.current = false;
      if (activeRef.current) setLoading(false);
    }
  }, [projectSlug, threadKey]);

  useEffect(() => {
    activeRef.current = true;
    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine) void refresh(true);
    };
    const interval = window.setInterval(refreshWhenVisible, 3_000);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      activeRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!liveHintThreadKey || liveHintThreadKey !== threadKey) return;
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
  }, [liveHintThreadKey, refresh, threadKey]);

  useEffect(() => {
    const thread = scrollRef.current;
    if (thread && previousScrollRef.current) {
      thread.scrollTop = previousScrollRef.current.top + thread.scrollHeight - previousScrollRef.current.height;
      previousScrollRef.current = null;
    } else if (thread && followLatestRef.current) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, [messages]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!canPost || !body || sendingRef.current) return;
    // Reuse the request identity when the server saved a message but its
    // response was lost. Polling cannot unlock this in-flight send.
    const pending = pendingSendRef.current?.body === body
      ? pendingSendRef.current : { body, id: crypto.randomUUID() };
    pendingSendRef.current = pending;
    sendingRef.current = true;
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/nest-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
      setDraft("");
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
      const params = new URLSearchParams({ projectSlug, threadKey, cursor: nextCursor });
      const response = await fetch(`/api/nest-chat?${params}`, { cache: "no-store" });
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

  return (
    <section className="flex min-h-[30rem] min-w-0 w-full flex-col overflow-hidden rounded-[1.75rem] border border-border bg-card text-card-foreground shadow-sm" aria-labelledby={headingId}>
      <header className="border-b border-border px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{scopeLabel}</p>
        <h2 id={headingId} className="mt-1 flex items-center gap-2 font-serif text-2xl font-black text-foreground"><MessageCircle size={20} aria-hidden="true" /> {heading}</h2>
        <p className="mt-2 text-xs font-semibold leading-5 text-muted-foreground">{scopeDescription || `Discuss ${collaborationTitle} and keep the conversation beside your work.`}</p>
      </header>
      <div ref={scrollRef} className="max-h-[32rem] min-h-0 flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-label={heading}
        onScroll={() => { const el = scrollRef.current; if (el) followLatestRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64; }}>
        {nextCursor ? <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="min-h-11 w-full rounded-xl border border-border px-3 text-sm">{loadingOlder ? "Loading…" : "Earlier messages"}</button> : null}
        {loading ? <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><LoaderCircle size={16} className="animate-spin" /> Loading conversation…</p> : null}
        {!loading && !loadError && messages.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Start the conversation when you're ready.</p> : null}
        {messages.map((message) => <article key={message.id} className="rounded-2xl border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-black text-foreground">{author(message)}</p><LocalDateTime value={message.createdAt} mode="time" className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground" /></div>
          {message.body ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{message.body}</p> : null}
          {message.gifUrl ? <img src={message.gifUrl} alt="Shared GIF" className="mt-3 max-h-48 w-full rounded-xl object-contain" /> : null}
        </article>)}
      </div>
      {loadError ? <div role="alert" className="px-4 py-2 text-sm text-destructive">{loadError} <button type="button" onClick={() => void refresh()} className="min-h-11 underline">Retry loading</button></div> : null}
      <form onSubmit={send} className="border-t border-border p-3">
        {error ? <p role="alert" className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{error} Your text is still here; try sending again.</p> : null}
        <div className="flex items-end gap-2">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Message" maxLength={4000} disabled={!canPost || status === "sending"} placeholder={canPost ? composerPlaceholder : viewOnlyPlaceholder} className="min-h-20 min-w-0 flex-1 resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/20 disabled:bg-muted" />
          <button type="submit" disabled={!canPost || !draft.trim() || status === "sending"} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 font-black text-primary-foreground disabled:opacity-45" aria-label="Send collaboration message">{status === "sending" ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}</button>
        </div>
        {!canPost ? <p className="mt-2 text-xs font-bold text-muted-foreground">You can read this recording thread, but editor access is required to post.</p> : null}
      </form>
    </section>
  );
}

export function SessionThread({
  projectSlug,
  roomId,
  sessionTitle,
  canPost = true,
  scopeLabel = "This meeting only",
  scopeDescription,
}: {
  projectSlug: string;
  roomId: string;
  sessionTitle: string;
  canPost?: boolean;
  scopeLabel?: string;
  scopeDescription?: string;
}) {
  return <CollaborationThread
    projectSlug={projectSlug}
    threadKey={`session:${roomId}`}
    liveHintThreadKey={`session:${roomId}`}
    collaborationTitle={sessionTitle}
    heading="Session thread"
    clientSurface="session-room-web"
    canPost={canPost}
    scopeLabel={scopeLabel}
    scopeDescription={scopeDescription || `Coordinate ${sessionTitle} before, during, and after the call. Your notes, tasks, and recording stay together in this Session.`}
    composerPlaceholder="Write to everyone in this Session…"
    viewOnlyPlaceholder="View-only Session thread"
  />;
}
