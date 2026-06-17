"use client";

import React, { useState } from "react";
import { Sparkles, Library, FileVideo, RotateCcw, BookOpen } from "lucide-react";

type Message = {
  id: string;
  sender: "quipsly" | "user";
  text: string;
  delay?: number;
};

const SCRIPT: Record<string, Message[]> = {
  intro: [
    { id: "i1", sender: "quipsly", text: "Hello! I'm a Quipsly librarian. How can I help you organize your ideas today?" }
  ],
  research: [
    { id: "r1", sender: "user", text: "Show me how you handle research." },
    { id: "r2", sender: "quipsly", text: "I can gather your scattered notes, links, and PDF quotes into neat little 'Research Packets'.", delay: 800 },
    { id: "r3", sender: "quipsly", text: "That way, when you sit down to write, all your sources are neatly piled on your desk, fully cited. No more drowning in browser tabs!", delay: 1500 }
  ],
  video: [
    { id: "v1", sender: "user", text: "What about video editing?" },
    { id: "v2", sender: "quipsly", text: "I love video! Just drop your raw footage into the Nest.", delay: 800 },
    { id: "v3", sender: "quipsly", text: "I'll sync the audio, generate a transcript, and let you highlight the best takes. When you're ready, I'll export an XML file straight into Premiere with all your cuts perfectly aligned.", delay: 1800 }
  ],
  podcast: [
    { id: "p1", sender: "user", text: "How do you help with podcasts?" },
    { id: "p2", sender: "quipsly", text: "For podcasts, I keep your show notes attached to the actual recording session.", delay: 800 },
    { id: "p3", sender: "quipsly", text: "While you record, I can track topics and mark soundbites. Later, I'll help you extract those moments into shareable quotes and clips for Patreon.", delay: 1500 }
  ],
  publishing: [
    { id: "pub1", sender: "user", text: "Can you help me publish my work?" },
    { id: "pub2", sender: "quipsly", text: "Absolutely. I can generate Publishing Packets tailored for any platform.", delay: 800 },
    { id: "pub3", sender: "quipsly", text: "Whether it's a living scroll, an interactive course, or beautiful quote cards for QuipLore, I'll organize the assets so you can just hit 'Publish'.", delay: 1500 }
  ]
};

export function MarketingQuipslyDemo() {
  const [messages, setMessages] = useState<Message[]>(SCRIPT.intro);
  const [isTyping, setIsTyping] = useState(false);
  const [showOptions, setShowOptions] = useState(true);

  const handleOptionSelect = async (key: keyof typeof SCRIPT) => {
    setShowOptions(false);
    const sequence = SCRIPT[key];
    
    // Add user message immediately
    setMessages(prev => [...prev, sequence[0]]);
    
    // Play back Quipsly responses with delays
    for (let i = 1; i < sequence.length; i++) {
      setIsTyping(true);
      await new Promise(resolve => setTimeout(resolve, sequence[i].delay || 1000));
      setIsTyping(false);
      setMessages(prev => [...prev, sequence[i]]);
    }
    
    setShowOptions(true);
  };

  const reset = () => {
    setMessages(SCRIPT.intro);
    setShowOptions(true);
  };

  return (
    <div className="w-full max-w-2xl mx-auto rounded-[2rem] border border-[#e8d0b5] bg-white shadow-xl overflow-hidden font-sans my-16">
      <div className="bg-[#fffaf1] border-b border-[#e8d0b5] p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/quipsly-app-icon.png" alt="Quipsly Avatar" className="w-10 h-10 rounded-xl shadow-sm border border-[#e8d0b5]" />
          <div>
            <h3 className="font-bold text-[#3d2618]">Quipsly Demo</h3>
            <p className="text-xs text-[#8c552e] uppercase tracking-wider font-black">Interactive</p>
          </div>
        </div>
        <button onClick={reset} className="p-2 hover:bg-[#fae0b8] rounded-full transition-colors text-[#a96735]" title="Restart Demo">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
      
      <div className="p-6 h-[400px] flex flex-col justify-end bg-[#fdfaf6] relative">
        <div className="overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-[#e8d0b5]">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2`}>
              <div className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                m.sender === "user" 
                  ? "bg-[#8c552e] text-white rounded-br-sm" 
                  : "bg-white border border-[#e8d0b5] text-[#3d2618] rounded-bl-sm shadow-sm"
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start animate-in fade-in">
              <div className="bg-white border border-[#e8d0b5] rounded-2xl rounded-bl-sm px-5 py-3 shadow-sm flex gap-1 items-center h-12">
                <div className="w-2 h-2 rounded-full bg-[#d8b98e] animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-[#d8b98e] animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-[#d8b98e] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 bg-white border-t border-[#e8d0b5]">
        {showOptions ? (
          <div className="grid gap-2 sm:grid-cols-2 animate-in fade-in slide-in-from-bottom-2">
            <button 
              onClick={() => handleOptionSelect("research")}
              className="flex items-center gap-2 text-left p-3 rounded-xl border border-[#e8d0b5] hover:border-[#a96735] hover:bg-[#fffaf1] transition-colors text-sm text-[#3d2618] font-medium"
            >
              <Library className="w-4 h-4 text-[#a96735]" />
              Research Packets
            </button>
            <button 
              onClick={() => handleOptionSelect("video")}
              className="flex items-center gap-2 text-left p-3 rounded-xl border border-[#e8d0b5] hover:border-[#a96735] hover:bg-[#fffaf1] transition-colors text-sm text-[#3d2618] font-medium"
            >
              <FileVideo className="w-4 h-4 text-[#a96735]" />
              Video Sync
            </button>
            <button 
              onClick={() => handleOptionSelect("podcast")}
              className="flex items-center gap-2 text-left p-3 rounded-xl border border-[#e8d0b5] hover:border-[#a96735] hover:bg-[#fffaf1] transition-colors text-sm text-[#3d2618] font-medium"
            >
              <Sparkles className="w-4 h-4 text-[#a96735]" />
              Podcast Prep
            </button>
            <button 
              onClick={() => handleOptionSelect("publishing")}
              className="flex items-center gap-2 text-left p-3 rounded-xl border border-[#e8d0b5] hover:border-[#a96735] hover:bg-[#fffaf1] transition-colors text-sm text-[#3d2618] font-medium"
            >
              <BookOpen className="w-4 h-4 text-[#a96735]" />
              Publishing Packets
            </button>
          </div>
        ) : (
          <div className="h-[60px] flex items-center justify-center text-[#8c552e] text-sm">
            <Sparkles className="w-4 h-4 animate-pulse mr-2" />
            Quipsly is answering...
          </div>
        )}
      </div>
    </div>
  );
}
