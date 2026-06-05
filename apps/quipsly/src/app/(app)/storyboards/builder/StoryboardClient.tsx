"use client";

import React, { useState } from 'react';
import { Film, Clapperboard, Plus, Image as ImageIcon, AlignLeft, X } from 'lucide-react';
import { createStoryboard, createStoryboardFrame, updateStoryboard, generateFrameImage, approveLedgerSuggestions } from '../actions';
import { useRouter, useSearchParams } from 'next/navigation';
import { StoryboardAssistantSuggestor } from './StoryboardAssistantSuggestor';
import { ScrollytellingRenderer } from './ScrollytellingRenderer';
import { ComicRenderer } from './ComicRenderer';
import { StoryboardGridRenderer } from './StoryboardGridRenderer';
import { useToast, useDebouncedCallback } from './hooks';

const ASPECT_RATIOS = [
  { label: '16:9 (Standard Widescreen)', value: '16:9', className: 'aspect-video' },
  { label: '2.35:1 (Cinemascope)', value: '2.35:1', className: 'aspect-[2.35/1]' },
  { label: '4:3 (Classic)', value: '4:3', className: 'aspect-[4/3]' },
  { label: '1:1 (Square)', value: '1:1', className: 'aspect-square' },
];

type Props = {
  initialProjects: any[];
  aiConfigStatus?: "ready" | "missing_keys" | "missing_bucket" | "missing_both";
};

