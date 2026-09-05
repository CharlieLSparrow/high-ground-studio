"use client";

import React from "react";

interface Props {
  type: "bar" | "line";
}

export function ComparativeChartWidget({ type }: Props) {
  // Mocking the visual representation of Recharts to stay dependency-free for now
  
  if (type === "bar") {
    return (
      <div className="flex h-64 items-end space-x-4 border-b border-l border-gray-200 pl-4 pb-4">
        {[40, 70, 30, 85, 50, 95].map((h, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end items-center group relative h-full">
            {/* Tooltip mock */}
            <div className="absolute -top-8 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
              Value: {h * 100}
            </div>
            <div 
              className={`w-full max-w-[40px] rounded-t-sm transition-all duration-500 ease-in-out ${i % 2 === 0 ? "bg-red-400 hover:bg-red-500" : "bg-blue-400 hover:bg-blue-500"}`}
              style={{ height: `${h}%` }}
            ></div>
            <div className="absolute -bottom-6 text-[10px] font-bold text-gray-500 w-full text-center">
              Day {i + 1}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Line chart mock (CSS magic)
  return (
    <div className="relative h-64 border-b border-l border-gray-200 pl-4 pb-4 flex items-end">
      {/* Grid lines */}
      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
        <div className="border-b border-gray-400 w-full"></div>
        <div className="border-b border-gray-400 w-full"></div>
        <div className="border-b border-gray-400 w-full"></div>
        <div className="border-b border-gray-400 w-full"></div>
      </div>
      
      {/* Fake Line SVG */}
      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
        {/* Shadow/Fill Area */}
        <path d="M0,80 L20,60 L40,70 L60,30 L80,50 L100,10 L100,100 L0,100 Z" fill="rgba(59, 130, 246, 0.1)" />
        {/* Line */}
        <polyline 
          fill="none" 
          stroke="var(--color-quipsly-lake-500)"
          strokeWidth="3" 
          points="0,80 20,60 40,70 60,30 80,50 100,10" 
          strokeLinejoin="round" 
          strokeLinecap="round" 
        />
        {/* Data points */}
        <circle cx="20" cy="60" r="2" fill="#fff" stroke="var(--color-quipsly-lake-500)" strokeWidth="1" className="hover:r-3 cursor-pointer transition-all" />
        <circle cx="40" cy="70" r="2" fill="#fff" stroke="var(--color-quipsly-lake-500)" strokeWidth="1" className="hover:r-3 cursor-pointer transition-all" />
        <circle cx="60" cy="30" r="2" fill="#fff" stroke="var(--color-quipsly-lake-500)" strokeWidth="1" className="hover:r-3 cursor-pointer transition-all" />
        <circle cx="80" cy="50" r="2" fill="#fff" stroke="var(--color-quipsly-lake-500)" strokeWidth="1" className="hover:r-3 cursor-pointer transition-all" />
      </svg>
    </div>
  );
}
