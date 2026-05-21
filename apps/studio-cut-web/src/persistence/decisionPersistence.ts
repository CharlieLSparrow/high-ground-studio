import {
  isDecisionEvent,
  mergeDecisionEvents,
  sortDecisionEvents,
  type DecisionEvent,
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
  path: string;
  loadEvents: () => Promise<DecisionEvent[]>;
  upsertEvent: (event: DecisionEvent) => Promise<void>;
  upsertEvents: (events: readonly DecisionEvent[]) => Promise<void>;
};

export function buildFirestoreDecisionEventsPath(
  projectId: string,
  branchId: string,
) {
  return `studioCutProjects/${projectId}/branches/${branchId}/decisionEvents`;
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
  const path = buildFirestoreDecisionEventsPath(projectId, branchId);
  const collectionRef = firestore.collection(
    db,
    "studioCutProjects",
    projectId,
    "branches",
    branchId,
    "decisionEvents",
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

  async function upsertEvent(event: DecisionEvent) {
    const docRef = firestore.doc(collectionRef, event.id);
    await firestore.setDoc(docRef, serializeDecisionEvent(event), {
      merge: true,
    });
  }

  async function upsertEvents(events: readonly DecisionEvent[]) {
    await Promise.all(mergeDecisionEvents(events).map(upsertEvent));
  }

  return { path, loadEvents, upsertEvent, upsertEvents };
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
    ...(event.note ? { note: event.note } : {}),
  };
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
