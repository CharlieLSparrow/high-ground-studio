"use client";

import React, { useState } from 'react';
import { Film, Clapperboard, Plus, Image as ImageIcon, AlignLeft, Camera, Settings2 } from 'lucide-react';
import { createProject, createScene, createShot, updateShot } from '../actions';
import Image from 'next/image';

type Props = {
  initialProjects: any[];
};

export function StoryboardClient({ initialProjects }: Props) {
  const [projects, setProjects] = useState<any[]>(initialProjects);
  const [activeProject, setActiveProject] = useState(initialProjects[0] || null);

  const handleNewProject = async () => {
    const title = prompt("Project Title:");
    if (!title) return;
    
    const formData = new FormData();
    formData.append("title", title);
    
    const res = await createProject(formData);
    if (res.success && res.project) {
      setProjects([res.project, ...projects]);
      setActiveProject(res.project);
    }
  };

  const handleAddScene = async () => {
    if (!activeProject) return;
    const sceneNumber = prompt("Scene Number (e.g. 1, 2A):");
    if (!sceneNumber) return;

    const res = await createScene(activeProject.id, sceneNumber);
    if (res.success) {
      // Refresh logic would ideally re-fetch from server, but we can do a naive append for speed
      const updatedProject = { ...activeProject, scenes: [...(activeProject.scenes || []), { ...res.scene, shots: [] }] };
      setActiveProject(updatedProject);
    }
  };

  const handleAddShot = async (sceneId: string, currentShotCount: number) => {
    const shotNumber = prompt("Shot Number (e.g. 1.1, 1.2):", `1.${currentShotCount + 1}`);
    if (!shotNumber) return;

    const res = await createShot(sceneId, shotNumber);
    if (res.success) {
      const updatedScenes = activeProject.scenes.map((s: any) => {
        if (s.id === sceneId) {
          return { ...s, shots: [...s.shots, res.shot] };
        }
        return s;
      });
      setActiveProject({ ...activeProject, scenes: updatedScenes });
    }
  };

  return (
    <div className="flex w-full h-full divide-x divide-zinc-200 dark:divide-zinc-800">
      
      {/* LEFT PANE: PROJECTS */}
      <div className="w-80 flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-y-auto">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="font-bold text-zinc-900 dark:text-white">Projects</h2>
          </div>
          <button 
            onClick={handleNewProject}
            className="flex items-center gap-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> New
          </button>
        </div>

        <div className="p-4 space-y-2">
          {projects.length === 0 ? (
            <div className="text-center p-6 text-zinc-500 text-sm">
              No projects yet. Click New to create a film project.
            </div>
          ) : (
            projects.map(proj => (
              <button
                key={proj.id}
                onClick={() => setActiveProject(proj)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${activeProject?.id === proj.id ? 'bg-white dark:bg-zinc-900 border-indigo-200 dark:border-indigo-800 shadow-sm ring-1 ring-indigo-500' : 'bg-transparent border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-900/50'}`}
              >
                <h3 className={`font-bold ${activeProject?.id === proj.id ? 'text-indigo-900 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {proj.title}
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
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
            <Clapperboard className="w-16 h-16 mb-4 opacity-20" />
            <h3 className="text-xl font-bold text-zinc-700 dark:text-zinc-300">Storyboard Builder</h3>
            <p className="mt-2 text-sm text-zinc-500 max-w-sm text-center">
              Select or create a project to start mapping out your scenes and shots.
            </p>
          </div>
        ) : (
          <>
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{activeProject.title}</h1>
                <p className="text-sm text-zinc-500 mt-1">{activeProject.description}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleAddScene}
                  className="flex items-center gap-2 text-sm font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Scene
                </button>
              </div>
            </div>

            <div className="flex-1 p-8 overflow-y-auto space-y-12">
              {(!activeProject.scenes || activeProject.scenes.length === 0) && (
                <div className="text-center p-12 text-zinc-500">
                  <p>No scenes found. Add a scene to begin storyboarding.</p>
                </div>
              )}

              {activeProject.scenes?.map((scene: any) => (
                <div key={scene.id} className="space-y-6">
                  <div className="flex items-center justify-between border-b-2 border-zinc-200 dark:border-zinc-800 pb-2">
                    <h2 className="text-xl font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                      Scene {scene.sceneNumber} - {scene.title}
                    </h2>
                    <span className="text-sm text-zinc-500 font-medium">{scene.location || 'INT/EXT'} • {scene.timeOfDay || 'DAY/NIGHT'}</span>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {scene.shots?.map((shot: any) => (
                      <div key={shot.id} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                        
                        {/* Shot Header */}
                        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50 dark:bg-zinc-900 flex justify-between items-center">
                          <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400">Shot {shot.shotNumber}</span>
                          <span className="text-xs font-semibold text-zinc-500 bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Camera className="w-3 h-3" /> {shot.cameraInfo}
                          </span>
                        </div>

                        {/* Shot Body */}
                        <div className="flex flex-col sm:flex-row h-full">
                          {/* Image Area */}
                          <div className="sm:w-1/2 aspect-video bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center justify-center border-b sm:border-b-0 sm:border-r border-zinc-200 dark:border-zinc-800 relative">
                            {shot.imageUrl ? (
                              <Image src={shot.imageUrl} alt={`Shot ${shot.shotNumber}`} fill className="object-cover" />
                            ) : (
                              <>
                                <ImageIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
                                <span className="text-xs text-zinc-400 font-medium">No Image Generated</span>
                                {/* This button will be wired up to Gemini/Imagen 3 in Sprint 12! */}
                                <button className="mt-3 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                                  Generate Shot
                                </button>
                              </>
                            )}
                          </div>

                          {/* Editor Area */}
                          <div className="sm:w-1/2 p-4 flex flex-col gap-4 text-sm">
                            <div className="flex-1">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Settings2 className="w-3 h-3" /> Action
                              </label>
                              <textarea 
                                defaultValue={shot.action}
                                className="w-full bg-transparent border-none resize-none focus:ring-0 p-0 text-zinc-800 dark:text-zinc-200"
                                rows={3}
                                placeholder="Describe the action..."
                                onBlur={(e) => updateShot(shot.id, { action: e.target.value })}
                              />
                            </div>
                            <div className="flex-1 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <AlignLeft className="w-3 h-3" /> Dialogue / Notes
                              </label>
                              <textarea 
                                defaultValue={shot.dialogue || ''}
                                className="w-full bg-transparent border-none resize-none focus:ring-0 p-0 text-zinc-800 dark:text-zinc-200"
                                rows={2}
                                placeholder="Any dialogue or specific notes..."
                                onBlur={(e) => updateShot(shot.id, { dialogue: e.target.value })}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {/* Add Shot Button Card */}
                    <button 
                      onClick={() => handleAddShot(scene.id, scene.shots?.length || 0)}
                      className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl flex flex-col items-center justify-center p-8 text-zinc-400 hover:text-indigo-500 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all min-h-[250px]"
                    >
                      <Plus className="w-8 h-8 mb-2" />
                      <span className="font-bold">Add Shot</span>
                    </button>

                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
