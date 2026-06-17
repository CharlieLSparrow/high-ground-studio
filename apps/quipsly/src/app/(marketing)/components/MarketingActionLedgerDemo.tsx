"use client";

import React, { useState, useEffect } from "react";
import { Cpu, ShieldCheck, Search, Sparkles, CheckCircle2, Feather } from "lucide-react";

type ActionLog = {
  id: string;
  title: string;
  type: "research" | "cleanup" | "generation";
  status: "pending" | "approved" | "rejected";
  time: string;
};

const INITIAL_LOGS: ActionLog[] = [
  { id: "1", title: "Extracted 12 quotes from 'Dune' PDF", type: "research", status: "approved", time: "10:02 AM" },
  { id: "2", title: "Formatted citations to Chicago Style", type: "cleanup", status: "approved", time: "10:05 AM" },
];

const NEW_LOGS: ActionLog[] = [
  { id: "3", title: "Drafted outline for 'Desert Ecology' scene", type: "generation", status: "pending", time: "Just now" },
];

export function MarketingActionLedgerDemo() {
  const [logs, setLogs] = useState<ActionLog[]>(INITIAL_LOGS);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const timer1 = setTimeout(() => setShowNew(true), 2000);
    const timer2 = setTimeout(() => {
      setLogs((prev) => [...NEW_LOGS, ...prev]);
      setShowNew(false);
    }, 4000);
    
    // Auto approve the pending draft after 7s
    const timer3 = setTimeout(() => {
      setLogs((prev) => prev.map(log => 
        log.id === "3" ? { ...log, status: "approved" } : log
      ));
    }, 7000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  return (
    <div className="w-full max-w-md mx-auto rounded-[2rem] border border-[#e8d0b5] bg-[#fffaf1] shadow-xl overflow-hidden font-sans my-16 flex flex-col h-[400px]">
      <div className="bg-white border-b border-[#e8d0b5] p-5 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[#3d2618] flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#617c4d]" />
            Action Ledger
          </h3>
          <p className="text-xs text-[#8c552e] mt-1">Total transparency. You hold the pen.</p>
        </div>
        <div className="px-3 py-1 bg-[#fdf5eb] border border-[#e8d0b5] text-[#617c4d] rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
          <ShieldCheck size={12} /> Safely Gated
        </div>
      </div>
      
      <div className="flex-1 p-6 relative overflow-hidden bg-[#fdfaf6]">
        <div className="absolute left-9 top-6 bottom-0 w-px bg-[#e8d0b5]" />
        
        <ul className="space-y-6 relative z-10">
          {showNew && (
            <li className="flex gap-4 animate-in fade-in slide-in-from-top-4">
              <div className="w-6 h-6 rounded-full bg-[#fdf5eb] border-2 border-[#a96735] flex items-center justify-center flex-shrink-0 z-10 animate-pulse">
                <div className="w-2 h-2 bg-[#a96735] rounded-full" />
              </div>
              <div className="flex-1 text-sm font-bold text-[#8c552e] italic">
                Quipsly is working...
              </div>
            </li>
          )}

          {logs.map((log) => (
            <li key={log.id} className="flex gap-4 animate-in fade-in slide-in-from-top-2">
              <div className="w-6 h-6 rounded-full bg-white border border-[#e8d0b5] flex items-center justify-center flex-shrink-0 z-10 shadow-sm mt-1">
                {log.type === "research" ? <Search size={12} className="text-[#3b82f6]" /> :
                 log.type === "cleanup" ? <Feather size={12} className="text-[#a96735]" /> :
                 <Sparkles size={12} className="text-[#dc982f]" />}
              </div>
              <div className="flex-1 bg-white border border-[#e8d0b5] rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-sm text-[#3d2618] leading-tight">{log.title}</span>
                  <span className="text-[10px] font-bold text-[#8c552e]">{log.time}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    log.status === "approved" ? "bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]" :
                    "bg-[#fffbeb] text-[#b45309] border-[#fde68a] animate-pulse"
                  }`}>
                    {log.status}
                  </span>
                  {log.status === "pending" && (
                    <button className="text-xs bg-[#a96735] text-white px-2 py-1 rounded shadow-sm hover:bg-[#8c552e] transition-colors flex items-center gap-1">
                      <CheckCircle2 size={12} /> Approve
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
