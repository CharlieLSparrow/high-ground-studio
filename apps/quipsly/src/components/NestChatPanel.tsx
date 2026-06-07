"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, Copy, ImagePlus, Loader2, MessageCircle, Send, X } from "lucide-react";

import { cn } from "@/app/(app)/studio-ui";

type NestChatMessage = {
  id: string;
  authorEmail: string | null;
  authorName: string | null;
  body: string;
  gifUrl: string | null;
  createdAt: string;
};

type NestChatResponse = {
  ok: boolean;
  error?: string;
  project?: {
    slug: string;
    name: string;
  };
  thread?: {
    title: string;
  };
  actor?: {
    name: string;
    role: string | null;
  };
  messages?: NestChatMessage[];
  message?: NestChatMessage;
};

const GIF_URL_PATTERN = /https?:\/\/[^\s<>()"']+(?:\.gif|giphy\.com\/gifs\/[^\s<>()"']+|tenor\.com\/view\/[^\s<>()"']+)/i;
const CHAT_ROUTE_PREFIXES = ["/create", "/editor", "/recorder", "/call", "/nests"] as const;
const PROJECT_QUERY_KEYS = ["project", "projectSlug", "nest", "projectId"] as const;

function normalizeProjectSlug(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function routeCanUseNestChat(pathname: string) {
  return CHAT_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function projectSlugFromSearchParams(searchParams: { get: (key: string) => string | null }) {
  for (const key of PROJECT_QUERY_KEYS) {
    const slug = normalizeProjectSlug(searchParams.get(key));
    if (slug) return slug;
  }

  return "";
}

function projectSlugFromPath(pathname: string) {
  const nestMatch = pathname.match(/^\/nests\/([^/?#]+)/);
  if (nestMatch?.[1]) return normalizeProjectSlug(nestMatch[1]);
  return "";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function displayAuthor(message: NestChatMessage) {
  if (message.authorName) return message.authorName;
  if (message.authorEmail) return message.authorEmail.split("@")[0];
  return "Quipsly friend";
}

function messageCopyText(message: NestChatMessage) {
  return [message.body, message.gifUrl].filter(Boolean).join("\n");
}

export function NestChatPanel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<NestChatMessage[]>([]);
  const [projectName, setProjectName] = useState("");
  const [threadTitle, setThreadTitle] = useState("Nest Chat");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sending" | "error">("idle");
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const routeSupportsChat = useMemo(() => routeCanUseNestChat(pathname), [pathname]);
  const projectSlug = useMemo(() => {
    if (!routeSupportsChat) return "";
    return projectSlugFromSearchParams(searchParams) || projectSlugFromPath(pathname);
  }, [pathname, routeSupportsChat, searchParams]);

  const detectedGifUrl = useMemo(() => {
    return draft.match(GIF_URL_PATTERN)?.[0] ?? "";
  }, [draft]);

  useEffect(() => {
    if (!projectSlug) {
      setMessages([]);
      setProjectName("");
      setThreadTitle("Nest Chat");
      setCopiedId(null);
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    setError("");
    setCopiedId(null);

    fetch(`/api/nest-chat?projectSlug=${encodeURIComponent(projectSlug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as NestChatResponse;
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Nest chat could not load.");
        setMessages(payload.messages ?? []);
        setProjectName(payload.project?.name ?? projectSlug);
        setThreadTitle(payload.thread?.title ?? "Nest Chat");
        setStatus("idle");
      })
      .catch((nextError: Error) => {
        if (controller.signal.aborted) return;
        setMessages([]);
        setError(nextError.message || "Nest chat could not load.");
        setStatus("error");
      });

    return () => controller.abort();
  }, [projectSlug]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function sendMessage() {
    const body = draft.trim();
    if (!projectSlug || (!body && !detectedGifUrl) || status === "sending") return;

    setStatus("sending");
    setError("");

    try {
      const response = await fetch("/api/nest-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug,
          body,
          gifUrl: detectedGifUrl || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as NestChatResponse;
      if (!response.ok || !payload.ok || !payload.message) throw new Error(payload.error || "Message could not send.");
      setMessages((current) => [...current, payload.message as NestChatMessage]);
      setDraft("");
      setStatus("idle");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Message could not send.");
      setStatus("error");
    }
  }

  async function copyText(id: string, text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 1800);
    } catch {
      setCopiedId(null);
    }
  }

  if (!projectSlug) return null;

  return (
    <div className="fixed bottom-20 right-4 z-[70] md:bottom-6 md:right-6">
      {open ? (
        <section className="flex h-[min(620px,calc(100vh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-[#e8dcc4] bg-[#fffaf0] shadow-2xl shadow-[#3d3122]/20">
          <header className="flex items-start justify-between gap-3 border-b border-[#eadbc5] bg-gradient-to-r from-[#3d3122] to-[#8c6b4a] p-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/80">One thread per Nest</p>
              <h2 className="mt-1 text-xl font-black leading-tight">{projectName || projectSlug}</h2>
              <p className="mt-1 text-xs text-amber-50/85">
                {threadTitle} · {projectSlug}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
              aria-label="Close Nest chat"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#fdf6ea] p-4">
            {status === "loading" ? (
              <div className="flex h-full items-center justify-center text-sm font-semibold text-[#8c6b4a]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading the Nest thread...
              </div>
            ) : null}

            {status !== "loading" && messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#d8c4a4] bg-white/80 p-4 text-sm leading-6 text-[#6f5737]">
                <p className="font-black text-[#3d3122]">Start the Nest thread with something easy.</p>
                <p className="mt-2">
                  Paste a Giphy link, drop a note, or begin with the sacred work chant:
                  <strong> Believe</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => setDraft("Believe. https://media.giphy.com/media/DEZA7FlHbMesUF1jm9/giphy.gif")}
                  className="mt-3 rounded-full border border-[#eadfca] bg-[#fffaf3] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a] transition hover:border-[#c28a37]"
                >
                  Use Believe starter
                </button>
              </div>
            ) : null}

            {messages.map((message) => (
              <article key={message.id} className="rounded-2xl border border-[#eadbc5] bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black text-[#3d3122]">{displayAuthor(message)}</p>
                  <div className="flex items-center gap-2">
                    <time className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9f835a]">
                      {formatTime(message.createdAt)}
                    </time>
                    <button
                      type="button"
                      onClick={() => void copyText(`message-${message.id}`, messageCopyText(message))}
                      className="inline-flex items-center gap-1 rounded-full border border-[#eadfca] bg-[#fffaf3] px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#8c6b4a] transition hover:border-[#c28a37]"
                      aria-label="Copy message"
                    >
                      {copiedId === `message-${message.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span className="hidden sm:inline">{copiedId === `message-${message.id}` ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>
                {message.body ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#4d3b27]">{message.body}</p>
                ) : null}
                {message.gifUrl ? (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-[#e8dcc4] bg-[#f7eddc]">
                    <img src={message.gifUrl} alt="Shared GIF" className="max-h-72 w-full object-contain" loading="lazy" />
                    <div className="flex items-center justify-between gap-2 border-t border-[#eadbc5] bg-[#fffaf0] px-3 py-2">
                      <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[#9f835a]">GIF attached</span>
                      <button
                        type="button"
                        onClick={() => void copyText(`gif-${message.id}`, message.gifUrl || "")}
                        className="inline-flex items-center gap-1 rounded-full border border-[#eadfca] bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#8c6b4a] transition hover:border-[#c28a37]"
                        aria-label="Copy GIF link"
                      >
                        {copiedId === `gif-${message.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedId === `gif-${message.id}` ? "Copied GIF" : "Copy GIF"}</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <footer className="border-t border-[#eadbc5] bg-[#fffaf0] p-3">
            {error ? (
              <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>
            ) : null}
            {detectedGifUrl ? (
              <div className="mb-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
                <div className="flex items-center gap-2">
                  <ImagePlus className="h-4 w-4" />
                  <span>GIF preview ready. This is what will post with your message.</span>
                </div>
                <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-200 bg-white">
                  <img src={detectedGifUrl} alt="GIF preview before send" className="max-h-44 w-full object-contain" />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="max-w-[260px] truncate text-[10px] font-black uppercase tracking-[0.12em] text-emerald-900">
                    {detectedGifUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyText("draft-gif", detectedGifUrl)}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-900"
                  >
                    {copiedId === "draft-gif" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedId === "draft-gif" ? "Copied GIF" : "Copy GIF"}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void sendMessage();
                }}
                placeholder="Write a note or paste a GIF URL..."
                className="min-h-20 flex-1 resize-none rounded-2xl border border-[#d9c4a6] bg-white px-3 py-2 text-sm text-[#3d3122] outline-none transition placeholder:text-[#9f835a] focus:border-[#8c6b4a] focus:ring-4 focus:ring-amber-500/10"
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={status === "sending" || (!draft.trim() && !detectedGifUrl)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm transition",
                  status === "sending" || (!draft.trim() && !detectedGifUrl)
                    ? "cursor-not-allowed bg-[#cbb99e]"
                    : "bg-[#3d3122] hover:bg-[#5a442b]",
                )}
              >
                {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="hidden md:inline">{status === "sending" ? "Sending" : "Send"}</span>
              </button>
            </div>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9f835a]">
              Tip: paste a Giphy or direct GIF link. Cmd+Enter sends.
            </p>
          </footer>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="ml-auto flex items-center gap-2 rounded-full border border-[#e8dcc4] bg-[#3d3122] px-4 py-3 text-sm font-black text-white shadow-xl shadow-[#3d3122]/20 transition hover:-translate-y-0.5 hover:bg-[#5a442b]"
        aria-label="Open Nest chat"
      >
        <MessageCircle className="h-5 w-5 text-amber-200" />
        Nest Chat
      </button>
    </div>
  );
}
