"use client";

import { Users, Calendar as CalendarIcon, Video, MessageSquare, ChevronRight, Mail, Phone, ExternalLink } from "lucide-react";

export default function CoachingPage() {
  const upcomingSessions = [
    { id: 1, client: "Alex Mercer", date: "May 31, 2026", time: "10:00 AM", type: "1-on-1 Strategy", status: "Confirmed" },
    { id: 2, client: "Group Cohort Alpha", date: "Jun 02, 2026", time: "3:00 PM", type: "Q&A Masterclass", status: "Pending" },
    { id: 3, client: "Elena Rostova", date: "Jun 05, 2026", time: "1:00 PM", type: "Portfolio Review", status: "Confirmed" },
  ];

  const clientRoster = [
    { id: 1, name: "Alex Mercer", email: "alex@example.com", sessions: 4, lastSeen: "2 days ago", tags: ["Strategy", "YouTube"] },
    { id: 2, name: "Elena Rostova", email: "elena@example.com", sessions: 1, lastSeen: "1 week ago", tags: ["Editing", "NLE"] },
    { id: 3, name: "David Chen", email: "david@example.com", sessions: 8, lastSeen: "1 month ago", tags: ["Burnout", "Planning"] },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-y-auto">
      <header className="p-8 pb-4">
        <p className="text-sm font-bold text-[#8c6b4a] uppercase tracking-widest mb-1">Coaching & Mentorship</p>
        <h1 className="text-4xl font-black text-[#3d3122]">Client Hub</h1>
        <p className="text-[#8c6b4a] mt-2">Manage your calendar, prepare for 1-on-1s, and track client progress.</p>
      </header>

      <div className="p-8 pt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (Calendar & Upcoming) */}
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white border border-[#e8dcc4] rounded-2xl p-6 shadow-sm">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-[#3d3122] flex items-center gap-2">
                 <CalendarIcon className="text-[#8c6b4a]" size={20} />
                 Upcoming Sessions
               </h3>
               <div className="flex gap-2">
                  <button className="text-xs font-bold bg-[#f8f3e6] text-[#8c6b4a] px-3 py-1.5 rounded-lg border border-[#e8dcc4] hover:text-[#3d3122] transition-colors">Sync Calendar</button>
                  <button className="text-xs font-bold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors">+ New Event</button>
               </div>
             </div>

             <div className="flex flex-col gap-3">
               {upcomingSessions.map(session => (
                 <div key={session.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#fdfaf6] border border-[#e8dcc4] rounded-xl hover:border-amber-400 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl border border-[#e8dcc4] flex flex-col items-center justify-center text-[#8c6b4a]">
                        <span className="text-[10px] font-bold uppercase">{session.date.split(' ')[0]}</span>
                        <span className="text-lg font-black leading-none text-[#3d3122]">{session.date.split(' ')[1].replace(',', '')}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-[#3d3122]">{session.client}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-bold text-[#8c6b4a] bg-white border border-[#e8dcc4] px-2 py-0.5 rounded-md">{session.time}</span>
                          <span className="text-xs text-[#8c6b4a]">{session.type}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-4 sm:mt-0">
                      <button className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors border border-blue-100">
                        <Video size={14} /> Join Call
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e8dcc4] text-[#8c6b4a] hover:text-[#3d3122] rounded-lg text-xs font-bold transition-colors">
                        <MessageSquare size={14} /> Notes
                      </button>
                    </div>
                 </div>
               ))}
             </div>
          </div>
        </div>

        {/* Right Column (Client Roster) */}
        <div className="col-span-1 flex flex-col gap-6">
          <div className="bg-[#f8f3e6] border border-[#e8dcc4] rounded-2xl p-6 shadow-sm flex-1">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-[#3d3122] flex items-center gap-2">
                 <Users className="text-[#8c6b4a]" size={20} />
                 Active Roster
               </h3>
               <button className="text-xs font-bold text-amber-600 hover:text-amber-700">View All</button>
             </div>

             <div className="flex flex-col gap-4">
                {clientRoster.map(client => (
                  <div key={client.id} className="bg-white border border-[#e8dcc4] p-4 rounded-xl flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                       <div className="flex flex-col">
                         <span className="font-bold text-[#3d3122]">{client.name}</span>
                         <span className="text-[10px] text-[#8c6b4a]">{client.email}</span>
                       </div>
                       <button className="w-8 h-8 rounded-full bg-[#fdfaf6] border border-[#e8dcc4] flex items-center justify-center text-[#8c6b4a] hover:text-amber-600 transition-colors">
                         <ExternalLink size={14} />
                       </button>
                    </div>
                    
                    <div className="flex gap-2">
                      {client.tags.map(tag => (
                        <span key={tag} className="text-[9px] font-bold uppercase tracking-wider bg-[#f8f3e6] text-[#8c6b4a] px-2 py-0.5 rounded border border-[#e8dcc4]">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-[#fdfaf6] mt-1">
                       <span className="text-xs text-[#8c6b4a] font-medium">{client.sessions} Sessions</span>
                       <div className="flex gap-2 text-[#d4c1a0]">
                         <Mail size={14} className="hover:text-amber-600 cursor-pointer transition-colors" />
                         <Phone size={14} className="hover:text-amber-600 cursor-pointer transition-colors" />
                       </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
