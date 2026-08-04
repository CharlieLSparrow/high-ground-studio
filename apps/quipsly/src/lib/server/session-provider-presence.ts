import "server-only";

import { createHash } from "node:crypto";

import { RoomServiceClient, TrackType } from "livekit-server-sdk";

type CanonicalParticipant = {
  id: string;
  displayName?: string | null;
  role: string;
  accessStatus: string;
};

type ProviderGrant = {
  participantId: string;
  providerIdentity: string;
  clientKind: string;
  deviceLabel?: string | null;
  issuedAt: Date;
};

type ActiveProviderParticipant = {
  identity: string;
  joinedAt?: bigint | number | string | null;
  joinedAtMs?: bigint | number | string | null;
  tracks?: Array<{ type: number; muted: boolean }>;
};

export type SessionProviderPresenceDevice = {
  id: string;
  participantId: string | null;
  participantLabel: string;
  role: string | null;
  canonicalAccessStatus: string | null;
  clientKind: string;
  deviceLabel: string;
  joinedAt: string | null;
  audio: { published: boolean; muted: boolean | null };
  video: { published: boolean; muted: boolean | null };
  matchedToCanonicalParticipant: boolean;
};

export type SessionProviderPresence = {
  status: "LIVE" | "EMPTY" | "NOT_REQUIRED" | "UNAVAILABLE" | "FAILED";
  errorCode: string | null;
  observedAt: string;
  provider: string | null;
  connectedDeviceCount: number | null;
  connectedParticipantCount: number | null;
  unknownDeviceCount: number | null;
  attentionCount: number | null;
  devices: SessionProviderPresenceDevice[];
  nextAction: string;
  boundaries: {
    providerReadbackAttempted: boolean;
    currentObservationNotHistory: true;
    joinKeyLeaseUsedAsPresence: false;
    providerIdentitiesExposed: false;
    credentialsExposed: false;
    recordingStateChanged: false;
  };
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function liveKitServiceURL(value: string) {
  if (value.startsWith("wss://"))
    return `https://${value.slice("wss://".length)}`;
  if (value.startsWith("ws://")) return `http://${value.slice("ws://".length)}`;
  return value.replace(/\/+$/, "");
}

function opaqueDeviceId(providerRoomId: string, providerIdentity: string) {
  return `presence-${createHash("sha256")
    .update(`${providerRoomId}\0${providerIdentity}`)
    .digest("hex")
    .slice(0, 20)}`;
}

function providerJoinedAt(value: ActiveProviderParticipant) {
  const milliseconds = Number(value.joinedAtMs || 0);
  if (Number.isFinite(milliseconds) && milliseconds > 0)
    return new Date(milliseconds).toISOString();
  const seconds = Number(value.joinedAt || 0);
  if (Number.isFinite(seconds) && seconds > 0)
    return new Date(seconds * 1000).toISOString();
  return null;
}

function trackState(tracks: ActiveProviderParticipant["tracks"], type: number) {
  const matching = (tracks || []).filter((track) => track.type === type);
  return {
    published: matching.length > 0,
    muted: matching.length ? matching.every((track) => track.muted) : null,
  };
}

function participantIdFromIdentity(identity: string, participantIds: string[]) {
  return participantIds.find(
    (participantId) =>
      identity === participantId || identity.startsWith(`${participantId}:`),
  );
}

export function projectSessionProviderPresence(input: {
  providerRoomId: string;
  participants: CanonicalParticipant[];
  grants: ProviderGrant[];
  activeParticipants: ActiveProviderParticipant[];
  observedAt?: Date;
}): Omit<
  SessionProviderPresence,
  "status" | "errorCode" | "provider" | "nextAction" | "boundaries"
> {
  const participantById = new Map(
    input.participants.map((participant) => [participant.id, participant]),
  );
  const latestGrantByIdentity = new Map<string, ProviderGrant>();
  for (const grant of input.grants) {
    const current = latestGrantByIdentity.get(grant.providerIdentity);
    if (!current || current.issuedAt.getTime() < grant.issuedAt.getTime())
      latestGrantByIdentity.set(grant.providerIdentity, grant);
  }
  const participantIds = [...participantById.keys()].sort(
    (left, right) => right.length - left.length,
  );
  const devices = input.activeParticipants
    .map((active) => {
      const grant = latestGrantByIdentity.get(active.identity);
      const participantId =
        grant?.participantId ||
        participantIdFromIdentity(active.identity, participantIds) ||
        null;
      const participant = participantId
        ? participantById.get(participantId)
        : undefined;
      const matched = Boolean(participant);
      const clientKind = grant?.clientKind || "unknown";
      const defaultDeviceLabel =
        clientKind.toLowerCase() === "ios"
          ? "Quipsly Capture"
          : clientKind.toLowerCase() === "web"
            ? "Quipsly Web"
            : "Unmatched provider device";
      return {
        id: opaqueDeviceId(input.providerRoomId, active.identity),
        participantId: participant?.id || null,
        participantLabel:
          participant?.displayName?.trim() ||
          (participant ? "Session participant" : "Unmatched provider device"),
        role: participant?.role || null,
        canonicalAccessStatus: participant?.accessStatus || null,
        clientKind,
        deviceLabel: grant?.deviceLabel?.trim() || defaultDeviceLabel,
        joinedAt: providerJoinedAt(active),
        audio: trackState(active.tracks, TrackType.AUDIO),
        video: trackState(active.tracks, TrackType.VIDEO),
        matchedToCanonicalParticipant: matched,
      } satisfies SessionProviderPresenceDevice;
    })
    .sort(
      (left, right) =>
        left.participantLabel.localeCompare(right.participantLabel) ||
        left.deviceLabel.localeCompare(right.deviceLabel) ||
        left.id.localeCompare(right.id),
    );
  const participantCount = new Set(
    devices
      .map((device) => device.participantId)
      .filter((participantId): participantId is string =>
        Boolean(participantId),
      ),
  ).size;
  const unknownDeviceCount = devices.filter(
    (device) => !device.matchedToCanonicalParticipant,
  ).length;
  const attentionCount = devices.filter(
    (device) =>
      !device.matchedToCanonicalParticipant ||
      device.canonicalAccessStatus === "REMOVED",
  ).length;
  return {
    observedAt: (input.observedAt || new Date()).toISOString(),
    connectedDeviceCount: devices.length,
    connectedParticipantCount: participantCount,
    unknownDeviceCount,
    attentionCount,
    devices,
  };
}

function boundary(providerReadbackAttempted: boolean) {
  return {
    providerReadbackAttempted,
    currentObservationNotHistory: true as const,
    joinKeyLeaseUsedAsPresence: false as const,
    providerIdentitiesExposed: false as const,
    credentialsExposed: false as const,
    recordingStateChanged: false as const,
  };
}

export async function readSessionProviderPresence(input: {
  provider: string | null | undefined;
  providerRoomId: string | null | undefined;
  participants: CanonicalParticipant[];
  grants: ProviderGrant[];
  observedAt?: Date;
}): Promise<SessionProviderPresence> {
  const observedAt = input.observedAt || new Date();
  const provider = text(input.provider).toLowerCase();
  const providerRoomId = text(input.providerRoomId);
  if (provider !== "livekit" || !providerRoomId) {
    return {
      status: "NOT_REQUIRED",
      errorCode: null,
      observedAt: observedAt.toISOString(),
      provider: provider || null,
      connectedDeviceCount: 0,
      connectedParticipantCount: 0,
      unknownDeviceCount: 0,
      attentionCount: 0,
      devices: [],
      nextAction:
        "This Session has no active LiveKit room to observe. Join-key history remains separate.",
      boundaries: boundary(false),
    };
  }

  const configuredURL = text(process.env.LIVEKIT_URL);
  const apiKey = text(process.env.LIVEKIT_API_KEY);
  const apiSecret = text(process.env.LIVEKIT_API_SECRET);
  if (!configuredURL || !apiKey || !apiSecret) {
    return {
      status: "UNAVAILABLE",
      errorCode: "LIVEKIT_ADMIN_NOT_CONFIGURED",
      observedAt: observedAt.toISOString(),
      provider: "livekit",
      connectedDeviceCount: null,
      connectedParticipantCount: null,
      unknownDeviceCount: null,
      attentionCount: null,
      devices: [],
      nextAction:
        "Live provider presence is unavailable because the server cannot perform an administrative readback. Quipsly will not infer presence from join keys.",
      boundaries: boundary(false),
    };
  }

  try {
    const roomService = new RoomServiceClient(
      liveKitServiceURL(configuredURL),
      apiKey,
      apiSecret,
    );
    const activeParticipants =
      await roomService.listParticipants(providerRoomId);
    const projection = projectSessionProviderPresence({
      providerRoomId,
      participants: input.participants,
      grants: input.grants,
      activeParticipants,
      observedAt,
    });
    return {
      status: projection.connectedDeviceCount ? "LIVE" : "EMPTY",
      errorCode: null,
      provider: "livekit",
      ...projection,
      nextAction: projection.connectedDeviceCount
        ? "LiveKit reports these devices in the room at the observation time. Track state is provider metadata, not retained-source or recording proof."
        : "LiveKit reports no connected device at the observation time. Historical access and join-key receipts remain preserved.",
      boundaries: boundary(true),
    };
  } catch {
    return {
      status: "FAILED",
      errorCode: "LIVEKIT_ADMIN_READBACK_FAILED",
      observedAt: observedAt.toISOString(),
      provider: "livekit",
      connectedDeviceCount: null,
      connectedParticipantCount: null,
      unknownDeviceCount: null,
      attentionCount: null,
      devices: [],
      nextAction:
        "The provider readback failed. Quipsly is showing presence as unknown rather than reusing stale authority or access history.",
      boundaries: boundary(true),
    };
  }
}
