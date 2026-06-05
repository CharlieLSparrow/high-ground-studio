import React, { useState } from 'react';
import Image from 'next/image';
import { Film, Clapperboard, Plus, AlignLeft, Settings2, Loader2, Image as ImageIcon } from 'lucide-react';
import { updateStoryboardFrame } from '../actions';
import { MediaAssetPicker } from '@/app/(app)/editor/MediaAssetPicker';
import { useDebouncedCallback } from './hooks';

const ASPECT_RATIOS = [
  { label: '16:9 (Standard Widescreen)', value: '16:9', className: 'aspect-video' },
  { label: '2.35:1 (Cinemascope)', value: '2.35:1', className: 'aspect-[2.35/1]' },
  { label: '4:3 (Classic)', value: '4:3', className: 'aspect-[4/3]' },
  { label: '1:1 (Square)', value: '1:1', className: 'aspect-square' },
];

const SHOT_SIZES = ['ECU', 'CU', 'MCU', 'MS', 'MWS', 'WS', 'EWS'];
const LENSES = ['14mm', '24mm', '35mm', '50mm', '85mm', '100mm', '200mm'];
const CAMERA_MOVEMENTS = ['Static', 'Pan', 'Tilt', 'Dolly', 'Tracking', 'Steadicam', 'Crane', 'Handheld', 'Drone'];

