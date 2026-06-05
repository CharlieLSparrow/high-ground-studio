import React from "react";

export default function EpisodeLoading() {
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center pt-32 pb-24 px-6 animate-pulse">
      {/* Hero Skeleton */}
      <div className="w-24 h-4 bg-zinc-800 rounded-full mb-6"></div>
      <div className="w-3/4 max-w-2xl h-12 bg-zinc-800 rounded-lg mb-6"></div>
      <div className="w-1/2 max-w-lg h-6 bg-zinc-800 rounded-lg mb-20"></div>

      {/* Show Notes Skeleton */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-12 mt-12">
        <div className="md:col-span-2 space-y-6">
          <div className="w-32 h-6 bg-zinc-800 rounded mb-4"></div>
          <div className="w-full h-32 bg-zinc-900 rounded-2xl border border-zinc-800/50"></div>
          <div className="w-full h-32 bg-zinc-900 rounded-2xl border border-zinc-800/50"></div>
        </div>
        <div className="md:col-span-1 space-y-4">
          <div className="w-24 h-6 bg-zinc-800 rounded mb-4"></div>
          <div className="w-full h-24 bg-zinc-900 rounded-2xl border border-zinc-800/50"></div>
          <div className="w-full h-24 bg-zinc-900 rounded-2xl border border-zinc-800/50"></div>
        </div>
      </div>
    </main>
  );
}
