"use client";

import React, { useState } from "react";

// Mock data for demonstration
const mockJobs = [
  { id: "1", title: "Announcing Quipsly 2.0", platform: "x_twitter", date: new Date(Date.now() + 86400000).toISOString() },
  { id: "2", title: "Behind the scenes vlog", platform: "youtube_v3", date: new Date(Date.now() + 172800000).toISOString() },
  { id: "3", title: "Early access pod", platform: "patreon_v2", date: new Date(Date.now() + 259200000).toISOString() },
];

export function CalendarGrid() {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Basic weekly view calculation
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
  
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const getJobsForDate = (date: Date) => {
    return mockJobs.filter(j => {
      const jd = new Date(j.date);
      return jd.getDate() === date.getDate() && jd.getMonth() === date.getMonth();
    });
  };

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData("jobId", jobId);
  };

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("jobId");
    console.log(`Moved job ${jobId} to ${date.toDateString()}`);
    // In a real app, dispatch API call to update `scheduledAt` for this WorldHubProviderSyncJob
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50 p-6 w-full">
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Content Calendar</h2>
        <div className="flex space-x-2">
          <button 
            className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
            onClick={() => {
              const prev = new Date(currentDate);
              prev.setDate(currentDate.getDate() - 7);
              setCurrentDate(prev);
            }}
          >
            &larr; Prev Week
          </button>
          <button 
            className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
            onClick={() => {
              const next = new Date(currentDate);
              next.setDate(currentDate.getDate() + 7);
              setCurrentDate(next);
            }}
          >
            Next Week &rarr;
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-4 flex-1">
        {days.map((day, idx) => {
          const jobs = getJobsForDate(day);
          const isToday = day.toDateString() === new Date().toDateString();
          
          return (
            <div 
              key={idx} 
              className={`flex flex-col bg-white border rounded-xl overflow-hidden transition-colors ${
                isToday ? "border-blue-500 shadow-md ring-1 ring-blue-500" : "border-gray-200"
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, day)}
            >
              {/* Day Header */}
              <div className={`p-3 text-center border-b ${isToday ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-600"}`}>
                <div className="text-xs uppercase font-semibold tracking-wider">{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
                <div className={`text-2xl font-bold mt-1 ${isToday ? "text-blue-600" : "text-gray-900"}`}>{day.getDate()}</div>
              </div>

              {/* Jobs Area */}
              <div className="flex-1 p-2 space-y-2 min-h-[150px] overflow-y-auto bg-gray-50/50">
                {jobs.map(job => (
                  <div 
                    key={job.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, job.id)}
                    className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 hover:shadow-md transition-all group"
                  >
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>{job.platform.replace("_v3", "").replace("_v2", "").replace("_", " ")}</span>
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">⠿</span>
                    </div>
                    <div className="text-sm font-medium text-gray-900 line-clamp-2">{job.title}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
