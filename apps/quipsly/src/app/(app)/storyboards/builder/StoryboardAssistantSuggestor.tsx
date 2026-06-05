"use client";

import React, { useState } from 'react';
import { Sparkles, Check, X, Loader2, Play } from 'lucide-react';

type PendingAction = {
  id: string;
  type: string;
  payloadJson: any;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

export function StoryboardAssistantSuggestor({ 
  storyboardId,
  onApprove 
}: { 
  storyboardId: string;
  onApprove: (frames: any[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Mocking the pending action that would normally come from StudioAssistantAction table
  const mockPendingAction: PendingAction = {
    id: "action_123",
    type: "GENERATE_STORYBOARD_FRAMES",
    status: "PENDING",
    payloadJson: {
      frames: [
        {
          action: "A dark silhouette steps out of the fog.",
          dialogue: "Who goes there?",
          shotSize: "WS",
          lens: "35mm",
          cameraMovement: "Tracking",
          estimatedDuration: 4.5
        },
        {
          action: "Close up on the glowing red eyes of the figure.",
          dialogue: "Your worst nightmare.",
          shotSize: "CU",
          lens: "85mm",
          cameraMovement: "Static",
          estimatedDuration: 2.0
        }
      ]
    }
  };

  const handleApprove = async () => {
    setIsProcessing(true);
    // Simulate network delay for Ledger approval
    await new Promise(r => setTimeout(r, 1200));
    onApprove(mockPendingAction.payloadJson.frames);
    setIsOpen(false);
    setIsProcessing(false);
  };

  const handleReject = async () => {
    setIsProcessing(true);
    await new Promise(r => setTimeout(r, 800));
    setIsOpen(false);
    setIsProcessing(false);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 bg-black dark:bg-white text-white dark:text-black p-4 rounded-full shadow-2xl hover:scale-105 transition-transform flex items-center gap-3 z-50 group"
      >
        <Sparkles className="w-5 h-5 text-yellow-400 dark:text-yellow-500" />
        <span className="font-bold pr-2 max-w-0 overflow-hidden group-hover:max-w-[200px] transition-all duration-500 whitespace-nowrap">
          AI Suggestions Available
        </span>
        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
          1
        </div>
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 pointer-events-none flex justify-center pb-8 px-4">
      <div className="pointer-events-auto bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl border border-indigo-200 dark:border-indigo-900/50 p-6 rounded-3xl shadow-2xl max-w-4xl w-full">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-black text-lg text-zinc-900 dark:text-zinc-100">Quipsly Assistant</h3>
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Ledger Action Pending: Auto-Storyboard</p>
            </div>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            aria-label="Close suggestions"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
          {mockPendingAction.payloadJson.frames.map((frame: any, idx: number) => (
            <div key={idx} className="snap-start flex-shrink-0 w-[300px] border-2 border-indigo-200 dark:border-indigo-800 border-dashed rounded-2xl bg-indigo-50/50 dark:bg-indigo-900/10 p-4">
              <div className="text-xs font-bold text-indigo-500 mb-2 uppercase tracking-wider">Suggested Frame {idx + 1}</div>
              <div className="space-y-3">
                <div className="aspect-video bg-zinc-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center relative overflow-hidden">
                   <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-overlay"></div>
                   <Sparkles className="w-6 h-6 text-zinc-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2">{frame.action}</p>
                </div>
                {frame.dialogue && (
                  <div className="bg-white dark:bg-zinc-900 p-2 rounded border border-zinc-100 dark:border-zinc-800 shadow-sm">
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">"{frame.dialogue}"</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded font-bold text-zinc-600 dark:text-zinc-400">{frame.shotSize}</span>
                  <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded font-bold text-zinc-600 dark:text-zinc-400">{frame.lens}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-between items-center border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <p className="text-xs text-zinc-500 max-w-sm">
            Approving this will write to the `StudioAssistantLedger` and inject these frames into your active storyboard.
          </p>
          <div className="flex gap-3">
            <button 
              onClick={handleReject}
              disabled={isProcessing}
              className="px-6 py-2 rounded-xl font-bold text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              Reject
            </button>
            <button 
              onClick={handleApprove}
              disabled={isProcessing}
              className="px-6 py-2 rounded-xl font-bold text-sm bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 hover:shadow-indigo-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Approve to Ledger
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
