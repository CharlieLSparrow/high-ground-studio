"use client";

import React, { useMemo } from "react";
import { PieChart, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { WidgetCard, classNames } from "./WidgetCard";

export type TagData = { name: string; count: number; color: string; trend: 'up' | 'down' | 'flat' };

export const TagDistributionWidget = React.memo(({ tags }: { tags: TagData[] }) => {
  const size = 300;
  const center = size / 2;
  const radius = (size / 2) - 40;
  
  const maxCount = useMemo(() => Math.max(...tags.map(t => t.count)), [tags]);

  // Memoize polygon path calculation for radar chart
  const { polygonPath, pointsData } = useMemo(() => {
    const getPoint = (value: number, index: number, total: number, r: number) => {
      const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
      const distance = (value / maxCount) * r;
      return {
        x: center + Math.cos(angle) * distance,
        y: center + Math.sin(angle) * distance
      };
    };

    const ptsData = tags.map((t, i) => {
      const p = getPoint(t.count, i, tags.length, radius);
      const labelP = getPoint(maxCount, i, tags.length, radius + 20);
      return { p, labelP, tag: t };
    });

    const polyPath = ptsData.map(d => `${d.p.x},${d.p.y}`).join(" ");
    return { polygonPath: polyPath, pointsData: ptsData };
  }, [tags, maxCount, center, radius]);

  return (
    <WidgetCard variant="glass">
      <div className="relative z-10 flex justify-between items-start mb-6">
        <div>
          <h3 className="text-2xl font-black text-[#3d3122] flex items-center gap-3">
            <PieChart className="text-rose-500" size={28} aria-hidden="true" />
            Tag Ontology
          </h3>
          <p className="text-[#8c6b4a] font-medium mt-1">Distribution of semantic tags across manuscript</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row items-center gap-8 mt-2">
        {/* Radar Chart SVG */}
        <div className="relative w-64 h-64 flex-shrink-0 group" role="img" aria-label="Radar chart showing tag distribution">
          <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible" aria-hidden="true">
            {/* Background Rings */}
            {[1, 0.75, 0.5, 0.25].map(scale => (
              <circle 
                key={scale} 
                cx={center} 
                cy={center} 
                r={radius * scale} 
                fill="none" 
                stroke="#e8dcc4" 
                strokeWidth="1" 
                strokeDasharray={scale === 1 ? "none" : "4 4"} 
              />
            ))}
            
            {/* Radar Axes */}
            {pointsData.map((data, i) => (
              <line 
                key={`axis-${i}`} 
                x1={center} 
                y1={center} 
                x2={data.labelP.x} 
                y2={data.labelP.y} 
                stroke="#e8dcc4" 
                strokeWidth="1" 
              />
            ))}

            {/* Polygon Shape */}
            <polygon 
              points={polygonPath} 
              fill="rgba(244, 63, 94, 0.2)" 
              stroke="#f43f5e" 
              strokeWidth="3"
              strokeLinejoin="round"
              className="transition-all duration-700 ease-out group-hover:fill-[rgba(244,63,94,0.4)]"
            />

            {/* Interactive Data Nodes */}
            {pointsData.map((data, i) => (
              <g 
                key={`tag-point-${i}`}
                role="button"
                tabIndex={0}
                aria-label={`${data.tag.name}: ${data.tag.count} usages`}
                className="outline-none focus:outline-none group/node"
              >
                <circle 
                  cx={data.p.x} 
                  cy={data.p.y} 
                  r="6" 
                  fill="#f43f5e" 
                  className="transition-transform group-focus/node:scale-150"
                />
                <text 
                  x={data.labelP.x} 
                  y={data.labelP.y} 
                  fill="#5e4b33" 
                  fontSize="12" 
                  fontWeight="bold" 
                  textAnchor="middle" 
                  alignmentBaseline="middle"
                  className="group-focus/node:fill-rose-700 transition-colors"
                >
                  {data.tag.name}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Details Grid */}
        <div className="flex-1 w-full grid grid-cols-2 gap-4">
          {tags.map(t => (
            <div 
              key={t.name} 
              className="bg-[#fdfaf6] p-4 rounded-2xl border border-[#e8dcc4] flex flex-col gap-2 shadow-sm focus-within:ring-2 focus-within:ring-amber-500 transition-all hover:border-amber-300"
              tabIndex={0}
              role="article"
              aria-labelledby={`tag-name-${t.name}`}
            >
              <div className="flex items-center gap-2">
                <div className={classNames("w-3 h-3 rounded-full flex-shrink-0", t.color)} aria-hidden="true"></div>
                <span id={`tag-name-${t.name}`} className="text-xs font-bold text-[#3d3122] truncate">{t.name}</span>
              </div>
              <div className="flex justify-between items-end pl-5">
                <span className="text-2xl font-black text-[#8c6b4a] leading-none" aria-label={`${t.count} total usages`}>{t.count}</span>
                <span 
                  className={classNames(
                    "text-[10px] font-bold uppercase flex items-center gap-0.5",
                    t.trend === 'up' ? 'text-emerald-700' : t.trend === 'down' ? 'text-rose-700' : 'text-slate-500'
                  )}
                  aria-label={`Trend is ${t.trend}`}
                >
                  {t.trend === 'up' ? <ArrowUpRight size={12} /> : t.trend === 'down' ? <ArrowDownRight size={12} /> : <Minus size={12} />}
                  {t.trend === 'up' ? 'Rising' : t.trend === 'down' ? 'Falling' : 'Stable'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </WidgetCard>
  );
});
