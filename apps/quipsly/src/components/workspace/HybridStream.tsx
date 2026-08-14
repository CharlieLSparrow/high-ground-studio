"use client";

import { useState, useTransition } from "react";
import { Send, Hash, CheckCircle2, Circle } from "lucide-react";
import { createWorkTask, updateWorkTaskStatus } from "@/app/(app)/work/actions";

type StreamEvent = {
  id: string;
  type: "chat" | "agent_action" | "task";
  content: string;
  timestamp: Date;
  actor: string;
  status?: "pending" | "done";
  taskId?: string; // Links to the real DB task
  updatedAt?: string; // Tracks the revision for concurrency control
};

type HybridStreamProps = {
  projectId: string;
  actorUserId: string;
};

export function HybridStream({ projectId, actorUserId }: HybridStreamProps) {
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [events, setEvents] = useState<StreamEvent[]>([
    {
      id: "1",
      type: "agent_action",
      content: "Quipsly verified 16 INSV files in this Nest.",
      timestamp: new Date(Date.now() - 3600000),
      actor: "Quipsly Agent",
    }
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isPending) return;

    const isTask = input.includes("#task");
    const content = input.replace("#task", "").trim();
    
    // Optimistic UI
    const tempId = Math.random().toString(36).slice(2);
    const newEvent: StreamEvent = {
      id: tempId,
      type: isTask ? "task" : "chat",
      content: content,
      timestamp: new Date(),
      actor: "You",
      ...(isTask ? { status: "pending" } : {})
    };

    setEvents((prev) => [...prev, newEvent]);
    setInput("");
    
    if (isTask) {
      startTransition(async () => {
        const result = await createWorkTask({
          title: content,
          projectId: projectId,
        });
        
        if (result.ok && result.taskId) {
           setEvents((prev) => prev.map(ev => 
             ev.id === tempId ? { ...ev, taskId: result.taskId, updatedAt: result.updatedAt } : ev
           ));
        }
      });
    }
  };

  const toggleTask = (id: string, taskId?: string) => {
    setEvents((prev) => prev.map(ev => {
      if (ev.id === id && ev.type === "task") {
        const newStatus = ev.status === "pending" ? "done" : "pending";
        if (taskId) {
           startTransition(async () => {
              const result = await updateWorkTaskStatus({
                 taskId,
                 nextStatus: newStatus === "done" ? "DONE" : "OPEN",
                 expectedUpdatedAt: ev.updatedAt || new Date().toISOString()
              });
              if (result.ok) {
                 setEvents((current) => current.map(e => e.id === id ? { ...e, updatedAt: result.updatedAt } : e));
              }
           });
        }
        return { ...ev, status: newStatus };
      }
      return ev;
    }));
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {events.map((event) => (
          <div key={event.id} className={`flex gap-3 text-sm ${event.type === 'agent_action' ? 'opacity-60' : ''}`}>
            <div className="flex-none pt-0.5">
              {event.type === "agent_action" ? (
                <Hash size={16} className="text-gray-400" />
              ) : event.type === "task" ? (
                <button onClick={() => toggleTask(event.id, event.taskId)} className="text-amber-600 hover:text-amber-700">
                  {event.status === "done" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                  {event.actor.charAt(0)}
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-gray-900">{event.actor}</span>
                <span className="text-[10px] text-gray-500">
                  {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className={`mt-0.5 ${event.type === 'task' && event.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                {event.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 p-3">
        <form onSubmit={handleSubmit} className="relative flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-3 py-1 shadow-sm focus-within:border-amber-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-100">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message or #task..."
            className="flex-1 bg-transparent py-2 px-1 text-sm outline-none placeholder:text-gray-400"
          />
          <button 
            type="submit" 
            disabled={!input.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 transition hover:bg-amber-200 disabled:opacity-50"
          >
            <Send size={14} />
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-gray-400">
          Tip: Include <strong className="font-medium">#task</strong> to instantly create an action item in this Nest.
        </p>
      </div>
    </div>
  );
}
