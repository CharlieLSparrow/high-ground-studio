import { useEffect, useMemo, useRef, useState } from "react";
import {
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
  loadLocalDecisionEvents,
  saveLocalDecisionEvents,
  type FirestoreDecisionStore,
  type PersistenceStatus,
} from "../persistence/decisionPersistence";
import {
  getStudioCutRuntimeConfig,
  type StudioCutRuntimeConfig,
} from "../studioCutConfig";

export type DecisionImportResult = {
  importedCount: number;
  rejectedCount: number;
  normalizedCount: number;
};

export function useDecisionPersistence() {
  const config = useMemo(getStudioCutRuntimeConfig, []);
  const [decisionEvents, setDecisionEvents] = useState<DecisionEvent[]>(
    loadLocalDecisionEvents,
  );
  const [status, setStatus] = useState<PersistenceStatus>(() =>
    config.firebaseConfig
      ? createCloudReadyStatus(config.projectId, config.branchId)
      : createLocalOnlyStatus(config.projectId, config.branchId),
  );
  const storeRef = useRef<FirestoreDecisionStore | undefined>(undefined);
  const initializedRef = useRef(false);

  useEffect(() => {
    saveLocalDecisionEvents(decisionEvents);
  }, [decisionEvents]);

  useEffect(() => {
    if (initializedRef.current || !config.firebaseConfig) {
      return;
    }

    initializedRef.current = true;
    setStatus(createCloudReadyStatus(config.projectId, config.branchId));

    void createFirestoreDecisionStore({
      firebaseConfig: config.firebaseConfig,
      projectId: config.projectId,
      branchId: config.branchId,
    })
      .then(async (store) => {
        storeRef.current = store;
        const cloudEvents = await store.loadEvents();

        setDecisionEvents((currentEvents) => {
          const mergedEvents = mergeDecisionEvents([
            ...cloudEvents,
            ...currentEvents,
          ]);

          void store
            .upsertEvents(mergedEvents)
            .then(() => {
              setStatus(
                createCloudConnectedStatus(
                  config.projectId,
                  config.branchId,
                  `Synced ${mergedEvents.length} decision event${
                    mergedEvents.length === 1 ? "" : "s"
                  } to Firestore.`,
                ),
              );
            })
            .catch((error: unknown) => {
              setStatus(
                createCloudErrorStatus(config.projectId, config.branchId, error),
              );
            });

          return mergedEvents;
        });
      })
      .catch((error: unknown) => {
        setStatus(createCloudErrorStatus(config.projectId, config.branchId, error));
      });
  }, [config]);

  function createDecision(state: ProgramState, sourceTimeMs: number, note: string) {
    const trimmedNote = note.trim();
    const event: DecisionEvent = {
      id: createDecisionId(),
      projectId: config.projectId,
      branchId: config.branchId,
      sourceTimeMs,
      state,
      createdBy: config.createdBy,
      createdAt: new Date().toISOString(),
      ...(trimmedNote ? { note: trimmedNote } : {}),
    };

    setDecisionEvents((events) => mergeDecisionEvents([...events, event]));
    void upsertCloudEvent(event);

    return event;
  }

  function removeDecision(eventId: string) {
    setDecisionEvents((events) => events.filter((event) => event.id !== eventId));
  }

  function clearDecisions() {
    setDecisionEvents([]);
  }

  function importDecisionEvents(payload: unknown): DecisionImportResult {
    const result = parseDecisionEventsPayload(payload);
    const normalizedEvents = result.events.map((event) =>
      normalizeDecisionEvent(event, config),
    );
    const normalizedCount = normalizedEvents.filter(
      (event, index) =>
        event.projectId !== result.events[index]?.projectId ||
        event.branchId !== result.events[index]?.branchId,
    ).length;

    setDecisionEvents((events) => mergeDecisionEvents([...events, ...normalizedEvents]));
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
      projectId: config.projectId,
      branchId: config.branchId,
      decisionEvents: sortDecisionEvents(decisionEvents),
    };
  }

  async function upsertCloudEvent(event: DecisionEvent) {
    if (!storeRef.current) {
      return;
    }

    try {
      await storeRef.current.upsertEvent(event);
      setStatus(
        createCloudConnectedStatus(
          config.projectId,
          config.branchId,
          `Synced event ${event.id.slice(0, 8)} to Firestore.`,
        ),
      );
    } catch (error) {
      setStatus(createCloudErrorStatus(config.projectId, config.branchId, error));
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
          config.projectId,
          config.branchId,
          `Synced ${events.length} imported event${
            events.length === 1 ? "" : "s"
          } to Firestore.`,
        ),
      );
    } catch (error) {
      setStatus(createCloudErrorStatus(config.projectId, config.branchId, error));
    }
  }

  return {
    config,
    decisionEvents,
    status,
    createDecision,
    removeDecision,
    clearDecisions,
    importDecisionEvents,
    exportDecisionEvents,
  };
}

function normalizeDecisionEvent(
  event: DecisionEvent,
  config: StudioCutRuntimeConfig,
): DecisionEvent {
  return {
    ...event,
    projectId: config.projectId,
    branchId: config.branchId,
  };
}

function createDecisionId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `decision-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
