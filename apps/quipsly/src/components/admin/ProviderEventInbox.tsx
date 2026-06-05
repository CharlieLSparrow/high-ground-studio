"use client";

import { WorldHubProviderEvent } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";
import { Server, AlertCircle, CheckCircle, Clock } from "lucide-react";

export function ProviderEventInbox({ events }: { events: WorldHubProviderEvent[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Server className="h-4 w-4 text-slate-500" />
          Provider Event Inbox
        </h3>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Raw Webhooks</span>
      </div>
      
      <div className="divide-y divide-slate-100">
        {events.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No events in the inbox.</div>
        ) : events.map((event) => (
          <div key={event.id} className="p-4 hover:bg-slate-50 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  {event.connectionId} / {event.eventType}
                </span>
                <span className="text-xs text-slate-400">
                  {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                </span>
              </div>
              <StatusBadge status={event.processingStatus} />
            </div>
            <div className="mt-2 text-xs font-mono text-slate-500 truncate max-w-full">
              ID: {event.idempotencyKey}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PROCESSED") {
    return <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100"><CheckCircle className="h-3 w-3" /> Processed</span>;
  }
  if (status === "FAILED") {
    return <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100"><AlertCircle className="h-3 w-3" /> Failed</span>;
  }
  return <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100"><Clock className="h-3 w-3" /> Unprocessed</span>;
}
