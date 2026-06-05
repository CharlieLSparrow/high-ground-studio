"use client";

import { useState, useEffect, useRef } from "react";
import { StoryboardFrameType } from "./FrameCard";
import { X, Image as ImageIcon, Video, AlignLeft, Trash2, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { updateStoryboardFrame, deleteStoryboardFrame } from "../actions";

interface FrameInspectorProps {
  frame: StoryboardFrameType;
  onClose: () => void;
  onUpdate: (updatedFrame: StoryboardFrameType) => void;
  onDelete: (id: string) => void;
}

type SyncState = "idle" | "saving" | "saved" | "error";

export function FrameInspector({ frame, onClose, onUpdate, onDelete }: FrameInspectorProps) {
  const [formData, setFormData] = useState<Partial<StoryboardFrameType>>(frame);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  // Reset form data if a new frame is selected
  useEffect(() => {
    setFormData(frame);
    setSyncState("idle");
    setErrorMessage(null);
    isFirstRender.current = true;
  }, [frame]);

  // Debounced Auto-Save
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      setSyncState("saving");
      setErrorMessage(null);

      try {
        const res = await updateStoryboardFrame(frame.id, {
          action: formData.action ?? undefined,
          dialogue: formData.dialogue ?? undefined,
          cameraInfo: formData.cameraInfo ?? undefined,
          shotSize: formData.shotSize ?? undefined,
          lens: formData.lens ?? undefined,
          estimatedDuration: formData.estimatedDuration ? Number(formData.estimatedDuration) : undefined,
          vfxNotes: formData.vfxNotes ?? undefined,
        });

        if (res.success && res.data) {
          // Merge with any client state
          onUpdate({ ...frame, ...res.data });
          setSyncState("saved");
          setTimeout(() => {
            setSyncState((prev) => (prev === "saved" ? "idle" : prev));
          }, 2000);
        } else {
          setSyncState("error");
          setErrorMessage(res.error || "Failed to save changes.");
        }
      } catch (e) {
        setSyncState("error");
        setErrorMessage("Network error while saving.");
      }
    }, 700); // 700ms debounce

    return () => clearTimeout(timer);
  }, [
    formData.action, 
    formData.dialogue, 
    formData.cameraInfo, 
    formData.shotSize, 
    formData.lens, 
    formData.estimatedDuration, 
    formData.vfxNotes
  ]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this frame?")) {
      const res = await deleteStoryboardFrame(frame.id);
      if (res.success) {
        onDelete(frame.id);
        onClose();
      } else {
        alert(res.error || "Failed to delete frame.");
      }
    }
  };

  return (
    <div className="w-80 sm:w-96 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col h-full shrink-0 overflow-y-auto transition-transform">
      <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md z-10">
        <div className="flex flex-col">
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <span>Inspector</span>
            <span className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-500">{frame.frameNumber}</span>
          </h3>
          
          <div className="flex items-center gap-1.5 mt-1 text-xs font-medium h-4">
            {syncState === "saving" && (
              <span className="text-zinc-500 flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Saving...
              </span>
            )}
            {syncState === "saved" && (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={12} /> Saved
              </span>
            )}
            {syncState === "error" && (
              <span className="text-red-600 dark:text-red-400 flex items-center gap-1" title={errorMessage || ""}>
                <AlertCircle size={12} /> {errorMessage || "Error saving"}
              </span>
            )}
          </div>
        </div>

        <button 
          onClick={onClose} 
          aria-label="Close inspector"
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-6 pb-24">
        {/* Visual Preview */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
            <ImageIcon size={14} /> Visual
          </label>
          <div className="aspect-video bg-zinc-100 dark:bg-zinc-900 rounded-lg flex items-center justify-center border border-dashed border-zinc-300 dark:border-zinc-700 relative overflow-hidden group cursor-pointer focus-within:ring-2 focus-within:ring-orange-500">
            {formData.imageUrl ? (
              <img src={formData.imageUrl} alt="Frame visual" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-medium text-zinc-400">No Render</span>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <button 
                className="text-white text-xs font-medium px-3 py-1.5 bg-zinc-800/80 rounded-md hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                aria-label="Generate AI image for frame"
              >
                Generate Image
              </button>
            </div>
          </div>
        </div>

        {/* Cinematography */}
        <div className="space-y-4 border-t border-zinc-100 dark:border-zinc-800 pt-4">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
            <Video size={14} /> Cinematography
          </label>
          
          <div className="space-y-1.5">
            <label htmlFor="shotSize" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Shot Size</label>
            <select 
              id="shotSize"
              name="shotSize" 
              value={formData.shotSize || ""} 
              onChange={handleChange}
              className="w-full text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500 transition-shadow"
            >
              <option value="Extreme Wide Shot">Extreme Wide Shot</option>
              <option value="Wide Shot">Wide Shot</option>
              <option value="Full Shot">Full Shot</option>
              <option value="Medium Shot">Medium Shot</option>
              <option value="Close Up">Close Up</option>
              <option value="Extreme Close Up">Extreme Close Up</option>
              <option value="Over the Shoulder">Over the Shoulder</option>
              <option value="POV">Point of View (POV)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cameraInfo" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Camera Movement & Angle</label>
            <input 
              id="cameraInfo"
              type="text" 
              name="cameraInfo" 
              value={formData.cameraInfo || ""} 
              onChange={handleChange}
              placeholder="e.g. Slow push in, low angle"
              maxLength={255}
              className="w-full text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500 transition-shadow"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="lens" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Lens</label>
              <input 
                id="lens"
                type="text" 
                name="lens" 
                value={formData.lens || ""} 
                onChange={handleChange}
                placeholder="e.g. 50mm"
                maxLength={100}
                className="w-full text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500 transition-shadow"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="estimatedDuration" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Duration (s)</label>
              <input 
                id="estimatedDuration"
                type="number" 
                name="estimatedDuration" 
                value={formData.estimatedDuration || ""} 
                onChange={handleChange}
                placeholder="Seconds"
                min="0"
                step="0.1"
                className="w-full text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500 transition-shadow"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 border-t border-zinc-100 dark:border-zinc-800 pt-4">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
            <AlignLeft size={14} /> Action & Script
          </label>
          
          <div className="space-y-1.5">
            <label htmlFor="action" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Action Description</label>
            <textarea 
              id="action"
              name="action" 
              value={formData.action || ""} 
              onChange={handleChange}
              rows={4}
              maxLength={1000}
              placeholder="Describe what is happening in the frame..."
              className="w-full text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500 resize-none transition-shadow"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="dialogue" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Dialogue</label>
            <textarea 
              id="dialogue"
              name="dialogue" 
              value={formData.dialogue || ""} 
              onChange={handleChange}
              rows={3}
              maxLength={500}
              placeholder="Any spoken lines during this shot?"
              className="w-full text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500 resize-none transition-shadow"
            />
          </div>
          
          <div className="space-y-1.5">
            <label htmlFor="vfxNotes" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">VFX Notes</label>
            <textarea 
              id="vfxNotes"
              name="vfxNotes" 
              value={formData.vfxNotes || ""} 
              onChange={handleChange}
              rows={2}
              maxLength={1000}
              placeholder="Greenscreen, explosions, color grade..."
              className="w-full text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500 resize-none transition-shadow"
            />
          </div>
        </div>
      </div>

      <div className="mt-auto p-4 border-t border-zinc-200 dark:border-zinc-800 sticky bottom-0 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md">
        <button 
          onClick={handleDelete}
          aria-label="Delete this frame"
          className="w-full flex items-center justify-center gap-2 text-red-600 dark:text-red-400 font-medium px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <Trash2 size={16} />
          Delete Frame
        </button>
      </div>
    </div>
  );
}
