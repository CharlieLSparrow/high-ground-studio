"use client";

import React, { Suspense, useState, useEffect } from "react";
import { Calendar, Lightbulb, Sparkles, Target } from "lucide-react";

// Lazy load widgets for simulated fetching / code splitting
import { ProgressGraphWidget, DailyMetric } from "./dashboard/ProgressGraphWidget";
import { TagDistributionWidget, TagData } from "./dashboard/TagDistributionWidget";
import { StructuralHotspotsWidget, Hotspot } from "./dashboard/StructuralHotspotsWidget";
import { ResearchActivityWidget } from "./dashboard/ResearchActivityWidget";
import { AssistantEngagementWidget, AssistantActionLog } from "./dashboard/AssistantEngagementWidget";
import { WidgetCard } from "./dashboard/WidgetCard";

// Mock Data
const MOCK_DAILY_METRICS: DailyMetric[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    words: Math.floor(Math.random() * 2500) + 500,
    focusScore: Math.floor(Math.random() * 40) + 60,
    aiInteractions: Math.floor(Math.random() * 15) + 2
  };
});

const MOCK_TAGS: TagData[] = [
  { name: 'Character Dev', count: 142, color: 'bg-rose-600', trend: 'up' },
  { name: 'Plot Hole', count: 28, color: 'bg-amber-600', trend: 'down' },
  { name: 'Worldbuilding', count: 315, color: 'bg-emerald-600', trend: 'up' },
  { name: 'Pacing Issue', count: 45, color: 'bg-indigo-600', trend: 'flat' },
  { name: 'Dialogue', count: 210, color: 'bg-sky-600', trend: 'up' },
  { name: 'Foreshadowing', count: 89, color: 'bg-purple-600', trend: 'flat' }
];

const MOCK_HOTSPOTS: Hotspot[] = [
  { id: 'hs1', location: 'Chapter 4: The Awakening', issue: 'Missing structural heading tags', severity: 'high', recommendation: 'Apply Chapter/Episode tags to normalize structure.' },
  { id: 'hs2', location: 'Chapter 7: Betrayal', issue: 'Dense dialogue without action tags', severity: 'medium', recommendation: 'Review for pacing; suggest injecting action beats.' },
  { id: 'hs3', location: 'Epilogue', issue: 'Untagged loose ends', severity: 'low', recommendation: 'Cross-reference with Foreshadowing tags to ensure resolution.' }
];

const MOCK_LOGS: AssistantActionLog[] = [
  { id: 'log1', action: 'Suggested outline cleanup for Chapter 3', type: 'cleanup', status: 'approved', time: '10 mins ago' },
  { id: 'log2', action: 'Researched "Medieval Siege Tactics"', type: 'research', status: 'approved', time: '2 hours ago' },
  { id: 'log3', action: 'Proposed dialogue rewrite', type: 'generation', status: 'rejected', time: 'Yesterday' },
  { id: 'log4', action: 'Generated character summary packet', type: 'research', status: 'pending', time: 'Yesterday' },
  { id: 'log5', action: 'Identified ambiguous timeline tags', type: 'cleanup', status: 'approved', time: '2 days ago' }
];

const SkeletonWidget = () => (
  <WidgetCard className="min-h-[300px] flex flex-col justify-center gap-4">
    <div className="h-8 w-1/3 bg-[#e8dcc4]/40 animate-pulse rounded-lg" />
    <div className="h-4 w-1/2 bg-[#e8dcc4]/30 animate-pulse rounded-lg" />
    <div className="flex-1 mt-4 bg-[#f8f3e6]/50 animate-pulse rounded-xl" />
  </WidgetCard>
);

export default function ManuscriptInsightEngine() {
  const [dataLoaded, setDataLoaded] = useState(false);

  // Artificial delay to demonstrate Suspense/Skeleton patterns typical of server components or real fetching
  useEffect(() => {
    const timer = setTimeout(() => setDataLoaded(true), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-8 pb-20">
      
      {/* Top Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-white/40 backdrop-blur-md p-6 rounded-3xl border border-white/50 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="text-amber-500" size={20} aria-hidden="true" />
            <h2 className="text-sm font-bold text-amber-700 uppercase tracking-widest">Studio Intelligence</h2>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-[#3d3122] tracking-tight">Manuscript Insights</h1>
          <p className="text-lg text-[#8c6b4a] mt-2 max-w-2xl">
            Real-time analytics and structural intelligence powered by your Quipsly assistant.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-5 py-2.5 bg-white border border-[#e8dcc4] text-[#3d3122] font-bold rounded-xl hover:bg-[#f8f3e6] transition-colors shadow-sm flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-amber-500">
            <Calendar size={18} aria-hidden="true" /> Last 30 Days
          </button>
          <button className="px-5 py-2.5 bg-[#3d3122] text-white font-bold rounded-xl hover:bg-[#2a2218] transition-colors shadow-md flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-[#3d3122] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fdfaf6]">
            <Target size={18} aria-hidden="true" /> Set Goals
          </button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          {dataLoaded ? <ProgressGraphWidget data={MOCK_DAILY_METRICS} /> : <SkeletonWidget />}
          {dataLoaded ? <TagDistributionWidget tags={MOCK_TAGS} /> : <SkeletonWidget />}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          <div className="h-[400px]">
            {dataLoaded ? <ResearchActivityWidget /> : <SkeletonWidget />}
          </div>
          <div className="flex-1">
            {dataLoaded ? <StructuralHotspotsWidget hotspots={MOCK_HOTSPOTS} /> : <SkeletonWidget />}
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div>
          {dataLoaded ? <AssistantEngagementWidget logs={MOCK_LOGS} /> : <SkeletonWidget />}
        </div>
        
        <WidgetCard variant="glass" className="flex flex-col items-center justify-center text-center min-h-[400px] border-dashed border-2">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 border border-[#e8dcc4]" aria-hidden="true">
            <Lightbulb size={32} className="text-amber-500" />
          </div>
          <h3 className="text-2xl font-black text-[#3d3122] mb-2">Character Dynamics</h3>
          <p className="text-[#8c6b4a] max-w-sm mb-6">
            Quipsly is analyzing your manuscript to map relationship arcs. This module will unlock soon.
          </p>
          <button className="px-6 py-3 bg-white border border-[#e8dcc4] text-[#3d3122] font-bold rounded-xl hover:bg-[#fdfaf6] transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-amber-500">
            Prioritize Feature
          </button>
        </WidgetCard>
      </div>

    </div>
  );
}
