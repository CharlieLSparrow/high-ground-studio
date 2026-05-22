import {
  getActiveDecisionEvents,
  isDecisionEvent,
  mergeDecisionEvents,
  sortDecisionEvents,
  type DecisionEvent,
  type ProgramState,
} from "@high-ground/studio-cut-schema";
import { getStudioCutFirebaseApp } from "../firebase/studioCutFirebase";
import type { StudioCutFirebaseConfig } from "../studioCutConfig";

export const DECISION_EVENTS_STORAGE_KEY =
  "high-ground-studio.studio-cut.decisions.v1";

export type PersistenceMode =
  | "local_only"
  | "cloud_ready"
  | "cloud_connected"
  | "cloud_error";

export type PersistenceStatus = {
  mode: PersistenceMode;
  label: string;
  detail: string;
  path: string;
};

export type FirestoreDecisionStore = {
  decisionEventsPath: string;
  presencePath: string;
  loadEvents: () => Promise<DecisionEvent[]>;
  subscribeToEvents: (
    onEvents: (events: DecisionEvent[]) => void,
    onError: (error: unknown) => void,
  ) => () => void;
  upsertEvent: (event: DecisionEvent) => Promise<void>;
  upsertEvents: (events: readonly DecisionEvent[]) => Promise<void>;
  tombstoneEvent: (
    event: DecisionEvent,
    removal: DecisionEventRemoval,
  ) => Promise<void>;
  tombstoneEvents: (
    events: readonly DecisionEvent[],
    removal: DecisionEventRemoval,
  ) => Promise<void>;
  updatePresence: (presence: CollaboratorPresence) => Promise<void>;
  subscribeToPresence: (
    onPresence: (presence: CollaboratorPresence[]) => void,
    onError: (error: unknown) => void,
  ) => () => void;
};

export type DecisionEventRemoval = {
  removedAt: string;
  removedBy: string;
  clientId: string;
};

export type CollaboratorPresence = {
  sessionId: string;
  userEmail: string;
  currentSourceTimeMs: number;
  updatedAt: string;
  currentState?: ProgramState;
  appVersion?: string;
};

export function buildFirestoreDecisionEventsPath(
  projectId: string,
  branchId: string,
) {
  return `studioCutProjects/${projectId}/branches/${branchId}/decisionEvents`;
}

export function buildFirestorePresencePath(projectId: string, branchId: string) {
  return `studioCutProjects/${projectId}/branches/${branchId}/presence`;
}

export function createLocalOnlyStatus(projectId: string, branchId: string) {
  return {
    mode: "local_only",
    label: "Local only",
    detail: "Firebase env vars are absent; decisions are saved in this browser.",
    path: buildFirestoreDecisionEventsPath(projectId, branchId),
  } satisfies PersistenceStatus;
}

export function createCloudReadyStatus(projectId: string, branchId: string) {
  return {
    mode: "cloud_ready",
    label: "Cloud ready",
    detail: "Firebase config is present; connecting Firestore adapter.",
    path: buildFirestoreDecisionEventsPath(projectId, branchId),
  } satisfies PersistenceStatus;
}

export function createCloudConnectedStatus(
  projectId: string,
  branchId: string,
  detail = "Firestore adapter loaded; localStorage remains the offline fallback.",
) {
  return {
    mode: "cloud_connected",
    label: "Cloud connected",
    detail,
    path: buildFirestoreDecisionEventsPath(projectId, branchId),
  } satisfies PersistenceStatus;
}

export function createCloudErrorStatus(
  projectId: string,
  branchId: string,
  error: unknown,
) {
  return {
    mode: "cloud_error",
    label: "Cloud error",
    detail: `Firestore is configured but unavailable: ${getErrorMessage(error)}`,
    path: buildFirestoreDecisionEventsPath(projectId, branchId),
  } satisfies PersistenceStatus;
}

