"use client";

import React, { useState, useEffect } from "react";
import { Activity, AlertCircle, CheckCircle, ChevronRight, Database, Radio, RefreshCw, Server } from "lucide-react";
import { WidgetCard } from "./WidgetCard";

type ServiceStatus = "operational" | "degraded" | "outage";
type Metric = { label: string; value: string; unit: string; trend: number };

const SERVICES = [
  { id: 'srv1', name: 'Primary Database (PostgreSQL)', status: 'operational' as ServiceStatus, latency: 12, uptime: 99.99 },
  { id: 'srv2', name: 'Quipsly AI Engine', status: 'operational' as ServiceStatus, latency: 45, uptime: 99.95 },
  { id: 'srv3', name: 'Asset Storage (S3)', status: 'operational' as ServiceStatus, latency: 8, uptime: 99.99 },
  { id: 'srv4', name: 'Real-time Collaboration', status: 'degraded' as ServiceStatus, latency: 250, uptime: 98.40 },
  { id: 'srv5', name: 'Publishing Pipeline', status: 'operational' as ServiceStatus, latency: 15, uptime: 99.90 }
];

const METRICS: Metric[] = [
  { label: 'CPU Usage', value: '24', unit: '%', trend: -2.5 },
  { label: 'Memory', value: '4.2', unit: 'GB', trend: +0.4 },
  { label: 'Active Conns', value: '1,432', unit: '', trend: +125 },
  { label: 'Disk IOPS', value: '840', unit: '/s', trend: -12 }
];

export const StudioHealthWidget = React.memo(() => {
  const [data, setData] = useState(() => Array.from({ length: 50 }, () => Math.random() * 100));
  
  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => [...prev.slice(1), Math.random() * 100]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <WidgetCard variant="dark">
      <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none" aria-hidden="true">
        <Server size={150} />
      </div>

      <div className="relative z-10 flex justify-between items-start mb-8">
        <div>
          <h3 className="text-2xl font-black text-white flex items-center gap-3">
            <Activity className="text-emerald-400" size={28} aria-hidden="true" />
            System Telemetry
          </h3>
          <p className="text-slate-400 font-medium mt-1">Live infrastructure monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full border border-emerald-400/20" role="status">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true"></span>
            All Systems Nominal
          </span>
          <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" aria-label="Refresh telemetry">
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 relative z-10">
        {METRICS.map(m => (
          <div key={m.label} className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-2xl flex flex-col gap-1 backdrop-blur-sm" role="group" aria-label={`Metric: ${m.label}`}>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{m.label}</span>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-black text-white">{m.value}</span>
              <span className="text-sm font-medium text-slate-400 mb-1">{m.unit}</span>
            </div>
            <span className={`text-[10px] font-bold ${m.trend > 0 ? 'text-emerald-400' : 'text-emerald-400'}`}>
              <span className="sr-only">Trend:</span>
              {m.trend > 0 ? '+' : ''}{m.trend}{m.unit} past hour
            </span>
          </div>
        ))}
      </div>

      <div className="flex-1 bg-slate-950 rounded-2xl border border-slate-800 p-6 relative overflow-hidden mb-8 z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        
        <div className="flex justify-between items-center mb-4 relative z-10">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Radio size={14} aria-hidden="true" /> Network Traffic
          </span>
          <span className="text-xs font-mono text-emerald-400">1.2 Gbps</span>
        </div>

        <div className="h-32 w-full relative z-10" role="img" aria-label="Real-time network traffic bandwidth graph">
          <svg viewBox="0 0 1000 100" className="w-full h-full overflow-visible preserve-3d" aria-hidden="true">
            <defs>
              <linearGradient id="trafficGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d={`M 0,100 ${data.map((d, i) => {
                const x = (i / (data.length - 1)) * 1000;
                const y = 100 - d;
                return `L ${x},${y}`;
              }).join(' ')} L 1000,100 Z`}
              fill="url(#trafficGradient)"
              className="transition-all duration-1000"
            />
            <path
              d={data.map((d, i) => {
                const x = (i / (data.length - 1)) * 1000;
                const y = 100 - d;
                return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
              }).join(' ')}
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              className="drop-shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-1000"
            />
          </svg>
        </div>
      </div>

      <div className="relative z-10">
        <h4 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
          <Database size={16} className="text-slate-500" aria-hidden="true" /> Services Status
        </h4>
        <ul className="flex flex-col gap-3">
          {SERVICES.map(srv => (
            <li key={srv.id} className="flex items-center justify-between p-3 bg-slate-800/30 hover:bg-slate-800/80 rounded-xl transition-colors border border-transparent hover:border-slate-700">
              <div className="flex items-center gap-3">
                {srv.status === 'operational' ? (
                  <CheckCircle size={18} className="text-emerald-400" aria-label="Operational" />
                ) : srv.status === 'degraded' ? (
                  <AlertCircle size={18} className="text-amber-400" aria-label="Degraded" />
                ) : (
                  <AlertCircle size={18} className="text-red-400" aria-label="Outage" />
                )}
                <span className="text-sm font-bold text-slate-200">{srv.name}</span>
              </div>
              <div className="flex items-center gap-6">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs text-slate-400 font-mono">{srv.latency}ms</span>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Latency</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-slate-200 font-mono">{srv.uptime}%</span>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Uptime</span>
                </div>
                <ChevronRight size={16} className="text-slate-600" aria-hidden="true" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </WidgetCard>
  );
});
