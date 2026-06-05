"use client";

import React, { useMemo } from "react";
import { TrendingUp, Zap } from "lucide-react";
import { WidgetCard } from "./WidgetCard";

export type DailyMetric = { date: string; words: number; focusScore: number; aiInteractions: number };

export const ProgressGraphWidget = React.memo(({ data }: { data: DailyMetric[] }) => {
  const maxWords = useMemo(() => Math.max(...data.map((d) => d.words)), [data]);
  const minWords = 0;
  const paddingY = 20;
  const chartHeight = 250;
  const chartWidth = 1000;
  const usableHeight = chartHeight - paddingY;

  // Memoize SVG path calculation
  const { linePath, areaPath } = useMemo(() => {
    if (data.length === 0) return { linePath: "", areaPath: "" };

    const getX = (i: number) => (i / (data.length - 1)) * chartWidth;
    const getY = (words: number) => chartHeight - ((words - minWords) / (maxWords - minWords)) * usableHeight;

    const pathPoints = data.map((d, i) => `${getX(i)},${getY(d.words)}`);
    
    const lineStr = pathPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p}`).join(" ");
    const areaStr = `M 0,${chartHeight} L ${pathPoints.join(" L ")} L ${chartWidth},${chartHeight} Z`;

    return { linePath: lineStr, areaPath: areaStr };
  }, [data, maxWords, minWords, chartHeight, chartWidth, usableHeight]);

  const totalWords = useMemo(() => data.reduce((acc, curr) => acc + curr.words, 0), [data]);
  const avgWords = useMemo(() => Math.round(totalWords / (data.length || 1)), [data, totalWords]);

  return (
    <WidgetCard variant="glass" className="group">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent opacity-50 z-0 pointer-events-none" aria-hidden="true" />
      
      <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-start mb-8 gap-4">
        <div>
          <h3 className="text-2xl font-black text-[#3d3122] flex items-center gap-3">
            <TrendingUp className="text-amber-500" size={28} aria-hidden="true" />
            Manuscript Velocity
          </h3>
          <p className="text-[#8c6b4a] font-medium mt-1">Words written over the last 30 days</p>
        </div>
        
        {/* Accessible Segmented Control */}
        <div role="radiogroup" aria-label="Timeframe" className="flex gap-2">
          <button 
            role="radio" 
            aria-checked="true" 
            tabIndex={0}
            className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold uppercase tracking-widest border border-amber-200 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            30 Days
          </button>
          <button 
            role="radio" 
            aria-checked="false"
            tabIndex={-1} 
            className="px-3 py-1 bg-white text-[#8c6b4a] rounded-full text-xs font-bold uppercase tracking-widest border border-[#e8dcc4] hover:bg-[#f8f3e6] transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            All Time
          </button>
        </div>
      </div>

      <div className="relative h-64 w-full z-10" role="img" aria-label="Line chart showing daily word count over 30 days">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="50%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          
          {/* Background Grid */}
          {[0, 1, 2, 3, 4].map(i => (
            <line 
              key={`grid-${i}`} 
              x1="0" 
              y1={i * (chartHeight / 4)} 
              x2={chartWidth} 
              y2={i * (chartHeight / 4)} 
              stroke="#e8dcc4" 
              strokeWidth="1" 
              strokeDasharray="4 4" 
              opacity="0.5"
            />
          ))}

          {/* Animated Area */}
          <path
            d={areaPath}
            fill="url(#areaGradient)"
            className="transition-all duration-1000 ease-in-out origin-bottom animate-[pulse_4s_ease-in-out_infinite]"
          />
          
          {/* Main Line */}
          <path
            d={linePath}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-lg"
          />

          {/* Interactive Data Points */}
          {data.map((d, i) => {
            const x = (i / (data.length - 1)) * chartWidth;
            const y = chartHeight - ((d.words - minWords) / (maxWords - minWords)) * usableHeight;
            return (
              <g 
                key={`point-${i}`} 
                className="group/point outline-none focus:outline-none"
                tabIndex={0}
                role="button"
                aria-label={`${d.words} words written on ${d.date}`}
              >
                <circle
                  cx={x}
                  cy={y}
                  r="6"
                  fill="white"
                  stroke="#d97706"
                  strokeWidth="3"
                  className="transition-all duration-300 group-hover/point:r-8 group-hover/point:stroke-[#b45309] group-focus/point:r-8 group-focus/point:stroke-amber-600 group-focus/point:ring-4 ring-amber-500/50"
                />
                <g className="opacity-0 group-hover/point:opacity-100 group-focus/point:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <rect x={x - 45} y={y - 55} width="90" height="40" rx="8" fill="#3d3122" />
                  <text x={x} y={y - 38} fill="white" fontSize="13" fontWeight="bold" textAnchor="middle">{d.words}</text>
                  <text x={x} y={y - 23} fill="#d4c1a0" fontSize="10" textAnchor="middle">{d.date}</text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Summary KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8 relative z-10">
        <div className="p-5 bg-[#fdfaf6] rounded-2xl border border-[#e8dcc4] flex flex-col gap-1 hover:border-amber-400 transition-colors shadow-sm focus-within:ring-2 focus-within:ring-amber-500">
          <span className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider">Total Words</span>
          <span className="text-2xl font-black text-[#3d3122]">
            {totalWords.toLocaleString()}
          </span>
        </div>
        <div className="p-5 bg-[#fdfaf6] rounded-2xl border border-[#e8dcc4] flex flex-col gap-1 hover:border-amber-400 transition-colors shadow-sm focus-within:ring-2 focus-within:ring-amber-500">
          <span className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider">Avg Daily</span>
          <span className="text-2xl font-black text-[#3d3122]">
            {avgWords.toLocaleString()}
          </span>
        </div>
        <div className="p-5 bg-[#fdfaf6] rounded-2xl border border-[#e8dcc4] flex flex-col gap-1 hover:border-amber-400 transition-colors shadow-sm focus-within:ring-2 focus-within:ring-amber-500">
          <span className="text-xs font-bold text-[#8c6b4a] uppercase tracking-wider">Best Day</span>
          <span className="text-2xl font-black text-emerald-600 flex items-center gap-2">
            {maxWords.toLocaleString()} <Zap size={16} className="fill-emerald-600" aria-hidden="true" />
          </span>
        </div>
      </div>
    </WidgetCard>
  );
});
