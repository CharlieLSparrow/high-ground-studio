"use client";

import { Mic, Video, Folder, Calendar, Activity, CheckCircle2, Clock, UploadCloud, ChevronRight } from "lucide-react";

export default function DashboardPage() {
  // Mock Data for the Command Center
  const recentUploads = [
    { id: 1, name: "Field_Recording_001.mp4", size: "1.2 GB", time: "10 mins ago", type: "video" },
    { id: 2, name: "Podcast_Interview_Audio.wav", size: "450 MB", time: "2 hours ago", type: "audio" },
    { id: 3, name: "B_Roll_Nature.mp4", size: "3.4 GB", time: "Yesterday", type: "video" },
  ];

  const activeRenders = [
    { id: 1, name: "The AI Revolution (Final Cut)", progress: 78, eta: "4 mins" },
    { id: 2, name: "Shorts Batch - 3 Clips", progress: 12, eta: "15 mins" },
  ];

  const upcomingCoaching = [
    { id: 1, client: "Sarah Jenkins", time: "2:00 PM Today", topic: "Content Strategy" },
    { id: 2, client: "Marcus Aurelius", time: "10:00 AM Tomorrow", topic: "YouTube Retention" },
  ];

  const storageStats = {
    used: 450,
    total: 1000,
    percent: 45,
  };

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-y-auto">
      {/* Header section */}
      <header className="p-8 pb-4">
        <p className="text-sm font-bold text-[#8c6b4a] uppercase tracking-widest mb-1">Command Center</p>
        <h1 className="text-4xl font-black text-[#3d3122]">The Nest</h1>
        <p className="text-[#8c6b4a] mt-2">Welcome back. Your studio is running smoothly.</p>
      </header>

      {/* Main Grid */}
      <div className="p-8 pt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (Main Stats & Renders) */}
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-6">
          
          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
             <div className="bg-white border border-[#e8dcc4] rounded-2xl p-5 shadow-sm flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[#8c6b4a] font-bold text-xs uppercase tracking-wider">
                  <Activity size={14} /> Active Projects
                </div>
                <span className="text-3xl font-black text-[#3d3122]">12</span>
                <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full w-fit mt-1">+3 this week</span>
             </div>
             
             <div className="bg-white border border-[#e8dcc4] rounded-2xl p-5 shadow-sm flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[#8c6b4a] font-bold text-xs uppercase tracking-wider">
                  <Folder size={14} /> Storage (GB)
                </div>
                <span className="text-3xl font-black text-[#3d3122]">{storageStats.used} <span className="text-lg text-[#8c6b4a]">/ {storageStats.total}</span></span>
                <div className="w-full h-1.5 bg-[#f8f3e6] rounded-full mt-2 overflow-hidden">
                   <div className="h-full bg-amber-500 rounded-full" style={{ width: `${storageStats.percent}%` }}></div>
                </div>
             </div>

             <div className="bg-[#8c6b4a] border border-[#5e4b33] rounded-2xl p-5 shadow-sm flex flex-col gap-2 text-white relative overflow-hidden group cursor-pointer hover:bg-[#7a5d40] transition-colors">
                <div className="absolute -right-4 -top-4 opacity-10">
                   <Mic size={100} />
                </div>
                <div className="flex items-center gap-2 text-[#ebdcc8] font-bold text-xs uppercase tracking-wider relative z-10">
                  <Mic size={14} /> iPhone Field Kit
                </div>
                <span className="text-xl font-bold mt-1 relative z-10">Connected</span>
                <span className="text-xs text-emerald-300 font-bold bg-emerald-900/50 border border-emerald-500/30 px-2 py-0.5 rounded-full w-fit mt-1 flex items-center gap-1 relative z-10">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> Ready to Record
                </span>
             </div>
          </div>

          {/* Active Render Jobs */}
          <div className="bg-white border border-[#e8dcc4] rounded-2xl p-6 shadow-sm">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-[#3d3122] flex items-center gap-2">
                 <Video className="text-[#8c6b4a]" size={20} />
                 Render Farm Status
               </h3>
               <button className="text-xs font-bold text-amber-600 hover:text-amber-700">View Queue</button>
             </div>
             
             <div className="flex flex-col gap-4">
               {activeRenders.map(render => (
                 <div key={render.id} className="flex flex-col gap-2 p-4 bg-[#fdfaf6] border border-[#e8dcc4] rounded-xl">
                   <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-[#3d3122]">{render.name}</span>
                      <span className="text-xs font-mono font-bold text-[#8c6b4a]">{render.eta} remaining</span>
                   </div>
                   <div className="w-full h-2 bg-[#e8dcc4] rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full relative overflow-hidden" style={{ width: `${render.progress}%` }}>
                         <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}></div>
                      </div>
                   </div>
                 </div>
               ))}
               {activeRenders.length === 0 && (
                 <div className="text-sm text-[#8c6b4a] text-center py-4 italic">No active render jobs.</div>
               )}
             </div>
          </div>

          {/* Recent Uploads from Field Kit */}
          <div className="bg-white border border-[#e8dcc4] rounded-2xl p-6 shadow-sm">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-[#3d3122] flex items-center gap-2">
                 <UploadCloud className="text-[#8c6b4a]" size={20} />
                 Recent Uploads
               </h3>
               <button className="text-xs font-bold text-amber-600 hover:text-amber-700">Open Vault</button>
             </div>
             
             <div className="flex flex-col gap-3">
               {recentUploads.map(upload => (
                 <div key={upload.id} className="flex items-center justify-between p-3 hover:bg-[#fdfaf6] rounded-xl transition-colors group cursor-pointer border border-transparent hover:border-[#e8dcc4]">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-lg bg-[#f8f3e6] flex items-center justify-center text-[#8c6b4a] border border-[#e8dcc4]">
                        {upload.type === 'video' ? <Video size={18} /> : <Mic size={18} />}
                     </div>
                     <div className="flex flex-col">
                       <span className="text-sm font-bold text-[#3d3122]">{upload.name}</span>
                       <span className="text-xs text-[#8c6b4a]">{upload.size}</span>
                     </div>
                   </div>
                   <div className="flex items-center gap-4">
                      <span className="text-xs text-[#8c6b4a] font-medium">{upload.time}</span>
                      <ChevronRight size={16} className="text-[#d4c1a0] group-hover:text-amber-500 transition-colors" />
                   </div>
                 </div>
               ))}
             </div>
          </div>
        </div>

        {/* Right Column (Coaching & Schedule) */}
        <div className="col-span-1 flex flex-col gap-6">
          
          {/* Coaching Appointments */}
          <div className="bg-white border border-[#e8dcc4] rounded-2xl p-6 shadow-sm flex-1">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-bold text-[#3d3122] flex items-center gap-2">
                 <Calendar className="text-[#8c6b4a]" size={20} />
                 Upcoming Coaching
               </h3>
               <button className="text-xs font-bold text-amber-600 hover:text-amber-700">Manage</button>
             </div>

             <div className="flex flex-col gap-4">
               {upcomingCoaching.map(apt => (
                 <div key={apt.id} className="p-4 bg-blue-50 border border-blue-100 rounded-xl relative overflow-hidden group">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-black text-blue-900">{apt.client}</span>
                      <span className="text-xs font-bold text-blue-600">{apt.topic}</span>
                      <div className="flex items-center gap-1 text-[10px] text-blue-500 font-bold uppercase tracking-wider mt-2">
                        <Clock size={12} /> {apt.time}
                      </div>
                    </div>
                 </div>
               ))}
               <button className="w-full py-2.5 mt-2 border-2 border-dashed border-[#d4c1a0] text-[#8c6b4a] font-bold text-xs rounded-xl hover:bg-[#f8f3e6] hover:border-[#8c6b4a] transition-all">
                 + Schedule Session
               </button>
             </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-[#fdfaf6] border border-[#e8dcc4] rounded-2xl p-6 shadow-sm">
             <h3 className="text-sm font-bold text-[#8c6b4a] uppercase tracking-wider mb-4">Quick Actions</h3>
             <div className="flex flex-col gap-2">
                <button className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-sm transition-colors text-sm">
                  Start New Video Project
                </button>
                <button className="w-full py-3 bg-white hover:bg-[#f8f3e6] border border-[#e8dcc4] text-[#3d3122] font-bold rounded-xl transition-colors text-sm">
                  Dispatch Research Agent
                </button>
                <button className="w-full py-3 bg-white hover:bg-[#f8f3e6] border border-[#e8dcc4] text-[#3d3122] font-bold rounded-xl transition-colors text-sm">
                  Write Social Post
                </button>
             </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
