"use client";

import React, { useState } from "react";
import { RefreshCcw, Check, AlertCircle } from "lucide-react";

export function RunWorkerSyncButton({ secret }: { secret?: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSync = async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/cron/patreon-reconcile", {
        method: "POST",
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to trigger sync");
      }
      
      setStatus("success");
      setMessage(`Processed ${data.processed} events`);
      
      // Reset after 3 seconds
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 3000);
      
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setMessage(err.message || "An error occurred");
      
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 5000);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {status === "error" && <span className="text-sm text-red-600 font-semibold">{message}</span>}
      {status === "success" && <span className="text-sm text-emerald-600 font-semibold">{message}</span>}
      
      <button 
        onClick={handleSync}
        disabled={status === "loading" || status === "success"}
        className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "loading" ? (
          <RefreshCcw className="h-4 w-4 animate-spin" />
        ) : status === "success" ? (
          <Check className="h-4 w-4 text-emerald-400" />
        ) : status === "error" ? (
          <AlertCircle className="h-4 w-4 text-red-400" />
        ) : (
          <RefreshCcw className="h-4 w-4" />
        )}
        Run Worker Sync
      </button>
    </div>
  );
}
