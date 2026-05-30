import type { StudioCollaborationMaterializedAnnotationStateReference } from "./studio-collaboration-annotation-state";

export const STUDIO_COLLABORATION_ROOM_IDENTITY_VERSION =
  "studio-collaboration-room-identity-v1";

export type StudioCollaborationRoomRole =
  | "owner"
  | "editor"
  | "reviewer"
  | "observer";

export type StudioCollaborationRoomParticipant = {
  actorId: "charlie" | "homer";
  displayName: string;
  role: StudioCollaborationRoomRole;
  canEditSource: boolean;
  canCreateAnnotations: boolean;
  canResolveAnnotations: boolean;
  canCreateCheckpoints: boolean;
};

export type StudioCollaborationAnnotationStreamIdentity = {
  streamId: string;
  roomId: string;
  manuscriptId: string;
  sourceKind: "annotation-event-log";
  materializedStateVersion: string | null;
  spanScope: "synthetic-spans";
  publicContent: false;
};

export type StudioCollaborationCheckpointAnnotationReference = {
  referenceVersion: "studio-checkpoint-annotation-reference-v1";
  roomId: string;
  manuscriptId: string;
  annotationStreamId: string;
  annotationStateVersion: string;
  eventCount: number;
  latestEventId: string | null;
  embedsAnnotationBodies: false;
  manualSnapshotMutation: false;
};

export type StudioCollaborationRoomIdentity = {
  contractVersion: typeof STUDIO_COLLABORATION_ROOM_IDENTITY_VERSION;
  manuscriptId: string;
  roomId: string;
  title: string;
  createdAt: string;
  participants: StudioCollaborationRoomParticipant[];
  annotationStreams: StudioCollaborationAnnotationStreamIdentity[];
  checkpointPolicy: {
    explicitCheckpointOnly: true;
    autosave: false;
    manualSnapshotsRemainRollbackAnchors: true;
    checkpointReferencesAnnotationState: true;
    checkpointEmbedsAnnotationBodies: false;
  };
  safety: {
    syntheticDataOnly: true;
    persistenceAdded: false;
    serverWrites: false;
    localStorage: false;
    dbSchema: false;
    yjsProviderServer: false;
    productionManuscriptEditing: false;
    publicPublishing: false;
  };
};

export type StudioCollaborationRoomIdentitySummary = {
  participantCount: number;
  editorCount: number;
  reviewerCount: number;
  observerCount: number;
  annotationStreamCount: number;
  canCharlieCheckpoint: boolean;
  canHomerCheckpoint: boolean;
};

export type StudioCollaborationRoomIdentityValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const knownRoles: StudioCollaborationRoomRole[] = [
  "owner",
  "editor",
  "reviewer",
  "observer",
];
const forbiddenRoomIdentityMarkers = [
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function containsForbiddenMarker(input: unknown) {
  const serialized = JSON.stringify(input);

  return forbiddenRoomIdentityMarkers.filter((marker) =>
    serialized.includes(marker),
  );
}

function createParticipant(
  actorId: StudioCollaborationRoomParticipant["actorId"],
  displayName: string,
  role: StudioCollaborationRoomRole,
): StudioCollaborationRoomParticipant {
  const canEditSource = role === "owner" || role === "editor";
  const canCreateAnnotations =
    role === "owner" || role === "editor" || role === "reviewer";
  const canResolveAnnotations = canCreateAnnotations;
  const canCreateCheckpoints = role === "owner" || role === "editor";

  return {
    actorId,
    displayName,
    role,
    canEditSource,
    canCreateAnnotations,
    canResolveAnnotations,
    canCreateCheckpoints,
  };
}

export function createSyntheticCollaborationRoomIdentity(
  input: {
    manuscriptId?: string;
    roomId?: string;
    title?: string;
  } = {},
): StudioCollaborationRoomIdentity {
  const manuscriptId =
    normalizeId(input.manuscriptId ?? "synthetic-collaboration-manuscript") ||
    "synthetic-collaboration-manuscript";
  const roomId =
    normalizeId(input.roomId ?? `${manuscriptId}-room`) || `${manuscriptId}-room`;

  return {
    contractVersion: STUDIO_COLLABORATION_ROOM_IDENTITY_VERSION,
    manuscriptId,
    roomId,
    title: input.title?.trim() || "Synthetic Collaboration Room",
    createdAt: nowIso(),
    participants: [
      createParticipant("charlie", "Charlie", "owner"),
      createParticipant("homer", "Homer", "reviewer"),
    ],
    annotationStreams: [],
    checkpointPolicy: {
      explicitCheckpointOnly: true,
      autosave: false,
      manualSnapshotsRemainRollbackAnchors: true,
      checkpointReferencesAnnotationState: true,
      checkpointEmbedsAnnotationBodies: false,
    },
    safety: {
      syntheticDataOnly: true,
      persistenceAdded: false,
      serverWrites: false,
      localStorage: false,
      dbSchema: false,
      yjsProviderServer: false,
      productionManuscriptEditing: false,
      publicPublishing: false,
    },
  };
}

export function createAnnotationStreamIdentity(
  room: StudioCollaborationRoomIdentity,
  materializedStateReference?: StudioCollaborationMaterializedAnnotationStateReference,
): StudioCollaborationAnnotationStreamIdentity {
  return {
    streamId: `${room.roomId}-annotation-stream`,
    roomId: room.roomId,
    manuscriptId: room.manuscriptId,
    sourceKind: "annotation-event-log",
    materializedStateVersion:
      materializedStateReference?.annotationStateVersion ?? null,
    spanScope: "synthetic-spans",
    publicContent: false,
  };
}

export function attachAnnotationStreamToRoom(
  room: StudioCollaborationRoomIdentity,
  stream: StudioCollaborationAnnotationStreamIdentity,
): StudioCollaborationRoomIdentity {
  if (stream.roomId !== room.roomId || stream.manuscriptId !== room.manuscriptId) {
    return {
      ...room,
      participants: room.participants.map((participant) => ({ ...participant })),
      annotationStreams: room.annotationStreams.map((existing) => ({ ...existing })),
    };
  }

  const existingStreams = room.annotationStreams.filter(
    (existing) => existing.streamId !== stream.streamId,
  );

  return {
    ...room,
    participants: room.participants.map((participant) => ({ ...participant })),
    annotationStreams: [...existingStreams, { ...stream }],
  };
}

export function canParticipantModifyAnnotations(
  room: StudioCollaborationRoomIdentity,
  actorId: StudioCollaborationRoomParticipant["actorId"],
) {
  return (
    room.participants.find((participant) => participant.actorId === actorId)
      ?.canCreateAnnotations ?? false
  );
}

export function canParticipantCreateCheckpoint(
  room: StudioCollaborationRoomIdentity,
  actorId: StudioCollaborationRoomParticipant["actorId"],
) {
  return (
    room.participants.find((participant) => participant.actorId === actorId)
      ?.canCreateCheckpoints ?? false
  );
}

export function summarizeCollaborationRoomIdentity(
  room: StudioCollaborationRoomIdentity,
): StudioCollaborationRoomIdentitySummary {
  return {
    participantCount: room.participants.length,
    editorCount: room.participants.filter((participant) =>
      ["owner", "editor"].includes(participant.role),
    ).length,
    reviewerCount: room.participants.filter(
      (participant) => participant.role === "reviewer",
    ).length,
    observerCount: room.participants.filter(
      (participant) => participant.role === "observer",
    ).length,
    annotationStreamCount: room.annotationStreams.length,
    canCharlieCheckpoint: canParticipantCreateCheckpoint(room, "charlie"),
    canHomerCheckpoint: canParticipantCreateCheckpoint(room, "homer"),
  };
}

export function createCheckpointAnnotationReference(
  room: StudioCollaborationRoomIdentity,
  stream: StudioCollaborationAnnotationStreamIdentity,
  materializedStateReference: StudioCollaborationMaterializedAnnotationStateReference,
): StudioCollaborationCheckpointAnnotationReference | null {
  if (
    stream.roomId !== room.roomId ||
    stream.manuscriptId !== room.manuscriptId ||
    stream.materializedStateVersion !==
      materializedStateReference.annotationStateVersion
  ) {
    return null;
  }

  return {
    referenceVersion: "studio-checkpoint-annotation-reference-v1",
    roomId: room.roomId,
    manuscriptId: room.manuscriptId,
    annotationStreamId: stream.streamId,
    annotationStateVersion:
      materializedStateReference.annotationStateVersion,
    eventCount: materializedStateReference.eventCount,
    latestEventId: materializedStateReference.latestEventId,
    embedsAnnotationBodies: false,
    manualSnapshotMutation: false,
  };
}

export function validateCollaborationRoomIdentity(
  room: unknown,
): StudioCollaborationRoomIdentityValidation {
  const errors: string[] = [];
  const warnings = [
    "Synthetic collaboration room identity only.",
    "No provider, persistence, server route, or production manuscript editing is added.",
  ];

  if (!isRecord(room)) {
    return {
      ok: false,
      errors: ["Collaboration room identity must be an object."],
      warnings,
    };
  }

  if (room.contractVersion !== STUDIO_COLLABORATION_ROOM_IDENTITY_VERSION) {
    errors.push(
      `Collaboration room contractVersion must be ${STUDIO_COLLABORATION_ROOM_IDENTITY_VERSION}.`,
    );
  }

  for (const key of ["manuscriptId", "roomId", "title", "createdAt"] as const) {
    if (typeof room[key] !== "string" || !room[key].trim()) {
      errors.push(`Collaboration room ${key} is required.`);
    }
  }

  if (!Array.isArray(room.participants) || !room.participants.length) {
    errors.push("Collaboration room participants are required.");
  } else {
    for (const participant of room.participants) {
      if (!isRecord(participant)) {
        errors.push("Collaboration room participant must be an object.");
        continue;
      }

      if (!["charlie", "homer"].includes(String(participant.actorId))) {
        errors.push("Collaboration room participant actorId must be charlie or homer.");
      }

      if (!knownRoles.includes(participant.role as StudioCollaborationRoomRole)) {
        errors.push("Collaboration room participant role is unknown.");
      }
    }
  }

  if (!Array.isArray(room.annotationStreams)) {
    errors.push("Collaboration room annotationStreams must be an array.");
  } else {
    for (const stream of room.annotationStreams) {
      if (!isRecord(stream)) {
        errors.push("Collaboration annotation stream must be an object.");
        continue;
      }

      if (stream.roomId !== room.roomId) {
        errors.push("Collaboration annotation stream roomId must match room.");
      }

      if (stream.manuscriptId !== room.manuscriptId) {
        errors.push(
          "Collaboration annotation stream manuscriptId must match room.",
        );
      }

      if (stream.sourceKind !== "annotation-event-log") {
        errors.push(
          "Collaboration annotation stream sourceKind must be annotation-event-log.",
        );
      }

      if (stream.publicContent !== false) {
        errors.push("Collaboration annotation stream publicContent must be false.");
      }
    }
  }

  if (!isRecord(room.checkpointPolicy)) {
    errors.push("Collaboration room checkpointPolicy is required.");
  } else {
    if (room.checkpointPolicy.explicitCheckpointOnly !== true) {
      errors.push("Collaboration room checkpointPolicy.explicitCheckpointOnly must be true.");
    }

    if (room.checkpointPolicy.manualSnapshotsRemainRollbackAnchors !== true) {
      errors.push(
        "Collaboration room checkpointPolicy.manualSnapshotsRemainRollbackAnchors must be true.",
      );
    }

    for (const key of ["autosave", "checkpointEmbedsAnnotationBodies"] as const) {
      if (room.checkpointPolicy[key] !== false) {
        errors.push(`Collaboration room checkpointPolicy.${key} must be false.`);
      }
    }
  }

  if (!isRecord(room.safety)) {
    errors.push("Collaboration room safety flags are required.");
  } else {
    if (room.safety.syntheticDataOnly !== true) {
      errors.push("Collaboration room safety.syntheticDataOnly must be true.");
    }

    for (const key of [
      "persistenceAdded",
      "serverWrites",
      "localStorage",
      "dbSchema",
      "yjsProviderServer",
      "productionManuscriptEditing",
      "publicPublishing",
    ] as const) {
      if (room.safety[key] !== false) {
        errors.push(`Collaboration room safety.${key} must be false.`);
      }
    }
  }

  const foundMarkers = containsForbiddenMarker(room);

  if (foundMarkers.length) {
    errors.push(
      `Collaboration room identity contains forbidden real-content or secret markers: ${foundMarkers.join(", ")}.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
