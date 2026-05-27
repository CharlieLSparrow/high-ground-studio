"use client";

import type { Editor, JSONContent } from "@tiptap/core";
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
  collectBlockSummaries,
  createManuscriptStructureBoundaryIndex,
  createDefaultManuscriptDraft,
  createEmptyManuscriptDoc,
  ensureManuscriptBlockIds,
  formatEpisodePublicationDate,
  getCurrentManuscriptStructureBoundary,
  getEpisodePublicationDateForIndex,
  getManuscriptAuthorDefinition,
  getManuscriptStructureDefinition,
  getNextManuscriptStructureBoundary,
  getSemanticHighlightDefinition,
  safeManuscriptDraft,
  semanticHighlightDefinitions,
  type ManuscriptAuthorId,
  type ManuscriptDraft,
  type ManuscriptEditorJson,
  type ManuscriptStructureBoundary,
  type ManuscriptStructureBoundaryKind,
  type ManuscriptStructureBoundaryMarker,
  type SemanticHighlightType,
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

type ResetRoomResponse =
  | {
      ok: true;
      snapshot: {
        id: string;
        title: string;
        updatedAt: string;
        wordCount: number;
        blockCount: number;
        draft: ManuscriptDraft;
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

type DraftHandoffState = "idle" | "pending" | "loading" | "loaded" | "blocked";

type LivePresenceParticipant = {
  clientId: number;
  name: string;
  color: string;
  actorId: "charlie" | "homer" | "studio";
  role: string;
  isCurrent: boolean;
};

type LiveWritableAuthorId = Extract<ManuscriptAuthorId, "charlie" | "homer">;

type LiveStructureState = {
  chapter: ManuscriptStructureBoundary | null;
  episode: ManuscriptStructureBoundary | null;
  nextChapter: ManuscriptStructureBoundary | null;
  nextEpisode: ManuscriptStructureBoundary | null;
};

const blockNodeTypes = ["paragraph", "heading", "listItem"];
const liveWritableAuthorIds: LiveWritableAuthorId[] = ["charlie", "homer"];
const liveQuickSemanticHighlightTypes = [
  "clip",
  "show-notes",
] as const satisfies readonly SemanticHighlightType[];
const AUTO_BACKUP_IDLE_MS = 4_000;
const AUTO_BACKUP_MIN_INTERVAL_MS = 30_000;
const AUTO_HANDOFF_DELAY_MS = 1_200;
const emptyLiveStructureState: LiveStructureState = {
  chapter: null,
  episode: null,
  nextChapter: null,
  nextEpisode: null,
};

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

function compareDateTime(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const leftMs = left ? Date.parse(left) : Number.NaN;
  const rightMs = right ? Date.parse(right) : Number.NaN;

  if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) {
    return null;
  }

  return leftMs - rightMs;
}

function getAuthorMarkAttrs(authorId: LiveWritableAuthorId) {
  const author = getManuscriptAuthorDefinition(authorId);

  return {
    authorId: author.id,
    authorLabel: author.label,
  };
}

function getLiveAuthorTone(authorId: LiveWritableAuthorId) {
  return authorId === "homer" ? "tag" : "source";
}

function getLiveAuthorButtonClassName(
  authorId: LiveWritableAuthorId,
  isActive: boolean,
) {
  return cn(
    "min-h-9 rounded-md border px-3 py-2 text-[0.78rem] font-extrabold transition disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim",
    isActive
      ? authorId === "homer"
        ? "border-studio-tag/60 bg-studio-tag/15 text-studio-tag"
        : "border-studio-source/60 bg-studio-source/10 text-studio-source"
      : "border-studio-line bg-studio-ink/5 text-studio-source hover:border-studio-source/55 hover:bg-studio-source/10",
  );
}

function getLiveSemanticButtonClassName(
  tagType: SemanticHighlightType,
  isActive: boolean,
) {
  const definition = getSemanticHighlightDefinition(tagType);
  const colorKey = definition.colorKey;
  const baseClassName =
    "min-h-9 rounded-md border px-3 py-2 text-[0.78rem] font-extrabold transition disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim";
  const inactiveClassName =
    "border-studio-line bg-studio-ink/5 text-studio-source hover:border-studio-source/55 hover:bg-studio-source/10";

  if (!isActive) {
    return cn(baseClassName, inactiveClassName);
  }

  if (colorKey === "clip") {
    return cn(
      baseClassName,
      "border-[#8b3126]/70 bg-[#8b3126]/15 text-[#e89a8e]",
    );
  }

  if (colorKey === "show-notes") {
    return cn(
      baseClassName,
      "border-[#c19a55]/65 bg-[#c19a55]/10 text-[#e6c780]",
    );
  }

  if (colorKey === "quote" || colorKey === "cited-quotation") {
    return cn(baseClassName, "border-studio-node/60 bg-studio-node/10 text-studio-node");
  }

  if (colorKey === "question" || colorKey === "needs-review") {
    return cn(
      baseClassName,
      "border-studio-danger/55 bg-studio-danger/10 text-studio-danger",
    );
  }

  if (colorKey === "research") {
    return cn(
      baseClassName,
      "border-studio-review/55 bg-studio-review/10 text-studio-review",
    );
  }

  return cn(baseClassName, "border-studio-source/55 bg-studio-source/10 text-studio-source");
}

function getLiveSemanticSwatchClassName(tagType: SemanticHighlightType) {
  const colorKey = getSemanticHighlightDefinition(tagType).colorKey;

  if (colorKey === "clip") {
    return "bg-[#8b3126]";
  }

  if (colorKey === "show-notes") {
    return "bg-[#c19a55]";
  }

  if (colorKey === "quote" || colorKey === "cited-quotation" || colorKey === "transition") {
    return "bg-studio-node";
  }

  if (colorKey === "question" || colorKey === "needs-review") {
    return "bg-studio-danger";
  }

  if (colorKey === "research") {
    return "bg-studio-review";
  }

  if (colorKey === "story") {
    return "bg-studio-tag";
  }

  return "bg-studio-source";
}

function getEditorSelectionBlockId(editor: Editor) {
  const { $from } = editor.state.selection;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    const blockId = node.attrs.blockId;

    if (
      blockNodeTypes.includes(node.type.name) &&
      typeof blockId === "string" &&
      blockId.trim()
    ) {
      return blockId;
    }
  }

  return null;
}

function getLiveStructureTone(kind: ManuscriptStructureBoundaryKind) {
  return kind === "chapter" ? "node" : "source";
}