export function loadLocalDecisionEvents() {
  try {
    const rawValue = localStorage.getItem(DECISION_EVENTS_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return sortDecisionEvents(parsedValue.filter(isDecisionEvent));
  } catch {
    return [];
  }
}

export function saveLocalDecisionEvents(events: readonly DecisionEvent[]) {
  try {
    localStorage.setItem(
      DECISION_EVENTS_STORAGE_KEY,
      JSON.stringify(sortDecisionEvents(events)),
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

export async function createFirestoreDecisionStore({
  firebaseConfig,
  projectId,
  branchId,
}: {
  firebaseConfig: StudioCutFirebaseConfig;
  projectId: string;
  branchId: string;
}): Promise<FirestoreDecisionStore> {
  const firestore = await import("firebase/firestore");
  const app = getStudioCutFirebaseApp(firebaseConfig);
  const db = firestore.getFirestore(app);
  const decisionEventsPath = buildFirestoreDecisionEventsPath(projectId, branchId);
  const presencePath = buildFirestorePresencePath(projectId, branchId);
  const collectionRef = firestore.collection(
    db,
    "studioCutProjects",
    projectId,
    "branches",
    branchId,
    "decisionEvents",
  );
  const presenceCollectionRef = firestore.collection(
    db,
    "studioCutProjects",
    projectId,
    "branches",
    branchId,
    "presence",
  );

  async function loadEvents() {
    const snapshot = await firestore.getDocs(
      firestore.query(collectionRef, firestore.orderBy("sourceTimeMs", "asc")),
    );
    const events = snapshot.docs
      .map((documentSnapshot) => {
        const data = documentSnapshot.data();
        return {
          id: documentSnapshot.id,
          ...data,
        };
      })
      .filter(isDecisionEvent);

    return sortDecisionEvents(events);
  }

  function subscribeToEvents(
    onEvents: (events: DecisionEvent[]) => void,
    onError: (error: unknown) => void,
  ) {
    return firestore.onSnapshot(
      firestore.query(collectionRef, firestore.orderBy("sourceTimeMs", "asc")),
      (snapshot) => {
        const events = snapshot.docs
          .map((documentSnapshot) => ({
            id: documentSnapshot.id,
            ...documentSnapshot.data(),
          }))
          .filter(isDecisionEvent);

        onEvents(sortDecisionEvents(events));
      },
      onError,
    );
  }

  async function upsertEvent(event: DecisionEvent) {
    const docRef = firestore.doc(collectionRef, event.id);
    await firestore.setDoc(docRef, serializeDecisionEvent(event), {
      merge: true,
    });
  }

  async function upsertEvents(events: readonly DecisionEvent[]) {
    await Promise.all(mergeDecisionEvents(events).map(upsertEvent));
  }

  async function tombstoneEvent(
    event: DecisionEvent,
    removal: DecisionEventRemoval,
  ) {
    const docRef = firestore.doc(collectionRef, event.id);
    await firestore.setDoc(
      docRef,
      serializeDecisionEvent({
        ...event,
        removedAt: removal.removedAt,
        removedBy: removal.removedBy,
        clientId: event.clientId ?? removal.clientId,
        operation: "remove",
      }),
      { merge: true },
    );
  }

  async function tombstoneEvents(
    events: readonly DecisionEvent[],
    removal: DecisionEventRemoval,
  ) {
    await Promise.all(getActiveDecisionEvents(events).map((event) => tombstoneEvent(event, removal)));
  }

  async function updatePresence(presence: CollaboratorPresence) {
    const docRef = firestore.doc(presenceCollectionRef, presence.sessionId);
    await firestore.setDoc(docRef, serializePresence(presence), { merge: true });
  }

  function subscribeToPresence(
    onPresence: (presence: CollaboratorPresence[]) => void,
    onError: (error: unknown) => void,
  ) {
    return firestore.onSnapshot(
      presenceCollectionRef,
      (snapshot) => {
        const presence = snapshot.docs
          .map((documentSnapshot) => ({
            sessionId: documentSnapshot.id,
            ...documentSnapshot.data(),
          }))
          .filter(isCollaboratorPresence)
          .sort((left, right) =>
            left.userEmail.localeCompare(right.userEmail) ||
            left.sessionId.localeCompare(right.sessionId),
          );

        onPresence(presence);
      },
      onError,
    );
  }

  return {
    decisionEventsPath,
    presencePath,
    loadEvents,
    subscribeToEvents,
    upsertEvent,
    upsertEvents,
    tombstoneEvent,
    tombstoneEvents,
    updatePresence,
    subscribeToPresence,
  };
}

function serializeDecisionEvent(event: DecisionEvent) {
  return {
    id: event.id,
    projectId: event.projectId,
    branchId: event.branchId,
    sourceTimeMs: event.sourceTimeMs,
    state: event.state,
    createdBy: event.createdBy,
    createdAt: event.createdAt,
    ...(event.clientId ? { clientId: event.clientId } : {}),
    ...(event.operation ? { operation: event.operation } : {}),
    ...(event.note ? { note: event.note } : {}),
    ...(event.removedAt ? { removedAt: event.removedAt } : {}),
    ...(event.removedBy ? { removedBy: event.removedBy } : {}),
  };
}

function serializePresence(presence: CollaboratorPresence) {
  return {
    sessionId: presence.sessionId,
    userEmail: presence.userEmail,
    currentSourceTimeMs: presence.currentSourceTimeMs,
    updatedAt: presence.updatedAt,
    ...(presence.currentState ? { currentState: presence.currentState } : {}),
    ...(presence.appVersion ? { appVersion: presence.appVersion } : {}),
  };
}

function isCollaboratorPresence(value: unknown): value is CollaboratorPresence {
  if (!value || typeof value !== "object") {
    return false;
  }

  const presence = value as Partial<CollaboratorPresence>;

  return (
    typeof presence.sessionId === "string" &&
    presence.sessionId.trim().length > 0 &&
    typeof presence.userEmail === "string" &&
    presence.userEmail.trim().length > 0 &&
    typeof presence.currentSourceTimeMs === "number" &&
    Number.isFinite(presence.currentSourceTimeMs) &&
    presence.currentSourceTimeMs >= 0 &&
    typeof presence.updatedAt === "string" &&
    presence.updatedAt.trim().length > 0 &&
    !Number.isNaN(Date.parse(presence.updatedAt)) &&
    (presence.currentState === undefined ||
      presence.currentState === "charlie" ||
      presence.currentState === "homer" ||
      presence.currentState === "both" ||
      presence.currentState === "charlie_clip" ||
      presence.currentState === "homer_clip" ||
      presence.currentState === "both_clip" ||
      presence.currentState === "cut") &&
    (presence.appVersion === undefined || typeof presence.appVersion === "string")
  );
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
