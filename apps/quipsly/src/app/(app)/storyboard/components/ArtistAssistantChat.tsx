"use client";

import { useState } from "react";
import { Sparkles, ArrowRight, X, Bot, Image as ImageIcon } from "lucide-react";
import { simulateArtistAgent, addStoryboardFrame } from "../actions";
import { StoryboardFrameType } from "./FrameCard";

export function ArtistAssistantChat({ 
  storyboardId, 
  onFramesAdded 
}: { 
  storyboardId: string;
  onFramesAdded: (frames: StoryboardFrameType[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const response = await simulateArtistAgent(prompt);
      if (!response.success || !response.data) throw new Error(response.error || "Failed to generate frames");
      
      const newFrames: StoryboardFrameType[] = [];
      const shots = response.data as any[];
      for (const shot of shots) {
        // Sequentially add frames using our server action
        const frame = await addStoryboardFrame(storyboardId, {
          action: shot.action,
          cameraInfo: shot.cameraInfo,
          shotSize: shot.shotSize,
          dialogue: shot.dialogue,
          frameNumber: "", // auto-generated in action
        });
        // We typecast for the client side usage. The action returns the full model.
        newFrames.push(frame as unknown as StoryboardFrameType);
      }
      
      onFramesAdded(newFrames);
      setPrompt("");
      setIsOpen(false);
    } catch (e) {
      console.error(e);
    }
    setIsGenerating(false);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        aria-label="Open Artist Co-Pilot"
        className="fixed bottom-6 right-6 bg-orange-500 text-white rounded-full p-4 shadow-lg shadow-orange-500/30 hover:bg-orange-600 hover:scale-105 transition-all flex items-center justify-center focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/50"
      >
        <Sparkles size={24} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl flex flex-col overflow-hidden z-50">
      <div className="bg-orange-50 dark:bg-orange-950/20 p-4 border-b border-orange-100 dark:border-orange-900/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center text-orange-600 dark:text-orange-400">
            <Bot size={20} />
          </div>
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">The Artist</h3>
            <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Quipsly Co-Pilot</p>
          </div>
        </div>
        <button 
          onClick={() => setIsOpen(false)} 
          aria-label="Close Artist Co-Pilot"
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded p-1"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      
      <div className="p-4 flex-1 flex flex-col">
        <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          <p>
            Paste a paragraph from your manuscript, and I'll break it down into a sequence of cinematic shots for your storyboard.
          </p>
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. The hero runs through the burning building, debris falling all around..."
          rows={5}
          className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-orange-500 outline-none resize-none"
        />

        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          aria-label="Generate shot list from prompt"
          className="mt-4 w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium px-4 py-3 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900"
        >
          {isGenerating ? (
            <>
              <Sparkles className="animate-spin" size={18} aria-hidden="true" />
              <span>Visualizing...</span>
            </>
          ) : (
            <>
              <ImageIcon size={18} aria-hidden="true" />
              <span>Generate Shot List</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
