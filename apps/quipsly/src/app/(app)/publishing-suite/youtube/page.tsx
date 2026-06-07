"use client";

import { useState, useMemo } from "react";
import { Youtube, UploadCloud, CheckCircle2, AlertCircle, Link as LinkIcon, Edit3, Type, Hash, ListOrdered, Lock, Globe, Users, Captions, Download } from "lucide-react";

export default function YouTubeDraftDesk() {
  const [connected, setConnected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [metadata, setMetadata] = useState({
    title: "High Ground Odyssey - The Framework",
    description: "In this episode, we break down the core framework of the High Ground Odyssey.\n\n00:00 Intro\n01:15 The Core Problem\n05:30 Solution Architecture\n12:45 Live Demo\n20:00 Conclusion",
    tags: "high ground, architecture, demo, quipsly",
    privacy: "unlisted"
  });

  const [srt, setSrt] = useState("");

  const isTitleValid = metadata.title.length > 0 && metadata.title.length <= 100;
  const isDescValid = metadata.description.length <= 5000;
  const isTagsValid = metadata.tags.length <= 500;
  const isValid = isTitleValid && isDescValid && isTagsValid;

  const handleGenerateSrt = () => {
    // Generate mock SRT based on the chapters in the description
    const lines = metadata.description.split("\n");
    let srtOutput = "";
    let counter = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(/^(\d{2}:\d{2})\s+(.+)$/);
      if (match) {
        const time = match[1];
        const text = match[2];
        const nextMatch = i + 1 < lines.length ? lines[i+1].match(/^(\d{2}:\d{2})\s+/) : null;
        const endTime = nextMatch ? nextMatch[1] : `${time.split(":")[0]}:${parseInt(time.split(":")[1]) + 5}`;

        srtOutput += `${counter}\n00:${time},000 --> 00:${endTime},000\n${text}\n\n`;
        counter++;
      }
    }
    setSrt(srtOutput || "1\n00:00:00,000 --> 00:00:05,000\n[No chapters found to convert]\n\n");
  };

  const handleDownloadSrt = () => {
    if (!srt) return;
    const blob = new Blob([srt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'captions.srt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleConnect = () => {
    setConnected(true);
  };

  const handleUpload = () => {
    setUploading(true);
    let current = 0;
    const interval = setInterval(() => {
      current += 10;
      setProgress(current);
      if (current >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setUploading(false);
          setProgress(0);
          alert("Mock upload to YouTube Data API complete!");
        }, 500);
      }
    }, 400);
  };

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex items-center gap-3 mb-8 border-b border-[#e8dcc4] pb-6">
        <div className="p-3 bg-red-100 rounded-xl">
          <Youtube className="w-8 h-8 text-red-600" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-[#3d3122]">YouTube Draft Desk</h1>
          <p className="text-[#8c6b4a] font-medium mt-1">Assemble metadata, sync chapters, and upload directly to YouTube Data API v3.</p>
        </div>
      </div>

      {!connected ? (
        <div className="bg-white border border-[#e8dcc4] rounded-2xl p-12 text-center shadow-sm">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <LinkIcon className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-[#3d3122] mb-3">Connect your YouTube Channel</h2>
          <p className="text-[#8c6b4a] max-w-md mx-auto mb-8">
            Quipsly needs permission to manage your YouTube videos. We use the official Google OAuth flow to securely push your rendered episodes.
          </p>
          <button
            onClick={handleConnect}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 mx-auto"
          >
            <Youtube className="w-5 h-5" />
            Connect with Google
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-[#e8dcc4] rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#3d3122] mb-6 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-red-600" />
                Video Metadata
              </h2>

              <div className="space-y-5">
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-[#8c6b4a] uppercase mb-2">
                    <Type className="w-4 h-4" /> Video Title
                  </label>
                  <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => setMetadata({...metadata, title: e.target.value})}
                    className={`w-full p-3 bg-gray-50 border rounded-xl focus:ring-2 outline-none text-[#3d3122] font-medium ${!isTitleValid ? 'border-red-400 focus:ring-red-500' : 'border-[#e8dcc4] focus:ring-amber-500'}`}
                  />
                  <div className="flex justify-between mt-1">
                    <span className={`text-[10px] ${!isTitleValid ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                      {!isTitleValid ? 'Title must be between 1 and 100 characters.' : 'Keep it catchy.'}
                    </span>
                    <span className={`text-[10px] ${metadata.title.length > 100 ? 'text-red-500 font-bold' : metadata.title.length > 80 ? 'text-orange-500' : 'text-gray-400'}`}>
                      {metadata.title.length}/100
                    </span>
                  </div>
                </div>

                <div>
                  <label className="flex items-center justify-between text-xs font-bold text-[#8c6b4a] uppercase mb-2">
                    <div className="flex items-center gap-2"><ListOrdered className="w-4 h-4" /> Description & Chapters</div>
                    <span className={`text-[10px] normal-case ${!isDescValid ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                      {metadata.description.length}/5000
                    </span>
                  </label>
                  <textarea
                    value={metadata.description}
                    onChange={(e) => setMetadata({...metadata, description: e.target.value})}
                    rows={8}
                    className={`w-full p-3 bg-gray-50 border rounded-xl focus:ring-2 outline-none text-[#3d3122] font-mono text-sm leading-relaxed ${!isDescValid ? 'border-red-400 focus:ring-red-500' : 'border-[#e8dcc4] focus:ring-amber-500'}`}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    YouTube will automatically parse timestamps (e.g. 00:00) into Video Chapters.
                  </p>
                </div>

                <div>
                  <label className="flex items-center justify-between text-xs font-bold text-[#8c6b4a] uppercase mb-2">
                    <div className="flex items-center gap-2"><Hash className="w-4 h-4" /> Tags</div>
                    <span className={`text-[10px] normal-case ${!isTagsValid ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                      {metadata.tags.length}/500
                    </span>
                  </label>
                  <input
                    type="text"
                    value={metadata.tags}
                    onChange={(e) => setMetadata({...metadata, tags: e.target.value})}
                    className={`w-full p-3 bg-gray-50 border rounded-xl focus:ring-2 outline-none text-[#3d3122] ${!isTagsValid ? 'border-red-400 focus:ring-red-500' : 'border-[#e8dcc4] focus:ring-amber-500'}`}
                    placeholder="Comma separated tags"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#e8dcc4] rounded-2xl p-6 shadow-sm mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#3d3122] flex items-center gap-2">
                  <Captions className="w-5 h-5 text-blue-600" />
                  Closed Captions (.srt)
                </h2>
                {srt && (
                  <button onClick={handleDownloadSrt} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Download .srt file">
                    <Download className="w-5 h-5" />
                  </button>
                )}
              </div>

              <p className="text-sm text-[#8c6b4a] mb-4">
                Generate proper SubRip Subtitle files based on your transcript segments. You can upload this directly to YouTube Studio.
              </p>

              {!srt ? (
                <button onClick={handleGenerateSrt} className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg transition-colors border border-blue-200">
                  Generate Subtitles
                </button>
              ) : (
                <textarea
                  value={srt}
                  onChange={(e) => setSrt(e.target.value)}
                  rows={6}
                  className="w-full p-3 bg-[#f8fafc] border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-[#1e293b] font-mono text-xs leading-relaxed"
                />
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Channel Status</h3>
              <p className="text-lg font-black text-[#3d3122]">Homer's Odyssey</p>
              <p className="text-sm text-gray-500 mt-1">12,403 Subscribers</p>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">API Quota</span>
                  <span className="font-bold text-green-600">Healthy</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#e8dcc4] rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Visibility Settings</h3>

              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="radio" name="privacy" checked={metadata.privacy === 'public'} onChange={() => setMetadata({...metadata, privacy: 'public'})} className="text-red-600 focus:ring-red-500" />
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-sm text-[#3d3122]"><Globe className="w-4 h-4" /> Public</div>
                    <p className="text-[10px] text-gray-500">Anyone can search for and view</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border border-blue-200 bg-blue-50/50 rounded-xl cursor-pointer transition-colors">
                  <input type="radio" name="privacy" checked={metadata.privacy === 'unlisted'} onChange={() => setMetadata({...metadata, privacy: 'unlisted'})} className="text-blue-600 focus:ring-blue-500" />
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-sm text-blue-900"><Users className="w-4 h-4" /> Unlisted</div>
                    <p className="text-[10px] text-blue-700">Anyone with the link can view</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="radio" name="privacy" checked={metadata.privacy === 'private'} onChange={() => setMetadata({...metadata, privacy: 'private'})} className="text-red-600 focus:ring-red-500" />
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-sm text-[#3d3122]"><Lock className="w-4 h-4" /> Private</div>
                    <p className="text-[10px] text-gray-500">Only you can view</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider mb-2">Publish Sequence</h3>
              <p className="text-xs text-red-600/80 mb-6">
                This will trigger the render queue to finalize the composition, encode the mp4, and stream it to the YouTube Data API.
              </p>

              <button
                onClick={handleUpload}
                disabled={uploading || !isValid}
                className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <UploadCloud className="w-5 h-5 animate-pulse" />
                    Uploading ({progress}%)
                  </>
                ) : !isValid ? (
                  <>
                    <AlertCircle className="w-5 h-5" />
                    Fix Errors to Publish
                  </>
                ) : (
                  <>
                    <Youtube className="w-5 h-5" />
                    Push to YouTube
                  </>
                )}
              </button>

              {uploading && (
                <div className="w-full bg-red-200 rounded-full h-1.5 mt-4 overflow-hidden">
                  <div className="bg-red-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
