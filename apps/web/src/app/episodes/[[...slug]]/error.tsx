"use client";

import React, { useEffect } from "react";

export default function EpisodeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In a full SaaS setup, we would log this to Sentry or Datadog here
    console.error("Episode Page Error Boundary caught:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-zinc-900 border border-red-900/50 p-8 rounded-2xl text-center shadow-2xl">
        <div className="w-16 h-16 bg-red-500/10 text-red-500 flex items-center justify-center rounded-full mx-auto mb-6 text-2xl font-bold">
          !
        </div>
        <h2 className="text-xl font-bold text-zinc-100 mb-3 tracking-tight">
          Failed to load episode
        </h2>
        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
          We encountered an error while trying to fetch the requested episode data. 
          The data packet might be corrupt or temporarily unavailable.
        </p>
        <button
          onClick={() => reset()}
          className="w-full bg-zinc-100 text-zinc-900 font-medium px-4 py-3 rounded-xl hover:bg-white transition-colors focus:ring-2 focus:ring-amber-500 focus:outline-none"
        >
          Try Again
        </button>
      </div>
    </main>
  );
}
