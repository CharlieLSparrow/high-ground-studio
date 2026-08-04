"use client";

import { LoaderCircle, MessageCircle, Send } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import LocalDateTime from "@/components/LocalDateTime";

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
};

function author(message: SessionMessage) {
  return message.authorName || message.authorEmail?.split("@")[0] || "Collaborator";
}

export function SessionThread({
  projectSlug,
  roomId,
  sessionTitle,
}: {
  projectSlug: string;
  roomId: string;
  sessionTitle: string;
}) {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "idle" | "sending" | "error">("loading");
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const threadKey = `session:${roomId}`;

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setStatus("loading");
    try {
      const params = new URLSearchParams({ projectSlug, threadKey });
      const response = await fetch(`/api/nest-chat?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as ThreadResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Session thread could not load.");
      setMessages(payload.messages ?? []);
      setError("");
      setStatus("idle");
    } catch (nextError) {
      if (!quiet) {
        setError(nextError instanceof Error ? nextError.message : "Session thread could not load.");
        setStatus("error");
      }
    }
  }, [projectSlug, threadKey]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(true), 3_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || status === "sending") return;
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
          clientMessageId: crypto.randomUUID(),
          clientSurface: "session-room-web",
        }),
      });
      const payload = await response.json().catch(() => ({})) as ThreadResponse;
      if (!response.ok || !payload.ok || !payload.message) throw new Error(payload.error || "Message could not send.");
      setMessages((current) => current.some((message) => message.id === payload.message?.id) ? current : [...current, payload.message as SessionMessage]);
      setDraft("");
      setStatus("idle");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Message could not send.");
      setStatus("error");
    }
  }

  return (
    <section className="flex min-h-[30rem] flex-col overflow-hidden rounded-[1.75rem] border border-[#d8c7a7] bg-[#fffdf8] shadow-sm" aria-labelledby={`session-thread-${roomId}`}>
      <header className="border-b border-[#e5d5b7] px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-800">This meeting only</p>
        <h2 id={`session-thread-${roomId}`} className="mt-1 flex items-center gap-2 font-serif text-2xl font-black text-[#3d3122]"><MessageCircle size={20} aria-hidden="true" /> Session thread</h2>
        <p className="mt-2 text-xs font-semibold leading-5 text-[#765f40]">Coordinate {sessionTitle} before, during, and after the call. Episode-wide production conversation stays in the Episode thread.</p>
      </header>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {status === "loading" ? <p className="flex items-center gap-2 text-sm font-semibold text-[#765f40]"><LoaderCircle size={16} className="animate-spin" /> Loading Session thread…</p> : null}
        {messages.map((message) => <article key={message.id} className="rounded-2xl border border-[#eadfc9] bg-white p-3">
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-black text-[#3d3122]">{author(message)}</p><LocalDateTime value={message.createdAt} mode="time" className="text-[10px] font-bold uppercase tracking-wide text-[#8a7354]" /></div>
          {message.body ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#5f4d37]">{message.body}</p> : null}
          {message.gifUrl ? <img src={message.gifUrl} alt="Shared GIF" className="mt-3 max-h-48 w-full rounded-xl object-contain" /> : null}
        </article>)}
      </div>
      <form onSubmit={send} className="border-t border-[#e5d5b7] p-3">
        {error ? <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{error}</p> : null}
        <div className="flex items-end gap-2">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write to everyone in this Session…" className="min-h-20 flex-1 resize-none rounded-2xl border border-[#d8c7a7] bg-white px-3 py-2 text-sm text-[#3d3122] outline-none placeholder:text-[#9a876c] focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
          <button type="submit" disabled={!draft.trim() || status === "sending"} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-violet-800 px-4 font-black text-white disabled:opacity-45" aria-label="Send Session message">{status === "sending" ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}</button>
        </div>
      </form>
    </section>
  );
}
