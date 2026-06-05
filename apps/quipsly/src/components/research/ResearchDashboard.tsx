"use client";

import React, { useState, useEffect } from "react";
import { QuoteVerificationTable } from "./QuoteVerificationTable";
import { Activity, ShieldCheck, Library, Layers, ArrowRight } from "lucide-react";

export function ResearchDashboard() {
  const [isLoading, setIsLoading] = useState(true);

  // Simulate network fetch for SaaS loading state demo
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col h-full space-y-8 pb-10">
      <header>
        <h1 className="text-4xl font-black tracking-tight text-zinc-100 mb-2">
          Morning, Research Team.
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl leading-relaxed">
          You have <strong className="text-amber-500 font-semibold">14 pending verifications</strong> blocking public QuipLore distribution. System health is nominal.
        </p>
      </header>

      {/* High level stats */}
      <section 
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        aria-label="Key Performance Indicators"
      >
        <StatCard 
          title="Total Quotes Verified" 
          value="45,231" 
          icon={<ShieldCheck />} 
          trend="+1,204 this week" 
          isLoading={isLoading} 
        />
        <StatCard 
          title="Manuscripts Indexed" 
          value="8,902" 
          icon={<Library />} 
          trend="+42 this week" 
          isLoading={isLoading} 
        />
        <StatCard 
          title="Lorelists Active" 
          value="1,405" 
          icon={<Layers />} 
          trend="+89 this week" 
          isLoading={isLoading} 
        />
        <StatCard 
          title="QuipStream Events (24h)" 
          value="1.2M" 
          icon={<Activity />} 
          trend="+12% traffic" 
          highlight 
          isLoading={isLoading} 
        />
      </section>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Verification Queue Preview */}
        <section 
          className="col-span-1 lg:col-span-2 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm"
          aria-label="Priority Verification Queue Preview"
        >
          <header className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80 backdrop-blur-sm z-10">
            <h3 className="font-bold text-lg text-zinc-100">Priority Verification Queue</h3>
            <button 
              className="text-sm text-amber-500 font-medium hover:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 rounded px-2 py-1 flex items-center gap-1 transition-colors"
              aria-label="View all items in priority verification queue"
            >
              View All <ArrowRight size={14} />
            </button>
          </header>
          <div className="p-4 flex-1 min-h-[500px]">
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-10 bg-zinc-800/50 rounded animate-pulse" />
                <div className="h-20 bg-zinc-800/30 rounded animate-pulse" />
                <div className="h-20 bg-zinc-800/30 rounded animate-pulse" />
                <div className="h-20 bg-zinc-800/30 rounded animate-pulse" />
              </div>
            ) : (
              <QuoteVerificationTable />
            )}
          </div>
        </section>

        {/* Action Center */}
        <aside className="col-span-1 flex flex-col space-y-6" aria-label="Required Actions and Impact">
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-lg mb-4 text-zinc-100">Required Actions</h3>
            {isLoading ? (
              <div className="space-y-3">
                <div className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />
                <div className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />
                <div className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />
              </div>
            ) : (
              <div className="space-y-3">
                <ActionItem title="Resolve Dispute: Marcus Aurelius" desc="Community reported incorrect translation on quote #8493." time="2h ago" type="urgent" />
                <ActionItem title="Review Merch Safety" desc="3 new quotes flag potential trademark collisions." time="4h ago" type="warning" />
                <ActionItem title="Source Sync" desc="Project Gutenberg sync complete. 120 new texts ready." time="5h ago" type="info" />
              </div>
            )}
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex-1 min-h-[250px] relative overflow-hidden group shadow-sm flex flex-col justify-end">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1200&auto=format&fit=crop')] bg-cover bg-center opacity-20 group-hover:opacity-30 transition-opacity duration-700 mix-blend-luminosity"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-900/80 to-transparent"></div>
            <div className="relative z-10 flex flex-col">
              <h3 className="font-bold text-xl mb-2 text-white drop-shadow-md">QuipLore Impact</h3>
              <p className="text-sm text-zinc-300 mb-6 leading-relaxed">
                Research verified today directly impacted <strong className="text-white">45,000</strong> public users via QuipStream.
              </p>
              <button className="w-full py-2.5 bg-white text-zinc-950 rounded-lg font-bold hover:bg-zinc-200 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-zinc-900 shadow-lg">
                View Audience Report
              </button>
            </div>
          </section>
        </aside>

      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend, highlight = false, isLoading = false }: any) {
  if (isLoading) {
    return (
      <div className={`p-6 rounded-xl border ${highlight ? 'bg-amber-500/5 border-amber-500/20' : 'bg-zinc-900 border-zinc-800'} animate-pulse`}>
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-32 bg-zinc-800 rounded"></div>
          <div className="h-6 w-6 bg-zinc-800 rounded-md"></div>
        </div>
        <div className="h-8 w-24 bg-zinc-800 rounded mb-2"></div>
        <div className="h-3 w-20 bg-zinc-800 rounded"></div>
      </div>
    );
  }

  return (
    <div className={`p-6 rounded-xl border transition-all hover:shadow-md ${highlight ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
      <div className="flex items-center justify-between mb-4">
        <span className={`font-medium text-sm ${highlight ? 'text-amber-500' : 'text-zinc-400'}`}>{title}</span>
        <div className={highlight ? 'text-amber-500' : 'text-zinc-500'} aria-hidden="true">{icon}</div>
      </div>
      <div className="text-3xl font-black text-white mb-2 tracking-tight">{value}</div>
      <div className={`text-xs font-medium ${highlight ? 'text-amber-500/80' : 'text-zinc-500'}`}>{trend}</div>
    </div>
  );
}

function ActionItem({ title, desc, time, type }: any) {
  const colors = {
    urgent: "bg-red-500/10 text-red-400 border-red-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  
  return (
    <button 
      className="w-full text-left flex gap-4 p-3 rounded-lg border border-zinc-800/50 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-700 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 group"
      aria-label={`${title}. ${desc}`}
    >
      <div className={`w-1.5 shrink-0 h-auto rounded-full ${colors[type as keyof typeof colors].split(" ")[0]}`} aria-hidden="true"></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1 gap-2">
          <h4 className="font-semibold text-sm text-zinc-200 group-hover:text-amber-400 transition-colors truncate">{title}</h4>
          <span className="text-xs text-zinc-500 shrink-0 tabular-nums">{time}</span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{desc}</p>
      </div>
    </button>
  );
}
