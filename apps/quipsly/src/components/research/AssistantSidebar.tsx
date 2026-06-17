"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { ManuscriptResearchPacket, RetrievalResult } from "@high-ground/quipsly-domain/retrieval";
import { saveQuoteToLore } from "../../app/actions/lore-actions";

interface AssistantSidebarProps {
  projectId: string;
  documentId?: string;
  cursorNodeId?: string;
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  packets?: ManuscriptResearchPacket[];
};

function makeMessage(role: ChatMessage["role"], content: string, packets?: ManuscriptResearchPacket[]): ChatMessage {
  return {
    id: `${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    packets,
  };
}

function CitationCard({ result, projectId }: { result: RetrievalResult, projectId: string }) {
  const prov = result.provenance;
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  let originLabel = "Source";
  let originIcon = "📄";
  let metaText = "";

  if (prov.origin === "studio-span") {
    originLabel = "Active Document";
    originIcon = "📝";
    metaText = `Block: ${prov.blockStableId}`;
  } else if (prov.origin === "studio-knowledge") {
    originLabel = "Knowledge Node";
    originIcon = "🧠";
    metaText = `Type: ${prov.nodeType}`;
  } else if (prov.origin === "quipsly-lore") {
    originLabel = "Lore Graph";
    originIcon = "🕸️";
    metaText = `Slug: ${prov.nodeSlug}`;
  } else if (prov.origin === "source-aware") {
    originLabel = "Immutable Source";
    originIcon = "🏛️";
    metaText = `Selector: ${prov.selector.kind}`;
  } else if (prov.origin === "semantic-lore") {
    originLabel = "Semantic Lore";
    originIcon = "📖";
    metaText = `Quote: ${prov.quoteId}`;
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-black/40 p-3 text-left transition-colors hover:bg-black/60">
      <div className="flex items-center justify-between gap-2">
        <h4 className="line-clamp-1 text-xs font-semibold text-white/90">{result.title}</h4>
        <span className="flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/60">
          <span>{originIcon}</span> {originLabel}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-white/70 line-clamp-3">{result.content}</p>
      {result.citation && (
        <div className="mt-1 flex items-start gap-1.5 text-[10px] text-purple-300/80">
          <span className="mt-0.5">↳</span>
          <p className="line-clamp-2 italic">{result.citation}</p>
        </div>
      )}
      <div className="text-[9px] text-white/40">{metaText}</div>
      {prov.origin !== "semantic-lore" && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={async () => {
              if (isSaving || isSaved) return;
              setIsSaving(true);
              try {
                await saveQuoteToLore(projectId, result.content, result.citation || undefined, result.title);
                setIsSaved(true);
              } catch (e) {
                console.error(e);
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving || isSaved}
            className="flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[10px] font-medium text-white hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            {isSaved ? "Saved to Lore ✓" : isSaving ? "Saving..." : "Save to Lore"}
          </button>
        </div>
      )}
    </div>
  );
}

function PacketViewer({ packet, projectId }: { packet: ManuscriptResearchPacket, projectId: string }) {
  if (!packet.results.length) return null;
  return (
    <div className="mt-3 flex w-full flex-col gap-2">
      <div className="flex items-center justify-between border-b border-white/10 pb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">{packet.intent}</h3>
        <span className="text-[10px] text-white/40">{packet.results.length} result(s)</span>
      </div>
      <div className="flex flex-col gap-1">
        {packet.results.slice(0, 4).map((result) => (
          <CitationCard key={result.resultId} result={result} projectId={projectId} />
        ))}
      </div>
    </div>
  );
}

export function AssistantSidebar({ projectId, documentId, cursorNodeId }: AssistantSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    const userMessage = makeMessage("user", prompt);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          documentId,
          cursorNodeId,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `Assistant request failed (${response.status})`);
      }

      setMessages((current) => [
        ...current, 
        makeMessage("assistant", data.message || "I did not find anything useful yet.", data.packets)
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        makeMessage(
          "assistant",
          error instanceof Error
            ? `I could not complete that research pass: ${error.message}`
            : "I could not complete that research pass.",
        ),
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-white/10 bg-black/60 shadow-2xl backdrop-blur-xl lg:w-96">
      <div className="flex items-center gap-3 border-b border-white/10 p-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
          <span className="text-sm font-bold text-white">Q</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold leading-tight text-white/90">Quipsly</h2>
          <p className="text-[10px] uppercase tracking-widest text-white/50">Research Assistant</p>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-4 text-center opacity-50">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20">
              <span className="text-xl">📚</span>
            </div>
            <p className="max-w-[220px] text-sm text-white/80">
              Ask me to find examples, quotes, or lore from your manuscript. I gather receipts; you stay the author.
            </p>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start w-full"}`}>
            <div
              className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                message.role === "user"
                  ? "max-w-[85%] rounded-br-none bg-blue-600 text-white"
                  : "w-full rounded-bl-none border border-white/5 bg-white/10 text-white/90"
              }`}
            >
              {message.content}
              {message.packets && message.packets.map((packet, idx) => (
                <PacketViewer key={`${packet.intent}-${idx}`} packet={packet} projectId={projectId} />
              ))}
            </div>
          </div>
        ))}

        {isLoading ? (
          <div className="flex items-start">
            <div className="rounded-2xl rounded-bl-none border border-white/5 bg-white/10 px-4 py-3 text-white/90">
              <div className="flex space-x-1">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40" style={{ animationDelay: "0ms" }} />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40" style={{ animationDelay: "150ms" }} />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-white/10 bg-black/40 p-4">
        <form onSubmit={handleSubmit} className="relative">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask Quipsly..."
            className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-4 pr-12 text-sm text-white shadow-inner placeholder-white/30 transition-all focus:border-purple-500/50 focus:bg-white/10 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white disabled:opacity-50"
          >
            ↑
          </button>
        </form>
        <div className="mt-2 text-center">
          <span className="text-[9px] text-white/30">Quipsly helps collect and compare. Verify citations before using them.</span>
        </div>
      </div>
    </div>
  );
}
