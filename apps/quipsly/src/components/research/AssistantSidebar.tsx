"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

interface AssistantSidebarProps {
  projectId: string;
}

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function makeMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

export function AssistantSidebar({ projectId }: AssistantSidebarProps) {
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
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `Assistant request failed (${response.status})`);
      }

      setMessages((current) => [...current, makeMessage("assistant", text || "I did not find anything useful yet.")]);
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
          <div key={message.id} className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                message.role === "user"
                  ? "rounded-br-none bg-blue-600 text-white"
                  : "rounded-bl-none border border-white/5 bg-white/10 text-white/90"
              }`}
            >
              {message.content}
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
