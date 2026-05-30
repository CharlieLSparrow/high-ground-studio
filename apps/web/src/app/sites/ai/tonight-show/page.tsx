"use client";

import { useState, useEffect, useRef } from "react";
import scriptData from "./today-script.json";

type ScriptLine = {
  role: "host" | "sidekick";
  line: string;
};

export default function TonightShowTeleprompter() {
  const [lines, setLines] = useState<ScriptLine[]>(scriptData as ScriptLine[]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load voices for the TTS
    const updateVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      // Try to find a good authoritative voice for the AI host
      const preferred = availableVoices.find(v => v.name.includes("Google UK English Male") || v.name.includes("Samantha") || v.name.includes("Daniel"));
      if (preferred) setSelectedVoice(preferred);
      else if (availableVoices.length > 0) setSelectedVoice(availableVoices[0]);
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to the active line
    if (scrollRef.current) {
      const activeElement = scrollRef.current.querySelector(".active-line");
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [currentIndex]);

  const speakLine = (index: number) => {
    if (index >= lines.length) {
      setIsPlaying(false);
      return;
    }

    setCurrentIndex(index);
    const line = lines[index];

    if (line.role === "host") {
      const utterance = new SpeechSynthesisUtterance(line.line);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      utterance.rate = 1.1; // Slightly fast, intelligent pacing
      utterance.pitch = 1.0;
      
      utterance.onend = () => {
        // When host finishes, we pause for the sidekick to read their line
        if (index + 1 < lines.length && lines[index + 1].role === "sidekick") {
          setCurrentIndex(index + 1);
        } else {
          speakLine(index + 1);
        }
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      // Sidekick line - we wait for the user to manually click "Next" after performing
    }
  };

  const startShow = () => {
    setIsPlaying(true);
    speakLine(0);
  };

  const nextLine = () => {
    window.speechSynthesis.cancel(); // Stop any current TTS
    speakLine(currentIndex + 1);
  };

  return (
    <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center">
      <div className="max-w-4xl w-full">
        
        <header className="flex items-center justify-between border-b border-zinc-800 pb-6 mb-8">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-blue-500">THE AI TONIGHT SHOW</h1>
            <p className="text-zinc-400 mt-2 font-mono uppercase text-sm">Interactive Teleprompter Studio</p>
          </div>

          <div className="flex gap-4">
            {!isPlaying ? (
              <button 
                onClick={startShow}
                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all hover:scale-105"
              >
                Start Broadcast
              </button>
            ) : (
              <button 
                onClick={() => {
                  window.speechSynthesis.cancel();
                  setIsPlaying(false);
                  setCurrentIndex(-1);
                }}
                className="bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-full font-bold"
              >
                Stop Show
              </button>
            )}
          </div>
        </header>

        {/* Teleprompter Scroll Area */}
        <div 
          ref={scrollRef}
          className="bg-zinc-950 rounded-2xl border border-zinc-800 p-8 h-[600px] overflow-y-auto relative shadow-2xl"
        >
          {lines.map((line, idx) => {
            const isActive = idx === currentIndex;
            const isPast = idx < currentIndex;
            const isHost = line.role === "host";

            return (
              <div 
                key={idx} 
                className={`mb-12 transition-all duration-500 ${isActive ? 'opacity-100 scale-100 active-line' : isPast ? 'opacity-30 scale-95' : 'opacity-50 scale-95'} ${isHost ? 'text-left pr-24' : 'text-right pl-24'}`}
              >
                <span className={`text-sm font-bold uppercase tracking-widest mb-2 block ${isHost ? 'text-blue-400' : 'text-orange-400'}`}>
                  {line.role}
                </span>
                <p className={`text-3xl md:text-5xl font-medium leading-tight ${isActive && !isHost ? 'text-white' : 'text-zinc-300'}`}>
                  "{line.line}"
                </p>
                
                {/* Manual Next Button for Sidekick */}
                {isActive && !isHost && (
                  <div className="mt-6 flex justify-end">
                    <button 
                      onClick={nextLine}
                      className="bg-orange-500 hover:bg-orange-400 text-black px-6 py-2 rounded-lg font-bold flex items-center gap-2 animate-pulse"
                    >
                      Next Line <span>→</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
