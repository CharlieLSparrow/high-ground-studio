"use client";

import React from "react";
import { Cpu, ShieldCheck, Search, Feather, Sparkles, History } from "lucide-react";
import { WidgetCard, classNames } from "./WidgetCard";

export type AssistantActionLog = { id: string; action: string; type: 'research' | 'cleanup' | 'generation'; status: 'approved' | 'rejected' | 'pending'; time: string };

export const AssistantEngagementWidget = React.memo(({ logs }: { logs: AssistantActionLog[] }) => {
  return (
    <WidgetCard variant="glass">
      <div className="relative z-10 flex justify-between items-start mb-6">
        <div>
          <h3 className="text-2xl font-black text-[#3d3122] flex items-center gap-3">
            <Cpu className="text-emerald-600" size={28} aria-hidden="true" />
            Quipsly Ledger
          </h3>
          <p className="text-[#8c6b4a] font-medium mt-1">Recent AI actions and human approvals</p>
        </div>
        <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-xs font-bold flex items-center gap-2 shadow-sm">
          <ShieldCheck size={14} aria-hidden="true" /> Safely Gated
        </div>
      </div>

      <div className="flex-1 relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[#e8dcc4] z-0" aria-hidden="true"></div>
        <ul className="flex flex-col gap-5 relative z-10 pt-2" aria-label="Activity ledger">
          {logs.map((log) => (
            <li key={log.id} className="flex gap-4 group">
              <div 
                className="w-8 h-8 rounded-full bg-white border-2 border-[#e8dcc4] flex items-center justify-center flex-shrink-0 z-10 transition-colors shadow-sm group-hover:border-emerald-500" 
                aria-hidden="true"
              >
                {log.type === 'research' ? <Search size={14} className="text-blue-600" /> : 
                 log.type === 'cleanup' ? <Feather size={14} className="text-indigo-600" /> : 
                 <Sparkles size={14} className="text-amber-600" />}
              </div>
              <div 
                className="flex-1 bg-white border border-[#e8dcc4] rounded-xl p-4 shadow-sm transition-all hover:shadow-md focus-within:ring-2 focus-within:ring-emerald-500"
                tabIndex={0}
                role="article"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-sm text-[#3d3122]">{log.action}</span>
                  <time dateTime={log.time} className="text-[10px] font-bold text-[#8c6b4a] sr-only md:not-sr-only">
                    {log.time}
                  </time>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={classNames(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                    log.status === 'approved' ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                    log.status === 'rejected' ? "bg-rose-50 text-rose-800 border-rose-200" :
                    "bg-amber-50 text-amber-800 border-amber-200"
                  )}>
                    {log.status}
                  </span>
                  <span className="text-xs text-[#8c6b4a] capitalize">
                    {log.type} Action
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      
      <button className="mt-6 w-full py-3 bg-[#fdfaf6] border border-[#e8dcc4] hover:bg-white hover:border-emerald-400 text-[#3d3122] font-bold text-sm rounded-xl transition-all flex justify-center items-center gap-2 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
        <History size={16} aria-hidden="true" /> View Full Ledger
      </button>
    </WidgetCard>
  );
});
