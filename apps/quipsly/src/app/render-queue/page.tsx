"use client";

import { useState, useEffect, useRef } from "react";
import { Layers, PlayCircle, Loader2, CheckCircle2, Film } from "lucide-react";

type RenderJob = {
  id: string;
  name: string;
  status: "pending" | "downloading_assets" | "stitching_insv" | "rendering" | "completed" | "error";
  progress: number;
};

export default function RenderQueue() {
  const [jobs, setJobs] = useState<RenderJob[]>([
    { id: "mock_1", name: "The AI Revolution (Final Cut)", status: "pending", progress: 0 }
  ]);
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
      if (type === "RENDER_PROGRESS") {
        // Merge the engine jobs with our pending mock jobs
        setJobs((current) => {
           const newJobs = [...current];
           payload.forEach((engineJob: RenderJob) => {
             const idx = newJobs.findIndex(j => j.name === engineJob.name || j.id === engineJob.id);
             if (idx >= 0) newJobs[idx] = engineJob;
             else newJobs.push(engineJob);
           });
           return newJobs;
        });
      }
    };

    ws.current.onclose = () => setIsConnected(false);

    return () => ws.current?.close();
  }, []);

  const startRender = (job: RenderJob) => {
    ws.current?.send(JSON.stringify({
      type: "START_RENDER",
      // Mock EDL payload for the prototype
      payload: { outputName: job.name, edl: {} }
    }));
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden p-8">
      <header className="mb-8 flex justify-between items-end border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-widest text-emerald-500 flex items-center gap-3">
            <Layers className="w-8 h-8" />
            Render Queue Command Center
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
            <p className="text-zinc-400 text-sm">
              {isConnected ? "Connected to Local Engine (M4 Hardware)" : "Local Engine Offline"}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto max-w-5xl mx-auto w-full">
        <div className="space-y-4">
          {jobs.length === 0 && (
            <div className="text-zinc-500 italic text-sm p-4 bg-zinc-900 rounded-xl border border-zinc-800 text-center">
              The queue is empty. Export an EDL from the NLE to begin.
            </div>
          )}
          
          {jobs.map((job) => (
            <div key={job.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-xl flex items-center gap-8 transition-all hover:border-zinc-700">
              
              <div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700">
                <Film className="w-8 h-8 text-blue-400" />
              </div>

              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">{job.name}</h3>
                <div className="flex items-center gap-3 text-xs font-bold uppercase">
                  <span className={`px-3 py-1 rounded-full ${
                    job.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                    job.status === 'stitching_insv' ? 'bg-purple-500/20 text-purple-400' :
                    job.status === 'pending' ? 'bg-zinc-800 text-zinc-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {job.status.replace("_", " ")}
                  </span>
                  {(job.status === 'rendering' || job.status === 'downloading_assets' || job.status === 'stitching_insv') && (
                    <span className="font-mono text-blue-400 flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {job.progress}%
                    </span>
                  )}
                </div>

                {(job.status === 'rendering' || job.status === 'downloading_assets' || job.status === 'stitching_insv') && (
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden mt-4">
                    <div 
                      className={`h-full transition-all duration-300 ${job.status === 'stitching_insv' ? 'bg-purple-500' : 'bg-blue-500'}`} 
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                )}
              </div>

              <div>
                {job.status === "pending" && (
                  <button
                    onClick={() => startRender(job)}
                    disabled={!isConnected}
                    className="px-6 py-3 font-bold bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <PlayCircle className="w-5 h-5" />
                    START RENDER
                  </button>
                )}
                
                {job.status === "completed" && (
                  <div className="px-6 py-3 font-bold text-emerald-500 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    BURN COMPLETE
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
