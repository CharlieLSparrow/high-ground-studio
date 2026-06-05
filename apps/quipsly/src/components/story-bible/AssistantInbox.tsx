"use client";

import React, { useState } from "react";
import { StudioAssistantAction } from "./types";
import { Check, X, Sparkles, Loader2, AlertTriangle, ChevronRight } from "lucide-react";

interface AssistantInboxProps {
  actions: StudioAssistantAction[];
  onProcessAction: (actionId: string, status: "APPROVED" | "REJECTED") => Promise<void>;
  onScanEntities?: () => Promise<void>;
  isScanning?: boolean;
  scanError?: string | null;
}

export function AssistantInbox({
  actions,
  onProcessAction,
  onScanEntities,
  isScanning = false,
  scanError = null,
}: AssistantInboxProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  const handleAction = async (id: string, status: "APPROVED" | "REJECTED") => {
    if (processingId) return;
    setProcessingId(id);
    try {
      await onProcessAction(id, status);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-void">
      <div className="sticky top-0 z-20 p-4 backdrop-blur-xl bg-void/80 border-b border-white/5 flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-black text-subject flex items-center gap-2 uppercase tracking-widest">
            <Sparkles className="h-4 w-4 text-flare-glow animate-pulse" aria-hidden="true" />
            Intelligence Inbox
          </h2>
          <p className="text-[11px] text-white/40 mt-1 uppercase tracking-wider font-medium">
            AI extractions require your approval
          </p>
        </div>

        {onScanEntities && (
          <div className="relative group overflow-hidden rounded-xl bg-gradient-to-r from-white/[0.05] to-white/[0.02] border border-white/10 p-3">
            <div className="absolute inset-0 bg-flare/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Deep Scan</span>
                <span className="text-[10px] text-white/40">Analyze active manuscript</span>
              </div>
              <button
                onClick={onScanEntities}
                disabled={isScanning}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-flare/20 hover:bg-flare/30 border border-flare/30 text-flare-glow text-xs font-bold uppercase tracking-wider rounded-lg transition-all disabled:opacity-50 shadow-[0_0_10px_rgba(255,165,0,0.1)]"
              >
                {isScanning ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Scanning</>
                ) : (
                  <><Sparkles className="h-3 w-3" /> Run Scan</>
                )}
              </button>
            </div>
            {scanError && <p className="text-[10px] text-red-400 font-bold mt-2 uppercase">{scanError}</p>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-4 opacity-40">
            <div className="relative">
              <div className="absolute inset-0 bg-flare blur-xl rounded-full opacity-20" />
              <Sparkles className="h-10 w-10 text-white relative z-10" />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-white">Inbox Zero</p>
          </div>
        ) : (
          actions.map((action) => {
            const payload = action.payloadJson || {};
            const attributes = payload.attributes || {};
            const excerpt = attributes.sourceExcerpt || attributes.source_excerpt || payload.sourceExcerpt;
            const isHighRisk = action.riskLevel === "HIGH";
            const isExpanded = expandedAction === action.id;

            return (
              <article
                key={action.id}
                className={`relative overflow-hidden rounded-2xl transition-all duration-300 border ${
                  isHighRisk ? "bg-red-950/10 border-red-500/20" : "bg-white/[0.03] border-white/10"
                } ${
                  processingId === action.id ? "opacity-50 scale-[0.98] pointer-events-none" : "hover:border-white/20 hover:bg-white/[0.05]"
                }`}
              >
                {/* Subtle top gradient line */}
                <div className={`absolute top-0 left-0 w-full h-1 ${isHighRisk ? "bg-red-500/50" : "bg-flare/50"}`} />

                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${isHighRisk ? "bg-red-500/10 text-red-400" : "bg-flare/10 text-flare-glow"}`}>
                        <Sparkles className="h-3 w-3" />
                      </div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-white/80">
                        {action.type.replace(/_/g, " ")}
                      </div>
                    </div>
                    {isHighRisk && (
                      <span className="flex items-center gap-1 bg-red-500/20 text-red-400 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-red-500/30">
                        <AlertTriangle className="h-3 w-3" />
                        High Risk
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-subject/90 leading-relaxed font-medium mb-4">
                    {action.explanation || "AI discovered a new entity pattern in the text."}
                  </p>

                  {excerpt && (
                    <div className="mb-4 bg-black/40 rounded-xl p-3 border border-white/5 relative group">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-flare/50 rounded-l-xl opacity-50 group-hover:opacity-100 transition-opacity" />
                      <div className="text-[9px] uppercase font-black tracking-widest text-white/30 mb-1.5 pl-2">Source Provenance</div>
                      <div className="text-xs italic text-white/70 pl-2 leading-relaxed">
                        "{String(excerpt)}"
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => setExpandedAction(isExpanded ? null : action.id)}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-white/80 transition-colors mb-3"
                  >
                    <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    Developer Payload View
                  </button>

                  {isExpanded && (
                    <div className="bg-black/60 rounded-lg p-3 font-mono text-[10px] text-white/50 space-y-1 overflow-x-auto mb-4 border border-white/5">
                      {Object.entries(payload).map(([k, v]) => {
                        if (k === "attributes") return null;
                        return <div key={k}><span className="text-white/30">{k}:</span> {JSON.stringify(v)}</div>;
                      })}
                      {Object.entries(attributes as any).map(([k, v]) => {
                        if (k === "sourceExcerpt" || k === "source_excerpt") return null;
                        return <div key={k}><span className="text-white/30">attr.{k}:</span> {JSON.stringify(v)}</div>;
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-3 border-t border-white/10">
                    <button
                      onClick={() => handleAction(action.id, "REJECTED")}
                      className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/50 bg-white/5 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                    >
                      <X className="h-3.5 w-3.5" /> Dismiss
                    </button>
                    <button
                      onClick={() => handleAction(action.id, "APPROVED")}
                      className={`flex-1 py-2 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-lg ${
                        isHighRisk 
                          ? "bg-red-500 hover:bg-red-400 text-white shadow-red-500/20" 
                          : "bg-flare hover:bg-flare-glow text-void shadow-flare/20"
                      }`}
                    >
                      {processingId === action.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} 
                      Approve
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
