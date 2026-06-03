"use client";

import { Image as ImageIcon, Camera, Move, Maximize, Type, GripVertical, Wand2 } from "lucide-react";
import { useRef } from "react";
import { cn } from "../../studio-ui";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type StoryboardShot = {
  id: string;
  sceneNumber: string;
  shotNumber: string;
  image?: string;
  action: string;
  dialogue?: string;
  cameraInfo: string;
  vfxNotes?: string;
};

export type StoryboardFrameProps = {
  shot: StoryboardShot;
  aspectRatio?: "16:9" | "2.35:1" | "4:3" | "1:1";
  className?: string;
  onGenerate?: (id: string, prompt: string) => void;
  isGenerating?: boolean;
  onUpload?: (id: string, file: File) => void;
  isUploading?: boolean;
};

export function StoryboardFrame({
  shot,
  aspectRatio = "16:9",
  className,
  onGenerate,
  isGenerating = false,
  onUpload,
  isUploading = false,
}: StoryboardFrameProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shot.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-studio-line-strong bg-[#0a0d0b] text-studio-ink shadow-sm transition-all hover:border-studio-source/40 hover:shadow-md",
        className,
        (isGenerating || isUploading) && "opacity-70 animate-pulse border-indigo-500/50",
        isDragging && "opacity-50 z-50 scale-105 shadow-2xl ring-2 ring-studio-source"
      )}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        hidden 
        accept="image/*" 
        onChange={(e) => {
          if (e.target.files?.[0]) {
            onUpload?.(shot.id, e.target.files[0]);
          }
        }} 
      />
      {/* Header: Scene/Shot Info */}
      <div className="flex items-center justify-between border-b border-studio-line/40 bg-studio-ink/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <div 
            {...attributes} 
            {...listeners} 
            className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded opacity-50 hover:bg-studio-line/30 group-hover:opacity-100 transition-all outline-none touch-none"
          >
            <GripVertical className="h-4 w-4 text-studio-muted" />
          </div>
          <span className="font-mono text-xs font-bold text-studio-dim">
            SC {shot.sceneNumber} • SHOT {shot.shotNumber}
          </span>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="rounded p-1 text-studio-muted hover:bg-studio-line/30 hover:text-studio-ink transition-colors" title="Add Camera Move">
            <Move size={14} />
          </button>
          <button className="rounded p-1 text-studio-muted hover:bg-studio-line/30 hover:text-studio-ink transition-colors" title="Change Lens/Framing">
            <Maximize size={14} />
          </button>
        </div>
      </div>

      {/* Frame Canvas */}
      <div
        className={cn(
          "relative flex items-center justify-center bg-[#050706] border-b border-studio-line/40 overflow-hidden",
          aspectRatio === "16:9" && "aspect-video",
          aspectRatio === "2.35:1" && "aspect-[2.35/1]",
          aspectRatio === "4:3" && "aspect-[4/3]",
          aspectRatio === "1:1" && "aspect-square"
        )}
      >
        {shot.image ? (
          <img
            src={shot.image}
            alt={`Scene ${shot.sceneNumber} Shot ${shot.shotNumber}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-studio-muted/50">
            <ImageIcon size={32} strokeWidth={1.5} />
            <span className="text-xs font-semibold uppercase tracking-widest">
              Empty Frame
            </span>
          </div>
        )}

        {/* Temporary overlay tools mock */}
        {!isGenerating && !isUploading && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex w-32 items-center justify-center gap-1.5 rounded-lg bg-studio-source/20 border border-studio-source/40 px-3 py-1.5 text-xs font-bold text-studio-source hover:bg-studio-source/30 transition-colors"
            >
              <Camera size={14} /> Upload
            </button>
            <button 
              onClick={() => onGenerate?.(shot.id, shot.action)}
              className="flex w-32 items-center justify-center gap-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/40 px-3 py-1.5 text-xs font-bold text-indigo-400 hover:bg-indigo-500/30 transition-colors"
            >
              <Wand2 size={14} /> Generate
            </button>
          </div>
        )}
      </div>

      {/* Shot Details (Action / Dialogue) */}
      <div className="flex flex-1 flex-col gap-2 p-3 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-bold uppercase tracking-widest text-studio-dim">
            Camera / Setup
          </span>
          <p className="text-studio-source font-medium">{shot.cameraInfo}</p>
        </div>
        
        <div className="h-px w-full bg-studio-line/20 my-1" />
        
        <div className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-bold uppercase tracking-widest text-studio-dim flex items-center gap-1">
            <Type size={10} /> Action
          </span>
          <p className="text-studio-ink/90 leading-relaxed text-sm">
            {shot.action}
          </p>
        </div>

        {shot.dialogue && (
          <div className="flex flex-col gap-1 mt-1 border-l-2 border-studio-line pl-2">
             <span className="text-[0.65rem] font-bold uppercase tracking-widest text-studio-dim">
               Dialogue
             </span>
             <p className="text-studio-muted italic text-sm">
               {shot.dialogue}
             </p>
          </div>
        )}
      </div>
    </div>
  );
}
