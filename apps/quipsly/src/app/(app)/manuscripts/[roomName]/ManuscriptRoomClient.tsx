"use client";

import React, { useState } from "react";
import Link from "next/link";
import Editor from "@/components/Editor";
import { Film, Clapperboard, Plus, X, Sparkles } from "lucide-react";
import { createFrameFromExcerpt } from "../../storyboards/actions";

interface Props {
  roomName: string;
  token: string;
  collabUrl: string;
  userName: string;
  userColor: string;
  initialStoryboards: any[];
}

export default function ManuscriptRoomClient({
  roomName,
  token,
  collabUrl,
  userName,
  userColor,
  initialStoryboards,
}: Props) {
  const [storyboards, setStoryboards] = useState(initialStoryboards);
  const [selectedText, setSelectedText] = useState("");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedStoryboardId, setSelectedStoryboardId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const handleSelectStoryboardText = (text: string) => {
    if (!text.trim()) return;
    setSelectedText(text);
    if (storyboards.length > 0) {
      setSelectedStoryboardId(storyboards[0].id);
    }
    setShowLinkModal(true);
  };

  const handleLinkToStoryboard = async () => {
    if (!selectedStoryboardId || !selectedText) return;
    setIsLinking(true);

    try {
      const res = await createFrameFromExcerpt(selectedStoryboardId, selectedText);
      setIsLinking(false);
      setShowLinkModal(false);

      if (res.success) {
        showToast("Successfully added excerpt as a new storyboard frame!");
        // Update frames count locally for visual feedback
        setStoryboards(prev =>
          prev.map(s => {
            if (s.id === selectedStoryboardId) {
              return {
                ...s,
                frames: [...(s.frames || []), res.frame]
              };
            }
            return s;
          })
        );
      } else {
        showToast("Error adding frame: " + res.error);
      }
    } catch (err: any) {
      setIsLinking(false);
      showToast("Request failed: " + err.message);
    }
  };

  return (
    <div className="flex h-screen w-full bg-neutral-50 dark:bg-neutral-950 overflow-hidden relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute bottom-6 right-6 z-50 bg-zinc-900/90 text-white font-semibold text-sm px-4 py-3 rounded-xl shadow-lg backdrop-blur animate-in slide-in-from-bottom-5">
          {toastMessage}
        </div>
      )}

      {/* Main Infinite Canvas */}
      <main className="flex-1 overflow-y-auto p-4 md:p-12 relative flex justify-center">
        <div className="w-full max-w-4xl pb-64">
          <header className="mb-8">
            <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
              {roomName.replace(/-/g, " ")}
            </h1>
            <p className="text-sm text-neutral-500">
              Live Collaboration Room • {userName}
            </p>
          </header>

          <Editor
            roomName={roomName}
            token={token}
            collabUrl={collabUrl}
            userName={userName}
            userColor={userColor}
            onSelectStoryboard={handleSelectStoryboardText}
          />
        </div>
      </main>

      {/* Right Sidebar - Collections & Snippets */}
      <aside className="w-80 border-l border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
          <Film className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Studio Library
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Storyboards */}
          <section>
            <h3 className="text-xs font-semibold text-neutral-400 mb-3 flex justify-between items-center">
              Storyboards
              <Link
                href={`/storyboards/builder?project=${roomName}`}
                className="text-blue-500 hover:text-blue-600 font-bold text-sm"
                title="Open Storyboards Builder"
              >
                +
              </Link>
            </h3>
            <ul className="space-y-2">
              {storyboards.length === 0 ? (
                <div className="text-xs text-neutral-500 italic p-3 bg-neutral-50 dark:bg-neutral-950/40 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800">
                  No storyboards created. Click the + to build one.
                </div>
              ) : (
                storyboards.map((s) => (
                  <Link key={s.id} href={`/storyboards/builder?project=${roomName}`}>
                    <li className="group flex flex-col gap-1 text-sm text-neutral-700 dark:text-neutral-300 bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100/70 dark:border-indigo-950/30 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-indigo-100/50 dark:hover:bg-indigo-950/30 transition-all shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-bold truncate text-neutral-850 dark:text-neutral-200 group-hover:text-indigo-650 transition-colors">
                          🎞️ {s.title}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                          {s.frames?.length || 0} F
                        </span>
                      </div>
                      {s.description && (
                        <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                          {s.description.replace(/\[Linked[^\]]+\]\s*/g, "")}
                        </p>
                      )}
                    </li>
                  </Link>
                ))
              )}
              <Link href={`/storyboards/builder?project=${roomName}`}>
                <li className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-3 py-2 rounded-xl cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-850 transition-colors shadow-sm mt-3 border-dashed">
                  <span className="text-neutral-400"><Plus className="w-4 h-4" /></span>
                  Open Storyboard Builder...
                </li>
              </Link>
            </ul>
          </section>

          {/* Active Collections */}
          <section>
            <h3 className="text-xs font-semibold text-neutral-400 mb-3 flex justify-between items-center">
              Active Collections
              <button className="text-blue-500 hover:text-blue-600 font-bold">+</button>
            </h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 px-3 py-2 rounded-md cursor-pointer">
                <span className="text-blue-500">📁</span> Book Quotes (Q3)
              </li>
              <li className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 px-3 py-2 rounded-md cursor-pointer">
                <span className="text-green-500">📁</span> High Ground Odyssey Ideas
              </li>
            </ul>
          </section>

          {/* Recent Snippets */}
          <section>
            <h3 className="text-xs font-semibold text-neutral-400 mb-3">Recent Snippets</h3>
            <div className="space-y-3">
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/50 rounded-md text-sm cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors">
                "The only way out is through the suffering."
                <div className="text-xs text-neutral-500 mt-2">— Found in 'Meditations'</div>
              </div>
            </div>
          </section>
        </div>
      </aside>

      {/* Link to Storyboard Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Clapperboard className="w-5 h-5" />
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Send Excerpt to Storyboard</h3>
              </div>
              <button
                onClick={() => setShowLinkModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Selected Script Beat Excerpt</span>
              <p className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs italic text-zinc-755 dark:text-zinc-300 max-h-24 overflow-y-auto">
                "{selectedText}"
              </p>
            </div>

            {storyboards.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 leading-relaxed">
                  No storyboards found for this project. Create a storyboard first to start organizing frames.
                </p>
                <Link
                  href={`/storyboards/builder?project=${roomName}`}
                  className="w-full flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-755 text-white font-bold py-2 px-4 rounded-xl text-xs transition-colors"
                >
                  <Plus className="w-4 h-4" /> Open Storyboards Builder
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="storyboard-select" className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Choose Destination Storyboard
                  </label>
                  <select
                    id="storyboard-select"
                    value={selectedStoryboardId}
                    onChange={(e) => setSelectedStoryboardId(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {storyboards.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({s.frames?.length || 0} frames)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 justify-end border-t border-zinc-100 dark:border-zinc-800 pt-4">
                  <button
                    onClick={() => setShowLinkModal(false)}
                    className="px-4 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-850"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLinkToStoryboard}
                    disabled={isLinking}
                    className="px-4 py-2 text-xs font-bold bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl disabled:opacity-50 transition-colors flex items-center gap-1 shadow-md shadow-indigo-500/20"
                  >
                    {isLinking ? "Creating..." : <><Sparkles className="w-3.5 h-3.5" /> Create Frame</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
