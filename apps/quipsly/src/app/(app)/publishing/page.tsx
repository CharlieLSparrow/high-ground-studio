"use client";

import { useState, useEffect } from "react";
import { Send, Calendar, Youtube, Instagram, Linkedin, MoreHorizontal, CheckCircle2, Loader2, PlaySquare } from "lucide-react";
import {
  DESTINATION_PUBLICATION_STATUS_LABELS,
  PUBLISH_DESTINATION_LABELS,
  type DestinationPublicationStatus,
  type PublishDestinationSlug,
} from "@high-ground/quipsly-domain/publishing";

const destinationStatuses: Array<{
  destination: PublishDestinationSlug;
  status: DestinationPublicationStatus;
  note: string;
}> = [
  {
    destination: "high-ground-odyssey",
    status: "published",
    note: "Public episode pages come from reviewed packets, not private manuscript state.",
  },
  {
    destination: "youtube",
    status: "packet-ready",
    note: "Video metadata and clip packages can be prepared here before provider push.",
  },
  {
    destination: "podcast-rss",
    status: "queued",
    note: "Podcast packages need audio, show notes, transcript, and episode metadata.",
  },
  {
    destination: "patreon",
    status: "needs-review",
    note: "Supporter posts should be reviewed before publishing or gating.",
  },
];

function statusClass(status: DestinationPublicationStatus) {
  if (status === "published") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "packet-ready" || status === "queued") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "needs-review" || status === "failed") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-[#e8dcc4] bg-[#f8f3e6] text-[#8c6b4a]";
}

type DeploymentState = "idle" | "uploading" | "metadata" | "success";

