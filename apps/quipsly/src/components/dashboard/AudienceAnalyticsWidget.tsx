"use client";

import React from "react";
import { Users, ArrowUpRight, TrendingUp, Globe, Mail, Award, Zap, BarChart3 } from "lucide-react";
import { WidgetCard, classNames } from "./WidgetCard";

export const AudienceAnalyticsWidget = React.memo(() => {
  const STATS = [
    { label: 'Total Subscribers', value: '124,592', change: '+2.4%', up: true, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Patreon ARR', value: '$84,200', change: '+12.1%', up: true, icon: Award, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Newsletter Open Rate', value: '42.8%', change: '-1.2%', up: false, icon: Mail, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Web Traffic', value: '89.2K', change: '+5.4%', up: true, icon: Globe, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <WidgetCard>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className="text-2xl font-black text-[#3d3122] flex items-center gap-3">
            <BarChart3 className="text-[#8c6b4a]" size={28} aria-hidden="true" />
            Audience Growth
          </h3>
          <p className="text-[#8c6b4a] font-medium mt-1">Cross-platform audience insights</p>
        </div>
        <button className="px-4 py-2 bg-[#fdfaf6] border border-[#e8dcc4] text-[#3d3122] font-bold text-sm rounded-xl hover:bg-white hover:shadow-sm transition-all flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
          View Detailed Report <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>

      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8" aria-label="Key audience metrics">
        {STATS.map(stat => (
          <li key={stat.label} className="bg-white border border-[#e8dcc4] rounded-2xl p-5 hover:shadow-md transition-shadow group focus-within:ring-2 focus-within:ring-amber-500" tabIndex={0}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${stat.bg} ${stat.color} group-hover:scale-110 group-focus:scale-110 transition-transform`} aria-hidden="true">
              <stat.icon size={20} />
            </div>
            <p className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider mb-1">{stat.label}</p>
            <div className="flex items-end gap-3">
              <span className="text-2xl font-black text-[#3d3122]">{stat.value}</span>
              <span 
                className={classNames(
                  "flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full mb-1",
                  stat.up ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                )}
                aria-label={stat.up ? "Increased by" : "Decreased by"}
              >
                {stat.change} <span aria-hidden="true">{stat.up ? '↑' : '↓'}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex-1 bg-[#fdfaf6] rounded-2xl border border-[#e8dcc4] p-6 flex flex-col justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-50 to-transparent opacity-50" aria-hidden="true" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 border-4 border-amber-100" aria-hidden="true">
            <TrendingUp size={28} className="text-amber-500" />
          </div>
          <h4 className="text-xl font-black text-[#3d3122] mb-2">Growth Trajectory is Strong</h4>
          <p className="text-[#8c6b4a] max-w-md mx-auto mb-6">
            Your recent focus on "Character Deep Dives" has driven a 15% increase in Patreon conversions compared to last month.
          </p>
          <button className="px-6 py-3 bg-amber-500 text-[#3d3122] font-black rounded-xl hover:bg-amber-400 transition-colors shadow-md flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
            <Zap size={18} fill="currentColor" aria-hidden="true" /> Generate Strategy Plan
          </button>
        </div>
      </div>
    </WidgetCard>
  );
});
