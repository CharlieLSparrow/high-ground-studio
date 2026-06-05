"use client";

import { useState } from "react";
import { format, isSameDay } from "date-fns";
import { Clock, Send, PlayCircle, Rss, AlertTriangle, CheckCircle2 } from "lucide-react";
import { mockPublishedEvents, generateTimelineDays, mockPackages } from "../mockData";

export default function CalendarDispatcherPage() {
  const [days] = useState(generateTimelineDays(14)); // 14 day timeline
  const today = new Date();

  const getEventsForDay = (date: Date) => {
    return mockPublishedEvents.filter(evt => {
      if (!evt.publishedAt) return false;
      const evtDate = new Date(evt.publishedAt);
      return isSameDay(evtDate, date);
    });
  };

  const getPackageInfo = (pkgId: string) => mockPackages.find(p => p.id === pkgId);

  return (
    <div className="p-8 max-w-6xl mx-auto h-full flex flex-col">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-[#3d3122] tracking-tight">Dispatch Calendar</h1>
          <p className="text-[#8c6b4a] font-medium mt-1">Timeline of background jobs, embargoes, and publishing events.</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[#8c6b4a]">
            <span className="w-3 h-3 rounded-full bg-green-500"></span> Published
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#8c6b4a]">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span> Scheduled
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#8c6b4a]">
            <span className="w-3 h-3 rounded-full bg-gray-300"></span> Draft
          </div>
        </div>
      </header>

      <div className="flex-1 bg-white rounded-2xl border border-[#e8dcc4] shadow-sm overflow-hidden flex flex-col">
        
        {/* Calendar Header / Timeline Scale */}
        <div className="grid grid-cols-7 border-b border-[#e8dcc4] bg-[#f8f3e6]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
             <div key={i} className="p-3 text-center text-xs font-bold text-[#8c6b4a] uppercase tracking-wider border-r border-[#e8dcc4] last:border-0">
               {day}
             </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 grid grid-cols-7 grid-rows-2">
          {days.map((date, i) => {
            const isToday = isSameDay(date, today);
            const events = getEventsForDay(date);

            return (
              <div key={i} className={`min-h-[150px] border-r border-b border-[#e8dcc4] p-2 flex flex-col ${isToday ? "bg-[#fdfaf6]" : "bg-white"}`}>
                <div className={`text-xs font-bold mb-2 flex justify-between items-center ${isToday ? "text-amber-700" : "text-[#5e4b33]"}`}>
                  <span>{format(date, "MMM d")}</span>
                  {isToday && <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] uppercase">Today</span>}
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  {events.map(evt => {
                    const pkg = getPackageInfo(evt.packageId);
                    if (!pkg) return null;

                    const isPublished = evt.status === "published";

                    return (
                      <div key={evt.id} className={`p-2 rounded-lg border text-left flex flex-col gap-1 shadow-sm transition-all hover:-translate-y-0.5 cursor-pointer ${isPublished ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                        <div className="flex justify-between items-start">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${isPublished ? "text-green-700" : "text-amber-700"}`}>
                            {evt.destination.split("_")[0]}
                          </span>
                          {isPublished ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <Clock className="w-3 h-3 text-amber-600" />}
                        </div>
                        <p className="text-xs font-bold text-[#3d3122] line-clamp-2">{pkg.title}</p>
                        <p className="text-[10px] text-[#6b5b45]">{format(new Date(evt.publishedAt!), "h:mm a")}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unscheduled Queue */}
      <div className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#8c6b4a] mb-4">Unscheduled / Draft Jobs</h2>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {mockPublishedEvents.filter(e => e.status === "draft").map(evt => {
            const pkg = getPackageInfo(evt.packageId);
            return (
              <div key={evt.id} className="w-64 flex-shrink-0 bg-white rounded-xl border border-[#e8dcc4] p-4 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                   <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">DRAFT</span>
                   <span className="text-[10px] font-bold uppercase tracking-wider text-[#8c6b4a]">{evt.destination.split("_")[0]}</span>
                </div>
                <h3 className="font-bold text-sm text-[#3d3122] truncate">{pkg?.title}</h3>
                <p className="text-xs text-[#8c6b4a] mt-2">Waiting for embargo clearance.</p>
                <button className="w-full mt-4 bg-[#f8f3e6] text-[#8c6b4a] text-xs font-bold py-2 rounded-lg hover:bg-[#ebdcc8] hover:text-[#3d3122] transition-colors">
                  Schedule Job
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