export function StoryboardGridRenderer({ 
  storyboard, 
  generatingFrames, 
  onGenerateFrame,
  onAddFrame
}: { 
  storyboard: any; 
  generatingFrames: Record<string, boolean>;
  onGenerateFrame: (frameId: string, storyboardId: string) => void;
  onAddFrame: () => void;
}) {
  const [activePickerFrameId, setActivePickerFrameId] = useState<string | null>(null);

  const debouncedUpdateFrame = useDebouncedCallback((id: string, data: any) => {
    updateStoryboardFrame(id, data);
  }, 500);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {storyboard.frames?.map((frame: any) => {
        const ratioClass = ASPECT_RATIOS.find(r => r.value === (storyboard.aspectRatio || '16:9'))?.className || 'aspect-video';
        
        return (
        <div key={frame.id} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm flex flex-col focus-within:ring-2 focus-within:ring-indigo-500 transition-shadow">
          
          {/* Frame Header */}
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50 dark:bg-zinc-900 flex justify-between items-center">
            <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400">Frame {frame.frameNumber}</span>
            <div className="flex gap-2 text-xs">
              <select 
                defaultValue={frame.shotSize || ''}
                onChange={(e) => updateStoryboardFrame(frame.id, { shotSize: e.target.value })}
                className="bg-zinc-200 dark:bg-zinc-800 border-none rounded py-0.5 px-2 font-semibold text-zinc-600 dark:text-zinc-400"
                aria-label="Shot Size"
              >
                <option value="">Size...</option>
                {SHOT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select 
                defaultValue={frame.lens || ''}
                onChange={(e) => updateStoryboardFrame(frame.id, { lens: e.target.value })}
                className="bg-zinc-200 dark:bg-zinc-800 border-none rounded py-0.5 px-2 font-semibold text-zinc-600 dark:text-zinc-400"
                aria-label="Lens"
              >
                <option value="">Lens...</option>
                {LENSES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select 
                defaultValue={frame.cameraMovement || ''}
                onChange={(e) => updateStoryboardFrame(frame.id, { cameraMovement: e.target.value })}
                className="bg-zinc-200 dark:bg-zinc-800 border-none rounded py-0.5 px-2 font-semibold text-zinc-600 dark:text-zinc-400"
                aria-label="Camera Movement"
              >
                <option value="">Move...</option>
                {CAMERA_MOVEMENTS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Frame Body */}
          <div className="flex flex-col sm:flex-row h-full">
            {/* Image Area */}
            <div className={`sm:w-1/2 flex flex-col border-b sm:border-b-0 sm:border-r border-zinc-200 dark:border-zinc-800 relative`}>
              {generatingFrames[frame.id] && (
                <div className="absolute inset-0 bg-indigo-500/10 z-20 animate-pulse pointer-events-none" />
              )}
              <div className={`${ratioClass} bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center justify-center relative overflow-hidden`}>
                {frame.imageUrl ? (
                  <Image src={frame.imageUrl} alt={`Frame ${frame.frameNumber}`} fill className="object-cover" />
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
                    <span className="text-xs text-zinc-400 font-medium">No Image Generated</span>
                    <button 
                      onClick={() => onGenerateFrame(frame.id, storyboard.id)}
                      disabled={generatingFrames[frame.id]}
                      aria-label="Generate Frame Image"
                      className="mt-3 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50 flex items-center gap-1 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                      {generatingFrames[frame.id] ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</> : "Generate Frame"}
                    </button>
                  </>
                )}
                {/* Overlay generating state if it already has an image but is re-generating */}
                {generatingFrames[frame.id] && frame.imageUrl && (
                  <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center z-10">
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                  </div>
                )}
              </div>
              
              {/* Editor Media Handoff Area */}
              <div className="flex-1 bg-zinc-50 dark:bg-zinc-900/50 p-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-col justify-center items-center">
                {frame.mediaClipId ? (
                  <div className="w-full flex items-center gap-3 bg-white dark:bg-zinc-800 p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm relative group">
                    <div className="w-12 h-8 bg-zinc-200 dark:bg-zinc-900 rounded flex-shrink-0 flex items-center justify-center overflow-hidden">
                      <Film className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 truncate">Linked Media</p>
                        <span className="text-[8px] uppercase tracking-wider font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500 px-1.5 py-0.5 rounded">Preview Missing</span>
                      </div>
                      <p className="text-[10px] text-zinc-500 truncate font-mono">{frame.mediaClipId}</p>
                      <p className="text-[9px] text-zinc-400 mt-0.5">Awaiting Video Editor preview component.</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setActivePickerFrameId(frame.id)}
                        aria-label="Replace Media"
                        className="text-[10px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-semibold px-2 focus:ring-2 focus:ring-indigo-500 rounded outline-none"
                      >
                        Replace
                      </button>
                      <button 
                        onClick={() => updateStoryboardFrame(frame.id, { mediaClipId: null })}
                        aria-label="Remove Media"
                        className="text-[10px] text-red-600 hover:text-red-700 font-semibold px-2 focus:ring-2 focus:ring-red-500 rounded outline-none"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2 text-center border border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg bg-white/50 dark:bg-zinc-800/20 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                    <button 
                      onClick={() => setActivePickerFrameId(frame.id)}
                      aria-label="Pick Media Clip"
                      className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 px-3 py-1.5 rounded-full transition-colors focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <Clapperboard className="w-3.5 h-3.5" />
                      Pick Media
                    </button>
                    <p className="text-[10px] text-zinc-400 max-w-[150px] leading-tight font-medium">
                      Link a video clip from this project's library.
                    </p>
                  </div>
                )}
                
                {/* Inline Media Asset Picker for this frame */}
                {activePickerFrameId === frame.id && (
                  <div className="absolute inset-0 z-10 bg-white/95 dark:bg-zinc-950/95 p-4 flex flex-col border border-indigo-200 dark:border-indigo-800 rounded-2xl shadow-xl backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Select Media Clip</h4>
                      <button 
                        onClick={() => setActivePickerFrameId(null)} 
                        aria-label="Close Picker"
                        className="text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 focus:ring-2 focus:ring-indigo-500 rounded px-1 outline-none">Close</button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <MediaAssetPicker 
                        assets={[]} 
                        selectedId={frame.mediaClipId || undefined}
                        onSelect={(assetId) => {
                          updateStoryboardFrame(frame.id, { mediaClipId: assetId });
                          setActivePickerFrameId(null);
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Editor Area */}
            <div className="sm:w-1/2 p-4 flex flex-col gap-4 text-sm relative z-0">
              <div className="flex-1">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Settings2 className="w-3 h-3" /> Action
                </label>
                <textarea 
                  defaultValue={frame.action}
                  aria-label="Action description"
                  className="w-full bg-transparent border-none resize-none focus:ring-0 p-0 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 outline-none"
                  rows={3}
                  placeholder="Describe the action..."
                  onChange={(e) => debouncedUpdateFrame(frame.id, { action: e.target.value })}
                />
              </div>
              <div className="flex-1 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <AlignLeft className="w-3 h-3" /> Dialogue / Notes
                </label>
                <textarea 
                  defaultValue={frame.dialogue || ''}
                  aria-label="Dialogue or notes"
                  className="w-full bg-transparent border-none resize-none focus:ring-0 p-0 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 outline-none"
                  rows={2}
                  placeholder="Any dialogue or specific notes..."
                  onChange={(e) => debouncedUpdateFrame(frame.id, { dialogue: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                <label htmlFor={`duration-${frame.id}`} className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Duration (s):
                </label>
                <input 
                  id={`duration-${frame.id}`}
                  type="number" 
                  step="0.1"
                  defaultValue={frame.estimatedDuration || ''}
                  onChange={(e) => debouncedUpdateFrame(frame.id, { estimatedDuration: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-16 bg-transparent border-b border-zinc-200 dark:border-zinc-700 focus:border-indigo-500 focus:ring-0 px-1 py-0.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      );
    })}
      
      {/* Add Frame Button Card */}
      <button 
        onClick={onAddFrame}
        aria-label="Add Frame"
        className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl flex flex-col items-center justify-center p-8 text-zinc-400 hover:text-indigo-500 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all min-h-[250px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <Plus className="w-8 h-8 mb-2" />
        <span className="font-bold">Add Frame</span>
      </button>

    </div>
  );
}
