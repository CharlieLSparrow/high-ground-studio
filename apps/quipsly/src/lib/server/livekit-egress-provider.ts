import "server-only";

import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  GCPUpload,
  WebhookConfig,
  WebhookReceiver,
} from "livekit-server-sdk";

export type LiveKitEgressProviderConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
  bucket: string;
  credentials: string;
};

export type LiveKitEgressEvidence = {
  egressId: string;
  roomName: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  outputPaths: string[];
  raw: Record<string, unknown>;
};

export type LiveKitWebhookEvidence = {
  eventId: string;
  eventType: string;
  createdAt: string | null;
  egress: LiveKitEgressEvidence | null;
  raw: Record<string, unknown>;
};

export type LiveKitEgressProvider = {
  startRoomComposite(input: {
    roomName: string;
    storageObjectPath: string;
    mode: "audio-reference" | "video-composite";
    webhookUrl?: string | null;
    webhookSigningKey?: string | null;
  }): Promise<LiveKitEgressEvidence>;
  listActive(roomName: string): Promise<LiveKitEgressEvidence[]>;
  stop(egressId: string): Promise<LiveKitEgressEvidence>;
};

export function liveKitRoomCompositeProfile(
  mode: "audio-reference" | "video-composite",
) {
  return mode === "audio-reference"
    ? {
        mode,
        fileType: EncodedFileType.OGG,
        audioOnly: true as const,
        layout: null,
        purpose: "shared-sync-and-recovery-reference" as const,
      }
    : {
        mode,
        fileType: EncodedFileType.MP4,
        audioOnly: false as const,
        layout: "speaker" as const,
        purpose: "shareable-room-video-composite" as const,
      };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function httpProviderUrl(value: string) {
  const url = value.trim().replace(/\/+$/, "");
  if (url.startsWith("wss://")) return `https://${url.slice("wss://".length)}`;
  if (url.startsWith("ws://")) return `http://${url.slice("ws://".length)}`;
  return url;
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const maybeMessage = value as { toJson?: (options?: unknown) => unknown };
    if (typeof maybeMessage.toJson === "function") {
      return jsonSafe(maybeMessage.toJson({ emitDefaultValues: true }));
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => typeof item !== "function")
        .map(([key, item]) => [key, jsonSafe(item)]),
    );
  }
  return value;
}

function jsonObject(value: unknown): Record<string, unknown> {
  const safe = jsonSafe(value);
  return safe && typeof safe === "object" && !Array.isArray(safe)
    ? (safe as Record<string, unknown>)
    : {};
}

function timestamp(value: unknown) {
  if (typeof value === "bigint") {
    const milliseconds =
      value > 10_000_000_000_000n
        ? Number(value / 1_000_000n)
        : Number(value > 10_000_000_000n ? value / 1_000n : value * 1_000n);
    return Number.isFinite(milliseconds)
      ? new Date(milliseconds).toISOString()
      : null;
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const milliseconds =
    number > 10_000_000_000_000
      ? number / 1_000_000
      : number > 10_000_000_000
        ? number / 1_000
        : number * 1_000;
  return new Date(milliseconds).toISOString();
}

function collectOutputPaths(
  value: unknown,
  paths = new Set<string>(),
): Set<string> {
  if (typeof value === "string") {
    const candidate = value.trim();
    if (
      candidate &&
      !candidate.includes("\n") &&
      /(?:file|path|filename|location|url)/i.test(candidate) &&
      candidate.length < 2_048
    ) {
      paths.add(candidate.replace(/^gs:\/\/[^/]+\//, ""));
    }
    return paths;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectOutputPaths(item, paths);
    return paths;
  }
  if (!value || typeof value !== "object") return paths;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (
      typeof item === "string" &&
      /(?:file|path|filename|location|url)/i.test(key)
    ) {
      const candidate = item.trim();
      if (candidate && candidate.length < 2_048) {
        paths.add(candidate.replace(/^gs:\/\/[^/]+\//, ""));
      }
    } else {
      collectOutputPaths(item, paths);
    }
  }
  return paths;
}

function egressEvidence(value: any): LiveKitEgressEvidence {
  const raw = jsonObject(value);
  const statusValue = value?.status ?? raw.status;
  const status =
    typeof statusValue === "number"
      ? EgressStatus[statusValue] || String(statusValue)
      : String(statusValue ?? "UNKNOWN");
  return {
    egressId:
      text(value?.egressId) || text(raw.egressId) || text(raw.egress_id),
    roomName:
      text(value?.roomName) || text(raw.roomName) || text(raw.room_name),
    status,
    startedAt: timestamp(value?.startedAt ?? raw.startedAt ?? raw.started_at),
    endedAt: timestamp(value?.endedAt ?? raw.endedAt ?? raw.ended_at),
    outputPaths: [...collectOutputPaths(raw)].sort(),
    raw,
  };
}

export function createLiveKitEgressProvider(
  config: LiveKitEgressProviderConfig,
): LiveKitEgressProvider {
  const client = new EgressClient(
    httpProviderUrl(config.url),
    config.apiKey,
    config.apiSecret,
  );

  return {
    async startRoomComposite(input) {
      const profile = liveKitRoomCompositeProfile(input.mode);
      const output = new EncodedFileOutput({
        fileType: profile.fileType,
        filepath: input.storageObjectPath,
        output: {
          case: "gcp",
          value: new GCPUpload({
            bucket: config.bucket,
            credentials: config.credentials,
          }),
        },
      });
      return egressEvidence(
        await client.startRoomCompositeEgress(
          input.roomName,
          { file: output },
          {
            ...(profile.audioOnly
              ? { audioOnly: true }
              : { layout: profile.layout! }),
            webhooks:
              input.webhookUrl && input.webhookSigningKey
                ? [
                    new WebhookConfig({
                      url: input.webhookUrl,
                      signingKey: input.webhookSigningKey,
                    }),
                  ]
                : [],
          },
        ),
      );
    },

    async listActive(roomName) {
      const items = await client.listEgress({ roomName, active: true });
      return items.map(egressEvidence);
    },

    async stop(egressId) {
      return egressEvidence(await client.stopEgress(egressId));
    },
  };
}

export async function verifyLiveKitWebhook(input: {
  rawBody: string;
  authorization: string;
  apiKey: string;
  apiSecret: string;
}): Promise<LiveKitWebhookEvidence> {
  const receiver = new WebhookReceiver(input.apiKey, input.apiSecret);
  const event = await receiver.receive(input.rawBody, input.authorization);
  const raw = jsonObject(event);
  const egress = event.egressInfo ? egressEvidence(event.egressInfo) : null;
  return {
    eventId: text(event.id) || text(raw.id),
    eventType: text(event.event) || text(raw.event),
    createdAt: timestamp(event.createdAt ?? raw.createdAt ?? raw.created_at),
    egress,
    raw,
  };
}

export function liveKitEgressMatchesObject(
  evidence: LiveKitEgressEvidence,
  expectedStorageObjectPath: string,
) {
  const expected = expectedStorageObjectPath
    .trim()
    .replace(/^gs:\/\/[^/]+\//, "");
  return (
    Boolean(expected) &&
    evidence.outputPaths.some(
      (path) => path === expected || path.endsWith(`/${expected}`),
    )
  );
}
