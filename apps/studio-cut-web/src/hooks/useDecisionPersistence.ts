import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getActiveDecisionEvents,
  mergeDecisionEvents,
  parseDecisionEventsPayload,
  sortDecisionEvents,
  type DecisionEvent,
  type ProgramState,
} from "@high-ground/studio-cut-schema";
import {
  createCloudConnectedStatus,
  createCloudErrorStatus,
  createCloudReadyStatus,
  createFirestoreDecisionStore,
  createLocalOnlyStatus,
  type CollaboratorPresence,
  loadLocalDecisionEvents,
  saveLocalDecisionEvents,
  type FirestoreDecisionStore,
  type PersistenceStatus,
} from "../persistence/decisionPersistence";
import { getStudioCutRuntimeConfig } from "../studioCutConfig";

export type DecisionImportResult = {
  importedCount: number;
  rejectedCount: number;
  normalizedCount: number;
};

export type StudioCutRoomSelection = {
  projectId: string;
  branchId: string;
};

export type PresenceUpdateInput = {
  currentSourceTimeMs: number;
  currentState?: ProgramState;
};

export function useDecisionPersistence(
  createdByOverride: string | undefined,
  roomSelection: StudioCutRoomSelection,
  sessionId: string,
) {
  const config = useMemo(getStudioCutRuntimeConfig, []);
  const projectId = roomSelection.projectId || config.projectId;
  const branchId = roomSelection.branchId || config.branchId;
  const createdBy = createdByOverride || config.createdBy;
  const [allDecisionEvents, setAllDecisionEvents] = useState<DecisionEvent[]>(
    loadLocalDecisionEvents,
  );
  const decisionEvents = useMemo(
    () => getActiveDecisionEvents(allDecisionEvents),
    [allDecisionEvents],
  );
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [status, setStatus] = useState<PersistenceStatus>(() =>
    config.firebaseConfig
      ? createCloudReadyStatus(projectId, branchId)
      : createLocalOnlyStatus(projectId, branchId),
  );
  const storeRef = useRef<FirestoreDecisionStore | undefined>(undefined);

  useEffect(() => {
    saveLocalDecisionEvents(allDecisionEvents);
  }, [allDecisionEvents]);

  useEffect(() => {
    storeRef.current = undefined;
    setCollaborators([]);

    if (!config.firebaseConfig) {
      setStatus(createLocalOnlyStatus(projectId, branchId));
      return;
    }

    let isActive = true;
    let unsubscribeEvents: (() => void) | undefined;
    let unsubscribePresence: (() => void) | undefined;

    setStatus(createCloudReadyStatus(projectId, branchId));
    setAllDecisionEvents([]);

    void createFirestoreDecisionStore({
      firebaseConfig: config.firebaseConfig,
      projectId,
      branchId,
    })
      .then((store) => {
        if (!isActive) {
          return;
        }

        storeRef.current = store;
        setStatus(
          createCloudConnectedStatus(
            projectId,
            branchId,
            "Firestore realtime listener connected; localStorage remains the offline fallback.",
          ),
        );
        unsubscribeEvents = store.subscribeToEvents(
          (remoteEvents) => {
            setAllDecisionEvents((currentEvents) =>
              mergeDecisionEvents([...currentEvents, ...remoteEvents]),
            );
            setStatus(
              createCloudConnectedStatus(
                projectId,
                branchId,
                `Received ${remoteEvents.length} shared decision event${
                  remoteEvents.length === 1 ? "" : "s"
                } from Firestore.`,
              ),
            );
          },
          (error) => {
            setStatus(createCloudErrorStatus(projectId, branchId, error));
          },
        );
        unsubscribePresence = store.subscribeToPresence(
          setCollaborators,
          (error) => {
            setStatus(createCloudErrorStatus(projectId, branchId, error));
          },
        );
      })
      .catch((error: unknown) => {
        setStatus(createCloudErrorStatus(projectId, branchId, error));
      });

    return () => {
      isActive = false;
      unsubscribeEvents?.();
      unsubscribePresence?.();
      storeRef.current = undefined;
    };
  }, [branchId, config.firebaseConfig, projectId]);

  function createDecision(state: ProgramState, sourceTimeMs: number, note: string) {
    const trimmedNote = note.trim();
    const event: DecisionEvent = {
      id: createDecisionId(),
      projectId,
      branchId,
      sourceTimeMs,
      state,
      createdBy,
      createdAt: new Date().toISOString(),
      clientId: sessionId,
      operation: "upsert",
      ...(trimmedNote ? { note: trimmedNote } : {}),
    };

    setAllDecisionEvents((events) => mergeDecisionEvents([...events, event]));
    void upsertCloudEvent(event);

    return event;
  }

  function removeDecision(eventId: string) {
    const removal = createDecisionRemoval(createdBy, sessionId);

    setAllDecisionEvents((events) => {
      const eventToRemove = events.find((event) => event.id === eventId);

      if (!eventToRemove) {
        return events;
      }

      if (!storeRef.current) {
        return events.filter((event) => event.id !== eventId);
      }

      return mergeDecisionEvents([
        ...events,
        {
          ...eventToRemove,
          removedAt: removal.removedAt,
          removedBy: removal.removedBy,
          clientId: eventToRemove.clientId ?? removal.clientId,
          operation: "remove",
        },
      ]);
    });

    const eventToRemove = allDecisionEvents.find((event) => event.id === eventId);

    if (eventToRemove && storeRef.current) {
      void tombstoneCloudEvent(eventToRemove, removal);
    }
  }

  function clearDecisions() {
    const removal = createDecisionRemoval(createdBy, sessionId);

    if (!storeRef.current) {
      setAllDecisionEvents([]);
      return;
    }

    const activeEvents = getActiveDecisionEvents(allDecisionEvents);
    const tombstonedEvents = activeEvents.map((event) => ({
      ...event,
      removedAt: removal.removedAt,
      removedBy: removal.removedBy,
      clientId: event.clientId ?? removal.clientId,
      operation: "remove" as const,
    }));

    setAllDecisionEvents((events) =>
      mergeDecisionEvents([...events, ...tombstonedEvents]),
    );
    void tombstoneCloudEvents(activeEvents, removal);
  }

  function replaceDecisionEvents(events: readonly DecisionEvent[]) {
    setAllDecisionEvents(sortDecisionEvents(events));
  }

  function importDecisionEvents(payload: unknown): DecisionImportResult {
    const result = parseDecisionEventsPayload(payload);
    const normalizedEvents = result.events.map((event) =>
      normalizeDecisionEvent(event, { projectId, branchId, clientId: sessionId }),
    );
    const normalizedCount = normalizedEvents.filter(
      (event, index) =>
        event.projectId !== result.events[index]?.projectId ||
        event.branchId !== result.events[index]?.branchId,
    ).length;

    setAllDecisionEvents((events) =>
      mergeDecisionEvents([...events, ...normalizedEvents]),
    );
    void upsertCloudEvents(normalizedEvents);

    return {
      importedCount: normalizedEvents.length,
      rejectedCount: result.rejectedCount,
      normalizedCount,
    };
  }

  function exportDecisionEvents() {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      projectId,
      branchId,
      decisionEvents: sortDecisionEvents(decisionEvents),
    };
  }

  const updatePresence = useCallback(
    (presence: PresenceUpdateInput) => {
      if (!storeRef.current) {
        return;
      }

      void storeRef.current
        .updatePresence({
          sessionId,
          userEmail: createdBy,
          currentSourceTimeMs: presence.currentSourceTimeMs,
          updatedAt: new Date().toISOString(),
          ...(presence.currentState ? { currentState: presence.currentState } : {}),
          appVersion: "studio-cut-web",
        })
        .catch((error: unknown) => {
          setStatus(createCloudErrorStatus(projectId, branchId, error));
        });
    },
    [branchId, createdBy, projectId, sessionId],
  );

  async function upsertCloudEvent(event: DecisionEvent) {
    if (!storeRef.current) {
      return;
    }

    try {
      await storeRef.current.upsertEvent(event);
      setStatus(
        createCloudConnectedStatus(
          projectId,
          branchId,
          `Synced event ${event.id.slice(0, 8)} to Firestore.`,
        ),
      );
    } catch (error) {
      setStatus(createCloudErrorStatus(projectId, branchId, error));
    }
  }

  async function upsertCloudEvents(events: readonly DecisionEvent[]) {
    if (!storeRef.current || events.length === 0) {
      return;
    }

    try {
      await storeRef.current.upsertEvents(events);
      setStatus(
        createCloudConnectedStatus(
          projectId,
          branchId,
          `Synced ${events.length} imported event${
            events.length === 1 ? "" : "s"
          } to Firestore.`,
        ),
      );
    } catch (error) {
      setStatus(createCloudErrorStatus(projectId, branchId, error));
    }
  }

  async function tombstoneCloudEvent(
    event: DecisionEvent,
    removal: { removedAt: string; removedBy: string; clientId: string },
  ) {
    if (!storeRef.current) {
      return;
    }

    try {
      await storeRef.current.tombstoneEvent(event, removal);
      setStatus(
        createCloudConnectedStatus(
          projectId,
          branchId,
          `Marked event ${event.id.slice(0, 8)} removed in Firestore.`,
        ),
      );
    } catch (error) {
      setStatus(createCloudErrorStatus(projectId, branchId, error));
    }
  }

  async function tombstoneCloudEvents(
    events: readonly DecisionEvent[],
    removal: { removedAt: string; removedBy: string; clientId: string },
  ) {
    if (!storeRef.current || events.length === 0) {
      return;
    }

    try {
      await storeRef.current.tombstoneEvents(events, removal);
      setStatus(
        createCloudConnectedStatus(
          projectId,
          branchId,
          `Marked ${events.length} event${
            events.length === 1 ? "" : "s"
          } removed in Firestore.`,
        ),
      );
    } catch (error) {
      setStatus(createCloudErrorStatus(projectId, branchId, error));
    }
  }

  return {
    config,
    roomSelection: { projectId, branchId },
    allDecisionEvents,
    decisionEvents,
    collaborators,
    status,
    createDecision,
    removeDecision,
    clearDecisions,
    replaceDecisionEvents,
    importDecisionEvents,
    exportDecisionEvents,
    updatePresence,
  };
}

function normalizeDecisionEvent(
  event: DecisionEvent,
  room: StudioCutRoomSelection & { clientId: string },
): DecisionEvent {
  return {
    ...event,
    projectId: room.projectId,
    branchId: room.branchId,
    clientId: event.clientId ?? room.clientId,
    operation: event.operation ?? "import",
  };
}

function createDecisionRemoval(removedBy: string, clientId: string) {
  return {
    removedAt: new Date().toISOString(),
    removedBy,
    clientId,
  };
}

function createDecisionId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `decision-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
