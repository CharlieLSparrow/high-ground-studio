"use client";

import React, { useState } from "react";
import { ComparativeChartWidget } from "./ComparativeChartWidget";

export default function AnalyticsDashboardPage() {
  const [dateRange, setDateRange] = useState("Last 30 Days");

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full overflow-y-auto bg-gray-50 p-6">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Analytics Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Compare performance across all your connected channels.</p>
        </div>
        <select 
          className="border border-gray-300 rounded-md px-4 py-2 text-sm font-semibold text-gray-700 bg-white shadow-sm"
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
        >
          <option>Last 7 Days</option>
          <option>Last 30 Days</option>
          <option>Year to Date</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* KPI Cards */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Total Audience</span>
          <div className="flex items-end space-x-3">
            <span className="text-3xl font-bold text-gray-900">142.5K</span>
            <span className="text-sm font-bold text-green-500 mb-1">+4.2%</span>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Total Engagement</span>
          <div className="flex items-end space-x-3">
            <span className="text-3xl font-bold text-gray-900">18.2K</span>
            <span className="text-sm font-bold text-green-500 mb-1">+12.4%</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Top Platform</span>
          <div className="flex items-center space-x-3 mt-1">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">YT</div>
            <span className="text-xl font-bold text-gray-900">YouTube</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-900 text-base mb-6">Cross-Platform Engagement Comparison</h3>
          <ComparativeChartWidget type="bar" />
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-900 text-base mb-6">Audience Growth Trend</h3>
          <ComparativeChartWidget type="line" />
        </div>
      </div>
      
      <div className="mt-6 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h3 className="font-bold text-gray-900 text-base mb-4">Top Performing Content</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Content</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Platform</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Views</th>
                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Engagements</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-gray-900">Announcing Quipsly 2.0</td>
                <td className="py-3 px-4"><span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">X / Twitter</span></td>
                <td className="py-3 px-4 text-sm text-gray-500">Oct 12, 2026</td>
                <td className="py-3 px-4 text-sm font-bold text-gray-900">45.2K</td>
                <td className="py-3 px-4 text-sm font-bold text-gray-900">3,204</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 text-sm font-medium text-gray-900">How I built a Command Center</td>
                <td className="py-3 px-4"><span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">YouTube</span></td>
                <td className="py-3 px-4 text-sm text-gray-500">Oct 10, 2026</td>
                <td className="py-3 px-4 text-sm font-bold text-gray-900">12.1K</td>
                <td className="py-3 px-4 text-sm font-bold text-gray-900">1,050</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
