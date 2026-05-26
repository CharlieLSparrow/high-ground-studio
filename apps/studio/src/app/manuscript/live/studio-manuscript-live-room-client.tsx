"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";

import { StudioNav } from "../../studio-nav";
import {
  cardClassName,
  cn,
  labelClassName,
  panelClassName,
  panelCopyClassName,
  panelTitleClassName,
  StudioChip,
  StudioGlyph,
} from "../../studio-ui";
import {
  applyTextAreaValueToYText,
  appendLiveRoomNotebookBlock,
  countLiveRoomTextStats,
  createLiveRoomNotebookSectionText,
  createLiveRoomNotebookStarterText,
  createLiveRoomNotebookBlocks,
  createLiveRoomSessionRecap,
  createLiveRoomSessionPacket,
  createLiveRoomSnapshotDescription,
  createManuscriptDraftFromLiveRoomText,
  createLiveRoomTextFromManuscriptDraft,
  decodeLiveRoomUpdateBase64,
  encodeLiveRoomUpdateBase64,
  insertLiveRoomNotebookBlockAfter,
  moveLiveRoomNotebookBlock,
  removeLiveRoomNotebookBlock,
  STUDIO_MANUSCRIPT_LIVE_YTEXT_NAME,
  type StudioManuscriptLiveNotebookSectionKind,
  updateLiveRoomNotebookBlockKind,
  updateLiveRoomNotebookBlockText,
} from "./studio-manuscript-live-room-model";
import type { ManuscriptDraft } from "../manuscript-editor-model";

type StudioManuscriptLiveRoomClientProps = {
  actor: {
    primaryEmail: string;
  };
};

type LivePresence = {
  actorEmail: string;
  displayName: string | null;
  clientId: string | null;
  mode: string | null;
  lastSeenAt: string;
};

type LiveRoomSummary = {
  id: string;
  manuscriptId: string | null;
  ownerEmail: string;
  title: string;
  schemaVersion: number;
  clock: number;
  wordCount: number;
  characterCount: number;
  updatedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
  activePresence: LivePresence[];
};

type LiveRoomDetail = LiveRoomSummary & {
  ydocUpdateBase64: string;
  plainText: string;
};

type LiveRoomUpdate = {
  id: string;
  actorEmail: string;
  clientId: string | null;
  clock: number;
  updateBase64: string;
  createdAt: string;
};

type ManuscriptSnapshotSummary = {
  id: string;
  manuscriptId: string | null;
  title: string;
  wordCount: number;
  characterCount: number;
  blockCount: number;
  updatedAt: string;
};

type ManuscriptSnapshotDetail = ManuscriptSnapshotSummary & {
  draft: ManuscriptDraft;
};

type ManuscriptLibrarySummary = {
  id: string;
  title: string;
  kind: "WORKING" | "SYNTHETIC";
  snapshotCount: number;
  latestSnapshot: ManuscriptSnapshotSummary | null;
  lastSnapshotAt: string | null;
  updatedAt: string;
};

type ApiResponse<T> = T | { ok: false; message: string };

type LiveEditorMode = "notebook" | "raw";

type NotebookStarterOption = {
  kind: "working-session" | "writing-pass" | "coaching-session";
  label: string;
};

type QuickSectionOption = {
  kind: StudioManuscriptLiveNotebookSectionKind;
  label: string;
};

const notebookStarterOptions: NotebookStarterOption[] = [
  { kind: "working-session", label: "Session notes" },
  { kind: "writing-pass", label: "Writing pass" },
  { kind: "coaching-session", label: "Coaching session" },
];

const quickSectionOptions: QuickSectionOption[] = [
  { kind: "note", label: "Note" },
  { kind: "decision", label: "Decision" },
  { kind: "action-items", label: "Actions" },
  { kind: "question", label: "Question" },
  { kind: "source-note", label: "Source" },
];

const notebookSectionKindOptions = quickSectionOptions;

const buttonClassName =
  "min-h-10 rounded-lg border border-studio-line bg-studio-ink/5 px-3 py-2 text-[0.8rem] font-extrabold text-studio-source transition hover:border-studio-source/55 hover:bg-studio-source/10 disabled:text-studio-dim";

const primaryButtonClassName =
  "min-h-10 rounded-lg border border-studio-tag/50 bg-studio-tag/15 px-3 py-2 text-[0.8rem] font-extrabold text-studio-tag transition hover:bg-studio-tag/20 disabled:text-studio-dim";

const fieldClassName =
  "min-h-10 w-full rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 py-2 text-studio-ink disabled:text-studio-dim";

const textareaClassName =
  "w-full resize-y rounded-xl border border-studio-line-strong bg-[#0f1512] px-4 py-3 text-[1rem] leading-7 text-studio-ink shadow-inner outline-none transition focus:border-studio-source/60";

