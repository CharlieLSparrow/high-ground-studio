"use client";

import React, { useState, useEffect, useCallback } from "react";
import { StoryEntity, StudioAssistantAction } from "./types";
import { EntityDirectory } from "./EntityDirectory";
import { EntityCard } from "./EntityCard";
import { AssistantInbox } from "./AssistantInbox";
import { TimelineView } from "./TimelineView";
import { CreateEntityModal } from "./CreateEntityModal";
import { Library, Sparkles, Clock } from "lucide-react";

interface StoryBibleSidebarProps {
  projectId: string;
  projectSlug: string;
  documentId: string;
  documentTitle?: string;
  activeBoundary?: any;
  activeView?: any;
  visibleBlocks?: any[];
}

type TabState = "DIRECTORY" | "TIMELINE" | "INBOX";

export function StoryBibleSidebar({
  projectId,
  projectSlug,
  documentId,
  documentTitle,
  activeBoundary,
  activeView,
  visibleBlocks,
}: StoryBibleSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabState>("DIRECTORY");
  const [entities, setEntities] = useState<StoryEntity[]>([]);
  const [actions, setActions] = useState<StudioAssistantAction[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<StoryEntity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch(`/api/story-bible/entities?projectId=${projectId}`);
      if (!res.ok) throw new Error(`entities fetch failed: ${res.status}`);
      const data = await res.json();
      if (data.entities) setEntities(data.entities);
    } catch (e) {
      console.error("[StoryBibleSidebar] fetchEntities error:", e);
    }
  }, [projectId]);

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch(`/api/story-bible/actions?projectId=${projectId}`);
      if (!res.ok) throw new Error(`actions fetch failed: ${res.status}`);
      const data = await res.json();
      if (data.actions) setActions(data.actions);
    } catch (e) {
      console.error("[StoryBibleSidebar] fetchActions error:", e);
    }
  }, [projectId]);

  useEffect(() => {
    Promise.all([fetchEntities(), fetchActions()]).finally(() => setIsLoading(false));
  }, [fetchEntities, fetchActions]);

  const handleProcessAction = async (actionId: string, status: "APPROVED" | "REJECTED") => {
    const previousActions = [...actions];
    setActions((prev) => prev.filter((a) => a.id !== actionId));

    try {
      const res = await fetch("/api/story-bible/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, status }),
      });
      if (!res.ok) throw new Error("Failed to process action");
      if (status === "APPROVED") await fetchEntities();
    } catch (error) {
      console.error("[StoryBibleSidebar] handleProcessAction rollback:", error);
      setActions(previousActions);
    }
  };

  const handleScanEntities = async () => {
    setIsScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/quipsly-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "SCAN_SECTION_FOR_ENTITIES: Extract all key entities (characters, settings, scenes, themes, and motifs) mentioned in the visible text.",
          projectSlug,
          documentId,
          documentTitle,
          activeBoundary,
          activeViewName: activeView?.name,
          visibleBlocks: visibleBlocks?.slice(0, 14),
          recentTags: Array.from(new Set((visibleBlocks || []).flatMap((b: any) => b.tags || []))).slice(0, 20),
        }),
      });

      if (!res.ok) {
        throw new Error("Scan request failed");
      }

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Scan failed");
      }

      // Refresh actions list
      await fetchActions();
    } catch (e: any) {
      console.error("[StoryBibleSidebar] handleScanEntities error:", e);
      setScanError(e.message || "Failed to scan section.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="w-full h-full bg-void flex flex-col relative">
      {/* Header: Tab Switcher */}
      <div className="flex items-center border-b border-white/10 shrink-0">
        <button
          id="story-bible-tab-directory"
          onClick={() => setActiveTab("DIRECTORY")}
          aria-selected={activeTab === "DIRECTORY"}
          role="tab"
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex justify-center items-center gap-2 ${
            activeTab === "DIRECTORY"
              ? "border-flare text-subject"
              : "border-transparent text-white/50 hover:text-white"
          }`}
        >
          <Library className="h-4 w-4" aria-hidden="true" />
          Directory
        </button>

        <button
          id="story-bible-tab-timeline"
          onClick={() => setActiveTab("TIMELINE")}
          aria-selected={activeTab === "TIMELINE"}
          role="tab"
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex justify-center items-center gap-2 ${
            activeTab === "TIMELINE"
              ? "border-flare text-subject"
              : "border-transparent text-white/50 hover:text-white"
          }`}
        >
          <Clock className="h-4 w-4" aria-hidden="true" />
          Beats
        </button>

        <button
          id="story-bible-tab-inbox"
          onClick={() => setActiveTab("INBOX")}
          aria-selected={activeTab === "INBOX"}
          role="tab"
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex justify-center items-center gap-2 ${
            activeTab === "INBOX"
              ? "border-flare text-subject"
              : "border-transparent text-white/50 hover:text-white"
          }`}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Inbox
          {actions.length > 0 && (
            <span
              aria-label={`${actions.length} pending suggestions`}
              className="bg-flare text-void text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            >
              {actions.length}
            </span>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative" role="tabpanel">
        {isLoading ? (
          <div
            role="status"
            aria-label="Loading story bible"
            className="flex items-center justify-center h-full text-white/40 text-sm"
          >
            Loading…
          </div>
        ) : (
          <>
            {activeTab === "DIRECTORY" &&
              (selectedEntity ? (
                <EntityCard entity={selectedEntity} onBack={() => setSelectedEntity(null)} />
              ) : (
                <EntityDirectory entities={entities} onSelectEntity={setSelectedEntity} />
              ))}

            {activeTab === "TIMELINE" &&
              (selectedEntity ? (
                <EntityCard entity={selectedEntity} onBack={() => setSelectedEntity(null)} />
              ) : (
                <TimelineView
                  entities={entities}
                  onSelectEntity={setSelectedEntity}
                  visibleBlocks={visibleBlocks}
                  onEntityUpdated={fetchEntities}
                />
              ))}

            {activeTab === "INBOX" && (
              <AssistantInbox
                actions={actions}
                onProcessAction={handleProcessAction}
                onScanEntities={handleScanEntities}
                isScanning={isScanning}
                scanError={scanError}
              />
            )}
          </>
        )}
      </div>

      {/* Native <dialog> for creating new entities */}
      <CreateEntityModal projectId={projectId} onCreated={fetchEntities} />
    </div>
  );
}
