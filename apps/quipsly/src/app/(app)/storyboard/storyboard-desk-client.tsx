"use client";

import { useState } from "react";
import { StudioNav } from "../studio-nav";
import {
  cn,
  panelClassName,
  labelClassName,
  panelTitleClassName,
  panelCopyClassName,
  StudioChip,
  StudioGlyph,
} from "../studio-ui";
import { StoryboardFrame, type StoryboardShot } from "../components/storyboard/StoryboardFrame";
import Editor from "@/components/Editor";
import { Users2, Columns2, Columns3, Columns4, Settings, Plus, Download, LayoutTemplate, PanelLeft, BookOpen } from "lucide-react";

import { addStoryboardShot, updateStoryboardShot, reorderStoryboardShots } from "./actions";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';

export function StoryboardDeskClient({ initialShots, cast = [] }: { initialShots: StoryboardShot[], cast?: any[] }) {
  const [columns, setColumns] = useState<2 | 3 | 4>(3);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "2.35:1">("16:9");
  const [shots, setShots] = useState<StoryboardShot[]>(initialShots);
  const [showScript, setShowScript] = useState(true);
  const [showCast, setShowCast] = useState(true);
  const [generatingShots, setGeneratingShots] = useState<Set<string>>(new Set());
  const [uploadingShots, setUploadingShots] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setShots((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        
        const newArray = arrayMove(items, oldIndex, newIndex);
        
        // Fire and forget server action to update db
        reorderStoryboardShots(newArray.map(s => s.id));
        
        return newArray;
      });
    }
  };

  const handleSelectStoryboard = async (text: string) => {
    // Optimistic local state update removed to let server dictate the true ID
    // Otherwise we'd have to sync the temporary ID.
    // Instead we'll show a loading state on the page, or just append it and replace.
    // Let's just create it on the server and then append.
    const newShot = await addStoryboardShot({
      action: text,
      cameraInfo: "SUGGESTED CAMERA"
    });
    setShots((prev) => [...prev, newShot]);
  };

  const handleAddShot = async () => {
    const newShot = await addStoryboardShot({
      action: "Describe the action here...",
      cameraInfo: "NEW CAMERA SETUP"
    });
    setShots((prev) => [...prev, newShot]);
  };

  const handleGenerate = async (id: string, prompt: string) => {
    setGeneratingShots((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    try {
      const response = await fetch("/api/storyboard/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) throw new Error("Failed to generate image");

      const data = await response.json();

      setShots((prev) => 
        prev.map((shot) => 
          shot.id === id 
            ? { ...shot, image: data.url } 
            : shot
        )
      );
      
      // Update DB permanently
      await updateStoryboardShot(id, { image: data.url });
    } catch (error) {
      console.error("Storyboard Generate Error:", error);
      // Optional: show a toast or error state here
    } finally {
      setGeneratingShots((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleUpload = async (id: string, file: File) => {
    setUploadingShots((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    // 1. Immediate local preview for fast UI feedback
    const objectUrl = URL.createObjectURL(file);
    setShots((prev) => 
      prev.map((shot) => shot.id === id ? { ...shot, image: objectUrl } : shot)
    );

    try {
      // 2. Request a GCS Presigned URL
      const response = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          directory: "storyboards",
        }),
      });

      if (!response.ok) throw new Error("Failed to get presigned URL");

      const { url, publicUrl } = await response.json();

      // 3. PUT the file directly to Google Cloud Storage
      // If the backend returned the fallback mock URL, we skip the PUT to prevent CORS/fetch errors in the prototype.
      if (!url.includes("X-Goog-Signature=mock")) {
        await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
      }

      // 4. Update the state with the permanent public GCS URL
      setShots((prev) => 
        prev.map((shot) => shot.id === id ? { ...shot, image: publicUrl } : shot)
      );
      
      // Update DB permanently
      await updateStoryboardShot(id, { image: publicUrl });
    } catch (error) {
      console.error("Storyboard Upload Error:", error);
      // We don't revert the local preview image so the user can still see it in the prototype
    } finally {
      setUploadingShots((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <main className="min-h-screen p-3.5 md:p-6 bg-[#030404] flex flex-col lg:flex-row gap-[18px]">
      
      {/* Optional Cast Sidebar */}
      {showCast && (
        <aside className="hidden lg:flex w-[300px] flex-col gap-[18px]">
          <div className={cn(panelClassName, "flex flex-col h-full overflow-hidden")}>
             <div className="border-b border-studio-line/40 px-4 py-3 flex items-center justify-between bg-studio-ink/5">
                <h2 className="text-sm font-bold text-studio-ink flex items-center gap-2">
                  <Users2 size={16} className="text-[#8c6b4a]" /> Entity Cast
                </h2>
             </div>
             <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-studio-panel/50">
               {cast.length === 0 ? (
                 <p className="text-xs text-studio-muted text-center p-4">No characters available in the Forge.</p>
               ) : (
                 cast.map((c: any) => (
                   <div key={c.id} className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex items-center gap-3 cursor-grab hover:bg-white/10 transition-colors">
                     <div className="w-8 h-8 rounded-full bg-[#8c6b4a]/20 text-[#8c6b4a] font-bold flex items-center justify-center text-xs">
                       {c.name.charAt(0)}
                     </div>
                     <div className="flex-1 min-w-0">
                       <h4 className="text-sm font-bold text-studio-ink truncate">{c.name}</h4>
                       <p className="text-[10px] text-studio-muted truncate">{c.archetype || "Unknown Role"}</p>
                     </div>
                   </div>
                 ))
               )}
             </div>
          </div>
        </aside>
      )}

      {/* Optional Script Sidebar */}
      {showScript && (
        <aside className="hidden lg:flex w-[400px] flex-col gap-[18px]">
          <div className={cn(panelClassName, "flex flex-col h-full overflow-hidden")}>
             <div className="border-b border-studio-line/40 px-4 py-3 flex items-center justify-between bg-studio-ink/5">
                <h2 className="text-sm font-bold text-studio-ink flex items-center gap-2">
                  <BookOpen size={16} className="text-studio-node" /> Linked Script
                </h2>
                <StudioChip tone="node">Sync Active</StudioChip>
             </div>
             <div className="flex-1 overflow-y-auto overflow-x-hidden bg-studio-panel/50">
               {/* Live Collaboration Sync */}
               <Editor 
                 roomName="storyboard-prototype"
                 onSelectStoryboard={handleSelectStoryboard} 
               />
             </div>
          </div>
        </aside>
      )}

      {/* Main Storyboard Desk area */}
      <div className="flex-1 grid min-h-[calc(100vh-28px)] grid-rows-[auto_auto_1fr] gap-[18px] md:min-h-[calc(100vh-48px)] min-w-0">
        
        {/* Header */}
        <header
          className={cn(
            panelClassName,
            "flex min-h-[72px] flex-col items-stretch justify-between gap-[18px] px-[18px] py-4 lg:flex-row lg:items-center",
          )}
          aria-label="Studio status"
        >
          <div className="flex min-w-0 flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
            <StudioGlyph />
            <div>
              <h1 className="m-0 text-[1.75rem] leading-[1.08] tracking-normal text-studio-ink max-sm:text-[1.45rem]">
                Storyboard Desk
              </h1>
              <p className="mt-1.5 mb-0 max-w-[760px] text-[0.94rem] leading-relaxed text-studio-muted">
                Pre-visualize the sequence. Connect the script to the screen.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <StudioNav />
            <StudioChip tone="source">Local Prototype</StudioChip>
            <StudioChip tone="tag">Visual Pre-pro</StudioChip>
          </div>
        </header>

        {/* Toolbar */}
        <section
          className={cn(panelClassName, "flex flex-wrap items-center justify-between gap-4 px-4 py-3")}
          aria-label="Storyboard Toolbar"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={labelClassName}>Columns:</span>
              <div className="flex bg-black/20 rounded-lg p-1 border border-studio-line">
                <button
                  onClick={() => setColumns(2)}
                  className={cn("p-1.5 rounded-md transition-colors", columns === 2 ? "bg-studio-line text-studio-ink" : "text-studio-muted hover:text-studio-ink")}
                  title="2 Columns"
                >
                  <Columns2 size={16} />
                </button>
                <button
                  onClick={() => setColumns(3)}
                  className={cn("p-1.5 rounded-md transition-colors", columns === 3 ? "bg-studio-line text-studio-ink" : "text-studio-muted hover:text-studio-ink")}
                  title="3 Columns"
                >
                  <Columns3 size={16} />
                </button>
                <button
                  onClick={() => setColumns(4)}
                  className={cn("p-1.5 rounded-md transition-colors", columns === 4 ? "bg-studio-line text-studio-ink" : "text-studio-muted hover:text-studio-ink")}
                  title="4 Columns"
                >
                  <Columns4 size={16} />
                </button>
              </div>
            </div>

            <div className="w-px h-6 bg-studio-line/40" />

            <div className="flex items-center gap-2">
              <span className={labelClassName}>Aspect:</span>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as any)}
                className="bg-black/20 border border-studio-line rounded-lg px-2 py-1 text-sm text-studio-ink focus:outline-none focus:border-studio-source"
              >
                <option value="16:9">16:9 (Standard)</option>
                <option value="2.35:1">2.35:1 (Cinematic)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowCast(!showCast)}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors hidden lg:flex", showCast ? "bg-[#8c6b4a]/20 border-[#8c6b4a]/40 text-[#8c6b4a]" : "bg-studio-ink/5 border-studio-line text-studio-ink hover:bg-studio-ink/10")}
            >
              <Users2 size={16} /> Cast
            </button>
            <button 
              onClick={() => setShowScript(!showScript)}
              className={cn("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors hidden lg:flex", showScript ? "bg-studio-node/20 border-studio-node/40 text-studio-node" : "bg-studio-ink/5 border-studio-line text-studio-ink hover:bg-studio-ink/10")}
            >
              <PanelLeft size={16} /> Script
            </button>
            <div className="w-px h-6 bg-studio-line/40 hidden lg:block" />

            <button className="flex items-center gap-2 rounded-lg bg-studio-ink/5 border border-studio-line px-3 py-1.5 text-sm font-bold text-studio-ink hover:bg-studio-ink/10 transition-colors">
              <Settings size={16} /> Settings
            </button>
            <button className="flex items-center gap-2 rounded-lg bg-studio-ink/5 border border-studio-line px-3 py-1.5 text-sm font-bold text-studio-ink hover:bg-studio-ink/10 transition-colors">
              <Download size={16} /> Export PDF
            </button>
            <button 
              onClick={handleAddShot}
              className="flex items-center gap-2 rounded-lg bg-studio-source/20 border border-studio-source/50 px-4 py-1.5 text-sm font-extrabold text-studio-source hover:bg-studio-source/30 transition-colors"
            >
              <Plus size={16} /> Add Shot
            </button>
          </div>
        </section>

        {/* Storyboard Grid */}
        <section
          className={cn(
            panelClassName,
            "p-4 flex flex-col gap-4"
          )}
          aria-label="Storyboard frames"
        >
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={shots.map(s => s.id)}
              strategy={rectSortingStrategy}
            >
              <div className={cn(
                "grid gap-4",
                columns === 2 && "md:grid-cols-2",
                columns === 3 && "md:grid-cols-2 lg:grid-cols-3",
                columns === 4 && "md:grid-cols-2 xl:grid-cols-4"
              )}>
                {shots.map((shot) => (
                  <StoryboardFrame
                    key={shot.id}
                    shot={shot}
                    aspectRatio={aspectRatio}
                    onGenerate={handleGenerate}
                    isGenerating={generatingShots.has(shot.id)}
                    onUpload={handleUpload}
                    isUploading={uploadingShots.has(shot.id)}
                  />
                ))}
                
                {/* Add New Frame Placeholder */}
                <div 
                  onClick={handleAddShot}
                  className="flex flex-col items-center justify-center min-h-[300px] rounded-xl border-2 border-dashed border-studio-line/40 bg-studio-ink/5 text-studio-muted cursor-pointer hover:border-studio-source/40 hover:text-studio-source hover:bg-studio-source/5 transition-all group"
                >
                  <div className="rounded-full bg-studio-line/20 p-4 mb-3 group-hover:bg-studio-source/20 group-hover:scale-110 transition-all">
                    <LayoutTemplate size={24} />
                  </div>
                  <span className="font-bold text-sm">Append New Frame</span>
                </div>
              </div>
            </SortableContext>
          </DndContext>
        </section>
      </div>
    </main>
  );
}