const notebookPresenceModePrefix = "editing section ";

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `live-client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readJsonResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const body = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!body || typeof body !== "object") {
    return { ok: false, message: "Server returned an unreadable response." };
  }

  return body;
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createShareUrl(roomId: string | null) {
  if (!roomId || typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  url.pathname = "/manuscript/live";
  url.search = "";
  url.searchParams.set("room", roomId);

  return url.toString();
}

function createLivePresenceMode(input: {
  editorMode: LiveEditorMode;
  isEditorFocused: boolean;
  selectedNotebookBlockIndex: number;
}) {
  if (!input.isEditorFocused) {
    return "viewing";
  }

  if (input.editorMode === "notebook") {
    return `${notebookPresenceModePrefix}${input.selectedNotebookBlockIndex + 1}`;
  }

  return "editing raw text";
}

function parseLivePresenceNotebookBlockIndex(mode: string | null) {
  const match = String(mode ?? "").match(/^editing section (\d+)$/);

  if (!match) {
    return null;
  }

  const sectionNumber = Number(match[1]);

  if (!Number.isFinite(sectionNumber) || sectionNumber < 1) {
    return null;
  }

  return sectionNumber - 1;
}

function formatLivePresenceName(
  entry: LivePresence,
  currentClientId: string,
  currentActorEmail: string,
) {
  if (entry.clientId === currentClientId) {
    return "You";
  }

  return (entry.displayName || entry.actorEmail || currentActorEmail).split("@")[0];
}

function formatLivePresenceMode(mode: string | null) {
  if (!mode) {
    return "viewing";
  }

  if (mode.startsWith(notebookPresenceModePrefix)) {
    return `section ${mode.slice(notebookPresenceModePrefix.length)}`;
  }

  return mode;
}

function formatNotebookSectionKind(kind: StudioManuscriptLiveNotebookSectionKind) {
  if (kind === "action-items") {
    return "Actions";
  }

  if (kind === "source-note") {
    return "Source";
  }

  if (kind === "decision") {
    return "Decision";
  }

  if (kind === "question") {
    return "Question";
  }

  return "Note";
}

function getNotebookSectionKindTone(
  kind: StudioManuscriptLiveNotebookSectionKind,
): "default" | "tag" | "node" | "source" | "review" | "danger" {
  if (kind === "decision") {
    return "tag";
  }

  if (kind === "action-items") {
    return "review";
  }

  if (kind === "source-note") {
    return "source";
  }

  if (kind === "question") {
    return "node";
  }

  return "default";
}

function isErrorResponse<T>(
  response: ApiResponse<T>,
): response is { ok: false; message: string } {
  return (
    typeof response === "object" &&
    response !== null &&
    "ok" in response &&
    response.ok === false
  );
}

export function StudioManuscriptLiveRoomClient({
  actor,
}: StudioManuscriptLiveRoomClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRoomId = searchParams.get("room")?.trim() ?? "";
  const [clientId] = useState(createClientId);
  const [rooms, setRooms] = useState<LiveRoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<LiveRoomDetail | null>(null);
  const [presence, setPresence] = useState<LivePresence[]>([]);
  const [manuscripts, setManuscripts] = useState<ManuscriptLibrarySummary[]>([]);
  const [selectedManuscriptId, setSelectedManuscriptId] = useState("");
  const [draftTitle, setDraftTitle] = useState("Tonight manuscript room");
  const [initialText, setInitialText] = useState("");
  const [text, setText] = useState("");
  const [editorMode, setEditorMode] = useState<LiveEditorMode>("notebook");
  const [selectedNotebookBlockIndex, setSelectedNotebookBlockIndex] = useState(0);
  const [isNotebookFocusMode, setIsNotebookFocusMode] = useState(false);
  const [message, setMessage] = useState("Ready.");
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const [isLoadingManuscripts, setIsLoadingManuscripts] = useState(false);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const yDocRef = useRef<Y.Doc | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const clockRef = useRef(0);
  const pendingUpdatesRef = useRef<Uint8Array[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const stats = useMemo(() => countLiveRoomTextStats(text), [text]);
  const sessionRecap = useMemo(() => createLiveRoomSessionRecap(text), [text]);
  const shareUrl = useMemo(() => createShareUrl(activeRoom?.id ?? null), [activeRoom?.id]);
  const notebookBlocks = useMemo(
    () => createLiveRoomNotebookBlocks(text),
    [text],
  );
  const visibleNotebookBlocks = useMemo(() => {
    if (!isNotebookFocusMode) {
      return notebookBlocks;
    }

    const selectedBlock = notebookBlocks.find(
      (block) => block.index === selectedNotebookBlockIndex,
    );

    return selectedBlock ? [selectedBlock] : notebookBlocks.slice(0, 1);
  }, [isNotebookFocusMode, notebookBlocks, selectedNotebookBlockIndex]);
  const notebookPresenceByBlock = useMemo(() => {
    const nextPresence = new Map<number, LivePresence[]>();

    presence.forEach((entry) => {
      const blockIndex = parseLivePresenceNotebookBlockIndex(entry.mode);

      if (blockIndex === null) {
        return;
      }

      const entries = nextPresence.get(blockIndex) ?? [];
      entries.push(entry);
      nextPresence.set(blockIndex, entries);
    });

    return nextPresence;
  }, [presence]);
  const selectedManuscript = useMemo(
    () =>
      manuscripts.find((manuscript) => manuscript.id === selectedManuscriptId) ??
      null,
    [manuscripts, selectedManuscriptId],
  );

  const updateMessage = useCallback((nextMessage: string) => {
    setMessage(nextMessage);
    setError("");
  }, []);

  const updateError = useCallback((nextError: string) => {
    setError(nextError);
    setMessage("");
  }, []);

  const loadRooms = useCallback(async () => {
    const response = await fetch("/api/manuscript/live-rooms", {
      cache: "no-store",
    });
    const body = await readJsonResponse<{ ok: true; rooms: LiveRoomSummary[] }>(
      response,
    );

    if (isErrorResponse(body)) {
      updateError(body.message);
      return;
    }

    setRooms(body.rooms);
  }, [updateError]);

  const loadManuscripts = useCallback(async () => {
    setIsLoadingManuscripts(true);

    const response = await fetch("/api/manuscript/library", {
      cache: "no-store",
    });
    const body = await readJsonResponse<{
      ok: true;
      manuscripts: ManuscriptLibrarySummary[];
    }>(response);

    setIsLoadingManuscripts(false);

    if (isErrorResponse(body)) {
      updateError(body.message);
      return;
    }

    setManuscripts(body.manuscripts);
    setSelectedManuscriptId((currentId) => {
      if (
        currentId &&
        body.manuscripts.some((manuscript) => manuscript.id === currentId)
      ) {
        return currentId;
      }

      return (
        body.manuscripts.find((manuscript) => manuscript.latestSnapshot)?.id ??
        body.manuscripts[0]?.id ??
        ""
      );
    });
  }, [updateError]);

  const loadLatestSnapshotIntoStart = useCallback(async () => {
    if (!selectedManuscriptId) {
      updateError("Select a manuscript first.");
      return;
    }

    setIsLoadingSnapshot(true);
    updateMessage("Loading latest manuscript snapshot.");

    const response = await fetch(
      `/api/manuscript/snapshots/latest?manuscriptId=${encodeURIComponent(
        selectedManuscriptId,
      )}`,
      { cache: "no-store" },
    );
    const body = await readJsonResponse<{
      ok: true;
      snapshot: ManuscriptSnapshotDetail | null;
    }>(response);

    setIsLoadingSnapshot(false);

    if (isErrorResponse(body)) {
      updateError(body.message);
      return;
    }

    if (!body.snapshot) {
      updateError("Selected manuscript has no saved snapshot yet.");
      return;
    }

    setDraftTitle(`${body.snapshot.title} live room`.slice(0, 140));
    setInitialText(createLiveRoomTextFromManuscriptDraft(body.snapshot.draft));
    updateMessage(`Loaded latest snapshot from ${formatTime(body.snapshot.updatedAt)}.`);
  }, [selectedManuscriptId, updateError, updateMessage]);

  const flushPendingUpdates = useCallback(async () => {
    const roomId = activeRoomIdRef.current;

    if (!roomId || !pendingUpdatesRef.current.length) {
      return;
    }

    const updates = pendingUpdatesRef.current.splice(0);

    for (const update of updates) {
      const response = await fetch(
        `/api/manuscript/live-rooms/${encodeURIComponent(roomId)}/updates`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            updateBase64: encodeLiveRoomUpdateBase64(update),
          }),
        },
      );
      const body = await readJsonResponse<{ ok: true; room: LiveRoomSummary }>(
        response,
      );

      if (isErrorResponse(body)) {
        pendingUpdatesRef.current.unshift(update);
        updateError(body.message);
        return;
      }

      setActiveRoom((room) =>
        room && room.id === body.room.id ? { ...room, ...body.room } : room,
      );
      updateMessage("Synced local edits.");
    }
  }, [clientId, updateError, updateMessage]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
    }

    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flushPendingUpdates();
    }, 450);
  }, [flushPendingUpdates]);

  const disposeCurrentRoom = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    pendingUpdatesRef.current = [];
    activeRoomIdRef.current = null;
    clockRef.current = 0;
    yDocRef.current?.destroy();
    yDocRef.current = null;
    yTextRef.current = null;
  }, []);

  const loadRoom = useCallback(
    async (roomId: string) => {
      if (!roomId) {
        return;
      }

      setIsLoadingRoom(true);
      updateMessage("Loading live room.");

      const response = await fetch(
        `/api/manuscript/live-rooms/${encodeURIComponent(roomId)}`,
        { cache: "no-store" },
      );
      const body = await readJsonResponse<{ ok: true; room: LiveRoomDetail }>(
        response,
      );

      setIsLoadingRoom(false);

      if (isErrorResponse(body)) {
        updateError(body.message);
        return;
      }

      disposeCurrentRoom();

      const update = decodeLiveRoomUpdateBase64(body.room.ydocUpdateBase64);

      if (!update) {
        updateError("Live room document payload could not be decoded.");
        return;
      }

      const doc = new Y.Doc();
      Y.applyUpdate(doc, update, "remote");
      const yText = doc.getText(STUDIO_MANUSCRIPT_LIVE_YTEXT_NAME);

      doc.on("update", (nextUpdate, origin) => {
        if (origin === "remote") {
          return;
        }

        pendingUpdatesRef.current.push(nextUpdate);
        scheduleFlush();
      });

      yText.observe(() => {
        const nextText = yText.toString();
        setText(nextText);
      });

      yDocRef.current = doc;
      yTextRef.current = yText;
      activeRoomIdRef.current = body.room.id;
      clockRef.current = body.room.clock;
      setActiveRoom(body.room);
      setPresence(body.room.activePresence);
      setText(yText.toString());
      updateMessage("Live room loaded.");
    },
    [disposeCurrentRoom, scheduleFlush, updateError, updateMessage],
  );

  const createRoom = useCallback(async () => {
    setIsCreating(true);
    updateMessage("Creating live room.");

    const response = await fetch("/api/manuscript/live-rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: draftTitle,
        initialText,
        manuscriptId: selectedManuscriptId || null,
      }),
    });
    const body = await readJsonResponse<{ ok: true; room: LiveRoomDetail }>(
      response,
    );

    setIsCreating(false);

    if (isErrorResponse(body)) {
      updateError(body.message);
      return;
    }

    setRooms((currentRooms) => [
      body.room,
      ...currentRooms.filter((room) => room.id !== body.room.id),
    ]);
    router.replace(`/manuscript/live?room=${encodeURIComponent(body.room.id)}`);
    await loadRoom(body.room.id);
  }, [
    draftTitle,
    initialText,
    loadRoom,
    router,
    selectedManuscriptId,
    updateError,
    updateMessage,
  ]);

  const updateText = useCallback((nextText: string) => {
    const yText = yTextRef.current;
    const doc = yDocRef.current;

    setText(nextText);

    if (!yText || !doc) {
      return;
    }

    doc.transact(() => {
      applyTextAreaValueToYText(yText, nextText);
    }, "local");
  }, []);

  const focusNotebookBlock = useCallback((blockIndex: number) => {
    setSelectedNotebookBlockIndex(blockIndex);

    window.requestAnimationFrame(() => {
      document.getElementById(`live-notebook-block-${blockIndex}`)?.focus();
    });
  }, []);

  const updateNotebookBlock = useCallback(
    (blockIndex: number, blockText: string) => {
      updateText(
        updateLiveRoomNotebookBlockText({
          text,
          blockIndex,
          blockText,
        }),
      );
    },
    [text, updateText],
  );

  const setNotebookBlockKind = useCallback(
    (blockIndex: number, kind: StudioManuscriptLiveNotebookSectionKind) => {
      updateText(
        updateLiveRoomNotebookBlockKind({
          text,
          blockIndex,
          kind,
        }),
      );
      focusNotebookBlock(blockIndex);
      updateMessage(
        `Marked section ${blockIndex + 1} as ${formatNotebookSectionKind(
          kind,
        ).toLowerCase()}.`,
      );
    },
    [focusNotebookBlock, text, updateMessage, updateText],
  );

  const toggleNotebookFocusMode = useCallback(() => {
    const nextFocusMode = !isNotebookFocusMode;

    setIsNotebookFocusMode(nextFocusMode);

    if (nextFocusMode) {
      focusNotebookBlock(selectedNotebookBlockIndex);
    }

    updateMessage(
      nextFocusMode
        ? `Focused section ${selectedNotebookBlockIndex + 1}.`
        : "Showing all notebook sections.",
    );
  }, [
    focusNotebookBlock,
    isNotebookFocusMode,
    selectedNotebookBlockIndex,
    updateMessage,
  ]);

  const focusNotebookSection = useCallback(
    (blockIndex: number) => {
      setIsNotebookFocusMode(true);
      focusNotebookBlock(blockIndex);
      updateMessage(`Focused section ${blockIndex + 1}.`);
    },
    [focusNotebookBlock, updateMessage],
  );

  const addNotebookBlock = useCallback(() => {
    const nextIndex = text.trim() ? notebookBlocks.length : 0;

    updateText(
      appendLiveRoomNotebookBlock(text, createLiveRoomNotebookSectionText()),
    );
    focusNotebookBlock(nextIndex);
    updateMessage("Added notebook section.");
  }, [focusNotebookBlock, notebookBlocks.length, text, updateMessage, updateText]);

  const insertQuickNotebookSection = useCallback(
    (kind: StudioManuscriptLiveNotebookSectionKind) => {
      const nextIndex = text.trim() ? selectedNotebookBlockIndex + 1 : 0;

      if (text.trim()) {
        updateText(
          insertLiveRoomNotebookBlockAfter({
            text,
            blockIndex: selectedNotebookBlockIndex,
            blockText: createLiveRoomNotebookSectionText(kind),
          }),
        );
      } else {
        updateText(createLiveRoomNotebookSectionText(kind));
      }

      focusNotebookBlock(nextIndex);
      updateMessage(
        `Added ${formatNotebookSectionKind(kind).toLowerCase()} section.`,
      );
    },
    [
      focusNotebookBlock,
      selectedNotebookBlockIndex,
      text,
      updateMessage,
      updateText,
    ],
  );

  const addNotebookBlockAfter = useCallback(
    (blockIndex: number) => {
      const nextIndex = blockIndex + 1;

      updateText(
        insertLiveRoomNotebookBlockAfter({
          text,
          blockIndex,
        }),
      );
      focusNotebookBlock(nextIndex);
      updateMessage("Added notebook section.");
    },
    [focusNotebookBlock, text, updateMessage, updateText],
  );

  const moveNotebookBlock = useCallback(
    (blockIndex: number, direction: -1 | 1) => {
      const nextIndex = Math.max(
        0,
        Math.min(notebookBlocks.length - 1, blockIndex + direction),
      );

      updateText(
        moveLiveRoomNotebookBlock({
          text,
          blockIndex,
          direction,
        }),
      );
      focusNotebookBlock(nextIndex);
      updateMessage("Moved notebook section.");
    },
    [focusNotebookBlock, notebookBlocks.length, text, updateMessage, updateText],
  );

  const removeNotebookBlock = useCallback(
    (blockIndex: number) => {
      const nextIndex = Math.max(0, blockIndex - 1);

      updateText(
        removeLiveRoomNotebookBlock({
          text,
          blockIndex,
        }),
      );
      focusNotebookBlock(nextIndex);
      updateMessage("Removed notebook section.");
    },
    [focusNotebookBlock, text, updateMessage, updateText],
  );

  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) {
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    updateMessage("Room link copied.");
  }, [shareUrl, updateMessage]);

  const copyText = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    updateMessage("Manuscript text copied.");
  }, [text, updateMessage]);

  const copySessionRecap = useCallback(async () => {
    await navigator.clipboard.writeText(sessionRecap.summaryText);
    updateMessage("Session recap copied.");
  }, [sessionRecap.summaryText, updateMessage]);

  const copySessionPacket = useCallback(async () => {
    if (!activeRoom) {
      return;
    }

    await navigator.clipboard.writeText(
      createLiveRoomSessionPacket({
        roomId: activeRoom.id,
        roomTitle: activeRoom.title,
        shareUrl,
        text,
      }),
    );
    updateMessage("Session packet copied.");
  }, [activeRoom, shareUrl, text, updateMessage]);

  const saveSnapshot = useCallback(async () => {
    if (!activeRoom) {
      return;
    }

    setIsSavingSnapshot(true);
    updateMessage("Saving manual snapshot.");

    const draft = createManuscriptDraftFromLiveRoomText({
      title: activeRoom.title,
      text,
      timestamp: new Date().toISOString(),
    });
    const response = await fetch("/api/manuscript/snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draft,
        description: createLiveRoomSnapshotDescription({
          roomId: activeRoom.id,
          recap: sessionRecap,
        }),
        manuscriptId: activeRoom.manuscriptId,
        snapshotType: "manual",
      }),
    });
    const body = await readJsonResponse<{ ok: true; snapshot: { id: string } }>(
      response,
    );

    setIsSavingSnapshot(false);

    if (isErrorResponse(body)) {
      updateError(body.message);
      return;
    }

    updateMessage(`Manual snapshot saved: ${body.snapshot.id}`);
  }, [activeRoom, sessionRecap, text, updateError, updateMessage]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    void loadManuscripts();
  }, [loadManuscripts]);

  useEffect(() => {
    if (requestedRoomId && requestedRoomId !== activeRoomIdRef.current) {
      void loadRoom(requestedRoomId);
    }
  }, [loadRoom, requestedRoomId]);

  useEffect(() => {
    if (!activeRoom?.id) {
      return;
    }

    const interval = setInterval(async () => {
      const roomId = activeRoomIdRef.current;
      const doc = yDocRef.current;

      if (!roomId || !doc) {
        return;
      }

      const response = await fetch(
        `/api/manuscript/live-rooms/${encodeURIComponent(roomId)}/updates?after=${clockRef.current}`,
        { cache: "no-store" },
      );
      const body = await readJsonResponse<{ ok: true; updates: LiveRoomUpdate[] }>(
        response,
      );

      if (isErrorResponse(body)) {
        updateError(body.message);
        return;
      }

      if (!body.updates.length) {
        return;
      }

      body.updates.forEach((roomUpdate) => {
        const update = decodeLiveRoomUpdateBase64(roomUpdate.updateBase64);

        if (update) {
          Y.applyUpdate(doc, update, "remote");
          clockRef.current = Math.max(clockRef.current, roomUpdate.clock);
        }
      });

      setActiveRoom((room) =>
        room
          ? {
              ...room,
              clock: Math.max(
                room.clock,
                ...body.updates.map((roomUpdate) => roomUpdate.clock),
              ),
            }
          : room,
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [activeRoom?.id, updateError]);

  useEffect(() => {
    if (!activeRoom?.id) {
      return;
    }

    const sendPresence = async () => {
      const roomId = activeRoomIdRef.current;

      if (!roomId) {
        return;
      }

      const response = await fetch(
        `/api/manuscript/live-rooms/${encodeURIComponent(roomId)}/presence`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            displayName: actor.primaryEmail,
            mode: createLivePresenceMode({
              editorMode,
              isEditorFocused,
              selectedNotebookBlockIndex,
            }),
          }),
        },
      );
      const body = await readJsonResponse<{ ok: true; presence: LivePresence[] }>(
        response,
      );

      if (!isErrorResponse(body)) {
        setPresence(body.presence);
      }
    };

    void sendPresence();
    const interval = setInterval(sendPresence, 8000);

    return () => clearInterval(interval);
  }, [
    activeRoom?.id,
    actor.primaryEmail,
    clientId,
    editorMode,
    isEditorFocused,
    selectedNotebookBlockIndex,
  ]);

  useEffect(() => disposeCurrentRoom, [disposeCurrentRoom]);

  useEffect(() => {
    if (selectedNotebookBlockIndex <= notebookBlocks.length - 1) {
      return;
    }

    setSelectedNotebookBlockIndex(Math.max(0, notebookBlocks.length - 1));
  }, [notebookBlocks.length, selectedNotebookBlockIndex]);

  useEffect(() => {
    if (editorMode === "notebook" || !isNotebookFocusMode) {
      return;
    }

    setIsNotebookFocusMode(false);
  }, [editorMode, isNotebookFocusMode]);

  return (
    <main className="min-h-screen bg-studio-bg px-4 py-5 text-studio-ink sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-5">
        <header className={cn(cardClassName, "p-4 sm:p-5")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <StudioGlyph />
              <div>
                <p className={labelClassName}>Manuscript Live Room</p>
                <h1 className="m-0 text-[1.75rem] font-black leading-tight text-studio-ink sm:text-[2.35rem]">
                  Shared editing for tonight
                </h1>
                <p className="mt-2 max-w-[760px] text-[0.92rem] leading-6 text-studio-muted">
                  A private live writing surface backed by Studio database sync.
                </p>
              </div>
            </div>
            <div className="grid gap-3">
              <StudioNav />
              <div className="flex flex-wrap gap-2">
                <StudioChip tone="tag">Studio access</StudioChip>
                <StudioChip className="normal-case" tone="source">
                  {actor.primaryEmail}
                </StudioChip>
                <StudioChip tone={activeRoom ? "tag" : "review"}>
                  {activeRoom ? "Room active" : "No room selected"}
                </StudioChip>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
          <aside className="grid content-start gap-5">
            <section className={panelClassName}>
              <p className={labelClassName}>Start</p>
              <h2 className={panelTitleClassName}>Create a room</h2>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1.5">
                  <span className={labelClassName}>Title</span>
                  <input
                    className={fieldClassName}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    value={draftTitle}
                  />
                </label>
                <div className="grid gap-2 border-y border-studio-line py-3">
                  <label className="grid gap-1.5">
                    <span className={labelClassName}>Start from library</span>
                    <select
                      className={fieldClassName}
                      disabled={isLoadingManuscripts || !manuscripts.length}
                      onChange={(event) => setSelectedManuscriptId(event.target.value)}
                      value={selectedManuscriptId}
                    >
                      {!manuscripts.length ? (
                        <option value="">No manuscripts available</option>
                      ) : null}
                      {manuscripts.map((manuscript) => (
                        <option key={manuscript.id} value={manuscript.id}>
                          {manuscript.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="m-0 text-[0.78rem] leading-5 text-studio-muted">
                      {selectedManuscript?.latestSnapshot
                        ? `${selectedManuscript.latestSnapshot.wordCount.toLocaleString()} words / ${selectedManuscript.latestSnapshot.blockCount.toLocaleString()} blocks / ${formatTime(selectedManuscript.latestSnapshot.updatedAt)}`
                        : isLoadingManuscripts
                          ? "Loading manuscript library."
                          : "No saved snapshot for this manuscript yet."}
                    </p>
                    <button
                      className={buttonClassName}
                      disabled={
                        !selectedManuscriptId ||
                        !selectedManuscript?.latestSnapshot ||
                        isLoadingSnapshot
                      }
                      onClick={() => void loadLatestSnapshotIntoStart()}
                      type="button"
                    >
                      {isLoadingSnapshot ? "Loading..." : "Load latest snapshot"}
                    </button>
                  </div>
                </div>
                <label className="grid gap-1.5">
                  <span className={labelClassName}>Starting text</span>
                  <div className="flex flex-wrap gap-2">
                    {notebookStarterOptions.map((option) => (
                      <button
                        className={buttonClassName}
                        key={option.kind}
                        onClick={() => {
                          setInitialText(createLiveRoomNotebookStarterText(option.kind));
                          updateMessage(`${option.label} starter loaded.`);
                        }}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className={cn(textareaClassName, "min-h-[150px] text-[0.9rem]")}
                    onChange={(event) => setInitialText(event.target.value)}
                    placeholder="Paste the current manuscript section here, or start blank."
                    value={initialText}
                  />
                </label>
                <button
                  className={primaryButtonClassName}
                  disabled={isCreating}
                  onClick={() => void createRoom()}
                  type="button"
                >
                  {isCreating ? "Creating..." : "Create live room"}
                </button>
              </div>
            </section>

            <section className={panelClassName}>
              <p className={labelClassName}>Rooms</p>
              <h2 className={panelTitleClassName}>Recent rooms</h2>
              <div className="mt-4 grid gap-2">
                {rooms.length ? (
                  rooms.map((room) => (
                    <button
                      className={cn(
                        "grid gap-1 rounded-lg border p-3 text-left transition",
                        activeRoom?.id === room.id
                          ? "border-studio-tag/55 bg-studio-tag/10"
                          : "border-studio-line bg-studio-ink/5 hover:border-studio-source/45",
                      )}
                      key={room.id}
                      onClick={() => {
                        router.replace(
                          `/manuscript/live?room=${encodeURIComponent(room.id)}`,
                        );
                        void loadRoom(room.id);
                      }}
                      type="button"
                    >
                      <span className="font-extrabold text-studio-ink">
                        {room.title}
                      </span>
                      <span className="text-[0.78rem] text-studio-muted">
                        {room.wordCount} words · rev {room.clock} ·{" "}
                        {formatTime(room.updatedAt)}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className={panelCopyClassName}>No live rooms yet.</p>
                )}
              </div>
            </section>
          </aside>

          <section className={panelClassName}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={labelClassName}>Live surface</p>
                <h2 className={panelTitleClassName}>
                  {activeRoom?.title ?? "Open or create a room"}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <StudioChip tone="source">{stats.words} words</StudioChip>
                <StudioChip tone="node">{stats.characters} chars</StudioChip>
                <StudioChip tone="review">rev {activeRoom?.clock ?? 0}</StudioChip>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex rounded-lg border border-studio-line bg-studio-ink/5 p-1">
                  {(
                    [
                      ["notebook", "Notebook"],
                      ["raw", "Raw text"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      className={cn(
                        "min-h-8 rounded-md px-3 text-[0.75rem] font-extrabold transition",
                        editorMode === mode
                          ? "bg-studio-tag/20 text-studio-tag"
                          : "text-studio-muted hover:text-studio-source",
                      )}
                      key={mode}
                      onClick={() => setEditorMode(mode)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={buttonClassName}
                    data-testid="live-room-notebook-focus-toggle"
                    disabled={!activeRoom || editorMode !== "notebook"}
                    onClick={toggleNotebookFocusMode}
                    type="button"
                  >
                    {isNotebookFocusMode ? "Show all sections" : "Focus section"}
                  </button>
                  <button
                    className={buttonClassName}
                    data-testid="live-room-notebook-add-section"
                    disabled={!activeRoom || editorMode !== "notebook"}
                    onClick={addNotebookBlock}
                    type="button"
                  >
                    Add section
                  </button>
                </div>
              </div>
              {editorMode === "notebook" ? (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-studio-line bg-black/10 p-2"
                  data-testid="live-room-notebook-quick-sections"
                >
                  <span className={labelClassName}>Quick section</span>
                  {quickSectionOptions.map((option) => (
                    <button
                      className={buttonClassName}
                      disabled={!activeRoom}
                      key={option.kind}
                      onClick={() => insertQuickNotebookSection(option.kind)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {editorMode === "notebook" ? (
                <div
                  className="grid min-h-[58vh] gap-3 lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]"
                  data-testid={
                    isNotebookFocusMode
                      ? "live-room-notebook-focus-mode"
                      : "live-room-notebook-editor"
                  }
                >
                  <div className="grid content-start gap-2 rounded-xl border border-studio-line bg-black/10 p-3">
                    <p className={labelClassName}>Notebook outline</p>
                    {notebookBlocks.map((block) => (
                      <button
                        className={cn(
                          "grid gap-1 rounded-lg border p-2.5 text-left transition",
                          selectedNotebookBlockIndex === block.index
                            ? "border-studio-tag/55 bg-studio-tag/10"
                            : "border-studio-line bg-studio-ink/5 hover:border-studio-source/45",
                        )}
                        key={block.id}
                        onClick={() => focusNotebookBlock(block.index)}
                        type="button"
                      >
                        <span className="text-[0.76rem] font-extrabold text-studio-ink">
                          {block.label}
                        </span>
                        <span className="text-[0.68rem] font-bold text-studio-muted">
                          {block.wordCount} words
                        </span>
                        <span className="text-[0.68rem] font-extrabold text-studio-source">
                          {formatNotebookSectionKind(block.kind)}
                        </span>
                        {notebookPresenceByBlock.get(block.index)?.length ? (
                          <span className="text-[0.68rem] font-extrabold text-studio-tag">
                            {notebookPresenceByBlock.get(block.index)?.length} active
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <div className="grid content-start gap-3">
                    {visibleNotebookBlocks.map((block) => (
                      <section
                        className={cn(
                          "grid gap-2 rounded-xl border bg-[#0f1512] p-3 transition",
                          selectedNotebookBlockIndex === block.index
                            ? "border-studio-tag/55"
                            : "border-studio-line-strong",
                        )}
                        key={block.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className={labelClassName}>
                            Section {block.index + 1}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <StudioChip tone={getNotebookSectionKindTone(block.kind)}>
                              {formatNotebookSectionKind(block.kind)}
                            </StudioChip>
                            <StudioChip tone="source">
                              {block.wordCount} words
                            </StudioChip>
                            <StudioChip tone="node">
                              {block.characterCount} chars
                            </StudioChip>
                            {(notebookPresenceByBlock.get(block.index) ?? []).map(
                              (entry) => (
                                <StudioChip
                                  className="normal-case"
                                  key={`${block.id}-${entry.actorEmail}-${
                                    entry.clientId ?? "client"
                                  }`}
                                  tone={
                                    entry.clientId === clientId ? "tag" : "source"
                                  }
                                >
                                  {formatLivePresenceName(
                                    entry,
                                    clientId,
                                    actor.primaryEmail,
                                  )}{" "}
                                  here
                                </StudioChip>
                              ),
                            )}
                          </div>
                        </div>
                        <div
                          className="flex flex-wrap items-center gap-1.5"
                          data-testid="live-room-notebook-section-kind-controls"
                        >
                          {notebookSectionKindOptions.map((option) => (
                            <button
                              aria-pressed={block.kind === option.kind}
                              className={cn(
                                "rounded-lg border px-2.5 py-1.5 text-[0.72rem] font-extrabold transition",
                                block.kind === option.kind
                                  ? "border-studio-tag/60 bg-studio-tag/15 text-studio-ink"
                                  : "border-studio-line bg-black/10 text-studio-muted hover:border-studio-source/50 hover:text-studio-ink",
                              )}
                              disabled={!activeRoom || isLoadingRoom}
                              key={option.kind}
                              onClick={() =>
                                setNotebookBlockKind(block.index, option.kind)
                              }
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className={buttonClassName}
                            disabled={!activeRoom || isLoadingRoom}
                            onClick={() => focusNotebookSection(block.index)}
                            type="button"
                          >
                            Focus
                          </button>
                          <button
                            className={buttonClassName}
                            disabled={!activeRoom || isLoadingRoom}
                            onClick={() => addNotebookBlockAfter(block.index)}
                            type="button"
                          >
                            Add below
                          </button>
                          <button
                            className={buttonClassName}
                            disabled={!activeRoom || isLoadingRoom || block.index === 0}
                            onClick={() => moveNotebookBlock(block.index, -1)}
                            type="button"
                          >
                            Move up
                          </button>
                          <button
                            className={buttonClassName}
                            disabled={
                              !activeRoom ||
                              isLoadingRoom ||
                              block.index >= notebookBlocks.length - 1
                            }
                            onClick={() => moveNotebookBlock(block.index, 1)}
                            type="button"
                          >
                            Move down
                          </button>
                          <button
                            className={buttonClassName}
                            disabled={
                              !activeRoom || isLoadingRoom || notebookBlocks.length <= 1
                            }
                            onClick={() => removeNotebookBlock(block.index)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                        <textarea
                          className={cn(
                            textareaClassName,
                            "border-studio-line bg-black/10 font-serif text-[1.02rem]",
                            isNotebookFocusMode ? "min-h-[58vh]" : "min-h-[190px]",
                          )}
                          disabled={!activeRoom || isLoadingRoom}
                          id={`live-notebook-block-${block.index}`}
                          onBlur={() => setIsEditorFocused(false)}
                          onChange={(event) =>
                            updateNotebookBlock(block.index, event.target.value)
                          }
                          onFocus={() => {
                            setIsEditorFocused(true);
                            setSelectedNotebookBlockIndex(block.index);
                          }}
                          value={block.text}
                        />
                      </section>
                    ))}
                  </div>
                </div>
              ) : (
                <textarea
                  className={cn(
                    textareaClassName,
                    "min-h-[58vh] font-serif text-[1.05rem]",
                  )}
                  disabled={!activeRoom || isLoadingRoom}
                  onBlur={() => setIsEditorFocused(false)}
                  onChange={(event) => updateText(event.target.value)}
                  onFocus={() => setIsEditorFocused(true)}
                  placeholder="Create or open a live room to begin."
                  ref={textareaRef}
                  value={text}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    className={buttonClassName}
                    disabled={!shareUrl}
                    onClick={() => void copyShareUrl()}
                    type="button"
                  >
                    Copy room link
                  </button>
                  <button
                    className={buttonClassName}
                    disabled={!activeRoom}
                    onClick={() => void copyText()}
                    type="button"
                  >
                    Copy text
                  </button>
                  <button
                    className={buttonClassName}
                    data-testid="live-room-copy-session-recap"
                    disabled={!activeRoom}
                    onClick={() => void copySessionRecap()}
                    type="button"
                  >
                    Copy recap
                  </button>
                  <button
                    className={buttonClassName}
                    data-testid="live-room-copy-session-packet"
                    disabled={!activeRoom}
                    onClick={() => void copySessionPacket()}
                    type="button"
                  >
                    Copy session packet
                  </button>
                  <button
                    className={buttonClassName}
                    disabled={!activeRoom || isSavingSnapshot}
                    onClick={() => void saveSnapshot()}
                    type="button"
                  >
                    {isSavingSnapshot ? "Saving..." : "Save manual snapshot"}
                  </button>
                  <Link className={buttonClassName} href="/manuscript">
                    Manuscript Desk
                  </Link>
                </div>
                <div className="text-[0.78rem] font-bold text-studio-muted">
                  {error || message}
                </div>
              </div>
              {shareUrl ? (
                <div className="rounded-lg border border-studio-line bg-black/10 p-3 font-mono text-[0.75rem] leading-5 text-studio-muted">
                  {shareUrl}
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-studio-line bg-studio-ink/5 p-4">
                <p className={labelClassName}>Presence</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {presence.length ? (
                    presence.map((entry) => (
                      <StudioChip
                        className="normal-case"
                        key={`${entry.actorEmail}-${entry.clientId ?? "client"}`}
                        tone={
                          entry.clientId === clientId || entry.actorEmail === actor.primaryEmail
                            ? "tag"
                            : "source"
                        }
                      >
                        {formatLivePresenceName(
                          entry,
                          clientId,
                          actor.primaryEmail,
                        )}{" "}
                        ·{" "}
                        {formatLivePresenceMode(entry.mode)}
                      </StudioChip>
                    ))
                  ) : (
                    <span className="text-[0.82rem] text-studio-muted">
                      No active presence yet.
                    </span>
                  )}
                </div>
              </div>
              <div
                className="rounded-xl border border-studio-line bg-studio-ink/5 p-4"
                data-testid="live-room-session-recap"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={labelClassName}>Session recap</p>
                  <div className="flex flex-wrap gap-1.5">
                    <StudioChip tone="tag">
                      {sessionRecap.decisions.length} decisions
                    </StudioChip>
                    <StudioChip tone="review">
                      {sessionRecap.actionItems.length} actions
                    </StudioChip>
                    <StudioChip tone="node">
                      {sessionRecap.questions.length} questions
                    </StudioChip>
                    <StudioChip tone="source">
                      {sessionRecap.sourceNotes.length} sources
                    </StudioChip>
                  </div>
                </div>
                <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-lg border border-studio-line bg-black/15 p-3 text-[0.78rem] leading-5 text-studio-muted">
                  {sessionRecap.summaryText}
                </pre>
              </div>
              <div className="rounded-xl border border-studio-line bg-studio-ink/5 p-4">
                <p className={labelClassName}>Checkpoint</p>
                <p className="mt-2 text-[0.84rem] leading-6 text-studio-muted">
                  Manual snapshots convert this room text into Manuscript Desk
                  paragraph blocks. The live room remains the shared scratch
                  surface until you checkpoint it.
                </p>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
