"use client";

import { useState, useEffect, useRef } from "react";
import { HardDrive, CloudUpload, Video, CheckCircle2, PlayCircle, Loader2 } from "lucide-react";

type IngestJob = {
  id: string;
  filename: string;
  status: "pending" | "proxy_generating" | "uploading_raw" | "completed" | "error";
  proxyProgress: number;
  uploadProgress: number;
};

export default function IngestTracker() {
  const [sdCards, setSdCards] = useState([{ name: "Bender", path: "/Volumes/Bender/DCIM", size: "128 GB" }]);
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to Unified Local Engine Daemon
    ws.current = new WebSocket("ws://localhost:4000");

    ws.current.onopen = () => {
      console.log("Connected to Local Engine");
      setIsConnected(true);
      ws.current?.send(JSON.stringify({ type: "GET_STATUS", payload: {} }));
    };

    ws.current.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data);
      if (type === "INGEST_PROGRESS") {
        setJobs(payload);
        const allDone = payload.length > 0 && payload.every((j: IngestJob) => j.status === "completed" || j.status === "error");
        setIsIngesting(!allDone && payload.length > 0);
      }
    };

    ws.current.onclose = () => setIsConnected(false);

    return () => {
      ws.current?.close();
    };
  }, []);

  const startSmartIngest = () => {
    setIsIngesting(true);
    // Send command to the Local Engine to begin processing the SD card
    ws.current?.send(JSON.stringify({
      type: "START_INGEST",
      payload: { sourceDir: sdCards[0].path }
    }));
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden p-8">
      <header className="mb-8 flex justify-between items-end border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-widest text-emerald-500 flex items-center gap-3">
            <HardDrive className="w-8 h-8" />
            Media Ingest Tracker
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
            <p className="text-zinc-400 text-sm">
              {isConnected ? "Connected to Local Engine Daemon" : "Local Engine Daemon Offline"}
            </p>
          </div>
        </div>
        <button
          onClick={startSmartIngest}
          disabled={isIngesting || !isConnected || (jobs.length > 0 && jobs.every(j => j.status === 'completed'))}
          className="px-6 py-3 font-bold bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg shadow-emerald-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isIngesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
          {isIngesting ? "INGESTING..." : "START SMART INGEST"}
        </button>
      </header>

      <div className="flex gap-8 flex-1 overflow-hidden">
        
        {/* Left Column: SD Cards */}
        <div className="w-1/3 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Detected Storage</h2>
          {sdCards.map((card) => (
            <div key={card.name} className="bg-zinc-900 border border-emerald-500/30 rounded-xl p-6 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110" />
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                    <HardDrive className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{card.name}</h3>
                    <p className="text-xs text-zinc-500 font-mono">{card.path}</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 space-y-2 relative z-10">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Capacity</span>
                  <span>{card.size}</span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                  <div className="h-full bg-emerald-500/50 w-3/4 rounded-full" />
                </div>
                <p className="text-xs text-emerald-500/80 text-right">96 GB Used</p>
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Ingest Queue */}
        <div className="w-2/3 flex flex-col gap-4 overflow-y-auto pr-4 pb-12">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Smart Transfer Queue</h2>
          
          <div className="space-y-4">
            {jobs.length === 0 && (
              <div className="text-zinc-500 italic text-sm p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                Ready to ingest. Click 'Start Smart Ingest' to begin pulling from the SD card.
              </div>
            )}
            {jobs.map((job) => (
              <div key={job.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg flex flex-col gap-4 transition-all hover:border-zinc-700">
                
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Video className="w-5 h-5 text-blue-400" />
                    <span className="font-mono font-bold text-sm">{job.filename}</span>
                  </div>
                  <div className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-zinc-800 text-zinc-400">
                    {job.status.replace("_", " ")}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  {/* Local Proxy Progress */}
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Local Proxy Generation
                      </span>
                      <span className="font-mono">{job.proxyProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300" 
                        style={{ width: `${job.proxyProgress}%` }}
                      />
                    </div>
                  </div>

                  {/* Cloud Upload Progress */}
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <CloudUpload className="w-3 h-3 text-purple-400" />
                        GCS Raw Upload
                      </span>
                      <span className="font-mono">{job.uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 transition-all duration-300" 
                        style={{ width: `${job.uploadProgress}%` }}
                      />
                    </div>
                  </div>
                </div>

                {job.status === "completed" && (
                  <div className="mt-2 text-xs font-bold text-emerald-500 flex items-center gap-1.5 bg-emerald-500/10 self-start px-3 py-1.5 rounded border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4" />
                    Asset Sync Complete. Raw file safely in Cloud.
                  </div>
                )}

              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
