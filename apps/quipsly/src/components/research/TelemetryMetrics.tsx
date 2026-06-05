"use client";

import React from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area
} from "recharts";
import { Activity, Users, Save, Share2, MousePointerClick, LineChart as LineChartIcon } from "lucide-react";

const engagementData = [
  { name: 'Mon', streams: 4000, saves: 2400, shares: 240 },
  { name: 'Tue', streams: 3000, saves: 1398, shares: 2210 },
  { name: 'Wed', streams: 2000, saves: 9800, shares: 2290 },
  { name: 'Thu', streams: 2780, saves: 3908, shares: 2000 },
  { name: 'Fri', streams: 1890, saves: 4800, shares: 2181 },
  { name: 'Sat', streams: 2390, saves: 3800, shares: 2500 },
  { name: 'Sun', streams: 3490, saves: 4300, shares: 2100 },
];

const topicData = [
  { topic: 'Philosophy', count: 120 },
  { topic: 'Stoicism', count: 98 },
  { topic: 'Science', count: 86 },
  { topic: 'Technology', count: 70 },
  { topic: 'Art', count: 65 },
  { topic: 'Politics', count: 54 },
];

export function TelemetryMetrics() {
  return (
    <div className="flex flex-col h-full space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-zinc-100 tracking-tight">QuipLore Telemetry</h2>
        <p className="text-zinc-400 mt-1">Real-time engagement signals driving research prioritization.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard title="Active Streams" value="124.5K" change="+12.5%" icon={<Activity />} color="text-blue-500" />
        <KpiCard title="Nest Saves" value="32.1K" change="+18.2%" icon={<Save />} color="text-emerald-500" />
        <KpiCard title="External Shares" value="8.4K" change="+5.4%" icon={<Share2 />} color="text-amber-500" />
        <KpiCard title="Click Throughs" value="45.2K" change="-2.1%" icon={<MousePointerClick />} color="text-purple-500" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-6 flex-1 min-h-[400px]">
        
        {/* Main Engagement Chart */}
        <div className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col">
          <h3 className="text-lg font-bold text-zinc-200 mb-6 flex items-center gap-2">
            <LineChartIcon  className="text-amber-500" />
            7-Day Funnel Engagement
          </h3>
          <div className="flex-1 w-full h-full min-h-[300px]">
            {/* Recharts wrapper needs fixed height in flex containers sometimes, but ResponsiveContainer handles it */}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={engagementData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorStreams" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSaves" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#52525b" tick={{fill: '#a1a1aa', fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" tick={{fill: '#a1a1aa', fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#f4f4f5' }}
                  itemStyle={{ color: '#e4e4e7' }}
                />
                <Area type="monotone" dataKey="streams" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorStreams)" />
                <Area type="monotone" dataKey="saves" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorSaves)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hot Topics Bar Chart */}
        <div className="col-span-1 bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col">
          <h3 className="text-lg font-bold text-zinc-200 mb-6 flex items-center gap-2">
            <Users  className="text-emerald-500" />
            Trending Research Demands
          </h3>
          <div className="flex-1 w-full h-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topicData} layout="vertical" margin={{ top: 0, right: 0, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="topic" type="category" axisLine={false} tickLine={false} tick={{fill: '#a1a1aa', fontSize: 12}} width={80} />
                <Tooltip 
                  cursor={{fill: '#27272a'}}
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                />
                <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}

function KpiCard({ title, value, change, icon, color }: { title: string; value: string; change: string; icon: React.ReactNode; color: string }) {
  const isPositive = change.startsWith("+");
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-400 font-medium text-sm">{title}</span>
        <div className={`p-2 rounded-lg bg-zinc-800/50 ${color}`}>
          {React.cloneElement(icon as React.ReactElement<any>, { size: 18 } as any)}
        </div>
      </div>
      <div>
        <div className="text-3xl font-black text-white tracking-tight">{value}</div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className={`font-semibold px-2 py-0.5 rounded ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            {change}
          </span>
          <span className="text-zinc-500">vs last week</span>
        </div>
      </div>
    </div>
  );
}
