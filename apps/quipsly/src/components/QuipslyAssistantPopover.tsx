"use client";

import { Check, X, ChevronRight } from "lucide-react";
import type { AssistantAction } from "./assistant-types";

export function QuipslyAssistantPopover({
  actions,
  onClose,
  onApprove,
  onReject,
}: {
  actions: AssistantAction[];
  onClose: () => void;
  onApprove: (action: AssistantAction) => void;
  onReject: (action: AssistantAction) => void;
}) {
  return (
    <div className="w-80 rounded-xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between border-b border-[#e8dcc4] bg-[#fcf9f2] px-3 py-2">
        <h3 className="text-sm font-semibold text-[#5e4b33]">Suggestions</h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-[#a6967f] hover:bg-[#ebdaba] hover:text-[#5e4b33]"
        >
          <X size={14} />
        </button>
      </div>
      
      <div className="max-h-96 overflow-y-auto p-2 space-y-2 bg-[#fdfaf6]">
        {actions.map((action) => (
          <div key={action.id} className="rounded-lg border border-[#e8dcc4] bg-white p-3 shadow-sm">
            <h4 className="text-sm font-bold text-[#3d3122] mb-1">{action.label}</h4>
            <p className="text-xs text-[#5e4b33] mb-3 leading-relaxed">
              {action.explanation}
            </p>
            
            {Boolean(action.payload?.draftText) && (
              <div className="mb-3 rounded border border-amber-100 bg-amber-50 p-2 text-xs text-amber-900 italic">
                "{String(action.payload!.draftText)}"
              </div>
            )}
            
            {Boolean(action.payload?.rewriteText) && (
              <div className="mb-3 rounded border border-amber-100 bg-amber-50 p-2 text-xs text-amber-900 italic">
                "{String(action.payload!.rewriteText)}"
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onApprove(action);
                  if (actions.length === 1) onClose();
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-200"
              >
                <Check size={14} />
                Approve
              </button>
              <button
                onClick={() => {
                  onReject(action);
                  if (actions.length === 1) onClose();
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#e8dcc4] bg-white px-2 py-1.5 text-xs font-semibold text-[#5e4b33] transition-colors hover:bg-[#fcf9f2]"
              >
                <X size={14} />
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
