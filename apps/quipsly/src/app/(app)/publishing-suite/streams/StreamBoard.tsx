"use client";

import React, { useState, useEffect } from "react";

interface StreamConfig {
  id: string;
  platform: "x_twitter" | "youtube_v3";
  query: string;
  type: "hashtag" | "mentions" | "keywords";
}

const DEFAULT_STREAMS: StreamConfig[] = [
  { id: "1", platform: "x_twitter", query: "@quipsly", type: "mentions" },
  { id: "2", platform: "x_twitter", query: "#TechNews", type: "hashtag" },
  { id: "3", platform: "youtube_v3", query: "Quipsly Review", type: "keywords" },
];

function generateMockItems(query: string, platform: string) {
  return Array.from({ length: 15 }).map((_, i) => ({
    id: `${query}-${i}-${Date.now()}`,
    author: platform === "x_twitter" ? `@User${Math.floor(Math.random() * 1000)}` : `Channel ${Math.floor(Math.random() * 100)}`,
    text: `This is an automated mock post matching "${query}" on ${platform}. Looks great! #${Math.floor(Math.random() * 100)}`,
    time: `${Math.floor(Math.random() * 59) + 1}m ago`
  }));
}

export function StreamBoard() {
  const [streams, setStreams] = useState<StreamConfig[]>([]);
  const [streamData, setStreamData] = useState<Record<string, any[]>>({});

  useEffect(() => {
    // Load from localStorage if present
    const saved = localStorage.getItem("quipsly_streams");
    if (saved) {
      setStreams(JSON.parse(saved));
    } else {
      setStreams(DEFAULT_STREAMS);
    }
  }, []);

  useEffect(() => {
    // Populate mock data
    const newData: Record<string, any[]> = {};
    streams.forEach(s => {
      newData[s.id] = generateMockItems(s.query, s.platform);
    });
    setStreamData(newData);
  }, [streams]);

  const addStream = () => {
    const newStream: StreamConfig = {
      id: Date.now().toString(),
      platform: "x_twitter",
      query: "New Stream",
      type: "keywords"
    };
    const updated = [...streams, newStream];
    setStreams(updated);
    localStorage.setItem("quipsly_streams", JSON.stringify(updated));
  };

  const removeStream = (id: string) => {
    const updated = streams.filter(s => s.id !== id);
    setStreams(updated);
    localStorage.setItem("quipsly_streams", JSON.stringify(updated));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] w-full overflow-hidden bg-gray-100">
      <div className="h-14 bg-white border-b border-gray-200 flex justify-between items-center px-6 shrink-0 z-10 shadow-sm">
        <h1 className="text-xl font-bold text-gray-800 tracking-tight">Listening Streams</h1>
        <button onClick={addStream} className="px-4 py-1.5 bg-gray-900 text-white text-sm font-semibold rounded hover:bg-gray-800 transition-colors">
          + Add Stream
        </button>
      </div>

      {/* Horizontal scrolling board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex space-x-6 items-start hide-scrollbar relative">
        {streams.map(stream => (
          <div key={stream.id} className="w-[350px] shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            
            {/* Stream Header */}
            <div className="p-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${stream.platform === "x_twitter" ? "bg-blue-400" : "bg-red-500"}`}></div>
                <h3 className="font-bold text-gray-900 text-sm truncate max-w-[200px]">{stream.query}</h3>
              </div>
              <div className="flex space-x-2">
                <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">{stream.type}</span>
                <button onClick={() => removeStream(stream.id)} className="text-gray-400 hover:text-red-500 transition-colors">✕</button>
              </div>
            </div>

            {/* Stream Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/30">
              {(streamData[stream.id] || []).map((item: any) => (
                <div key={item.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:border-blue-200 transition-colors cursor-pointer group">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm text-gray-900">{item.author}</span>
                    <span className="text-xs text-gray-400">{item.time}</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-snug">{item.text}</p>
                  
                  <div className="mt-3 flex space-x-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="text-gray-400 hover:text-blue-500 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                    </button>
                    <button className="text-gray-400 hover:text-red-500 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        ))}
        
        {streams.length === 0 && (
          <div className="flex flex-col items-center justify-center w-full h-full text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            <p className="text-lg font-medium">Your stream board is empty.</p>
            <p className="text-sm">Add a stream to start listening to conversations.</p>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
