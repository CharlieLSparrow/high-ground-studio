"use client";

import type { JSONContent } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  cn,
  labelClassName,
  StudioChip,
  StudioGlyph,
} from "../../../studio-ui";
import { AuthorMark, SemanticHighlightMark } from "../../manuscript-editor-marks";
import {
  createDefaultManuscriptDraft,
  createEmptyManuscriptDoc,
  ensureManuscriptBlockIds,
  safeManuscriptDraft,
  type ManuscriptDraft,
  type ManuscriptEditorJson,
} from "../../manuscript-editor-model";

type CollabSetupResponse =
  | {
      ok: true;
      url: string;
      token: string;
      actor: {
        actorId: "charlie" | "homer";
        displayName: string;
        color: string;
      };
      room: {
        roomName: string;
        title: string;
        seededAt: string | null;
        hasPersistedState: boolean;
        lastCheckpointSnapshotId: string | null;
      };
      initialSnapshot: {
        id: string;
        title: string;
        updatedAt: string;
        draft: ManuscriptDraft;
      } | null;
    }
  | { ok: false; message: string };

type SeedClaimResponse =
  | {
      ok: true;
      claimed: boolean;
      room: {
        seededAt: string | null;
        hasPersistedState: boolean;
      } | null;
    }
  | { ok: false; message: string };

type CheckpointResponse =
  | {
      ok: true;
      snapshot: {
        id: string;
        title: string;
        updatedAt: string;
        wordCount: number;
        blockCount: number;
      };
    }
  | { ok: false; message: string };

type LiveEditFreshnessState =
  | "current"
  | "outside-changes"
  | "no-backup"
  | "no-room";

type LiveEditStatusResponse =
  | {
      ok: true;
      room: {
        seedSnapshotId: string | null;
        lastCheckpointSnapshotId: string | null;
        hasPersistedState: boolean;
        updatedAt: string;
      } | null;
      latestSnapshot: {
        id: string;
        title: string;
        updatedAt: string;
        wordCount: number;
        blockCount: number;
      } | null;
      freshness: {
        state: LiveEditFreshnessState;
        latestSnapshotId: string | null;
        roomBaselineSnapshotId: string | null;
        seedSnapshotId: string | null;
        lastCheckpointSnapshotId: string | null;
      };
    }
  | { ok: false; message: string };

type ConnectionStatus = "idle" | "connecting" | "connected" | "synced" | "error";

const blockNodeTypes = ["paragraph", "heading", "listItem"];

function createId(prefix: string) {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
  );
}

function createBlockId(nodeType: string, index = 0) {
  return `live-${nodeType}-${index}-${createId("collab")}`;
}

