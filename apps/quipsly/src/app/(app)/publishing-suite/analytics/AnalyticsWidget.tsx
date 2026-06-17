"use client";

import React from "react";

export function AnalyticsWidget() {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">Engagement Trend</h3>
        <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">+12%</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Total Views</div>
          <div className="text-xl font-bold text-gray-900">14.2K</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Engagements</div>
          <div className="text-xl font-bold text-gray-900">1,842</div>
        </div>
      </div>

      <div className="flex-1 min-h-[150px] flex items-end space-x-2">
        {/* Mocking a bar chart for aesthetic Command Center vibes */}
        {[30, 45, 20, 60, 80, 50, 90].map((height, i) => (
          <div key={i} className="flex-1 bg-blue-100 rounded-t-sm group relative flex justify-center">
            <div 
              className="absolute bottom-0 w-full bg-blue-500 rounded-t-sm transition-all duration-500 group-hover:bg-blue-600" 
              style={{ height: `${height}%` }}
            ></div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-gray-400 font-medium">
        <span>Mon</span>
        <span>Wed</span>
        <span>Fri</span>
        <span>Sun</span>
      </div>
    </div>
  );
}
