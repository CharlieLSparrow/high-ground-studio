"use client";

import { useState } from "react";
import Link from "next/link";
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
  const [sourcePath, setSourcePath] = useState("");
  const [destPath, setDestPath] = useState("");
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [message, setMessage] = useState("Local folder ingest is handled by Quipsly Mac + local-engine.");
  const [isScanning, setIsScanning] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isDryRun, setIsDryRun] = useState(true);

  const handleScan = async () => {
    setIsScanning(true);
    const result = await scanDirectory(sourcePath, destPath);
    if (result.success && result.files) {
      setFiles(result.files);
    } else {
      setMessage(result.error || "Local filesystem scanning is disabled in the web app.");
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
    } else {
      setFiles(result.results || files);
      setMessage(result.error || "Use Quipsly Mac/local-engine for local media work.");
    }
    setIsOrganizing(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-zinc-800 pb-6">
          <div className="mb-3 inline-flex rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-orange-300">
            Native handoff required
          </div>
          <h1 className="text-4xl font-bold text-orange-500 mb-2">Media Pipeline</h1>
          <p className="max-w-3xl text-zinc-400">
            The web app no longer pretends it can browse your Mac. Real local ingest belongs to Quipsly Mac and local-engine, where native file pickers, ffmpeg, proxies, upload retries, and user consent actually make sense.
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-5 text-orange-100">
          <h2 className="text-xl font-black">Production workflow</h2>
          <ol className="mt-3 grid gap-2 text-sm leading-6 text-orange-50/90 md:grid-cols-2">
            <li>1. Open Quipsly Mac.</li>
            <li>2. Choose Local Files or Import to Episode.</li>
            <li>3. Probe, proxy, thumbnail, and upload through local-engine.</li>
            <li>4. Attach the registered asset to the Nest or episode editor.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/editor" className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-black text-zinc-950">
              Open episode editor
            </Link>
            <Link href="/asset-manager" className="rounded-lg border border-orange-300/40 px-4 py-2 text-sm font-black text-orange-100">
              Review registered assets
            </Link>
          </div>
        </section>

        {message ? (
          <div className="mb-8 rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-sm leading-6 text-zinc-200">
            {message}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800">
            <label className="block text-sm font-bold text-zinc-400 mb-2">Source Path (legacy web action disabled)</label>
            <input
              type="text"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              placeholder="Use Quipsly Mac native file picker instead"
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-4 py-2 text-white"
            />
          </div>
          <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-800">
            <label className="block text-sm font-bold text-zinc-400 mb-2">Destination Library (managed by local-engine)</label>
            <input
              type="text"
              value={destPath}
              onChange={(e) => setDestPath(e.target.value)}
              placeholder="Local cache/bucket registration happens natively"
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
            {isScanning ? "Checking..." : "Explain native import path"}
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
            {isOrganizing ? "Preparing..." : "Send to native workflow"}
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