export function StoryboardClient({ initialProjects, aiConfigStatus = "ready" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectSlug = searchParams?.get('project');
  const { toasts, showToast } = useToast();

  const [projects, setProjects] = useState<any[]>(initialProjects);
  
  // Initialize active project based on URL or fallback to first project
  const [activeProject, setActiveProject] = useState(() => {
    if (projectSlug) {
      const found = initialProjects.find(p => p.slug === projectSlug);
      if (found) return found;
    }
    return initialProjects[0] || null;
  });

  const [generatingFrames, setGeneratingFrames] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'GRID' | 'SCROLL' | 'COMIC'>('GRID');

  const debouncedUpdateStoryboard = useDebouncedCallback((id: string, data: any) => {
    updateStoryboard(id, data);
  }, 500);

  const handleSelectProject = (proj: any) => {
    setActiveProject(proj);
    router.push(`?project=${proj.slug}`);
  };

  // Quarantined project creation handler for beta posture
  // const handleNewProject = async () => {
  //   const title = `Untitled Project ${projects.length + 1}`;
  //   
  //   const formData = new FormData();
  //   formData.append("title", title);
  //   
  //   const res = await createProject(formData);
  //   if (res.success && res.project) {
  //     setProjects([res.project, ...projects]);
  //     setActiveProject(res.project);
  //     showToast("Project created successfully", "success");
  //   } else {
  //     showToast("Failed to create project", "error");
  //   }
  // };

  const handleAddStoryboard = async () => {
    if (!activeProject) return;
    const title = `Storyboard ${(activeProject.storyboards?.length || 0) + 1}`;

    const res = await createStoryboard(activeProject.id, title);
    if (res.success) {
      const updatedProject = { ...activeProject, storyboards: [...(activeProject.storyboards || []), { ...res.storyboard, frames: [] }] };
      setActiveProject(updatedProject);
      showToast("Storyboard added", "success");
    } else {
      showToast("Failed to add storyboard", "error");
    }
  };

  const handleAddFrame = async (storyboardId: string, currentFrameCount: number) => {
    const frameNumber = `1.${currentFrameCount + 1}`;

    const res = await createStoryboardFrame(storyboardId, frameNumber);
    if (res.success) {
      const updatedStoryboards = activeProject.storyboards.map((s: any) => {
        if (s.id === storyboardId) {
          return { ...s, frames: [...s.frames, res.frame] };
        }
        return s;
      });
      setActiveProject({ ...activeProject, storyboards: updatedStoryboards });
    } else {
      showToast("Failed to add frame", "error");
    }
  };

  const handleGenerateFrame = async (frameId: string, storyboardId: string) => {
    setGeneratingFrames(prev => ({ ...prev, [frameId]: true }));
    const res = await generateFrameImage(frameId);
    
    if (res.success && res.frame) {
      if (activeProject) {
        const updatedStoryboards = activeProject.storyboards.map((s: any) => {
          if (s.id === storyboardId) {
            return {
              ...s,
              frames: s.frames.map((frame: any) => frame.id === frameId ? res.frame : frame)
            };
          }
          return s;
        });
        setActiveProject({ ...activeProject, storyboards: updatedStoryboards });
      }
      showToast("Image generated", "success");
    } else {
      showToast("Failed to generate image: " + res.error, "error");
    }
    setGeneratingFrames(prev => ({ ...prev, [frameId]: false }));
  };

  const handleApproveSuggestions = async (storyboardId: string, frames: any[]) => {
    const res = await approveLedgerSuggestions(storyboardId, frames);
    if (res.success && res.frames) {
      if (activeProject) {
        const updatedStoryboards = activeProject.storyboards.map((s: any) => {
          if (s.id === storyboardId) {
            return {
              ...s,
              frames: [...s.frames, ...res.frames]
            };
          }
          return s;
        });
        setActiveProject({ ...activeProject, storyboards: updatedStoryboards });
      }
      showToast(`Approved & persisted ${res.frames.length} frames successfully!`, "success");
    } else {
      showToast("Failed to save approved frames: " + (res.error || "Unknown error"), "error");
    }
  };

  return (
    <div className="flex w-full h-full divide-x divide-zinc-200 dark:divide-zinc-800 relative">
      
      {/* Toast Notification Container */}
      <div className="absolute bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center justify-between p-4 rounded-xl shadow-lg text-sm font-semibold max-w-sm w-full backdrop-blur transition-all animate-in slide-in-from-right-4 
            ${toast.type === 'error' ? 'bg-red-500/90 text-white' : toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-zinc-800/90 text-white'}`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Assistant Ledger Suggestor - Only show if we have an active storyboard to inject to */}
      {activeProject?.storyboards?.[0] && (
        <StoryboardAssistantSuggestor 
          storyboardId={activeProject.storyboards[0].id}
          onApprove={(frames) => handleApproveSuggestions(activeProject.storyboards[0].id, frames)}
        />
      )}
      
      {/* LEFT PANE: PROJECTS */}
      <div className="w-80 flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-y-auto">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="font-bold text-zinc-900 dark:text-white">Projects</h2>
          </div>
          {/* Project creation is quarantined for beta posture; managed globally via the Nest dashboard */}
        </div>

        <div className="p-4 space-y-2">
          {projects.length === 0 ? (
            <div className="text-center p-6 text-zinc-500 text-sm">
              No projects found. Create a project from the dashboard.
            </div>
          ) : (
            projects.map(proj => (
              <button
                key={proj.id}
                onClick={() => handleSelectProject(proj)}
                aria-label={`Select Project ${proj.name}`}
                className={`w-full text-left p-4 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${activeProject?.id === proj.id ? 'bg-white dark:bg-zinc-900 border-indigo-200 dark:border-indigo-800 shadow-sm ring-1 ring-indigo-500' : 'bg-transparent border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-900/50'}`}
              >
                <h3 className={`font-bold ${activeProject?.id === proj.id ? 'text-indigo-900 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {proj.name}
                </h3>
                <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{proj.description || 'No description'}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANE: CANVAS */}
      <div className="flex-1 flex flex-col bg-zinc-100 dark:bg-zinc-900 relative">
        {!activeProject ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50">
            <div className="w-24 h-24 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center shadow-sm mb-6 border border-zinc-100 dark:border-zinc-700/50">
              <Clapperboard className="w-10 h-10 text-indigo-500/50" />
            </div>
            <h3 className="text-2xl font-black text-zinc-800 dark:text-zinc-200 tracking-tight">Storyboard Builder</h3>
            <p className="mt-3 text-sm text-zinc-500 max-w-sm text-center leading-relaxed">
              Select an existing project from the left sidebar, or create a new one to start mapping out your scenes and shots.
            </p>
          </div>
        ) : (
          <>
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-full">Active Project</span>
                </div>
                <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">{activeProject.name}</h1>
                <p className="text-sm text-zinc-500 mt-0.5">{activeProject.description || "No project description"}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setViewMode(viewMode === 'SCROLL' ? 'GRID' : 'SCROLL')}
                  aria-label={viewMode === 'SCROLL' ? 'Exit Scroll Mode' : 'Preview Scroll Mode'}
                  className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-colors focus:ring-2 focus:ring-indigo-500 outline-none ${viewMode === 'SCROLL' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                >
                  <AlignLeft className="w-4 h-4 rotate-90" /> {viewMode === 'SCROLL' ? 'Exit Scroll' : 'Preview Scroll'}
                </button>
                <button 
                  onClick={() => setViewMode(viewMode === 'COMIC' ? 'GRID' : 'COMIC')}
                  aria-label={viewMode === 'COMIC' ? 'Exit Comic Mode' : 'Comic Mode'}
                  className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-colors focus:ring-2 focus:ring-indigo-500 outline-none ${viewMode === 'COMIC' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                >
                  <ImageIcon className="w-4 h-4" /> {viewMode === 'COMIC' ? 'Exit Comic' : 'Comic Mode'}
                </button>
                <button 
                  onClick={handleAddStoryboard}
                  aria-label="Add Storyboard"
                  className="flex items-center gap-2 text-sm font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <Plus className="w-4 h-4" /> Add Storyboard
                </button>
              </div>
            </div>

            <div className="flex-1 p-8 overflow-y-auto space-y-12">
              {(!activeProject.storyboards || activeProject.storyboards.length === 0) && (
                <div className="text-center py-20 flex flex-col items-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/50">
                  <Film className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4" />
                  <h3 className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mb-2">No storyboards yet</h3>
                  <p className="text-sm text-zinc-500 mb-6 max-w-xs">Create your first storyboard to start organizing your frames and shots for this project.</p>
                  <button 
                    onClick={handleAddStoryboard}
                    className="flex items-center gap-2 text-sm font-semibold bg-indigo-600 text-white px-5 py-2.5 rounded-xl shadow-sm hover:bg-indigo-700 transition-colors focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <Plus className="w-4 h-4" /> Create First Storyboard
                  </button>
                </div>
              )}

              {activeProject.storyboards?.map((storyboard: any) => (
                <div key={storyboard.id} className="space-y-6">
                  <div className="flex items-center justify-between border-b-2 border-zinc-200 dark:border-zinc-800 pb-2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        {storyboard.episodeProductionId && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded-sm">Episode Linked</span>
                        )}
                        {storyboard.documentId && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-sm">Document Linked</span>
                        )}
                      </div>
                      <input 
                        type="text" 
                        defaultValue={storyboard.title}
                        onChange={(e) => debouncedUpdateStoryboard(storyboard.id, { title: e.target.value })}
                        aria-label="Storyboard Title"
                        className="text-xl font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider bg-transparent border-none focus:ring-2 focus:ring-indigo-500 p-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-2 -ml-2 transition-colors outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      
                      {/* Review Feedback Display */}
                      <div className="flex items-center gap-2 mr-2">
                        {(!storyboard.feedbackStats || (storyboard.feedbackStats.comments === 0 && storyboard.feedbackStats.favorites === 0)) ? (
                          <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
                            No feedback yet
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/20">
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              {storyboard.feedbackStats.comments}
                            </span>
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                              </svg>
                              {storyboard.feedbackStats.favorites}
                            </span>
                          </div>
                        )}
                      </div>

                      {storyboard.frames && storyboard.frames.length > 0 && (
                        <a 
                          href={`/review/${storyboard.id}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open in Review Mode"
                          className="text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                        >
                          Review Mode ↗
                        </a>
                      )}
                      <select 
                        defaultValue={storyboard.aspectRatio || '16:9'}
                        onChange={(e) => updateStoryboard(storyboard.id, { aspectRatio: e.target.value })}
                        aria-label="Storyboard Aspect Ratio"
                        className="text-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-lg text-zinc-700 dark:text-zinc-300 py-1.5 pl-3 pr-8 focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {ASPECT_RATIOS.map(ratio => (
                          <option key={ratio.value} value={ratio.value}>{ratio.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {viewMode === 'SCROLL' && (
                    <ScrollytellingRenderer frames={storyboard.frames} />
                  )}

                  {viewMode === 'COMIC' && (
                    <ComicRenderer frames={storyboard.frames} />
                  )}

                   {viewMode === 'GRID' && (
                    <StoryboardGridRenderer 
                      storyboard={storyboard}
                      mediaAssets={activeProject.mediaAssets || []}
                      generatingFrames={generatingFrames}
                      onGenerateFrame={handleGenerateFrame}
                      onAddFrame={() => handleAddFrame(storyboard.id, storyboard.frames?.length || 0)}
                      aiConfigStatus={aiConfigStatus}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