function isEmptyEditorJson(json: JSONContent | null | undefined) {
  function collectText(node: JSONContent): string {
    return `${node.text ?? ""}${(node.content ?? []).map(collectText).join("")}`;
  }

  return !collectText((json ?? {}) as JSONContent).trim();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not saved yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function buildCheckpointDraft(input: {
  baseDraft: ManuscriptDraft | null;
  editorJson: ManuscriptEditorJson;
  actorId: "charlie" | "homer";
}) {
  const now = new Date().toISOString();
  const baseDraft = input.baseDraft ?? createDefaultManuscriptDraft(now);

  return {
    ...baseDraft,
    editorJson: ensureManuscriptBlockIds(input.editorJson, createBlockId),
    activeAuthorId: input.actorId,
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: now,
  };
}

async function fetchLiveEditStatus() {
  const response = await fetch("/api/manuscript/collab/latest/status", {
    cache: "no-store",
  });

  return (await response.json()) as LiveEditStatusResponse;
}

export default function StudioManuscriptCollabClient() {
  const [setup, setSetup] = useState<CollabSetupResponse | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [message, setMessage] = useState("Preparing live edit room.");
  const [isSaving, setIsSaving] = useState(false);
  const [hasCheckpointChanges, setHasCheckpointChanges] = useState(false);
  const [isCheckingLiveStatus, setIsCheckingLiveStatus] = useState(false);
  const [liveStatus, setLiveStatus] =
    useState<LiveEditStatusResponse | null>(null);
  const [shareLinkState, setShareLinkState] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const [lastCheckpoint, setLastCheckpoint] =
    useState<Extract<CheckpointResponse, { ok: true }>["snapshot"] | null>(
      null,
    );
  const hasSeededRef = useRef(false);
  const programmaticEditorUpdateRef = useRef(false);

  const initialDraft = useMemo(() => {
    return setup?.ok && setup.initialSnapshot
      ? safeManuscriptDraft(setup.initialSnapshot.draft)
      : null;
  }, [setup]);

  useEffect(() => {
    let isMounted = true;

    async function loadSetup() {
      setConnectionStatus("connecting");

      try {
        const response = await fetch("/api/manuscript/collab/latest", {
          cache: "no-store",
        });
        const payload = (await response.json()) as CollabSetupResponse;

        if (!isMounted) {
          return;
        }

        setSetup(payload);

        if (!payload.ok) {
          setConnectionStatus("error");
          setMessage(payload.message);
          return;
        }

        const nextProvider = new HocuspocusProvider({
          url: payload.url,
          name: payload.room.roomName,
          token: payload.token,
          onAuthenticated: () => {
            setConnectionStatus("connected");
            setMessage("Connected to the live edit room.");
          },
          onAuthenticationFailed: () => {
            setConnectionStatus("error");
            setMessage("Live edit authentication failed.");
          },
          onSynced: ({ state }: { state: boolean }) => {
            if (state) {
              setConnectionStatus("synced");
              setMessage("Live room synced.");
            }
          },
          onStatus: ({ status }: { status: string }) => {
            if (status === "connected") {
              setConnectionStatus("connected");
            }
          },
        });

        setProvider(nextProvider);
      } catch (error) {
        console.error("Live edit setup failed.", error);

        if (isMounted) {
          setConnectionStatus("error");
          setMessage("Could not open the live edit room.");
        }
      }
    }

    void loadSetup();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      provider?.destroy();
    };
  }, [provider]);

  useEffect(() => {
    if (!setup?.ok) {
      return;
    }

    let isMounted = true;

    async function loadLiveStatus() {
      try {
        const payload = await fetchLiveEditStatus();

        if (isMounted) {
          setLiveStatus(payload);
        }
      } catch (error) {
        console.error("Live edit status check failed.", error);

        if (isMounted) {
          setLiveStatus({
            ok: false,
            message: "Could not check the latest manuscript backup.",
          });
        }
      }
    }

    void loadLiveStatus();
    const intervalId = window.setInterval(
      () => void loadLiveStatus(),
      30_000,
    );

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [setup]);

  async function refreshLiveStatus() {
    setIsCheckingLiveStatus(true);

    try {
      setLiveStatus(await fetchLiveEditStatus());
    } catch (error) {
      console.error("Live edit status refresh failed.", error);
      setLiveStatus({
        ok: false,
        message: "Could not check the latest manuscript backup.",
      });
    } finally {
      setIsCheckingLiveStatus(false);
    }
  }

  const editor = useEditor(
    {
      extensions: provider
        ? [
            StarterKit.configure({
              heading: {
                levels: [1, 2, 3],
              },
              undoRedo: false,
            }),
            UniqueID.configure({
              attributeName: "blockId",
              types: blockNodeTypes,
              generateID: ({ node, pos }) => createBlockId(node.type.name, pos),
            }),
            AuthorMark,
            SemanticHighlightMark,
            Collaboration.configure({
              document: provider.document,
            }),
            CollaborationCaret.configure({
              provider,
              user: setup?.ok
                ? {
                    name: setup.actor.displayName,
                    color: setup.actor.color,
                  }
                : {
                    name: "Studio",
                    color: "#9fb6b0",
                  },
            }),
          ]
        : [
            StarterKit.configure({
              heading: {
                levels: [1, 2, 3],
              },
            }),
            UniqueID.configure({
              attributeName: "blockId",
              types: blockNodeTypes,
              generateID: ({ node, pos }) => createBlockId(node.type.name, pos),
            }),
            AuthorMark,
            SemanticHighlightMark,
          ],
      content: createEmptyManuscriptDoc() as JSONContent,
      editable: Boolean(provider),
      immediatelyRender: false,
      onUpdate: () => {
        if (programmaticEditorUpdateRef.current) {
          programmaticEditorUpdateRef.current = false;
          return;
        }

        setHasCheckpointChanges(true);
      },
      editorProps: {
        attributes: {
          class:
            "manuscript-prosemirror min-h-[70dvh] bg-transparent px-0 py-0 text-[1rem] leading-8 text-studio-ink outline-none md:text-[1.06rem]",
        },
      },
    },
    [provider, setup],
  );

  useEffect(() => {
    if (
      !editor ||
      !provider ||
      !setup?.ok ||
      connectionStatus !== "synced" ||
      hasSeededRef.current ||
      setup.room.seededAt ||
      setup.room.hasPersistedState
    ) {
      return;
    }

    const currentEditor = editor;

    async function seedRoom() {
      try {
        const response = await fetch("/api/manuscript/collab/latest", {
          method: "POST",
        });
        const payload = (await response.json()) as SeedClaimResponse;

        if (!payload.ok || !payload.claimed || hasSeededRef.current) {
          return;
        }

        const seedJson =
          initialDraft?.editorJson ?? createEmptyManuscriptDoc();

        if (isEmptyEditorJson(currentEditor.getJSON())) {
          programmaticEditorUpdateRef.current = true;
          currentEditor.commands.setContent(seedJson as JSONContent);
          hasSeededRef.current = true;
          setHasCheckpointChanges(false);
          setMessage("Live room initialized from the latest saved manuscript.");
        }
      } catch (error) {
        console.error("Live room seed failed.", error);
        setMessage("The room opened, but initial manuscript seeding failed.");
      }
    }

    void seedRoom();
  }, [connectionStatus, editor, initialDraft, provider, setup]);

  async function saveCheckpoint() {
    if (!editor || !setup?.ok) {
      return;
    }

    setIsSaving(true);
    setMessage("Saving the room to the latest manuscript backup.");

    const draft = buildCheckpointDraft({
      baseDraft: initialDraft,
      editorJson: editor.getJSON() as ManuscriptEditorJson,
      actorId: setup.actor.actorId,
    });

    try {
      const response = await fetch(
        "/api/manuscript/collab/latest/checkpoint",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            draft,
            description: "Live edit checkpoint",
          }),
        },
      );
      const payload = (await response.json()) as CheckpointResponse;

      if (!payload.ok) {
        setMessage(payload.message);
        return;
      }

      setLastCheckpoint(payload.snapshot);
      setHasCheckpointChanges(false);
      setMessage("Saved to the latest manuscript backup.");
      void refreshLiveStatus();
    } catch (error) {
      console.error("Live edit checkpoint save failed.", error);
      setMessage("Could not save to the manuscript.");
    } finally {
      setIsSaving(false);
    }
  }

  async function copySharedEditLink() {
    const href =
      typeof window === "undefined"
        ? "/manuscript/collab/latest"
        : `${window.location.origin}/manuscript/collab/latest`;

    try {
      await navigator.clipboard.writeText(href);
      setShareLinkState("copied");
      setMessage("Shared edit link copied.");
    } catch (error) {
      console.error("Live edit link copy failed.", error);
      setShareLinkState("error");
      setMessage("Could not copy the shared edit link.");
    }
  }

  const statusTone =
    connectionStatus === "synced"
      ? "tag"
      : connectionStatus === "error"
        ? "danger"
        : "source";
  const liveFreshness = liveStatus?.ok ? liveStatus.freshness : null;
  const hasOutsideBackup = liveFreshness?.state === "outside-changes";
  const backupPriorityTone = hasOutsideBackup
    ? "review"
    : liveFreshness?.state === "current"
      ? "tag"
      : liveStatus?.ok
        ? "source"
        : "danger";
  const backupPriorityLabel = hasOutsideBackup
    ? "Review"
    : liveFreshness?.state === "current"
      ? "Current"
      : liveFreshness?.state === "no-backup"
        ? "No backup"
        : liveFreshness?.state === "no-room"
          ? "No room"
          : "Unknown";
  const latestBackupLabel =
    liveStatus?.ok && liveStatus.latestSnapshot
      ? `${formatDateTime(liveStatus.latestSnapshot.updatedAt)} - ${liveStatus.latestSnapshot.wordCount.toLocaleString()} words`
      : "No latest backup found.";
  const backupPriorityCopy = hasOutsideBackup
    ? "A newer backup exists outside this room. Saving here will make the room state the latest backup."
    : liveFreshness?.state === "current"
      ? "This room is lined up with the latest manuscript backup."
      : liveStatus?.ok
        ? "This room is waiting for its first manuscript backup baseline."
        : liveStatus?.message ?? "Latest backup status is unavailable.";
  const saveButtonLabel = hasOutsideBackup
    ? "Save room over latest"
    : "Save to manuscript";

  return (
    <main className="min-h-screen px-3.5 py-4 md:px-6 md:py-6">
      <section className="mx-auto grid max-w-[1500px] gap-4">
        <header className="sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-studio-line-strong bg-studio-panel/95 p-3.5 shadow-[0_16px_44px_rgba(0,0,0,0.34)] backdrop-blur">
          <div className="flex min-w-0 items-center gap-2.5">
            <StudioGlyph />
            <div className="min-w-0">
              <p className="m-0 text-[0.72rem] font-extrabold uppercase leading-tight text-studio-muted">
                Live manuscript edit
              </p>
              <h1 className="m-0 truncate text-[1.05rem] leading-tight text-studio-ink">
                {setup?.ok
                  ? setup.initialSnapshot?.title || setup.room.title
                  : "Live room"}
              </h1>
            </div>
            <StudioChip tone={statusTone}>
              {connectionStatus === "synced"
                ? "Synced"
                : connectionStatus === "connected"
                  ? "Connected"
                  : connectionStatus === "error"
                    ? "Offline"
                    : "Connecting"}
            </StudioChip>
            {setup?.ok ? (
              <StudioChip tone={setup.actor.actorId === "homer" ? "tag" : "source"}>
                {setup.actor.displayName}
              </StudioChip>
            ) : null}
            {hasCheckpointChanges ? (
              <StudioChip tone="review">Needs save</StudioChip>
            ) : null}
            {hasOutsideBackup ? (
              <StudioChip tone="review">Backup changed</StudioChip>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              className="min-h-9 rounded-md border border-studio-source/45 bg-studio-source/10 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source transition hover:border-studio-source/60 hover:bg-studio-source/15"
              type="button"
              onClick={() => void copySharedEditLink()}
            >
              {shareLinkState === "copied" ? "Link copied" : "Copy edit link"}
            </button>
            <a
              className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10"
              href="/manuscript"
            >
              Exit room
            </a>
            <button
              className={cn(
                "min-h-9 rounded-md border border-studio-tag/55 bg-studio-tag/15 px-3 py-2 text-[0.78rem] font-extrabold text-studio-tag transition hover:bg-studio-tag/20 disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim",
              )}
              disabled={!editor || !setup?.ok || isSaving}
              type="button"
              onClick={() => void saveCheckpoint()}
            >
              {isSaving ? "Saving..." : saveButtonLabel}
            </button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 rounded-lg border border-studio-line bg-[#021615] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] md:p-6">
            <EditorContent editor={editor} />
          </section>

          <aside className="grid h-fit gap-3 rounded-lg border border-studio-line-strong bg-studio-panel/82 p-4 lg:sticky lg:top-[92px]">
            <div>
              <p className={labelClassName}>Room</p>
              <p className="mt-1 mb-0 text-[0.92rem] leading-6 text-studio-muted">
                This is the shared editing room. Changes appear for everyone in
                the room; saving writes the room state back to the latest
                manuscript backup.
              </p>
            </div>

            <div className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={labelClassName}>Status</span>
                <StudioChip tone={statusTone}>{connectionStatus}</StudioChip>
              </div>
              <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                {message}
              </p>
            </div>

            <div
              className={cn(
                "grid gap-2 rounded-lg border bg-black/15 p-3",
                hasOutsideBackup
                  ? "border-studio-review/45 bg-studio-review/10"
                  : "border-studio-line",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={labelClassName}>Backup priority</span>
                <StudioChip tone={backupPriorityTone}>{backupPriorityLabel}</StudioChip>
              </div>
              <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                {backupPriorityCopy}
              </p>
              <p className="m-0 text-[0.76rem] leading-5 text-studio-dim">
                Latest: {latestBackupLabel}
              </p>
              <button
                className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10 disabled:text-studio-dim"
                disabled={isCheckingLiveStatus}
                type="button"
                onClick={() => void refreshLiveStatus()}
              >
                {isCheckingLiveStatus ? "Checking..." : "Check latest"}
              </button>
            </div>

            <div className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3">
              <span className={labelClassName}>Seed</span>
              <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                {setup?.ok && setup.initialSnapshot
                  ? `Started from ${formatDateTime(setup.initialSnapshot.updatedAt)}.`
                  : "No latest manuscript snapshot was found."}
              </p>
            </div>

            <div className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3">
              <span className={labelClassName}>Manuscript save</span>
              <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                {lastCheckpoint
                  ? `${formatDateTime(lastCheckpoint.updatedAt)} - ${lastCheckpoint.wordCount.toLocaleString()} words`
                  : hasCheckpointChanges
                    ? "The room has edits that are not the latest manuscript backup yet."
                    : "No new room edits need saving from this browser."}
              </p>
            </div>

            <a
              className="min-h-10 rounded-lg border border-studio-line bg-studio-ink/5 px-3 py-2 text-center text-[0.86rem] font-extrabold text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10"
              href="/manuscript/live/latest"
              target="_blank"
              rel="noreferrer"
            >
              Open read-only latest
            </a>
          </aside>
        </div>
      </section>
    </main>
  );
}