export default function PublishingCommandCenter() {
  const [activeTab, setActiveTab] = useState<"calendar" | "outbox">("outbox");
  const [deploymentState, setDeploymentState] = useState<DeploymentState>("idle");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (deploymentState === "uploading") {
      const interval = setInterval(() => {
        setProgress((p) => {
          if (p >= 100) {
            clearInterval(interval);
            setTimeout(() => setDeploymentState("metadata"), 500);
            return 100;
          }
          // Simulate bursty network upload
          return p + Math.random() * 15;
        });
      }, 300);
      return () => clearInterval(interval);
    }
    
    if (deploymentState === "metadata") {
      const timer = setTimeout(() => {
        setDeploymentState("success");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [deploymentState]);

  const handlePublishClick = () => {
    if (deploymentState === "idle") {
      setProgress(0);
      setDeploymentState("uploading");
    }
  };

  return (
    <div className="flex flex-col w-full max-w-6xl mx-auto">
      <header className="mb-8 flex justify-between items-end border-b border-[#e8dcc4] pb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#3d3122] flex items-center gap-3">
            <Send className="w-8 h-8 text-amber-600" />
            The Transmitter
          </h1>
          <p className="text-[#8c6b4a] mt-2 font-medium">
            Public-safe packet status for HGO, YouTube, podcast, Patreon, and social outputs.
          </p>
        </div>
        <div className="flex bg-[#f8f3e6] rounded-xl p-1 border border-[#e8dcc4] shadow-sm">
          <button
            onClick={() => setActiveTab("outbox")}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === "outbox" ? "bg-[#8c6b4a] text-white shadow-sm" : "text-[#8c6b4a] hover:text-[#3d3122]"}`}
          >
            Outbox Queue
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === "calendar" ? "bg-[#8c6b4a] text-white shadow-sm" : "text-[#8c6b4a] hover:text-[#3d3122]"}`}
          >
            Content Calendar
          </button>
        </div>
      </header>

      <div className="flex-1 w-full grid grid-cols-12 gap-8">
        {/* Left Sidebar: Connected Accounts */}
        <div className="col-span-3 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#8c6b4a] mb-4">Destination Health</h2>
          <div className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
            <p className="text-xs leading-5 text-[#6b5b45]">
              Publishing starts from approved packets. Each destination tracks its own state so one bad upload does not muddy the source document.
            </p>
          </div>
          <div className="space-y-3">
            {destinationStatuses.map((item) => (
              <div key={item.destination} className="rounded-2xl border border-[#e8dcc4] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-[#3d3122]">{PUBLISH_DESTINATION_LABELS[item.destination]}</p>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClass(item.status)}`}>
                    {DESTINATION_PUBLICATION_STATUS_LABELS[item.status]}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#8c6b4a]">{item.note}</p>
              </div>
            ))}
          </div>

          <h2 className="text-xs font-bold uppercase tracking-widest text-[#8c6b4a] mb-4 pt-4">Connected Accounts</h2>

          <div className="bg-white p-4 rounded-2xl border border-[#e8dcc4] flex items-center gap-4 shadow-sm">
            <Youtube className="w-6 h-6 text-red-500" />
            <div>
              <p className="font-bold text-[#3d3122]">High Ground</p>
              <p className="text-xs text-[#8c6b4a]">Connected</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#e8dcc4] flex items-center gap-4 shadow-sm">
            <Instagram className="w-6 h-6 text-pink-600" />
            <div>
              <p className="font-bold text-[#3d3122]">@highground</p>
              <p className="text-xs text-[#8c6b4a]">Connected</p>
            </div>
          </div>

          <button className="w-full mt-4 py-3 bg-[#f8f3e6] hover:bg-[#ebdcc8] text-[#8c6b4a] hover:text-[#3d3122] rounded-xl text-sm font-bold transition-all border border-dashed border-[#e8dcc4]">
            + Connect New Account
          </button>
        </div>

        {/* Main Feed: Post Queue */}
        <div className="col-span-9 space-y-6">

          {/* Post Card */}
          <div className={`bg-white rounded-2xl border ${deploymentState === "success" ? "border-emerald-300 shadow-md bg-emerald-50/20" : "border-[#e8dcc4] shadow-sm"} overflow-hidden transition-all duration-500 hover:shadow-md`}>
            <div className={`p-4 border-b flex justify-between items-center transition-colors ${deploymentState === "success" ? "border-emerald-200 bg-emerald-100/30" : "border-[#e8dcc4] bg-[#fdfaf6]"}`}>
               <div className="flex items-center gap-3">
                 <Youtube className="w-5 h-5 text-red-500" />
                 <span className="font-bold text-sm text-[#3d3122]">YouTube Shorts</span>
                 {deploymentState === "idle" && (
                   <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider">Scheduled</span>
                 )}
                 {deploymentState !== "idle" && deploymentState !== "success" && (
                   <span className="px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                     <Loader2 className="w-3 h-3 animate-spin" /> Deploying
                   </span>
                 )}
                 {deploymentState === "success" && (
                   <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                     <CheckCircle2 className="w-3 h-3" /> Published
                   </span>
                 )}
               </div>
               <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 text-[#8c6b4a] text-sm font-mono font-medium">
                   <Calendar className="w-4 h-4" />
                   Tomorrow, 10:00 AM
                 </div>
                 <button className="text-[#8c6b4a] hover:text-[#3d3122] transition-colors">
                   <MoreHorizontal className="w-5 h-5" />
                 </button>
               </div>
            </div>

            <div className="p-6 flex gap-6">
              <div className="w-32 h-48 bg-[#1a1a1a] rounded-xl overflow-hidden relative border border-[#e8dcc4] flex items-center justify-center group cursor-pointer">
                 <PlaySquare className="w-10 h-10 text-white/50 group-hover:text-white transition-colors" />
                 <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                   <span className="text-white font-mono text-[10px]">00:45</span>
                 </div>
              </div>
              <div className="flex-1 space-y-4">
                <p className="text-[#5e4b33] text-sm leading-relaxed font-medium">
                  Have you ever wondered why traditional productivity systems fail? It's not you, it's the tools.
                  In this short, we break down why the OneNote methodology works for non-linear thinkers.
                  <br/><br/>
                  <span className="text-amber-600">#productivity #adhd #software</span>
                </p>

                {/* Interactive Deployment Console */}
                <div className={`mt-4 rounded-xl border transition-all duration-500 overflow-hidden ${deploymentState !== "idle" ? "h-auto border-[#e8dcc4] bg-[#fdfaf6] opacity-100" : "h-0 border-transparent opacity-0"}`}>
                  <div className="p-4 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#8c6b4a]">Deployment Console</h3>
                    
                    {/* Progress Track 1: Video Upload */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="flex items-center gap-2">
                          {progress >= 100 ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                          Uploading 4K ProRes (1.2GB)
                        </span>
                        <span className="text-[#8c6b4a]">{Math.min(100, Math.floor(progress))}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-[#e8dcc4] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out" 
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                      </div>
                    </div>

                    {/* Progress Track 2: API Handshake */}
                    <div className={`space-y-1.5 transition-all duration-500 ${deploymentState === "metadata" || deploymentState === "success" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="flex items-center gap-2">
                          {deploymentState === "success" ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Loader2 className="w-3 h-3 animate-spin text-amber-500" />}
                          Syncing YouTube Metadata & Tags
                        </span>
                        <span className="text-[#8c6b4a]">{deploymentState === "success" ? "Done" : "Waiting"}</span>
                      </div>
                    </div>

                  </div>
                </div>

                <div className="pt-4 border-t border-[#e8dcc4] flex gap-3">
                  <button 
                    disabled={deploymentState !== "idle"} 
                    className="px-4 py-2 bg-[#f8f3e6] hover:bg-[#ebdcc8] text-[#8c6b4a] hover:text-[#3d3122] rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Edit Post
                  </button>
                  {deploymentState === "idle" && (
                    <button 
                      onClick={handlePublishClick}
                      className="px-4 py-2 bg-amber-600 text-white hover:bg-amber-700 rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                      Publish Now
                    </button>
                  )}
                  {deploymentState === "success" && (
                    <a 
                      href="https://youtube.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-2"
                    >
                      <Youtube className="w-4 h-4" /> View on YouTube
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
