"use client";

/**
 * @module AssistantInbox
 *
 * The AI Suggestion Inbox for the StoryBible side-panel. This component acts as
 * a "pull request queue" for the writer's story bible — the AI can propose adding
 * or updating entities, and the user has full control to approve or reject each one.
 *
 * ## Philosophy: The Librarian Model
 *
 * The assistant never modifies story data directly. Instead, it creates a
 * `StudioAssistantAction` record (type: PROPOSE_ENTITY | PROPOSE_ENTITY_UPDATE)
 * and adds it to this inbox. Only when the human clicks "Approve" does the
 * server commit the change and record it in the `StudioAssistantLedger`.
 *
 * This keeps the AI in an advisory role and gives the writer complete creative authority.
 *
 * ## Optimistic UI
 *
 * Clicking "Approve" or "Reject" immediately removes the card from the inbox list
 * via an optimistic state update, providing zero perceived latency. The parent
 * (`StoryBibleSidebar`) handles the rollback logic if the server request fails.
 *
 * @param actions         - The current list of pending PROPOSE_* AI actions.
 * @param onProcessAction - Async callback to the parent's optimistic handler.
 */

import React, { useState } from "react";
import { StudioAssistantAction } from "./types";
import { Check, X, Sparkles, Loader2, AlertTriangle } from "lucide-react";

interface AssistantInboxProps {
  actions: StudioAssistantAction[];
  onProcessAction: (actionId: string, status: "APPROVED" | "REJECTED") => Promise<void>;
}

export function AssistantInbox({ actions, onProcessAction }: AssistantInboxProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleAction = async (id: string, status: "APPROVED" | "REJECTED") => {
    if (processingId) return; // Prevent double-click
    setProcessingId(id);
    try {
      await onProcessAction(id, status);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-void">
      <div className="sticky top-0 z-10 p-4 backdrop-blur-md bg-void/80 border-b border-white/5">
        <h2 className="text-sm font-medium text-subject flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-flare-glow" aria-hidden="true" />
          Assistant Suggestions
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Your AI collaborator found these — you decide what sticks.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {actions.length === 0 ? (
          <div className="text-center p-8 space-y-2">
            <Sparkles className="h-8 w-8 text-white/20 mx-auto" />
            <p className="text-white/40 text-sm">All caught up! No pending suggestions.</p>
          </div>
        ) : (
          actions.map((action) => (
            <article
              key={action.id}
              aria-label={`AI suggestion: ${action.type}`}
              className={`bg-white/5 border border-white/10 rounded-xl p-4 transition-all duration-200 ${
                processingId === action.id
                  ? "opacity-50 pointer-events-none scale-[0.98]"
                  : "opacity-100 scale-100"
              }`}
            >
              {/* Action Type Badge + Risk Level */}
              <div className="flex items-start justify-between mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-flare-glow">
                  {action.type.replace(/_/g, " ")}
                </div>
                {action.riskLevel === "HIGH" && (
                  <span className="flex items-center gap-1 bg-red-500/20 text-red-300 text-[10px] px-2 py-0.5 rounded-full border border-red-500/30">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    High Risk
                  </span>
                )}
              </div>

              {/* Human-readable explanation */}
              <p className="text-sm text-subject mb-4 leading-relaxed">
                {action.explanation ??
                  "The assistant identified a new story element based on recent manuscript changes."}
              </p>

              {/* Payload Preview */}
              <div
                aria-label="Proposed change details"
                className="bg-void/50 rounded-lg p-3 font-mono text-[11px] text-white/70 space-y-1 overflow-x-auto mb-4 border border-white/5"
              >
                {action.payloadJson?.name && (
                  <div>
                    <span className="text-white/40">name: </span>
                    {String(action.payloadJson.name)}
                  </div>
                )}
                {action.payloadJson?.type && (
                  <div>
                    <span className="text-white/40">type: </span>
                    {String(action.payloadJson.type)}
                  </div>
                )}
                {action.payloadJson?.attributes &&
                  Object.entries(action.payloadJson.attributes as Record<string, unknown>).map(
                    ([k, v]) => (
                      <div key={k}>
                        <span className="text-white/40">{k}: </span>
                        {String(v)}
                      </div>
                    )
                  )}
              </div>

              {/* Approve / Reject */}
              <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                <button
                  id={`reject-action-${action.id}`}
                  onClick={() => handleAction(action.id, "REJECTED")}
                  disabled={!!processingId}
                  aria-label="Reject suggestion"
                  className="flex-1 py-1.5 flex items-center justify-center gap-1.5 text-xs font-medium text-white/50 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" /> Reject
                </button>
                <button
                  id={`approve-action-${action.id}`}
                  onClick={() => handleAction(action.id, "APPROVED")}
                  disabled={!!processingId}
                  aria-label="Approve suggestion"
                  className="flex-1 py-1.5 flex items-center justify-center gap-1.5 text-xs font-medium text-void bg-flare hover:bg-flare-glow rounded-md transition-colors"
                >
                  {processingId === action.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Approve
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
