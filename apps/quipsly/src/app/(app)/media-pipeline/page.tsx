"use client";

import { useState } from "react";
import { scanDirectory, organizeMedia } from "./actions";

type MediaFile = {
  name: string;
  sourcePath: string;
  type: "video" | "photo" | "audio" | "unknown";
  sizeMb: string;
  proposedDestination: string;
  status?: string;
};

export default function MediaPipeline() {
  const [sourcePath, setSourcePath] = useState("/Users/wall-e/Ingest");
  const [destPath, setDestPath] = useState("/Users/wall-e/MediaLibrary");
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isDryRun, setIsDryRun] = useState(true);

  const handleScan = async () => {
    setIsScanning(true);
    const result = await scanDirectory(sourcePath, destPath);
    if (result.success && result.files) {
      setFiles(result.files);
    } else {
      alert("Error scanning directory: " + result.error);
    }
    setIsScanning(false);
  };

  const handleOrganize = async () => {
    setIsOrganizing(true);
    const result = await organizeMedia(files, isDryRun);
    if (result.success && result.results) {
      setFiles(result.results);
      if (!isDryRun) {
        alert("Files successfully moved!");
      }
    }
    setIsOrganizing(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-zinc-800 pb-6">
          <h1 className="text-4xl font-bold text-orange-500 mb-2">Local Media Pipeline</h1>
          <p className="text-zinc-400">Bulk ingest, tag, and organize files across your hard drives.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800">
            <label className="block text-sm font-bold text-zinc-400 mb-2">Source Path (e.g. SD Card)</label>
            <input 
              type="text" 
              value={sourcePath} 
              onChange={(e) => setSourcePath(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-4 py-2 text-white"
            />
          </div>
          <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800">
            <label className="block text-sm font-bold text-zinc-400 mb-2">Destination Library</label>
            <input 
              type="text" 
              value={destPath} 
              onChange={(e) => setDestPath(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-4 py-2 text-white"
            />
          </div>
        </div>

        <div className="flex gap-4 mb-8">
          <button 
            onClick={handleScan}
            disabled={isScanning}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold"
          >
            {isScanning ? "Scanning..." : "Scan Source Directory"}
          </button>
          
          <div className="flex items-center gap-2 bg-zinc-900 px-4 rounded-lg border border-zinc-800">
            <input 
              type="checkbox" 
              id="dryRun" 
              checked={isDryRun} 
              onChange={(e) => setIsDryRun(e.target.checked)} 
              className="w-5 h-5"
            />
            <label htmlFor="dryRun" className="font-bold text-orange-400">Dry Run (Preview Only)</label>
          </div>

          <button 
            onClick={handleOrganize}
            disabled={isOrganizing || files.length === 0}
            className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-lg font-bold disabled:opacity-50"
          >
            {isOrganizing ? "Organizing..." : "Execute Bulk Organization"}
          </button>
        </div>

        {/* Visual Grid */}
        {files.length > 0 && (
          <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800">
            <h2 className="text-xl font-bold mb-4">Proposed File Moves ({files.length} files)</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {files.map((file, idx) => (
                <div key={idx} className="bg-zinc-950 p-4 rounded border border-zinc-800 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-blue-400 truncate w-2/3" title={file.name}>{file.name}</span>
                    <span className="text-xs bg-zinc-800 px-2 py-1 rounded uppercase">{file.type}</span>
                  </div>
                  <div className="text-sm text-zinc-400">
                    <p><span className="text-zinc-500">From:</span> {file.sourcePath}</p>
                    <p className="text-green-400"><span className="text-zinc-500">To:</span> {file.proposedDestination}</p>
                  </div>
                  {file.status && (
                    <div className={`mt-2 text-xs font-bold px-2 py-1 inline-block rounded w-max ${file.status === 'success' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
                      Status: {file.status} {isDryRun ? "(Preview)" : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
