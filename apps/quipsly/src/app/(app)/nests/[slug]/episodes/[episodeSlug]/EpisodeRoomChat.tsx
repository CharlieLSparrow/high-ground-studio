"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";

import LocalDateTime from "@/components/LocalDateTime";

type Message = {
  id: string;
  authorName: string | null;
  authorEmail: string | null;
  body: string;
  gifUrl: string | null;
  createdAt: string;
};

type ChatResponse = {
  ok: boolean;
  error?: string;
  messages?: Message[];
  message?: Message;
};

function author(message: Message) {
  return message.authorName || message.authorEmail?.split("@")[0] || "Collaborator";
}

export default function EpisodeRoomChat({
  projectSlug,
  episodeSlug,
  canEdit,
}: {
  projectSlug: string;
  episodeSlug: string;
  canEdit: boolean;
}) {
  const threadKey = `episode:${episodeSlug}`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "idle" | "sending" | "error">("loading");
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setStatus("loading");
    try {
      const params = new URLSearchParams({ projectSlug, threadKey });
      const response = await fetch(`/api/nest-chat?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as ChatResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Episode chat could not load.");
      setMessages(payload.messages ?? []);
      setError("");
      setStatus("idle");
    } catch (nextError) {
      if (!quiet) {
        setError(nextError instanceof Error ? nextError.message : "Episode chat could not load.");
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
    if (!body || status === "sending" || !canEdit) return;
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/nest-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug, threadKey, body }),
      });
      const payload = await response.json().catch(() => ({})) as ChatResponse;
      if (!response.ok || !payload.ok || !payload.message) {
        throw new Error(payload.error || "Message could not send.");
      }
      setMessages((current) => current.some((message) => message.id === payload.message?.id)
        ? current
        : [...current, payload.message as Message]);
      setDraft("");
      setStatus("idle");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Message could not send.");
      setStatus("error");
    }
  }

  return (
    <section aria-labelledby="episode-chat-heading" className="flex min-h-[34rem] flex-col overflow-hidden rounded-[1.75rem] border border-[#30483d] bg-[#101b16]">
      <header className="border-b border-[#30483d] px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d8ad56]">Episode thread</p>
        <h2 id="episode-chat-heading" className="mt-1 flex items-center gap-2 font-serif text-2xl font-black text-[#f4eedf]">
          <MessageCircle size={20} aria-hidden="true" /> Collaborate
        </h2>
        <p className="mt-2 text-xs font-semibold leading-5 text-[#aab9af]">Writing, recording, editing, and publishing stay in one conversation.</p>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {status === "loading" ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-[#aab9af]">
            <Loader2 size={16} className="animate-spin" /> Loading episode chat…
          </p>
        ) : null}
        {messages.map((message) => (
          <article key={message.id} className="rounded-2xl border border-[#30483d] bg-[#17251e] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-[#f4eedf]">{author(message)}</p>
              <LocalDateTime
                value={message.createdAt}
                mode="time"
                className="text-[10px] font-bold uppercase tracking-wide text-[#82958a]"
              />
            </div>
            {message.body ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#d8e1da]">{message.body}</p> : null}
            {message.gifUrl ? <img src={message.gifUrl} alt="Shared GIF" className="mt-3 max-h-48 w-full rounded-xl object-contain" /> : null}
          </article>
        ))}
      </div>

      <form onSubmit={send} className="border-t border-[#30483d] p-3">
        {error ? <p className="mb-2 rounded-xl bg-rose-950/50 px-3 py-2 text-xs font-semibold text-rose-200">{error}</p> : null}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!canEdit}
            placeholder={canEdit ? "Write to the episode thread…" : "View-only access"}
            className="min-h-20 flex-1 resize-none rounded-2xl border border-[#40584c] bg-[#07110d] px-3 py-2 text-sm text-[#f4eedf] outline-none placeholder:text-[#72847a] focus:border-[#d8ad56] focus:ring-4 focus:ring-[#d8ad56]/10 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!canEdit || !draft.trim() || status === "sending"}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#d8ad56] px-4 font-black text-[#172018] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Send episode message"
          >
            {status === "sending" ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
          </button>
        </div>
      </form>
    </section>
  );
}
