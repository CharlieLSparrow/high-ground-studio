import React, { useState, useEffect } from "react";
import { Mic, DollarSign, Clock, CheckCircle2, Play, Square, FastForward } from "lucide-react";
import { Block } from "../../Tagger";

export default function SponsorAdCard({ block }: { block: Block }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const targetDuration = 60; // 60 seconds ad read
  
  const sponsorMatch = block.text.match(/Sponsor:\s*(.+)/i);
  const sponsor = sponsorMatch ? sponsorMatch[1].trim() : "Premium Sponsor";

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const progress = Math.min((elapsed / targetDuration) * 100, 100);
  const isOvertime = elapsed > targetDuration;

  return (
    <div className="my-6 rounded-2xl border-2 border-emerald-200 bg-white overflow-hidden shadow-sm relative group">
      <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
      
      <div className="p-5 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
              <DollarSign size={12} /> Live Ad Read
            </span>
            <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Clock size={12} /> Target: 60s
            </span>
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            {sponsor}
          </h3>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            "We are thrilled to partner with {sponsor} to bring you this episode. They offer the best..."
          </p>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 w-full md:w-64 shrink-0 flex flex-col items-center">
          <div className={`text-4xl font-mono font-black tracking-tighter mb-2 ${isOvertime ? 'text-rose-500' : 'text-gray-800'}`}>
            00:{elapsed.toString().padStart(2, '0')}
          </div>
          
          <div className="w-full h-2 bg-gray-200 rounded-full mb-4 overflow-hidden relative">
            <div 
              className={`absolute top-0 left-0 h-full transition-all duration-1000 ease-linear ${isOvertime ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="flex items-center gap-2 w-full">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm transition-colors ${
                isPlaying 
                  ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' 
                  : 'bg-gray-800 text-white hover:bg-gray-900'
              }`}
            >
              {isPlaying ? <><Square size={16} /> Stop</> : <><Play size={16} /> Start Read</>}
            </button>
            <button 
              onClick={() => { setIsPlaying(false); setElapsed(0); }}
              className="p-2 text-gray-500 hover:text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
              title="Reset timer"
            >
              <FastForward size={16} />
            </button>
          </div>
        </div>
      </div>
      
      <div className="bg-emerald-50/50 border-t border-emerald-100 p-3 px-5 flex items-center justify-between">
        <div className="text-xs font-medium text-emerald-800 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-600" />
          Talking points verified
        </div>
        <button className="text-xs font-bold text-emerald-700 hover:text-emerald-900">
          View Full Copy &rarr;
        </button>
      </div>
    </div>
  );
}
