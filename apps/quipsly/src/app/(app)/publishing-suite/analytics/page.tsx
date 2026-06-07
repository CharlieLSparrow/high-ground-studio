"use client";

import { useState, useEffect } from "react";
import { TrendingUp, DollarSign, Eye, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { mockPrinciples, getMockMetrics, mockPublishedEvents, mockPackages } from "../mockData";
import { DashboardSkeleton } from "../components/LoadingSkeleton";
import { getDestinationLabel } from "@/lib/publishing/statusModel";

/**
 * Bespoke SVG Sparkline Component
 * SAAS UPGRADE: Replaces heavy chart libraries with clean, zero-dependency inline SVGs
 */
function Sparkline({ data, color }: { data: number[], color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((val - min) / (range || 1)) * 100;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 100" className="w-16 h-8 overflow-visible" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AnalyticsNexusPage() {
  const [selectedPrinciple, setSelectedPrinciple] = useState(mockPrinciples[0].id);
  const [expandedPackage, setExpandedPackage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate network latency for SaaS feel
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) return <DashboardSkeleton />;

  const totalViews = mockPublishedEvents
    .filter(e => e.externalRefId)
    .reduce((acc, evt) => acc + getMockMetrics(evt.externalRefId!).views, 0);

  const totalRevenue = mockPublishedEvents
    .filter(e => e.externalRefId)
    .reduce((acc, evt) => acc + (getMockMetrics(evt.externalRefId!).revenueCents || 0), 0);

  return (
    <div className="p-8 max-w-6xl mx-auto h-full flex flex-col">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-[#3d3122] tracking-tight" tabIndex={0}>Analytics Nexus</h1>
        <p className="text-[#8c6b4a] font-medium mt-1">Closing the feedback loop: How published packages perform in the wild.</p>
      </header>

      {/* Top Level KPIs - SAAS UPGRADE: Actionable hierarchy & Sparklines */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-[#e8dcc4] shadow-sm flex flex-col focus-within:ring-2 focus-within:ring-amber-500 transition-all hover:shadow-md">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider" id="kpi-views">Audience Reach</h3>
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
              <Eye className="w-4 h-4 text-blue-600" aria-hidden="true" />
            </div>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-3xl font-black text-[#3d3122]" aria-labelledby="kpi-views">{totalViews.toLocaleString()}</p>
              <p className="text-xs text-green-600 font-bold mt-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +14% 30d</p>
            </div>
            <Sparkline data={[10, 15, 12, 25, 22, 40, 57]} color="#2563eb" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#e8dcc4] shadow-sm flex flex-col focus-within:ring-2 focus-within:ring-amber-500 transition-all hover:shadow-md">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider" id="kpi-revenue">Generated Revenue</h3>
            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-green-600" aria-hidden="true" />
            </div>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-3xl font-black text-[#3d3122]" aria-labelledby="kpi-revenue">${(totalRevenue / 100).toFixed(2)}</p>
              <p className="text-xs text-green-600 font-bold mt-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> AdSense</p>
            </div>
            <Sparkline data={[5, 12, 10, 30, 20, 25, 125]} color="#16a34a" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#e8dcc4] shadow-sm flex flex-col col-span-2">
           <div className="flex justify-between items-start mb-4">
             <h3 className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider">Actionable Insight</h3>
             <Lightbulb className="w-5 h-5 text-amber-500" />
           </div>
           <p className="text-lg font-bold text-[#3d3122] mb-1">YouTube Shorts are driving 80% of new reach.</p>
           <p className="text-sm text-[#8c6b4a]">Consider converting the top 3 podcast episodes into Short-form clips this week to capitalize on algorithmic momentum.</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8 flex-1 min-h-0">

        {/* Published Packages Performance List - SAAS UPGRADE: Progressive Disclosure */}
        <div className="col-span-7 flex flex-col bg-white rounded-2xl border border-[#e8dcc4] shadow-sm overflow-hidden">
          <div className="p-5 border-b border-[#e8dcc4] bg-[#f8f3e6] flex justify-between items-center">
            <h2 className="font-bold text-[#3d3122]">Recent Package Performance</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {mockPublishedEvents.filter(e => e.status === "published").map(evt => {
              const pkg = mockPackages.find(p => p.id === evt.packageId);
              const metrics = getMockMetrics(evt.externalRefId!);
              const isExpanded = expandedPackage === evt.id;

              return (
                <div key={evt.id} className="border-b border-[#e8dcc4] last:border-0 hover:bg-[#fdfaf6] transition-colors">
                  <button
                    className="w-full p-5 flex justify-between items-center text-left focus:outline-none focus:bg-[#fdfaf6] focus:ring-inset focus:ring-2 focus:ring-amber-500"
                    onClick={() => setExpandedPackage(isExpanded ? null : evt.id)}
                    aria-expanded={isExpanded}
                    aria-label={`View details for ${pkg?.title}`}
                  >
                    <div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 mr-2">
                        {getDestinationLabel(evt.destination)}
                      </span>
                      <h3 className="font-bold text-[#3d3122] inline-block">{pkg?.title}</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-[#3d3122]">{metrics.views.toLocaleString()} views</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-[#8c6b4a]" /> : <ChevronDown className="w-4 h-4 text-[#8c6b4a]" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 border-t border-dashed border-[#e8dcc4] bg-[#fdfaf6]">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white rounded-lg p-3 border border-[#e8dcc4]">
                          <p className="text-[10px] uppercase font-bold text-[#8c6b4a] mb-1">Engagement</p>
                          <p className="text-lg font-bold text-[#3d3122]">{metrics.engagement.toLocaleString()}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-[#e8dcc4]">
                          <p className="text-[10px] uppercase font-bold text-[#8c6b4a] mb-1">Retention Score</p>
                          <p className="text-lg font-bold text-[#3d3122]">{metrics.retentionScore}%</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-[#e8dcc4]">
                          <p className="text-[10px] uppercase font-bold text-[#8c6b4a] mb-1">Revenue</p>
                          <p className="text-lg font-bold text-green-700">${(metrics.revenueCents! / 100).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button className="px-3 py-1.5 bg-white border border-[#e8dcc4] text-[#5e4b33] text-xs font-bold rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-amber-500">View Source Material</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Principle Feedback Loop - SAAS UPGRADE: Next Action Engine */}
        <div className="col-span-5 flex flex-col bg-white rounded-2xl border border-[#e8dcc4] shadow-sm overflow-hidden">
          <div className="p-5 border-b border-[#e8dcc4] bg-[#f8f3e6]">
            <h2 className="font-bold text-[#3d3122]">Source Principle Feedback</h2>
            <p className="text-xs text-[#8c6b4a] mt-1">Which core ideas resonate with your audience?</p>
          </div>

          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            {mockPrinciples.map(prin => {
              const isSelected = selectedPrinciple === prin.id;
              const correlatedViews = prin.id === "prin-sys-1" ? 57500 : prin.id === "prin-persp-2" ? 12500 : 0;
              const hasData = correlatedViews > 0;

              return (
                <button
                  key={prin.id}
                  onClick={() => setSelectedPrinciple(prin.id)}
                  aria-pressed={isSelected}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 ${isSelected ? "border-amber-600 bg-amber-50 shadow-sm" : "border-[#e8dcc4] hover:bg-[#f8f3e6]"}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">{prin.category}</span>
                    {hasData && <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded">High Performer</span>}
                  </div>
                  <h3 className="font-bold text-[#3d3122] mb-3">{prin.title}</h3>

                  {hasData ? (
                    <div className="text-sm pt-3 border-t border-amber-200/50">
                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex flex-col">
                          <span className="text-xs text-[#8c6b4a]">Correlated Views</span>
                          <span className="font-bold text-[#3d3122]">{correlatedViews.toLocaleString()}</span>
                        </div>
                      </div>
                      {/* SAAS UPGRADE: Recommendation Engine */}
                      {isSelected && prin.id === "prin-sys-1" && (
                         <div className="bg-white p-3 rounded border border-amber-200 text-xs mt-2">
                            <p className="font-bold text-amber-800 mb-1">Next Action Recommended</p>
                            <p className="text-amber-700">This principle has exceptional retention. Draft a dedicated deep-dive article for Patreon.</p>
                         </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[#8c6b4a] italic pt-3 border-t border-[#e8dcc4]">Not enough publishing data yet.</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
