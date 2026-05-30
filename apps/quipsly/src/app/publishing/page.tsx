"use client";

import { useState } from "react";
import { Send, Calendar, Youtube, Instagram, Linkedin, MoreHorizontal } from "lucide-react";

export default function PublishingCommandCenter() {
  const [activeTab, setActiveTab] = useState<"calendar" | "outbox">("outbox");

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden p-8">
      <header className="mb-8 flex justify-between items-end border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-widest text-pink-500 flex items-center gap-3">
            <Send className="w-8 h-8" />
            Social Media Command Center
          </h1>
          <p className="text-zinc-400 mt-2">
            Centralized publishing outbox for YouTube, Instagram, and LinkedIn.
          </p>
        </div>
        <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          <button 
            onClick={() => setActiveTab("outbox")}
            className={`px-6 py-2 rounded-md font-bold text-sm transition-all ${activeTab === "outbox" ? "bg-pink-600 text-white shadow-lg" : "text-zinc-400 hover:text-white"}`}
          >
            Outbox Queue
          </button>
          <button 
            onClick={() => setActiveTab("calendar")}
            className={`px-6 py-2 rounded-md font-bold text-sm transition-all ${activeTab === "calendar" ? "bg-pink-600 text-white shadow-lg" : "text-zinc-400 hover:text-white"}`}
          >
            Content Calendar
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto w-full max-w-6xl mx-auto grid grid-cols-12 gap-8">
        
        {/* Left Sidebar: Connected Accounts */}
        <div className="col-span-3 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-4">Connected Accounts</h2>
          
          <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex items-center gap-4">
            <Youtube className="w-6 h-6 text-red-500" />
            <div>
              <p className="font-bold">High Ground</p>
              <p className="text-xs text-zinc-500">Connected</p>
            </div>
          </div>

          <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex items-center gap-4">
            <Instagram className="w-6 h-6 text-pink-500" />
            <div>
              <p className="font-bold">@highground</p>
              <p className="text-xs text-zinc-500">Connected</p>
            </div>
          </div>

          <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex items-center gap-4">
            <Linkedin className="w-6 h-6 text-blue-500" />
            <div>
              <p className="font-bold">Personal Profile</p>
              <p className="text-xs text-emerald-500">Healthy</p>
            </div>
          </div>
          
          <button className="w-full mt-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-bold transition-all border border-dashed border-zinc-600">
            + Connect New Account
          </button>
        </div>

        {/* Main Feed: Post Queue */}
        <div className="col-span-9 space-y-6">
          
          {/* Post Card */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-xl transition-all hover:border-zinc-700">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
               <div className="flex items-center gap-3">
                 <Youtube className="w-5 h-5 text-red-500" />
                 <span className="font-bold text-sm">YouTube Shorts</span>
                 <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-xs font-bold uppercase">Scheduled</span>
               </div>
               <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 text-zinc-400 text-sm font-mono">
                   <Calendar className="w-4 h-4" />
                   Tomorrow, 10:00 AM
                 </div>
                 <button className="text-zinc-500 hover:text-white transition-colors">
                   <MoreHorizontal className="w-5 h-5" />
                 </button>
               </div>
            </div>
            <div className="p-6 flex gap-6">
              <div className="w-32 h-48 bg-zinc-800 rounded-lg overflow-hidden relative border border-zinc-700 flex items-center justify-center">
                 <span className="text-zinc-600 font-bold text-xs">Video Thumbnail</span>
              </div>
              <div className="flex-1 space-y-4">
                <p className="text-zinc-300 text-sm leading-relaxed">
                  Have you ever wondered why traditional productivity systems fail? It's not you, it's the tools. 
                  In this short, we break down why the OneNote methodology works for non-linear thinkers. 
                  <br/><br/>
                  #productivity #adhd #software
                </p>
                <div className="pt-4 border-t border-zinc-800 flex gap-4">
                  <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-xs font-bold transition-all">Edit Post</button>
                  <button className="px-4 py-2 bg-pink-600/20 text-pink-400 hover:bg-pink-600 hover:text-white rounded text-xs font-bold transition-all">Publish Now</button>
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
