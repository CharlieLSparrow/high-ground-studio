"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Hash, CheckCircle2, Circle, Loader2, ListFilter, CheckSquare, BrainCircuit, Lightbulb } from "lucide-react";
import { createWorkTask, updateWorkTaskStatus } from "@/app/(app)/work/actions";
import { cn } from "@/app/(app)/studio-ui";

type StreamEvent = {
  id: string;
  body: string;
  gifUrl: string | null;
  authorName: string | null;
  authorEmail: string | null;
  createdAt: string;
  linkedGoalId: string | null;
};

type HybridStreamProps = {
  projectId: string;
  actorUserId: string;
};

type NestChatResponse = {
  ok: boolean;
  messages: StreamEvent[];
  hasMore: boolean;
  nextCursor: string | null;
  error?: string;
};

const FILTERS = [
  { id: "all", label: "All", icon: ListFilter, color: "text-gray-500" },
  { id: "tasks", label: "Tasks Only", icon: CheckSquare, color: "text-emerald-600" },
  { id: "decisions", label: "Decisions", icon: BrainCircuit, color: "text-purple-600" },
  { id: "idea", label: "Ideas", icon: Lightbulb, color: "text-amber-500" },
] as const;

export function HybridStream({ projectId, actorUserId }: HybridStreamProps) {
  const queryClient = useQueryClient();
  const [filterMode, setFilterMode] = useState<typeof FILTERS[number]["id"]>("all");
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const queryKey = ["hybrid-stream", projectId, filterMode];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = "" }) => {
      const url = new URL("/api/nest-chat", window.location.origin);
      url.searchParams.set("projectSlug", projectId);
      url.searchParams.set("filterMode", filterMode);
      if (pageParam) url.searchParams.set("cursor", pageParam);
      
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load stream");
      return json as NestChatResponse;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    initialPageParam: "",
  });

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scrollContainerRef.current, threshold: 1.0 }
    );

    if (bottomRef.current) {
      observer.observe(bottomRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const messages = data?.pages.flatMap((page) => page.messages) || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;
    
    setIsSending(true);
    const text = input;
    setInput("");

    try {
      const url = new URL("/api/nest-chat", window.location.origin);
      url.searchParams.set("projectSlug", projectId);
      
      await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      
      await refetch();
      
      // Auto-scroll to top after sending
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setIsSending(false);
    }
  };

  const toggleTask = async (id: string, goalId: string) => {
    // Optimistically could update cache, but for safety we'll just let the board handle deep state
    // If it's a chat message linked to a goal, we don't have direct access to the goal status here
    // unless we enrich the API response. For now, it's just visual.
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Sticky Filter Bar */}
      <div className="sticky top-0 z-10 flex gap-2 border-b border-gray-100 bg-white/90 p-3 backdrop-blur-md">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const isActive = filterMode === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilterMode(f.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all",
                isActive 
                  ? "bg-gray-900 text-white shadow-sm" 
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              <Icon size={14} className={isActive ? "text-white" : f.color} />
              {f.label}
            </button>
          );
        })}
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col-reverse">
        {/* We use flex-col-reverse so new messages are at the bottom naturally without complex JS scrolling */}
        {status === "pending" && (
          <div className="flex justify-center p-4">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}
        
        {messages.map((message) => {
          const isAgent = message.authorName === "Quipsly Agent";
          const isTask = !!message.linkedGoalId;

          return (
            <div key={message.id} className={cn("flex gap-3 text-sm", isAgent && "opacity-60")}>
              <div className="flex-none pt-0.5">
                {isAgent ? (
                  <Hash size={16} className="text-gray-400" />
                ) : isTask ? (
                  <button onClick={() => message.linkedGoalId && toggleTask(message.id, message.linkedGoalId)} className="text-emerald-600 hover:text-emerald-700">
                    <CheckCircle2 size={18} />
                  </button>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800 uppercase">
                    {(message.authorName || message.authorEmail || "U")[0]}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-gray-900">{message.authorName || (message.authorEmail?.split("@")[0]) || "User"}</span>
                  <span className="text-[10px] text-gray-500">
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className={cn("mt-0.5 whitespace-pre-wrap text-gray-800")}>
                  {message.body}
                </p>
                {message.gifUrl && (
                  <img src={message.gifUrl} alt="GIF" className="mt-2 max-h-48 rounded-xl object-contain border border-gray-200" />
                )}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} className="h-1" />
        
        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-3 bg-white">
        <form onSubmit={handleSubmit} className="relative flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-3 py-1 shadow-sm focus-within:border-amber-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-100">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Type a message, or #task, #decision...`}
            className="flex-1 bg-transparent py-2 px-1 text-sm outline-none placeholder:text-gray-400"
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isSending}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 transition hover:bg-amber-200 disabled:opacity-50"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </form>
      </div>
    </div>
  );
}
