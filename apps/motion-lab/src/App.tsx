// @ts-nocheck
import React, { useRef, useState, useEffect } from "react";

// Mock Timeline Data (Hormozi style fast captions)
type GraphicBlock = {
  id: string;
  type: "text" | "image";
  startTime: number; // in seconds
  endTime: number;
  content: string;
  style?: React.CSSProperties;
};

const MOCK_GEMINI_RESPONSE: GraphicBlock[] = [
  { id: "g1", type: "text", startTime: 1.0, endTime: 2.2, content: "THE AI TONIGHT SHOW", style: { fontSize: "4rem", color: "#FFD700", fontWeight: 900, textTransform: "uppercase", backgroundColor: "#000", padding: "10px", textShadow: "4px 4px 0px #000" } },
  { id: "g2", type: "text", startTime: 2.2, endTime: 3.5, content: "IS NOW LIVE", style: { fontSize: "5rem", color: "#00FFDD", fontWeight: 900, textTransform: "uppercase", textShadow: "4px 4px 0px #000" } },
  { id: "g3", type: "text", startTime: 3.5, endTime: 5.5, content: "Starring Wall-E", style: { fontSize: "3rem", color: "#FFF", fontWeight: 800, textShadow: "2px 2px 0px #000", transform: "rotate(-2deg)" } },
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeline, setTimeline] = useState<GraphicBlock[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Mock Gemini Call
  const handleAutoCaption = async () => {
    setIsGenerating(true);
    // Simulate network delay for API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    setTimeline(MOCK_GEMINI_RESPONSE);
    setIsGenerating(false);
  };

  // The Sync Engine
  useEffect(() => {
    let animationFrameId: number;
    
    const loop = () => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(loop);
    } else if (videoRef.current) {
      // update one last time when paused
      setCurrentTime(videoRef.current.currentTime);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Find active blocks based on precise currentTime
  const activeBlocks = timeline.filter(block => currentTime >= block.startTime && currentTime <= block.endTime);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col p-8">
      
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white">Motion Lab: Graphics Engine</h1>
          <p className="text-zinc-400">Vertical Video Text & Overlay Composer</p>
        </div>
        <button 
          onClick={handleAutoCaption}
          disabled={isGenerating || timeline.length > 0}
          className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(147,51,234,0.5)] transition-all disabled:opacity-50"
        >
          {isGenerating ? "Analyzing Audio..." : "✨ Auto-Caption with Gemini"}
        </button>
      </header>

      <div className="flex gap-8 flex-1">
        
        {/* The Composition Canvas (9:16 Aspect Ratio) */}
        <div className="relative w-[360px] h-[640px] bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex-shrink-0 mx-auto">
          
          {/* Base Video Layer */}
          {/* Using a placeholder stock video url for demo purposes */}
          <video 
            ref={videoRef}
            src="https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" 
            className="w-full h-full object-cover"
            playsInline
            loop
            muted
          />

          {/* Graphics Overlay Layer (Absolute Positioned DOM) */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8 text-center">
            {activeBlocks.map(block => (
              <div 
                key={block.id} 
                className="transition-transform duration-75 animate-popIn"
                style={block.style}
              >
                {block.content}
              </div>
            ))}
          </div>

        </div>

        {/* The Timeline Editor */}
        <div className="flex-1 flex flex-col">
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex-1 flex flex-col">
            <h2 className="text-xl font-bold mb-4">Timeline Controls</h2>
            
            <div className="flex items-center gap-4 mb-8">
              <button 
                onClick={togglePlay}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded font-bold w-32"
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <div className="text-2xl font-mono text-zinc-300 bg-black px-4 py-2 rounded">
                {currentTime.toFixed(2)}s
              </div>
            </div>

            {/* Visual Timeline Tracks */}
            <div className="flex-1 bg-black rounded-lg border border-zinc-800 p-4 overflow-x-auto relative">
              <div className="w-[2000px] h-full relative">
                
                {/* Time markers (Seconds) */}
                <div className="h-6 border-b border-zinc-800 flex text-xs text-zinc-500 font-mono">
                  {[...Array(20)].map((_, i) => (
                    <div key={i} className="flex-none border-l border-zinc-800 pl-1" style={{ width: '100px' }}>
                      {i}s
                    </div>
                  ))}
                </div>

                {/* Tracks */}
                <div className="mt-4 relative h-16 bg-zinc-900 rounded">
                  <div className="absolute left-0 top-0 bottom-0 w-24 bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 border-r border-zinc-700 z-10">
                    TEXT V1
                  </div>
                  
                  {/* Blocks rendered dynamically based on start/end times (100px = 1 second) */}
                  {timeline.map(block => (
                    <div 
                      key={block.id}
                      className="absolute top-2 bottom-2 bg-blue-600 rounded flex items-center px-2 text-xs font-bold truncate border border-blue-400 shadow-lg cursor-pointer hover:bg-blue-500 transition-colors"
                      style={{ 
                        left: (100 + (block.startTime * 100)) + "px", 
                        width: ((block.endTime - block.startTime) * 100) + "px" 
                      }}
                    >
                      {block.content}
                    </div>
                  ))}
                </div>

                {/* Playhead indicator */}
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none transition-all duration-75"
                  style={{ left: (100 + (currentTime * 100)) + "px" }}
                >
                  <div className="absolute -top-2 -left-1.5 w-3.5 h-3.5 bg-red-500 rotate-45"></div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