function buildCheckpointDraft(input: {
  baseDraft: ManuscriptDraft | null;
  editorJson: ManuscriptEditorJson;
  actorId: LiveWritableAuthorId;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizePresenceActorId(
  value: unknown,
): LivePresenceParticipant["actorId"] {
  return value === "charlie" || value === "homer" ? value : "studio";
}

function getPresenceUserField(
  state: Record<string, unknown>,
  key: "name" | "color",
) {
  const user = isRecord(state.user) ? state.user : {};
  const value = user[key] ?? state[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectPresenceParticipants(
  provider: HocuspocusProvider | null,
): LivePresenceParticipant[] {
  const awareness = provider?.awareness;

  if (!awareness) {
    return [];
  }

  const localClientId =
    typeof awareness.clientID === "number" ? awareness.clientID : null;

  return Array.from(awareness.getStates().entries())
    .map(([clientId, rawState]) => {
      const state = isRecord(rawState) ? rawState : {};
      const studio = isRecord(state.studio) ? state.studio : {};
      const actorId = normalizePresenceActorId(studio.actorId);
      const name =
        getPresenceUserField(state, "name") ||
        (actorId === "homer"
          ? "Homer / Scott"
          : actorId === "charlie"
            ? "Charlie"
            : "Studio");
      const color =
        getPresenceUserField(state, "color") ||
        (actorId === "homer" ? "#93d977" : "#8eddf2");
      const rawRole = studio.role;
      const role = typeof rawRole === "string" && rawRole.trim()
        ? rawRole.trim()
        : "editor";

      return {
        clientId,
        name,
        color,
        actorId,
        role,
        isCurrent: localClientId === clientId,
      };
    })
    .sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) {
        return left.isCurrent ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
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
  const [activeAuthorId, setActiveAuthorId] =
    useState<LiveWritableAuthorId>("charlie");
  const [semanticType, setSemanticType] =
    useState<SemanticHighlightType>("clip");
  const [semanticNote, setSemanticNote] = useState("");
  const [currentEditorJson, setCurrentEditorJson] =
    useState<ManuscriptEditorJson>(
      createEmptyManuscriptDoc() as ManuscriptEditorJson,
    );
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [isDraftHandoffVisible, setIsDraftHandoffVisible] = useState(false);
  const [draftHandoffState, setDraftHandoffState] =
    useState<DraftHandoffState>("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingFromLatest, setIsResettingFromLatest] = useState(false);
  const [hasCheckpointChanges, setHasCheckpointChanges] = useState(false);
  const [isAutoBackupEnabled, setIsAutoBackupEnabled] = useState(true);
  const [autoBackupStatus, setAutoBackupStatus] =
    useState("Auto-save is on.");
  const [unsyncedChangeCount, setUnsyncedChangeCount] = useState(0);
  const [presenceParticipants, setPresenceParticipants] = useState<
    LivePresenceParticipant[]
  >([]);
  const [isCheckingLiveStatus, setIsCheckingLiveStatus] = useState(false);
  const [liveStatus, setLiveStatus] =
    useState<LiveEditStatusResponse | null>(null);
  const [isMobileRoomMenuOpen, setIsMobileRoomMenuOpen] = useState(false);
  const [shareLinkState, setShareLinkState] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const [lastCheckpoint, setLastCheckpoint] =
    useState<Extract<CheckpointResponse, { ok: true }>["snapshot"] | null>(
      null,
    );
  const [checkpointBaseDraft, setCheckpointBaseDraft] =
    useState<ManuscriptDraft | null>(null);
  const activeAuthorIdRef = useRef<LiveWritableAuthorId>("charlie");
  const hasSeededRef = useRef(false);
  const autoDraftHandoffAttemptedRef = useRef(false);
  const programmaticEditorUpdateRef = useRef(false);
  const autoBackupTimerRef = useRef<number | null>(null);
  const lastAutoBackupAtRef = useRef(0);

  const initialDraft = useMemo(() => {
    return setup?.ok && setup.initialSnapshot
      ? safeManuscriptDraft(setup.initialSnapshot.draft)
      : null;
  }, [setup]);
  const liveBoundaryMarkers =
    checkpointBaseDraft?.structureBoundaryMarkers?.length
      ? checkpointBaseDraft.structureBoundaryMarkers
      : initialDraft?.structureBoundaryMarkers ?? [];
  const liveBlockSummaries = useMemo(
    () => collectBlockSummaries(currentEditorJson),
    [currentEditorJson],
  );
  const liveStructureBoundaryIndex = useMemo(
    () =>
      createManuscriptStructureBoundaryIndex({
        blocks: liveBlockSummaries,
        boundaryMarkers: liveBoundaryMarkers,
      }),
    [liveBlockSummaries, liveBoundaryMarkers],
  );
  const liveCurrentBlockIndex = useMemo(() => {
    if (!liveBlockSummaries.length) {
      return -1;
    }

    const matchedIndex = liveBlockSummaries.findIndex(
      (block) => block.blockId === currentBlockId,
    );

    return matchedIndex >= 0 ? matchedIndex : 0;
  }, [currentBlockId, liveBlockSummaries]);
  const liveCurrentBlock =
    liveCurrentBlockIndex >= 0 ? liveBlockSummaries[liveCurrentBlockIndex] : null;
  const liveCurrentChapterMarker =
    liveCurrentBlock?.blockId
      ? liveBoundaryMarkers.find(
          (marker) =>
            marker.kind === "chapter" &&
            marker.blockId === liveCurrentBlock.blockId,
        ) ?? null
      : null;
  const liveCurrentEpisodeMarker =
    liveCurrentBlock?.blockId
      ? liveBoundaryMarkers.find(
          (marker) =>
            marker.kind === "episode" &&
            marker.blockId === liveCurrentBlock.blockId,
        ) ?? null
      : null;
  const liveStructureState = useMemo(() => {
    if (liveCurrentBlockIndex < 0) {
      return emptyLiveStructureState;
    }

    const chapter = getCurrentManuscriptStructureBoundary(
      liveStructureBoundaryIndex.chapters,
      liveCurrentBlockIndex,
    );
    const episode = getCurrentManuscriptStructureBoundary(
      liveStructureBoundaryIndex.episodes,
      liveCurrentBlockIndex,
    );

    return {
      chapter,
      episode,
      nextChapter: getNextManuscriptStructureBoundary(
        liveStructureBoundaryIndex.chapters,
        liveCurrentBlockIndex,
        chapter,
      ),
      nextEpisode: getNextManuscriptStructureBoundary(
        liveStructureBoundaryIndex.episodes,
        liveCurrentBlockIndex,
        episode,
      ),
    };
  }, [liveCurrentBlockIndex, liveStructureBoundaryIndex]);
  const hasLiveStructureContent = Boolean(
    liveStructureState.chapter ||
      liveStructureState.episode ||
      liveStructureState.nextChapter ||
      liveStructureState.nextEpisode,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);

    if (params.get("start") === "latest") {
      setIsDraftHandoffVisible(true);
      setDraftHandoffState("pending");
      setMessage(
        "Draft handoff ready. The room will use the latest backup automatically if it is safe.",
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!initialDraft) {
      return;
    }

    setCheckpointBaseDraft((current) => current ?? initialDraft);
    setCurrentEditorJson(initialDraft.editorJson);
  }, [initialDraft]);

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
              setUnsyncedChangeCount(0);
              setMessage("Live room synced.");
            }
          },
          onUnsyncedChanges: ({ number }: { number: number }) => {
            setUnsyncedChangeCount(Math.max(0, Math.floor(number)));
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
    if (!provider || !setup?.ok) {
      return;
    }

    provider.setAwarenessField("user", {
      name: setup.actor.displayName,
      color: setup.actor.color,
    });
    provider.setAwarenessField("studio", {
      actorId: setup.actor.actorId,
      role: "editor",
    });
  }, [provider, setup]);

  useEffect(() => {
    if (!provider) {
      setPresenceParticipants([]);
      return;
    }

    function refreshPresence() {
      setPresenceParticipants(collectPresenceParticipants(provider));
    }

    refreshPresence();
    provider.on("awarenessChange", refreshPresence);
    provider.on("awarenessUpdate", refreshPresence);
    const intervalId = window.setInterval(refreshPresence, 5_000);

    return () => {
      provider.off("awarenessChange", refreshPresence);
      provider.off("awarenessUpdate", refreshPresence);
      window.clearInterval(intervalId);
    };
  }, [provider]);

  useEffect(() => {
    if (!setup?.ok) {
      return;
    }

    setActiveAuthorId(setup.actor.actorId);
    activeAuthorIdRef.current = setup.actor.actorId;

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
      onUpdate: ({ editor: updatedEditor }) => {
        setCurrentEditorJson(updatedEditor.getJSON() as ManuscriptEditorJson);
        setCurrentBlockId(getEditorSelectionBlockId(updatedEditor));

        if (programmaticEditorUpdateRef.current) {
          programmaticEditorUpdateRef.current = false;
          return;
        }

        setHasCheckpointChanges(true);
      },
      onSelectionUpdate: ({ editor: selectionEditor }) => {
        setCurrentBlockId(getEditorSelectionBlockId(selectionEditor));

        if (
          !selectionEditor.isEditable ||
          !selectionEditor.state.selection.empty
        ) {
          return;
        }

        const authorId = activeAuthorIdRef.current;
        const currentAuthorId =
          selectionEditor.getAttributes("authorMark").authorId;

        if (currentAuthorId === authorId) {
          return;
        }

        selectionEditor.commands.setMark(
          "authorMark",
          getAuthorMarkAttrs(authorId),
        );
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
    if (!editor) {
      return;
    }

    const classNames = [
      "manuscript-boundary-marker-block",
      "manuscript-boundary-marker-chapter",
      "manuscript-boundary-marker-episode",
      "manuscript-chapter-title-block",
    ];
    const boundaryMarkersByBlockId = new Map<
      string,
      ManuscriptStructureBoundaryMarker[]
    >();

    for (const marker of liveBoundaryMarkers) {
      const markers = boundaryMarkersByBlockId.get(marker.blockId) ?? [];
      markers.push(marker);
      boundaryMarkersByBlockId.set(marker.blockId, markers);
    }

    editor.state.doc.descendants((node, pos) => {
      if (!blockNodeTypes.includes(node.type.name)) {
        return true;
      }

      const domNode = editor.view.nodeDOM(pos);

      if (!(domNode instanceof HTMLElement)) {
        return true;
      }

      domNode.classList.remove(...classNames);
      domNode.removeAttribute("data-structure-boundaries");
      domNode.removeAttribute("data-manuscript-boundary-heading");

      const blockId = node.attrs.blockId;

      if (typeof blockId !== "string") {
        return true;
      }

      const boundaryMarkers = boundaryMarkersByBlockId.get(blockId);

      if (!boundaryMarkers?.length) {
        return true;
      }

      domNode.classList.add("manuscript-boundary-marker-block");

      if (boundaryMarkers.some((marker) => marker.kind === "chapter")) {
        domNode.classList.add("manuscript-boundary-marker-chapter");
        domNode.classList.add("manuscript-chapter-title-block");
        domNode.setAttribute("data-manuscript-boundary-heading", "chapter");
      }

      if (boundaryMarkers.some((marker) => marker.kind === "episode")) {
        domNode.classList.add("manuscript-boundary-marker-episode");
        domNode.setAttribute("data-manuscript-boundary-heading", "episode");
      }

      domNode.setAttribute(
        "data-structure-boundaries",
        boundaryMarkers
          .map((marker) => (marker.kind === "chapter" ? "Chapter" : "Episode"))
          .join(", "),
      );

      return true;
    });
  }, [currentEditorJson, editor, liveBoundaryMarkers]);

  function applyLiveAuthorToCursor(
    authorId: LiveWritableAuthorId,
    options: { focus?: boolean } = {},
  ) {
    if (!editor || !editor.isEditable) {
      return;
    }

    const chain = editor.chain();

    if (options.focus) {
      chain.focus();
    }

    chain.setMark("authorMark", getAuthorMarkAttrs(authorId)).run();
  }

  function updateLiveWritingAuthor(authorId: LiveWritableAuthorId) {
    activeAuthorIdRef.current = authorId;
    setActiveAuthorId(authorId);
    applyLiveAuthorToCursor(authorId, { focus: true });
    setMessage(
      `New live edits will be marked as ${
        getManuscriptAuthorDefinition(authorId).label
      }.`,
    );
  }

  function markSelectionAsLiveAuthor(authorId = activeAuthorId) {
    if (!editor) {
      return;
    }

    const author = getManuscriptAuthorDefinition(authorId);
    const selection = editor.state.selection;

    if (selection.empty) {
      updateLiveWritingAuthor(authorId);
      setMessage(`Cursor is ready to write as ${author.label}.`);
      return;
    }

    editor
      .chain()
      .focus()
      .setTextSelection({ from: selection.from, to: selection.to })
      .setMark("authorMark", getAuthorMarkAttrs(authorId))
      .run();
    activeAuthorIdRef.current = authorId;
    setActiveAuthorId(authorId);
    setHasCheckpointChanges(true);
    setMessage(`Marked selected text as ${author.label}.`);
  }

  function applyLiveSemanticHighlight(
    tagType: SemanticHighlightType = semanticType,
  ) {
    if (!editor) {
      return;
    }

    const selection = editor.state.selection;

    if (selection.empty || selection.from === selection.to) {
      setMessage("Select live room text before applying a semantic mark.");
      return;
    }

    const selectedText = editor.state.doc
      .textBetween(selection.from, selection.to, " ")
      .trim();

    if (!selectedText) {
      setMessage("Select live room text before applying a semantic mark.");
      return;
    }

    const definition = getSemanticHighlightDefinition(tagType);

    editor
      .chain()
      .focus()
      .setTextSelection({ from: selection.from, to: selection.to })
      .setMark("semanticHighlightMark", {
        highlightId: createId("live-highlight"),
        tagType: definition.id,
        label: definition.label,
        colorKey: definition.colorKey,
        note: semanticNote.trim(),
        createdAt: new Date().toISOString(),
      })
      .run();
    setSemanticType(definition.id);
    setSemanticNote("");
    setHasCheckpointChanges(true);
    setMessage(`Marked selected text as ${definition.label}.`);
  }

  function clearLiveSemanticHighlight() {
    if (!editor) {
      return;
    }

    editor.chain().focus().unsetMark("semanticHighlightMark").run();
    setHasCheckpointChanges(true);
    setMessage("Cleared semantic marks from the current selection.");
  }

  function updateLiveStructureBoundaryMarkers(
    updater: (
      markers: ManuscriptStructureBoundaryMarker[],
      updatedAt: string,
    ) => ManuscriptStructureBoundaryMarker[],
  ) {
    const updatedAt = new Date().toISOString();

    setCheckpointBaseDraft((current) => {
      const baseDraft =
        current ??
        initialDraft ??
        createDefaultManuscriptDraft(updatedAt);

      return {
        ...baseDraft,
        editorJson: currentEditorJson,
        activeAuthorId,
        showAuthorColors: true,
        showSemanticColors: true,
        structureBoundaryMarkers: updater(
          baseDraft.structureBoundaryMarkers ?? [],
          updatedAt,
        ),
        lastUpdatedAt: updatedAt,
      };
    });
  }

  function toggleLiveStructureBoundaryMarker(
    kind: ManuscriptStructureBoundaryKind,
  ) {
    const blockId = liveCurrentBlock?.blockId;

    if (!blockId) {
      setMessage("Place the cursor in a block before marking structure.");
      return;
    }

    const definition = getManuscriptStructureDefinition(kind);
    const fallbackTitle =
      kind === "chapter" ? "Chapter / book boundary" : "Episode boundary";
    const title = (liveCurrentBlock?.preview || fallbackTitle).trim();
    const existingMarker = liveBoundaryMarkers.find(
      (marker) => marker.kind === kind && marker.blockId === blockId,
    );
    const publicationDate =
      !existingMarker && kind === "episode"
        ? getEpisodePublicationDateForIndex(
            liveBoundaryMarkers.filter((marker) => marker.kind === "episode")
              .length,
          )
        : null;
    const publicationDateLabel = formatEpisodePublicationDate(publicationDate);

    updateLiveStructureBoundaryMarkers((markers, updatedAt) => {
      const markerToRemove = markers.find(
        (marker) => marker.kind === kind && marker.blockId === blockId,
      );

      if (markerToRemove) {
        return markers.filter((marker) => marker.id !== markerToRemove.id);
      }

      return [
        ...markers,
        {
          id: `live-boundary-${kind}-${createId("marker")}`,
          kind,
          blockId,
          title,
          notes: "Marked during live edit.",
          ...(publicationDate ? { publicationDate } : {}),
          createdAt: updatedAt,
          updatedAt,
        },
      ];
    });
    setHasCheckpointChanges(true);
    setMessage(
      existingMarker
        ? `${definition.label} marker removed from the current block.`
        : publicationDateLabel
          ? `Marked current block as ${definition.label}. Publishes ${publicationDateLabel}.`
          : `Marked current block as ${definition.label}.`,
    );
  }

  function focusLiveBlock(blockId: string | null) {
    if (!editor || !blockId) {
      setMessage("No structure marker is available to jump to yet.");
      return;
    }

    let targetPosition: number | null = null;

    editor.state.doc.descendants((node, pos) => {
      if (node.attrs?.blockId === blockId) {
        targetPosition = pos;
        return false;
      }

      return true;
    });

    if (targetPosition === null) {
      setMessage("That structure marker was not found in the live room.");
      return;
    }

    editor
      .chain()
      .focus()
      .setTextSelection(
        Math.min(targetPosition + 1, editor.state.doc.content.size),
      )
      .scrollIntoView()
      .run();
    setCurrentBlockId(blockId);
    setMessage("Jumped to the live room structure marker.");
  }

  function focusLiveBoundary(
    boundary: ManuscriptStructureBoundary | null,
    edge: "start" | "end" = "start",
  ) {
    const blockId =
      edge === "end"
        ? boundary?.endBlockId ?? null
        : boundary?.startBlockId ?? null;

    focusLiveBlock(blockId);
  }

  useEffect(() => {
    activeAuthorIdRef.current = activeAuthorId;
    applyLiveAuthorToCursor(activeAuthorId);
  }, [activeAuthorId, editor]);

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
          setCurrentEditorJson(seedJson as ManuscriptEditorJson);
          setCurrentBlockId(getEditorSelectionBlockId(currentEditor));
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

  async function saveCheckpoint(
    options: { mode?: "manual" | "auto" } = {},
  ) {
    if (!editor || !setup?.ok) {
      return;
    }

    if (options.mode === "auto" && hasOutsideBackup) {
      setAutoBackupStatus(
        "Auto-save paused because a newer backup exists outside this room.",
      );
      return;
    }

    setIsSaving(true);
    setMessage(
      options.mode === "auto"
        ? "Auto-saving this room to the latest manuscript backup."
        : "Saving the room to the latest manuscript backup.",
    );

    const draft = buildCheckpointDraft({
      baseDraft: checkpointBaseDraft ?? initialDraft,
      editorJson: editor.getJSON() as ManuscriptEditorJson,
      actorId: activeAuthorIdRef.current,
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
            description:
              options.mode === "auto"
                ? "Live edit auto-save"
                : "Live edit checkpoint",
          }),
        },
      );
      const payload = (await response.json()) as CheckpointResponse;

      if (!payload.ok) {
        setMessage(payload.message);
        return;
      }

      setLastCheckpoint(payload.snapshot);
      setCheckpointBaseDraft(draft);
      setHasCheckpointChanges(false);
      if (options.mode === "auto") {
        lastAutoBackupAtRef.current = Date.now();
        setAutoBackupStatus(
          `Auto-saved ${formatDateTime(payload.snapshot.updatedAt)}.`,
        );
      }
      setMessage(
        options.mode === "auto"
          ? "Auto-saved to the latest manuscript backup."
          : "Saved to the latest manuscript backup.",
      );
      void refreshLiveStatus();
    } catch (error) {
      console.error("Live edit checkpoint save failed.", error);
      const failedMessage =
        options.mode === "auto"
          ? "Auto-save could not save to the manuscript."
          : "Could not save to the manuscript.";
      setAutoBackupStatus(failedMessage);
      setMessage(failedMessage);
    } finally {
      setIsSaving(false);
    }
  }

  async function resetRoomFromLatestBackup(
    options: { skipConfirm?: boolean; source?: "manual" | "handoff" } = {},
  ) {
    if (!editor || !setup?.ok || isResettingFromLatest) {
      return;
    }

    const confirmed =
      options.skipConfirm ||
      window.confirm(
        "Load the latest manuscript backup into this shared room? This replaces the current unsaved room text for everyone connected.",
      );

    if (!confirmed) {
      return;
    }

    setIsResettingFromLatest(true);
    if (options.source === "handoff") {
      setDraftHandoffState("loading");
      setMessage("Starting the room from the latest manuscript backup.");
    } else {
      setMessage("Loading the latest manuscript backup into the room.");
    }

    try {
      const response = await fetch("/api/manuscript/collab/latest/reset", {
        method: "POST",
      });
      const payload = (await response.json()) as ResetRoomResponse;

      if (!payload.ok) {
        setMessage(payload.message);
        if (options.source === "handoff") {
          setDraftHandoffState("blocked");
        }
        return;
      }

      const latestDraft = safeManuscriptDraft(payload.snapshot.draft);

      if (!latestDraft) {
        setMessage("The latest backup could not be opened in the room.");
        if (options.source === "handoff") {
          setDraftHandoffState("blocked");
        }
        return;
      }

      programmaticEditorUpdateRef.current = true;
      editor.commands.setContent(latestDraft.editorJson as JSONContent);
      setCurrentEditorJson(latestDraft.editorJson);
      setCurrentBlockId(getEditorSelectionBlockId(editor));
      setCheckpointBaseDraft(latestDraft);
      setLastCheckpoint(payload.snapshot);
      setHasCheckpointChanges(false);
      if (options.source === "handoff") {
        setDraftHandoffState("loaded");
        setIsDraftHandoffVisible(false);
        setMessage("Live room started from the latest manuscript backup.");
      } else {
        setMessage("Room loaded from the latest manuscript backup.");
      }
      void refreshLiveStatus();
    } catch (error) {
      console.error("Live edit room reset failed.", error);
      setMessage("Could not load the latest backup into the room.");
      if (options.source === "handoff") {
        setDraftHandoffState("blocked");
      }
    } finally {
      setIsResettingFromLatest(false);
    }
  }

  async function useLatestBackupFromDraftHandoff() {
    await resetRoomFromLatestBackup({
      skipConfirm: true,
      source: "handoff",
    });
  }

  useEffect(() => {
    if (
      draftHandoffState !== "pending" ||
      autoDraftHandoffAttemptedRef.current ||
      !editor ||
      !setup?.ok ||
      !liveStatus?.ok ||
      !liveStatus.latestSnapshot ||
      connectionStatus !== "synced" ||
      isSaving ||
      isResettingFromLatest
    ) {
      return;
    }

    if (hasCheckpointChanges) {
      setDraftHandoffState("blocked");
      setMessage(
        "The live room has edits already. Compare before loading the saved draft.",
      );
      return;
    }

    const otherParticipants = presenceParticipants.filter(
      (participant) => !participant.isCurrent,
    );

    if (otherParticipants.length > 0) {
      setDraftHandoffState("blocked");
      setMessage(
        "Someone else is already in the live room. Compare before loading the saved draft.",
      );
      return;
    }

    const latestComparedToRoom = compareDateTime(
      liveStatus.latestSnapshot.updatedAt,
      liveStatus.room?.updatedAt,
    );
    const roomHasPersistedState = Boolean(liveStatus.room?.hasPersistedState);
    const roomLooksNewerThanLatest =
      roomHasPersistedState &&
      (latestComparedToRoom === null || latestComparedToRoom < 0);

    if (roomLooksNewerThanLatest) {
      setDraftHandoffState("blocked");
      setMessage(
        "The live room has newer stored edits. Compare before loading the saved draft.",
      );
      return;
    }

    if (liveStatus.freshness.state === "current") {
      setDraftHandoffState("loaded");
      setIsDraftHandoffVisible(false);
      setMessage("Live room is already lined up with the latest manuscript backup.");
      return;
    }

    autoDraftHandoffAttemptedRef.current = true;
    setDraftHandoffState("loading");
    setMessage("Starting the live room from the latest saved draft.");

    const timeoutId = window.setTimeout(() => {
      void resetRoomFromLatestBackup({
        skipConfirm: true,
        source: "handoff",
      });
    }, AUTO_HANDOFF_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    connectionStatus,
    draftHandoffState,
    editor,
    hasCheckpointChanges,
    isResettingFromLatest,
    isSaving,
    liveStatus,
    presenceParticipants,
    setup,
  ]);

  async function copySharedEditLink() {
    const href =
      typeof window === "undefined"
        ? "/manuscript/collab/latest?start=latest"
        : `${window.location.origin}/manuscript/collab/latest?start=latest`;

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
    ? "Save room as latest"
    : "Save now";
  const activeParticipantCount = Math.max(
    presenceParticipants.length,
    setup?.ok ? 1 : 0,
  );
  const roomSyncLabel =
    unsyncedChangeCount > 0
      ? `${unsyncedChangeCount.toLocaleString()} syncing`
      : connectionStatus === "synced"
        ? "Room synced"
        : connectionStatus === "connected"
          ? "Syncing"
          : connectionStatus === "error"
            ? "Offline"
            : "Connecting";
  const autoBackupTone = !isAutoBackupEnabled
    ? "source"
    : hasOutsideBackup
      ? "review"
      : hasCheckpointChanges
        ? "review"
        : "tag";
  const autoBackupLabel = !isAutoBackupEnabled
    ? "Manual"
    : hasOutsideBackup
      ? "Paused"
      : hasCheckpointChanges
        ? "Queued"
        : "On";

  function renderLiveSemanticControls(context: "desktop" | "mobile") {
    const testIdPrefix =
      context === "mobile" ? "manuscript-live-mobile" : "manuscript-live";

    return (
      <div
        className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3"
        data-testid={`${testIdPrefix}-semantic-controls`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={labelClassName}>Semantic marks</span>
          <StudioChip tone="source">
            {getSemanticHighlightDefinition(semanticType).label}
          </StudioChip>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {liveQuickSemanticHighlightTypes.map((tagType) => {
            const definition = getSemanticHighlightDefinition(tagType);

            return (
              <button
                className={getLiveSemanticButtonClassName(
                  definition.id,
                  semanticType === definition.id,
                )}
                data-testid={`${testIdPrefix}-semantic-quick-${definition.id}`}
                disabled={!editor || !setup?.ok}
                key={definition.id}
                type="button"
                onClick={() => applyLiveSemanticHighlight(definition.id)}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      getLiveSemanticSwatchClassName(definition.id),
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{definition.label}</span>
                </span>
              </button>
            );
          })}
        </div>
        <label className="grid gap-1.5">
          <span className={labelClassName}>Tag type</span>
          <select
            className="min-h-10 rounded-lg border border-studio-line bg-[#031c1a] px-3 py-2 text-[0.9rem] text-studio-ink outline-none focus:border-studio-source/70"
            data-testid={`${testIdPrefix}-semantic-select`}
            value={semanticType}
            onChange={(event) =>
              setSemanticType(event.target.value as SemanticHighlightType)
            }
          >
            {semanticHighlightDefinitions.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className={labelClassName}>Note</span>
          <textarea
            className="min-h-[72px] resize-y rounded-lg border border-studio-line bg-[#031c1a] px-3 py-2 text-[0.86rem] leading-5 text-studio-ink outline-none focus:border-studio-source/70"
            data-testid={`${testIdPrefix}-semantic-note`}
            value={semanticNote}
            onChange={(event) => setSemanticNote(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-9 rounded-md border border-studio-source/55 bg-studio-source/10 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source transition hover:bg-studio-source/15 disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim"
            data-testid={`${testIdPrefix}-semantic-apply`}
            disabled={!editor || !setup?.ok}
            type="button"
            onClick={() => applyLiveSemanticHighlight()}
          >
            Apply
          </button>
          <button
            className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10 disabled:text-studio-dim"
            data-testid={`${testIdPrefix}-semantic-clear`}
            disabled={!editor || !setup?.ok}
            type="button"
            onClick={() => clearLiveSemanticHighlight()}
          >
            Clear
          </button>
        </div>
      </div>
    );
  }

  function renderLiveStructureMarkerControls(context: "desktop" | "mobile") {
    const testIdPrefix =
      context === "mobile" ? "manuscript-live-mobile" : "manuscript-live";

    return (
      <div
        className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3"
        data-testid={`${testIdPrefix}-structure-marker-controls`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={labelClassName}>Structure markers</span>
          <StudioChip tone={liveCurrentBlock?.blockId ? "source" : "default"}>
            {liveCurrentBlock?.blockId ? "Current block" : "No block"}
          </StudioChip>
        </div>
        <p className="m-0 text-[0.78rem] leading-5 text-studio-muted">
          {liveCurrentBlock?.preview || "Place the cursor in a title block first."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            className={cn(
              "min-h-9 rounded-md border px-3 py-2 text-[0.78rem] font-extrabold transition disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim",
              liveCurrentChapterMarker
                ? "border-studio-node/60 bg-studio-node/15 text-studio-node"
                : "border-studio-line bg-studio-ink/5 text-studio-source hover:border-studio-source/55 hover:bg-studio-source/10",
            )}
            data-testid={`${testIdPrefix}-mark-current-chapter`}
            disabled={!editor || !setup?.ok || !liveCurrentBlock?.blockId}
            type="button"
            onClick={() => toggleLiveStructureBoundaryMarker("chapter")}
          >
            {liveCurrentChapterMarker ? "Remove chapter" : "Mark chapter"}
          </button>
          <button
            className={cn(
              "min-h-9 rounded-md border px-3 py-2 text-[0.78rem] font-extrabold transition disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim",
              liveCurrentEpisodeMarker
                ? "border-studio-source/60 bg-studio-source/15 text-studio-source"
                : "border-studio-line bg-studio-ink/5 text-studio-source hover:border-studio-source/55 hover:bg-studio-source/10",
            )}
            data-testid={`${testIdPrefix}-mark-current-episode`}
            disabled={!editor || !setup?.ok || !liveCurrentBlock?.blockId}
            type="button"
            onClick={() => toggleLiveStructureBoundaryMarker("episode")}
          >
            {liveCurrentEpisodeMarker ? "Remove episode" : "Mark episode"}
          </button>
        </div>
      </div>
    );
  }

  function renderLiveStructureStatusItem(
    kind: ManuscriptStructureBoundaryKind,
    currentBoundary: ManuscriptStructureBoundary | null,
    nextBoundary: ManuscriptStructureBoundary | null,
  ) {
    const definition = getManuscriptStructureDefinition(kind);
    const targetBoundary = currentBoundary ?? nextBoundary;
    const statusLabel =
      currentBoundary?.label ??
      (nextBoundary ? `Before ${nextBoundary.label}` : `No ${definition.label}`);
    const title = currentBoundary?.title ?? nextBoundary?.title ?? "Not marked yet";
    const publicationDate = formatEpisodePublicationDate(
      kind === "episode" ? targetBoundary?.publicationDate : null,
    );

    return (
      <button
        aria-label={
          targetBoundary
            ? `Jump to ${definition.label.toLowerCase()} ${targetBoundary.label}`
            : `${definition.label} is not marked yet`
        }
        className={cn(
          "min-w-0 rounded-lg border px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
          kind === "chapter"
            ? "border-studio-node/45 bg-studio-node/10"
            : "border-studio-source/45 bg-studio-source/10",
        )}
        data-testid={`manuscript-live-mobile-current-${kind}`}
        disabled={!targetBoundary}
        key={kind}
        type="button"
        onClick={() => focusLiveBoundary(targetBoundary)}
      >
        <span
          className={cn(
            "block truncate text-[0.62rem] font-extrabold tracking-[0.08em] uppercase",
            kind === "chapter" ? "text-studio-node" : "text-studio-source",
          )}
        >
          {definition.label}
        </span>
        <span className="mt-0.5 block truncate text-[0.76rem] leading-tight text-studio-ink">
          {statusLabel}
        </span>
        <span className="mt-0.5 block truncate text-[0.66rem] leading-tight text-studio-muted">
          {publicationDate ? `Publishes ${publicationDate}` : title}
        </span>
      </button>
    );
  }

  function renderLiveStructureNavigationCard(
    kind: ManuscriptStructureBoundaryKind,
    currentBoundary: ManuscriptStructureBoundary | null,
    nextBoundary: ManuscriptStructureBoundary | null,
  ) {
    if (!currentBoundary && !nextBoundary) {
      return null;
    }

    const definition = getManuscriptStructureDefinition(kind);
    const targetBoundary = currentBoundary ?? nextBoundary;
    const publicationDate = formatEpisodePublicationDate(
      kind === "episode" ? targetBoundary?.publicationDate : null,
    );

    return (
      <article
        className={cn(
          "grid gap-2 rounded-lg border p-2.5",
          kind === "chapter"
            ? "border-studio-node/35 bg-studio-node/10"
            : "border-studio-source/35 bg-studio-source/10",
        )}
        data-testid={`manuscript-live-structure-nav-${kind}`}
        key={kind}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={labelClassName}>{definition.label}</span>
          <StudioChip tone={getLiveStructureTone(kind)}>
            {currentBoundary ? "Current" : "Upcoming"}
          </StudioChip>
        </div>
        <div className="min-w-0">
          <p className="m-0 truncate text-[0.82rem] font-bold text-studio-ink">
            {targetBoundary?.label}
          </p>
          <p className="m-0 truncate text-[0.72rem] leading-relaxed text-studio-muted">
            {targetBoundary?.title}
          </p>
          {publicationDate ? (
            <p className="m-0 truncate text-[0.68rem] font-bold leading-relaxed text-studio-source">
              Publishes {publicationDate}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source disabled:text-studio-dim"
            disabled={!currentBoundary}
            type="button"
            onClick={() => focusLiveBoundary(currentBoundary)}
          >
            Current
          </button>
          <button
            className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source disabled:text-studio-dim"
            disabled={!currentBoundary}
            type="button"
            onClick={() => focusLiveBoundary(currentBoundary, "end")}
          >
            End
          </button>
          <button
            className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source disabled:text-studio-dim"
            disabled={!nextBoundary}
            type="button"
            onClick={() => focusLiveBoundary(nextBoundary)}
          >
            Next
          </button>
          <button
            className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source disabled:text-studio-dim"
            disabled={!nextBoundary}
            type="button"
            onClick={() => focusLiveBoundary(nextBoundary, "end")}
          >
            Next end
          </button>
        </div>
      </article>
    );
  }

  useEffect(() => {
    if (autoBackupTimerRef.current !== null) {
      window.clearTimeout(autoBackupTimerRef.current);
      autoBackupTimerRef.current = null;
    }

    if (!isAutoBackupEnabled) {
      setAutoBackupStatus("Auto-save is off. Use Save now.");
      return;
    }

    if (hasOutsideBackup) {
      setAutoBackupStatus(
        "Auto-save paused until the newer outside backup is reviewed.",
      );
      return;
    }

    if (
      !hasCheckpointChanges ||
      !editor ||
      !setup?.ok ||
      isSaving ||
      isResettingFromLatest ||
      connectionStatus === "error"
    ) {
      return;
    }

    const elapsedSinceLastBackup = Date.now() - lastAutoBackupAtRef.current;
    const delay = Math.max(
      AUTO_BACKUP_IDLE_MS,
      AUTO_BACKUP_MIN_INTERVAL_MS - elapsedSinceLastBackup,
    );

    setAutoBackupStatus(
      `Auto-save queued in ${Math.ceil(delay / 1000).toLocaleString()} seconds.`,
    );
    autoBackupTimerRef.current = window.setTimeout(() => {
      autoBackupTimerRef.current = null;
      void saveCheckpoint({ mode: "auto" });
    }, delay);

    return () => {
      if (autoBackupTimerRef.current !== null) {
        window.clearTimeout(autoBackupTimerRef.current);
        autoBackupTimerRef.current = null;
      }
    };
  }, [
    connectionStatus,
    editor,
    hasCheckpointChanges,
    hasOutsideBackup,
    isAutoBackupEnabled,
    isResettingFromLatest,
    isSaving,
    setup,
  ]);

  return (
    <main className="min-h-screen px-3.5 pt-4 pb-32 md:px-6 md:pt-6 lg:py-6">
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
            {setup?.ok ? (
              <StudioChip tone="source">
                {activeParticipantCount.toLocaleString()} active
              </StudioChip>
            ) : null}
            {hasCheckpointChanges ? (
              <StudioChip tone="review">Saving soon</StudioChip>
            ) : null}
            {hasOutsideBackup ? (
              <StudioChip tone="review">Backup changed</StudioChip>
            ) : null}
          </div>

          <div className="hidden flex-wrap items-center justify-end gap-2 lg:flex">
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
              disabled={!editor || !setup?.ok || isSaving || isResettingFromLatest}
              type="button"
              onClick={() => void saveCheckpoint({ mode: "manual" })}
            >
              {isSaving ? "Saving..." : saveButtonLabel}
            </button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 rounded-lg border border-studio-line bg-[#021615] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] md:p-6">
            <EditorContent editor={editor} />
          </section>

          <aside className="hidden h-fit gap-3 rounded-lg border border-studio-line-strong bg-studio-panel/82 p-4 lg:sticky lg:top-[92px] lg:grid">
            <div>
              <p className={labelClassName}>Room</p>
              <p className="mt-1 mb-0 text-[0.92rem] leading-6 text-studio-muted">
                This is the shared editing room. Changes appear for everyone and
                save to the room automatically; the latest manuscript backup
                updates quietly after a short pause.
              </p>
            </div>

            <div className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={labelClassName}>Status</span>
                <StudioChip tone={statusTone}>{roomSyncLabel}</StudioChip>
              </div>
              <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                {message}
              </p>
              <p className="m-0 text-[0.76rem] leading-5 text-studio-dim">
                Live edits are saved to this shared room automatically. The
                latest manuscript backup auto-saves after a short idle pause;
                use Save now when you want it immediately.
              </p>
            </div>

            {isDraftHandoffVisible ? (
              <div
                className="grid gap-2 rounded-lg border border-studio-source/45 bg-studio-source/10 p-3"
                data-testid="manuscript-live-draft-handoff"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={labelClassName}>Draft handoff</span>
                  <StudioChip
                    tone={
                      draftHandoffState === "blocked"
                        ? "review"
                        : draftHandoffState === "loaded"
                          ? "tag"
                          : "source"
                    }
                  >
                    {draftHandoffState === "loading"
                      ? "Auto-starting"
                      : draftHandoffState === "blocked"
                        ? "Review first"
                        : "From editor"}
                  </StudioChip>
                </div>
                <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                  {draftHandoffState === "loading"
                    ? "You opened this room from a fresh Manuscript Desk save. No one else is active here, so the room is starting from that save automatically."
                    : draftHandoffState === "blocked"
                      ? "You opened this room from a fresh Manuscript Desk save, but the room may already have live edits. Compare first or load the saved draft when you are ready."
                      : "You opened this room from a fresh Manuscript Desk save. If it is safe, the room starts from that save automatically; otherwise, compare first."}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <button
                    className="min-h-9 rounded-md border border-studio-source/55 bg-studio-source/15 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source transition hover:bg-studio-source/20 disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim"
                    disabled={
                      !editor ||
                      !setup?.ok ||
                      isResettingFromLatest ||
                      isSaving ||
                      !(liveStatus?.ok && liveStatus.latestSnapshot)
                    }
                    type="button"
                    onClick={() => void useLatestBackupFromDraftHandoff()}
                  >
                    {draftHandoffState === "loading"
                      ? "Starting room..."
                      : "Use saved draft now"}
                  </button>
                  <button
                    className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10"
                    type="button"
                    onClick={() => {
                      setDraftHandoffState("idle");
                      setIsDraftHandoffVisible(false);
                    }}
                  >
                    Keep current room
                  </button>
                </div>
              </div>
            ) : null}

            <div
              className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3"
              data-testid="manuscript-live-author-controls"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={labelClassName}>Writing as</span>
                <StudioChip tone={getLiveAuthorTone(activeAuthorId)}>
                  {getManuscriptAuthorDefinition(activeAuthorId).label}
                </StudioChip>
              </div>
              <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                New typing uses this author color. Select text first when you
                need to repair attribution in the shared room.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {liveWritableAuthorIds.map((authorId) => {
                  const author = getManuscriptAuthorDefinition(authorId);

                  return (
                    <button
                      className={getLiveAuthorButtonClassName(
                        authorId,
                        activeAuthorId === authorId,
                      )}
                      data-testid={`manuscript-live-author-${authorId}`}
                      disabled={!editor || !setup?.ok}
                      key={authorId}
                      type="button"
                      onClick={() => updateLiveWritingAuthor(authorId)}
                    >
                      {author.label}
                    </button>
                  );
                })}
              </div>
              <button
                className="min-h-9 rounded-md border border-studio-source/55 bg-studio-source/10 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source transition hover:bg-studio-source/15 disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim"
                data-testid="manuscript-live-author-mark-selection"
                disabled={!editor || !setup?.ok}
                type="button"
                onClick={() => markSelectionAsLiveAuthor()}
              >
                Mark selected text
              </button>
            </div>

            {renderLiveSemanticControls("desktop")}

            {renderLiveStructureMarkerControls("desktop")}

            {hasLiveStructureContent ? (
              <div
                className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3"
                data-testid="manuscript-live-structure-navigation"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={labelClassName}>Live outline</span>
                  <StudioChip tone="source">
                    {liveBlockSummaries.length.toLocaleString()} blocks
                  </StudioChip>
                </div>
                {renderLiveStructureNavigationCard(
                  "chapter",
                  liveStructureState.chapter,
                  liveStructureState.nextChapter,
                )}
                {renderLiveStructureNavigationCard(
                  "episode",
                  liveStructureState.episode,
                  liveStructureState.nextEpisode,
                )}
              </div>
            ) : null}

            <div className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={labelClassName}>People in room</span>
                <StudioChip tone="source">
                  {activeParticipantCount.toLocaleString()} active
                </StudioChip>
              </div>
              <div className="grid gap-2">
                {presenceParticipants.length ? (
                  presenceParticipants.map((participant) => (
                    <div
                      className="flex items-center justify-between gap-2 rounded-md border border-studio-line bg-studio-ink/5 px-2.5 py-2"
                      key={participant.clientId}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: participant.color }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-[0.84rem] font-extrabold text-studio-ink">
                          {participant.name}
                        </span>
                      </div>
                      <span className="shrink-0 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-studio-dim">
                        {participant.isCurrent ? "You" : participant.role}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                    Waiting for room presence.
                  </p>
                )}
              </div>
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
                <span className={labelClassName}>Latest backup</span>
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

            <div
              className={cn(
                "grid gap-2 rounded-lg border bg-black/15 p-3",
                hasOutsideBackup
                  ? "border-studio-review/45 bg-studio-review/10"
                  : "border-studio-line",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={labelClassName}>Start over from latest</span>
                {hasOutsideBackup ? (
                  <StudioChip tone="review">Compare first</StudioChip>
                ) : null}
              </div>
              <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                Open the latest backup beside this room, or load it into the
                shared room when the room should start fresh from the saved
                manuscript.
              </p>
              <div className="grid gap-2">
                <a
                  className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-center text-[0.78rem] font-extrabold text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10"
                  href="/manuscript/live/latest"
                  target="_blank"
                  rel="noreferrer"
                >
                  Compare latest
                </a>
                <button
                  className="min-h-9 rounded-md border border-studio-review/55 bg-studio-review/10 px-3 py-2 text-[0.78rem] font-extrabold text-studio-review transition hover:bg-studio-review/15 disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim"
                  disabled={
                    !editor ||
                    !setup?.ok ||
                    isResettingFromLatest ||
                    isSaving ||
                    !(liveStatus?.ok && liveStatus.latestSnapshot)
                  }
                  type="button"
                  onClick={() => void resetRoomFromLatestBackup()}
                >
                  {isResettingFromLatest
                    ? "Loading latest..."
                    : "Load latest into room"}
                </button>
              </div>
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
              <div className="flex items-center justify-between gap-2">
                <span className={labelClassName}>Auto-save</span>
                <StudioChip tone={autoBackupTone}>{autoBackupLabel}</StudioChip>
              </div>
              <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                {lastCheckpoint
                  ? `${formatDateTime(lastCheckpoint.updatedAt)} - ${lastCheckpoint.wordCount.toLocaleString()} words`
                  : hasCheckpointChanges
                    ? "The room has edits queued for the next automatic backup."
                    : "No new room edits need saving from this browser."}
              </p>
              <p className="m-0 text-[0.76rem] leading-5 text-studio-dim">
                {autoBackupStatus}
              </p>
              <button
                className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10"
                type="button"
                onClick={() => {
                  setIsAutoBackupEnabled((current) => !current);
                }}
              >
                {isAutoBackupEnabled ? "Turn off auto-save" : "Turn on auto-save"}
              </button>
            </div>

            <a
              className="min-h-10 rounded-lg border border-studio-line bg-studio-ink/5 px-3 py-2 text-center text-[0.86rem] font-extrabold text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10"
              href="/manuscript"
            >
              Back to Manuscript Desk
            </a>
          </aside>
          </div>
        </section>

        <section
          className="fixed inset-x-0 bottom-0 z-40 border-t border-studio-line-strong bg-studio-panel/98 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-18px_54px_rgba(0,0,0,0.38)] backdrop-blur lg:hidden"
          aria-label="Mobile live edit controls"
        >
          {isMobileRoomMenuOpen ? (
            <div
              className="mb-2 grid max-h-[68vh] gap-3 overflow-auto rounded-t-2xl border border-studio-line-strong bg-[#041f1e] p-3"
              data-testid="manuscript-live-mobile-menu"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={labelClassName}>Live room</p>
                  <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                    Room tools
                  </h2>
                </div>
                <button
                  className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source"
                  type="button"
                  onClick={() => setIsMobileRoomMenuOpen(false)}
                >
                  Back
                </button>
              </div>

              <div className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={labelClassName}>Status</span>
                  <StudioChip tone={statusTone}>{roomSyncLabel}</StudioChip>
                </div>
                <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                  {message}
                </p>
              </div>

              <div
                className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3"
                data-testid="manuscript-live-mobile-author-controls"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={labelClassName}>Writing as</span>
                  <StudioChip tone={getLiveAuthorTone(activeAuthorId)}>
                    {getManuscriptAuthorDefinition(activeAuthorId).label}
                  </StudioChip>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {liveWritableAuthorIds.map((authorId) => {
                    const author = getManuscriptAuthorDefinition(authorId);

                    return (
                      <button
                        className={getLiveAuthorButtonClassName(
                          authorId,
                          activeAuthorId === authorId,
                        )}
                        data-testid={`manuscript-live-mobile-author-${authorId}`}
                        disabled={!editor || !setup?.ok}
                        key={authorId}
                        type="button"
                        onClick={() => updateLiveWritingAuthor(authorId)}
                      >
                        {author.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="min-h-9 rounded-md border border-studio-source/55 bg-studio-source/10 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim"
                  data-testid="manuscript-live-mobile-author-mark-selection"
                  disabled={!editor || !setup?.ok}
                  type="button"
                  onClick={() => markSelectionAsLiveAuthor()}
                >
                  Mark selection
                </button>
              </div>

              {renderLiveSemanticControls("mobile")}

              {renderLiveStructureMarkerControls("mobile")}

              {hasLiveStructureContent ? (
                <div
                  className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3"
                  data-testid="manuscript-live-mobile-structure-navigation"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={labelClassName}>Live outline</span>
                    <StudioChip tone="source">
                      {liveBlockSummaries.length.toLocaleString()} blocks
                    </StudioChip>
                  </div>
                  {renderLiveStructureNavigationCard(
                    "chapter",
                    liveStructureState.chapter,
                    liveStructureState.nextChapter,
                  )}
                  {renderLiveStructureNavigationCard(
                    "episode",
                    liveStructureState.episode,
                    liveStructureState.nextEpisode,
                  )}
                </div>
              ) : null}

              <div className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={labelClassName}>People</span>
                  <StudioChip tone="source">
                    {activeParticipantCount.toLocaleString()} active
                  </StudioChip>
                </div>
                <div className="grid gap-2">
                  {presenceParticipants.length ? (
                    presenceParticipants.map((participant) => (
                      <div
                        className="flex items-center justify-between gap-2 rounded-md border border-studio-line bg-studio-ink/5 px-2.5 py-2"
                        key={participant.clientId}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: participant.color }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-[0.84rem] font-extrabold text-studio-ink">
                            {participant.name}
                          </span>
                        </div>
                        <span className="shrink-0 text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-studio-dim">
                          {participant.isCurrent ? "You" : participant.role}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                      Waiting for room presence.
                    </p>
                  )}
                </div>
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
                  <span className={labelClassName}>Latest backup</span>
                  <StudioChip tone={backupPriorityTone}>{backupPriorityLabel}</StudioChip>
                </div>
                <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                  {backupPriorityCopy}
                </p>
                <p className="m-0 text-[0.76rem] leading-5 text-studio-dim">
                  Latest: {latestBackupLabel}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source disabled:text-studio-dim"
                    disabled={isCheckingLiveStatus}
                    type="button"
                    onClick={() => void refreshLiveStatus()}
                  >
                    {isCheckingLiveStatus ? "Checking..." : "Check"}
                  </button>
                  <a
                    className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-center text-[0.78rem] font-extrabold text-studio-source"
                    href="/manuscript/live/latest"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Compare
                  </a>
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={labelClassName}>Auto-save</span>
                  <StudioChip tone={autoBackupTone}>{autoBackupLabel}</StudioChip>
                </div>
                <p className="m-0 text-[0.82rem] leading-5 text-studio-muted">
                  {lastCheckpoint
                    ? `${formatDateTime(lastCheckpoint.updatedAt)} - ${lastCheckpoint.wordCount.toLocaleString()} words`
                    : hasCheckpointChanges
                      ? "The room has edits queued for the next automatic backup."
                      : "No new room edits need saving from this browser."}
                </p>
                <p className="m-0 text-[0.76rem] leading-5 text-studio-dim">
                  {autoBackupStatus}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="min-h-9 rounded-md border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source"
                    type="button"
                    onClick={() => {
                      setIsAutoBackupEnabled((current) => !current);
                    }}
                  >
                    {isAutoBackupEnabled ? "Manual" : "Auto"}
                  </button>
                  <button
                    className="min-h-9 rounded-md border border-studio-review/55 bg-studio-review/10 px-3 py-2 text-[0.78rem] font-extrabold text-studio-review disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim"
                    disabled={
                      !editor ||
                      !setup?.ok ||
                      isResettingFromLatest ||
                      isSaving ||
                      !(liveStatus?.ok && liveStatus.latestSnapshot)
                    }
                    type="button"
                    onClick={() => void resetRoomFromLatestBackup()}
                  >
                    {isResettingFromLatest ? "Loading..." : "Load latest"}
                  </button>
                </div>
              </div>

              <a
                className="min-h-10 rounded-lg border border-studio-line bg-studio-ink/5 px-3 py-2 text-center text-[0.86rem] font-extrabold text-studio-source"
                href="/manuscript"
              >
                Back to Manuscript Desk
              </a>
            </div>
          ) : null}

          {hasLiveStructureContent ? (
            <div
              className="mb-2 grid grid-cols-2 gap-2"
              data-testid="manuscript-live-mobile-structure-strip"
            >
              {renderLiveStructureStatusItem(
                "chapter",
                liveStructureState.chapter,
                liveStructureState.nextChapter,
              )}
              {renderLiveStructureStatusItem(
                "episode",
                liveStructureState.episode,
                liveStructureState.nextEpisode,
              )}
            </div>
          ) : null}

          <div
            className="flex items-center justify-between gap-2"
            data-testid="manuscript-live-mobile-footer"
          >
            <div className="min-w-0">
              <p className="m-0 truncate text-[0.66rem] font-extrabold uppercase leading-tight text-studio-muted">
                {roomSyncLabel}
              </p>
              <p className="m-0 truncate text-[0.72rem] leading-tight text-studio-muted">
                {getManuscriptAuthorDefinition(activeAuthorId).label} /{" "}
                {activeParticipantCount.toLocaleString()} active
                {hasCheckpointChanges ? " / saving soon" : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                className="min-h-10 rounded-lg border border-studio-tag/55 bg-studio-tag/15 px-3 py-2 text-[0.78rem] font-extrabold text-studio-tag disabled:border-studio-line disabled:bg-studio-ink/5 disabled:text-studio-dim"
                data-testid="manuscript-live-mobile-save"
                disabled={!editor || !setup?.ok || isSaving || isResettingFromLatest}
                type="button"
                onClick={() => void saveCheckpoint({ mode: "manual" })}
              >
                {isSaving ? "Saving" : "Save"}
              </button>
              <button
                className="min-h-10 rounded-lg border border-studio-source/45 bg-studio-source/10 px-3 py-2 text-[0.78rem] font-extrabold text-studio-source"
                data-testid="manuscript-live-mobile-share"
                type="button"
                onClick={() => void copySharedEditLink()}
              >
                {shareLinkState === "copied" ? "Copied" : "Share"}
              </button>
              <button
                className={cn(
                  "grid size-10 place-items-center rounded-lg border border-studio-line bg-studio-ink/5 px-0 text-studio-source",
                  isMobileRoomMenuOpen
                    ? "border-studio-tag/55 bg-studio-tag/15 text-studio-tag"
                    : "",
                )}
                data-testid="manuscript-live-mobile-menu-toggle"
                type="button"
                aria-expanded={isMobileRoomMenuOpen}
                aria-label={
                  isMobileRoomMenuOpen
                    ? "Close live room tools"
                    : "Open live room tools"
                }
                onClick={() => setIsMobileRoomMenuOpen((current) => !current)}
              >
                <span className="grid gap-1" aria-hidden="true">
                  <span className="block h-0.5 w-4 rounded-full bg-current" />
                  <span className="block h-0.5 w-4 rounded-full bg-current" />
                  <span className="block h-0.5 w-4 rounded-full bg-current" />
                </span>
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }
