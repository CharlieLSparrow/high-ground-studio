"use client";

/**
 * @module StoryBibleSidebar
 *
 * The master container for the Quipsly StoryBible feature — a premium, contextual
 * knowledge panel that slides in from the right edge of the writing workspace.
 *
 * ## Architecture Overview
 *
 * The sidebar manages two primary views via a top-level tab switcher:
 *   1. **Directory** - A searchable, categorized index of all StoryEntity records
 *      (Characters, Settings, Scenes, Themes, etc.) scoped strictly to the current project.
 *   2. **Inbox** - A zero-latency AI Suggestion inbox where the assistant's proposed
 *      entity changes appear as approval-gated "pull requests" for the story.
 *
 * ## Data Flow
 *
 * ```
 * Server (Prisma / PostgreSQL)
 *   └──> /api/story-bible/entities  [GET]  → entities[]
 *   └──> /api/story-bible/actions   [GET]  → pendingActions[]
 *                                   [POST] → Approve/Reject (ledger commit)
 *
 * Client (React State)
 *   └──> entities[]          → EntityDirectory → EntityCard
 *   └──> pendingActions[]    → AssistantInbox  (optimistic UI)
 * ```
 *
 * ## Optimistic UI Pattern
 *
 * When a user approves or rejects an AI action via `handleProcessAction`, the UI
 * immediately removes the action from the list before the network request resolves.
 * If the server returns an error, the action is restored from a snapshot of the
 * previous state. This provides zero perceived latency without sacrificing consistency.
 *
 * ## Privacy Guarantee
 *
 * All API calls include the `projectId` as a required query parameter. The backend
 * enforces that the authenticated user has access to the given project before any
 * data is returned. Entity data from one project can never bleed into another.
 *
 * @param projectId - The unique ID of the current StudioProject workspace.
 */

import React, { useState, useEffect, useCallback } from "react";
import { StoryEntity, StudioAssistantAction } from "./types";
import { EntityDirectory } from "./EntityDirectory";
import { EntityCard } from "./EntityCard";
import { AssistantInbox } from "./AssistantInbox";
import { CreateEntityModal } from "./CreateEntityModal";
import { Library, Sparkles } from "lucide-react";

interface StoryBibleSidebarProps {
  projectId: string;
}

type TabState = "DIRECTORY" | "INBOX";

export function StoryBibleSidebar({ projectId }: StoryBibleSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabState>("DIRECTORY");
  const [entities, setEntities] = useState<StoryEntity[]>([]);
  const [actions, setActions] = useState<StudioAssistantAction[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<StoryEntity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  /**
   * Processes an AI assistant action (approve or reject).
   *
   * Uses an optimistic UI pattern:
   * 1. Snapshot the current actions list.
   * 2. Immediately remove the action from the UI.
   * 3. POST the decision to the server.
   * 4. If approved, re-fetch entities (the server may have created a new one).
   * 5. If the server fails, restore the original list from the snapshot.
   */
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

  return (
    <div className="w-80 h-full bg-void border-l border-white/10 flex flex-col shadow-2xl relative">
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

            {activeTab === "INBOX" && (
              <AssistantInbox actions={actions} onProcessAction={handleProcessAction} />
            )}
          </>
        )}
      </div>

      {/* Native <dialog> for creating new entities - lives here at the sidebar root
          so it renders in the top layer above all other content. */}
      <CreateEntityModal projectId={projectId} onCreated={fetchEntities} />
    </div>
  );
}
