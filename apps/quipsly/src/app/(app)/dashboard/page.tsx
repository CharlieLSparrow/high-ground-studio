"use client";

import React, { useState } from "react";
import ManuscriptInsightEngine from "@/components/ManuscriptInsightEngine";
import { StudioHealthWidget } from "@/components/dashboard/StudioHealthWidget";
import { ContentCalendarWidget } from "@/components/dashboard/ContentCalendarWidget";
import { AudienceAnalyticsWidget } from "@/components/dashboard/AudienceAnalyticsWidget";
import { PublishingPipelineWidget } from "@/components/dashboard/PublishingPipelineWidget";
import { Blocks, Rocket, ShieldCheck, Sparkles, Wand2 } from "lucide-react";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'insights' | 'operations' | 'audience' | 'health'>('insights');

  const tabs = [
    { id: 'insights', label: 'Manuscript Insights', icon: Wand2 },
    { id: 'operations', label: 'Pipeline & Content', icon: Rocket },
    { id: 'audience', label: 'Audience Growth', icon: UsersIcon },
    { id: 'health', label: 'Studio Telemetry', icon: ActivityIcon }
  ] as const;

  return (
    <main className="w-full h-full flex flex-col bg-[#fdfaf6] overflow-y-auto custom-scrollbar">
      {/* Dynamic Header */}
      <header className="px-8 pt-8 pb-6 border-b border-[#e8dcc4] bg-white sticky top-0 z-50 shadow-sm">
        <div className="flex justify-between items-end mb-6">
          <div>
            <p className="text-xs font-bold text-[#8c6b4a] uppercase tracking-widest mb-1 flex items-center gap-2">
              <Blocks size={14} aria-hidden="true" /> High Ground Studio OS
            </p>
            <h1 className="text-4xl font-black text-[#3d3122] tracking-tight">Command Center</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-xs font-bold bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-full border border-emerald-200">
              <ShieldCheck size={14} aria-hidden="true" /> System Secure
            </span>
            <button className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-[#3d3122] font-black text-sm rounded-xl transition-colors shadow-md flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
              <Sparkles size={16} aria-hidden="true" /> Run Diagnostics
            </button>
          </div>
        </div>

        {/* Accessible Tab Navigation */}
        <nav aria-label="Dashboard views">
          <ul role="tablist" className="flex gap-2">
            {tabs.map(tab => (
              <li key={tab.id} role="presentation">
                <button 
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  id={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-5 py-2.5 rounded-t-xl text-sm font-bold flex items-center gap-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                    activeTab === tab.id 
                      ? 'bg-[#fdfaf6] text-amber-800 border-t border-x border-[#e8dcc4] translate-y-[1px]' 
                      : 'bg-white text-[#8c6b4a] hover:bg-[#f8f3e6] border-t border-x border-transparent hover:text-[#5e4b33]'
                  }`}
                >
                  <tab.icon size={16} aria-hidden="true" /> {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* Main Content Area */}
      <div className="p-8 flex flex-col gap-8">
        
        <div 
          role="tabpanel" 
          id="panel-insights" 
          aria-labelledby="tab-insights"
          hidden={activeTab !== 'insights'}
        >
          {activeTab === 'insights' && (
            <div className="animate-in fade-in duration-500">
              <ManuscriptInsightEngine />
            </div>
          )}
        </div>

        <div 
          role="tabpanel" 
          id="panel-operations" 
          aria-labelledby="tab-operations"
          hidden={activeTab !== 'operations'}
        >
          {activeTab === 'operations' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto w-full">
              <div className="xl:col-span-8 h-[700px]">
                <PublishingPipelineWidget />
              </div>
              <div className="xl:col-span-4 h-[700px]">
                <ContentCalendarWidget />
              </div>
            </div>
          )}
        </div>

        <div 
          role="tabpanel" 
          id="panel-audience" 
          aria-labelledby="tab-audience"
          hidden={activeTab !== 'audience'}
        >
          {activeTab === 'audience' && (
            <div className="animate-in fade-in duration-500 max-w-[1600px] mx-auto w-full">
              <AudienceAnalyticsWidget />
            </div>
          )}
        </div>

        <div 
          role="tabpanel" 
          id="panel-health" 
          aria-labelledby="tab-health"
          hidden={activeTab !== 'health'}
        >
          {activeTab === 'health' && (
            <div className="animate-in fade-in duration-500 max-w-[1600px] mx-auto w-full">
              <StudioHealthWidget />
            </div>
          )}
        </div>

      </div>
    </main>
  );
}

// Helper Icons
function UsersIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  );
}

function ActivityIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  );
}
