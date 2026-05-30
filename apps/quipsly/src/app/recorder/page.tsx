"use client";

import { useState, useEffect, useRef } from "react";
import { StudioNav } from "../studio-nav";

export default function RecorderDashboard() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(12).fill(4));
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize camera and mic streams on mount
  useEffect(() => {
    async function startMedia() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: "user" },
          audio: true,
        });
        
        setStream(mediaStream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        // Web Audio API for Mic Visualizer
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        const source = audioCtx.createMediaStreamSource(mediaStream);
        const analyser = audioCtx.createAnalyser();
        
        analyser.fftSize = 32;
        source.connect(analyser);
        
        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const updateLevels = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            
            // Map the frequencies to our 12 visualizer slots
            const newLevels = Array.from({ length: 12 }).map((_, i) => {
              const val = dataArray[i % bufferLength];
              // Map 0-255 to 4px-32px heights
              return Math.max(4, (val / 255) * 32);
            });
            setAudioLevels(newLevels);
          }
          animationFrameRef.current = requestAnimationFrame(updateLevels);
        };
        
        updateLevels();
      } catch (err) {
        console.warn("Camera or microphone access denied, falling back to simulated visuals.", err);
      }
    }

    startMedia();

    return () => {
      // Cleanup streams
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Handle Recording Timer & MediaRecorder
  useEffect(() => {
    if (isRecording) {
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);

      // Initialize media recorder if stream is available
      if (stream) {
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        mediaRecorderRef.current = recorder;
        recorder.start();
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    }
  }, [isRecording, stream]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <StudioNav />
      <main className="flex-1 flex flex-col p-6 relative">
        <header className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white/90">
              Multicam Studio
            </h1>
            <p className="text-zinc-500 font-mono text-sm">
              Local isolated track recording (Riverside parity)
            </p>
          </div>
          
          <div className="flex items-center gap-6">
            {isRecording && (
              <div className="flex items-center gap-2 bg-red-950/50 border border-red-500/30 text-red-500 px-4 py-2 rounded-lg font-mono font-bold animate-pulse text-sm">
                <span className="w-2.5 h-2.5 bg-red-600 rounded-full"></span>
                <span>REC {formatTime(recordSeconds)}</span>
              </div>
            )}
            
            <button 
              onClick={() => setIsRecording(!isRecording)}
              className={`px-8 py-3 rounded text-sm font-black tracking-widest transition-colors ${
                isRecording 
                  ? "bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.6)]" 
                  : "bg-zinc-800 hover:bg-zinc-700 text-white"
              }`}
            >
              {isRecording ? "STOP RECORDING" : "START RECORDING"}
            </button>
          </div>
        </header>

        {/* Studio Viewport */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Local Host Camera */}
          <div className="relative bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden group flex items-center justify-center shadow-xl">
            {stream ? (
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-zinc-800 font-black text-6xl uppercase tracking-widest pointer-events-none">
                HOST FEED
              </div>
            )}
            
            {isRecording && (
              <div className="absolute top-4 right-4 bg-red-600 w-4 h-4 rounded-full animate-bounce shadow-[0_0_10px_rgba(220,38,38,0.8)]"></div>
            )}
            
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 flex justify-between items-end z-10">
              <div>
                <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Local Track (Host)</span>
                <h3 className="font-bold text-lg mt-1.5">Charlie (M4 Mac)</h3>
              </div>
              <div className="flex items-end gap-1 bg-black/40 p-2 rounded-lg backdrop-blur-sm min-h-[40px]">
                {/* Dynamic Web Audio Mic Meter */}
                {audioLevels.map((level, i) => (
                  <div 
                    key={i} 
                    className={`w-1.5 rounded-full transition-all duration-75 ${
                      i < 8 ? 'bg-emerald-500' : i < 10 ? 'bg-yellow-500' : 'bg-red-500'
                    }`} 
                    style={{ height: `${level}px` }}
                  ></div>
                ))}
              </div>
            </div>
          </div>

          {/* Remote Guest Camera */}
          <div className="relative bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex items-center justify-center shadow-xl">
            <div className="absolute inset-0 flex items-center justify-center text-zinc-900 font-black text-4xl uppercase tracking-widest pointer-events-none text-center px-8">
              WAITING FOR GUEST...
            </div>
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA1KSIvPjwvc3ZnPg==')] opacity-50"></div>
            
            <div className="z-10 bg-black/80 backdrop-blur-md p-6 rounded-lg border border-zinc-800 text-center max-w-sm">
              <h3 className="font-bold mb-2">Remote Link Ready</h3>
              <p className="text-xs text-zinc-400 mb-4 font-mono leading-relaxed">Send this secure WebRTC invite link to your guest to start isolated local track recording.</p>
              <div className="flex bg-zinc-950 p-1.5 rounded border border-zinc-800">
                <input 
                  type="text" 
                  readOnly 
                  value="https://studio.highground.com/join/room-alpha" 
                  className="bg-transparent text-xs text-zinc-500 w-full outline-none px-2 select-all"
                />
                <button className="bg-zinc-800 hover:bg-zinc-700 text-xs px-3 py-1.5 rounded font-bold transition-colors select-none">
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

