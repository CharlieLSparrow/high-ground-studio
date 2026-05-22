export const STUDIO_COLLABORATION_PRESENCE_VERSION =
  "studio-collaboration-presence-v1";

export type StudioCollaborationPresenceActorId = "charlie" | "homer";

export type StudioCollaborationPresenceMode =
  | "reading"
  | "editing"
  | "tagging"
  | "reviewing";

export type StudioCollaborationPresenceActor = {
  actorId: StudioCollaborationPresenceActorId;
  displayName: string;
  colorLabel: "source" | "review";
  activeBlockId: string | null;
  activeSpanId: string | null;
  currentMode: StudioCollaborationPresenceMode;
  lastAction: string;
  updatedAt: string;
};

export type StudioCollaborationPresenceState = {
  schemaVersion: typeof STUDIO_COLLABORATION_PRESENCE_VERSION;
  actors: Record<
    StudioCollaborationPresenceActorId,
    StudioCollaborationPresenceActor
  >;
  safety: {
    syntheticDataOnly: true;
    documentContent: false;
    serverWrites: false;
    localStorage: false;
    durableSnapshot: false;
  };
};

export type StudioCollaborationPresenceSummary = {
  actorCount: number;
  activeBlockPresenceCount: number;
  activeSpanPresenceCount: number;
  staleActorCount: number;
  actors: Array<{
    actorId: StudioCollaborationPresenceActorId;
    displayName: string;
    currentMode: StudioCollaborationPresenceMode;
    activeBlockId: string | null;
    activeSpanId: string | null;
    lastAction: string;
    isStale: boolean;
  }>;
};

export type StudioCollaborationPresenceValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const defaultPresenceTimestamp = "2026-05-22T12:00:00.000Z";
const defaultStaleThresholdMs = 5 * 60 * 1000;
const knownActorIds: StudioCollaborationPresenceActorId[] = [
  "charlie",
  "homer",
];
const knownModes: StudioCollaborationPresenceMode[] = [
  "reading",
  "editing",
  "tagging",
  "reviewing",
];
const forbiddenPresenceMarkers = [
  "learning-to-lead.living",
  "real-manuscript-draft.docx",
  "apps/web/content",
  "apps/web/content/_inbox",
  "apps/web/content/_staging",
  "apps/web/content/publish",
  "localStorageData",
  "sessionStorageData",
  "cookie",
  "auth-storage-state",
  "access_token",
  "refresh_token",
  "id_token",
  "DATABASE_URL",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "ManuscriptBlock",
  "StoryDraft",
];

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeTimestamp(timestamp?: string) {
  return timestamp && timestamp.trim() ? timestamp : nowIso();
}

function createActor(input: {
  actorId: StudioCollaborationPresenceActorId;
  displayName: string;
  colorLabel: StudioCollaborationPresenceActor["colorLabel"];
  updatedAt: string;
}): StudioCollaborationPresenceActor {
  return {
    actorId: input.actorId,
    displayName: input.displayName,
    colorLabel: input.colorLabel,
    activeBlockId: null,
    activeSpanId: null,
    currentMode: "reading",
    lastAction: "Synthetic presence initialized.",
    updatedAt: input.updatedAt,
  };
}

function clonePresenceState(
  state: StudioCollaborationPresenceState,
): StudioCollaborationPresenceState {
  return {
    schemaVersion: state.schemaVersion,
    actors: {
      charlie: { ...state.actors.charlie },
      homer: { ...state.actors.homer },
    },
    safety: { ...state.safety },
  };
}

export function createSyntheticPresenceState(
  updatedAt = defaultPresenceTimestamp,
): StudioCollaborationPresenceState {
  return {
    schemaVersion: STUDIO_COLLABORATION_PRESENCE_VERSION,
    actors: {
      charlie: createActor({
        actorId: "charlie",
        displayName: "Charlie",
        colorLabel: "source",
        updatedAt,
      }),
      homer: createActor({
        actorId: "homer",
        displayName: "Homer",
        colorLabel: "review",
        updatedAt,
      }),
    },
    safety: {
      syntheticDataOnly: true,
      documentContent: false,
      serverWrites: false,
      localStorage: false,
      durableSnapshot: false,
    },
  };
}

export function updateSyntheticPresenceActor(
  state: StudioCollaborationPresenceState,
  actorId: StudioCollaborationPresenceActorId,
  patch: Partial<
    Omit<StudioCollaborationPresenceActor, "actorId" | "displayName" | "colorLabel">
  >,
): StudioCollaborationPresenceState {
  const next = clonePresenceState(state);
  const actor = next.actors[actorId];

  next.actors[actorId] = {
    ...actor,
    ...patch,
    actorId,
    displayName: actor.displayName,
    colorLabel: actor.colorLabel,
    updatedAt: normalizeTimestamp(patch.updatedAt),
  };

  return next;
}

export function markSyntheticPresenceForBlock(
  state: StudioCollaborationPresenceState,
  actorId: StudioCollaborationPresenceActorId,
  blockId: string,
  mode: StudioCollaborationPresenceMode,
  lastAction: string,
): StudioCollaborationPresenceState {
  return updateSyntheticPresenceActor(state, actorId, {
    activeBlockId: blockId,
    activeSpanId: null,
    currentMode: mode,
    lastAction,
  });
}

