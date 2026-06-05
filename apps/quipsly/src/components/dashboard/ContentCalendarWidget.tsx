"use client";

import React from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Plus, Video, FileText, Image as ImageIcon } from "lucide-react";
import { WidgetCard } from "./WidgetCard";

type EventType = 'video' | 'post' | 'draft';
type ContentEvent = {
  id: string;
  title: string;
  type: EventType;
  time: string;
  status: 'planned' | 'in-progress' | 'ready' | 'published';
  day: number;
};

const EVENTS: ContentEvent[] = [
  { id: '1', title: 'Q2 Roadmap Video', type: 'video', time: '10:00 AM', status: 'published', day: 2 },
  { id: '2', title: 'Character Deep Dive', type: 'post', time: '2:00 PM', status: 'ready', day: 5 },
  { id: '3', title: 'Chapter 5 Edit', type: 'draft', time: '9:00 AM', status: 'in-progress', day: 12 },
  { id: '4', title: 'Patreon Update', type: 'post', time: '12:00 PM', status: 'planned', day: 15 },
  { id: '5', title: 'Teaser Trailer', type: 'video', time: '5:00 PM', status: 'planned', day: 22 },
];

export const ContentCalendarWidget = React.memo(() => {
  const daysInMonth = 30; // Mock 30-day month
  const firstDayOffset = 3; // Starts on Wednesday
  
  const days = Array.from({ length: 42 }, (_, i) => {
    const dayNumber = i - firstDayOffset + 1;
    const isCurrentMonth = dayNumber > 0 && dayNumber <= daysInMonth;
    const events = EVENTS.filter(e => e.day === dayNumber);
    return { dayNumber, isCurrentMonth, events, isToday: dayNumber === 12 };
  });

  return (
    <WidgetCard>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-2xl font-black text-[#3d3122] flex items-center gap-3">
            <CalendarIcon className="text-[#8c6b4a]" size={28} aria-hidden="true" />
            Content Pipeline
          </h3>
          <p className="text-[#8c6b4a] font-medium mt-1">June 2026 Schedule</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-[#fdfaf6] rounded-xl border border-[#e8dcc4] p-1" role="group" aria-label="Month navigation">
            <button className="p-2 text-[#8c6b4a] hover:bg-white hover:shadow-sm rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" aria-label="Previous month">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span className="px-4 text-sm font-bold text-[#3d3122]" aria-live="polite">June</span>
            <button className="p-2 text-[#8c6b4a] hover:bg-white hover:shadow-sm rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" aria-label="Next month">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          <button className="px-4 py-2 bg-[#3d3122] text-white font-bold text-sm rounded-xl hover:bg-[#2a2218] transition-colors shadow-md flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3d3122] focus-visible:ring-offset-2">
            <Plus size={16} aria-hidden="true" /> New Drop
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-[500px]">
        {/* Days Header */}
        <div className="grid grid-cols-7 gap-2 mb-2" role="row">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} role="columnheader" className="text-center text-xs font-bold text-[#8c6b4a] uppercase tracking-wider py-2">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2 flex-1" role="grid" aria-label="Calendar grid">
          {days.map((day, i) => (
            <div 
              key={i} 
              role="gridcell"
              className={`border rounded-xl p-2 flex flex-col gap-1 min-h-[100px] transition-all group
                ${day.isCurrentMonth ? 'bg-white border-[#e8dcc4]' : 'bg-[#fdfaf6]/50 border-transparent'}
                ${day.isToday ? 'ring-2 ring-amber-500 border-transparent shadow-md' : 'hover:border-amber-300'}
              `}
              aria-label={day.isCurrentMonth ? `${day.dayNumber} June, ${day.events.length} events` : "Empty date cell"}
            >
              <div className="flex justify-between items-start">
                <span className={`text-sm font-bold ${day.isToday ? 'bg-amber-500 text-white w-6 h-6 flex items-center justify-center rounded-full' : day.isCurrentMonth ? 'text-[#3d3122]' : 'text-[#d4c1a0]'}`}>
                  {day.dayNumber > 0 && day.dayNumber <= daysInMonth ? day.dayNumber : ''}
                </span>
                {day.isCurrentMonth && day.dayNumber > 0 && (
                  <button className="text-white hover:text-amber-500 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 transition-opacity focus:outline-none focus-visible:opacity-100" aria-label={`Add event for June ${day.dayNumber}`}>
                    <Plus size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
              
              <div className="flex flex-col gap-1 mt-1 overflow-y-auto custom-scrollbar flex-1">
                {day.events.map(event => (
                  <button 
                    key={event.id} 
                    className={`text-[10px] text-left font-bold px-2 py-1.5 rounded-lg border flex flex-col gap-1 cursor-pointer hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2
                      ${event.type === 'video' ? 'bg-rose-50 text-rose-800 border-rose-200 focus-visible:ring-rose-400' : 
                        event.type === 'post' ? 'bg-blue-50 text-blue-800 border-blue-200 focus-visible:ring-blue-400' : 
                        'bg-emerald-50 text-emerald-800 border-emerald-200 focus-visible:ring-emerald-400'
                      }
                    `}
                    aria-label={`${event.title}, ${event.type} event at ${event.time}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="truncate">{event.title}</span>
                    </div>
                    <div className="flex items-center justify-between opacity-80 w-full">
                      <span className="flex items-center gap-1"><Clock size={10} aria-hidden="true" /> {event.time}</span>
                      {event.type === 'video' ? <Video size={10} aria-hidden="true" /> : event.type === 'post' ? <FileText size={10} aria-hidden="true" /> : <ImageIcon size={10} aria-hidden="true" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </WidgetCard>
  );
});