export function markSyntheticPresenceForSpan(
  state: StudioCollaborationPresenceState,
  actorId: StudioCollaborationPresenceActorId,
  spanId: string,
  mode: StudioCollaborationPresenceMode,
  lastAction: string,
): StudioCollaborationPresenceState {
  return updateSyntheticPresenceActor(state, actorId, {
    activeSpanId: spanId,
    currentMode: mode,
    lastAction,
  });
}

export function listPresenceActors(state: StudioCollaborationPresenceState) {
  return knownActorIds.map((actorId) => state.actors[actorId]);
}

export function listPresenceForBlock(
  state: StudioCollaborationPresenceState,
  blockId: string,
) {
  return listPresenceActors(state).filter(
    (actor) => actor.activeBlockId === blockId,
  );
}

export function listPresenceForSpan(
  state: StudioCollaborationPresenceState,
  spanId: string,
) {
  return listPresenceActors(state).filter(
    (actor) => actor.activeSpanId === spanId,
  );
}

export function isSyntheticPresenceStale(
  actor: StudioCollaborationPresenceActor,
  now = nowIso(),
  thresholdMs = defaultStaleThresholdMs,
) {
  const updated = Date.parse(actor.updatedAt);
  const current = Date.parse(now);

  if (!Number.isFinite(updated) || !Number.isFinite(current)) {
    return true;
  }

  return current - updated > thresholdMs;
}

export function summarizeSyntheticPresence(
  state: StudioCollaborationPresenceState,
  now = defaultPresenceTimestamp,
): StudioCollaborationPresenceSummary {
  const actors = listPresenceActors(state).map((actor) => ({
    actorId: actor.actorId,
    displayName: actor.displayName,
    currentMode: actor.currentMode,
    activeBlockId: actor.activeBlockId,
    activeSpanId: actor.activeSpanId,
    lastAction: actor.lastAction,
    isStale: isSyntheticPresenceStale(actor, now),
  }));

  return {
    actorCount: actors.length,
    activeBlockPresenceCount: actors.filter((actor) => actor.activeBlockId).length,
    activeSpanPresenceCount: actors.filter((actor) => actor.activeSpanId).length,
    staleActorCount: actors.filter((actor) => actor.isStale).length,
    actors,
  };
}

export function validateSyntheticPresenceState(
  input: unknown,
): StudioCollaborationPresenceValidation {
  const errors: string[] = [];
  const warnings = [
    "Synthetic presence is ephemeral.",
    "Presence is not manuscript content.",
    "Presence must not be checkpointed as document state.",
  ];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: ["Presence state must be an object."],
      warnings,
    };
  }

  if (input.schemaVersion !== STUDIO_COLLABORATION_PRESENCE_VERSION) {
    errors.push(
      `Presence schemaVersion must be ${STUDIO_COLLABORATION_PRESENCE_VERSION}.`,
    );
  }

  const actors = isRecord(input.actors) ? input.actors : null;

  if (!actors) {
    errors.push("Presence actors are required.");
  } else {
    for (const actorId of knownActorIds) {
      const actor = isRecord(actors[actorId]) ? actors[actorId] : null;

      if (!actor) {
        errors.push(`Presence actor ${actorId} is required.`);
        continue;
      }

      if (actor.actorId !== actorId) {
        errors.push(`Presence actor ${actorId} has mismatched actorId.`);
      }

      if (typeof actor.displayName !== "string" || !actor.displayName.trim()) {
        errors.push(`Presence actor ${actorId} displayName is required.`);
      }

      if (
        actor.currentMode !== undefined &&
        !knownModes.includes(actor.currentMode as StudioCollaborationPresenceMode)
      ) {
        errors.push(`Presence actor ${actorId} has an invalid currentMode.`);
      }

      for (const key of ["activeBlockId", "activeSpanId", "lastAction"] as const) {
        const value = actor[key];

        if (value !== null && value !== undefined && typeof value !== "string") {
          errors.push(`Presence actor ${actorId}.${key} must be a string or null.`);
        }
      }

      if (typeof actor.updatedAt !== "string" || !actor.updatedAt.trim()) {
        errors.push(`Presence actor ${actorId} updatedAt is required.`);
      }
    }
  }

  const safety = isRecord(input.safety) ? input.safety : null;

  if (!safety) {
    errors.push("Presence safety flags are required.");
  } else {
    if (safety.syntheticDataOnly !== true) {
      errors.push("Presence safety.syntheticDataOnly must be true.");
    }

    for (const key of [
      "documentContent",
      "serverWrites",
      "localStorage",
      "durableSnapshot",
    ] as const) {
      if (safety[key] !== false) {
        errors.push(`Presence safety.${key} must be false.`);
      }
    }
  }

  const serialized = JSON.stringify(input);
  const foundMarkers = forbiddenPresenceMarkers.filter((marker) =>
    serialized.includes(marker),
  );

  if (foundMarkers.length) {
    errors.push(
      `Presence contains forbidden real-content or secret markers: ${foundMarkers.join(", ")}.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
