export const HGO_PUBLIC_COACHING_PACKET_KIND = "hgo-public-coaching-packet-v1" as const;

export type HgoPublicCoachingPacket = {
  packetKind: typeof HGO_PUBLIC_COACHING_PACKET_KIND;
  
  id: string;
  slug: string;
  title: string;
  summary: string;
  publishStatus: "live" | "archived";

  framework: {
    principles: Array<{ title: string; description: string; }>;
    exercises: Array<{ title: string; instructions: string; }>;
  };

  essayVersion: string;

  provenance: {
    sourceArtifactHash: string;
    publishedAt: string;
  };
};

export type HgoPublicCoachingPacketValidationResult =
  | { ok: true; packet: HgoPublicCoachingPacket; errors: []; warnings: string[] }
  | { ok: false; packet: null; errors: string[]; warnings: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(record: Record<string, unknown>, key: string, path: string, errors: string[]) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path}.${key} must be a non-empty string.`);
    return "";
  }
  return value;
}

export function validateHgoPublicCoachingPacket(input: unknown): HgoPublicCoachingPacketValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, packet: null, errors: ["Packet must be a JSON object."], warnings };
  }

  if (input.packetKind !== HGO_PUBLIC_COACHING_PACKET_KIND) {
    errors.push(`packetKind must be ${HGO_PUBLIC_COACHING_PACKET_KIND}.`);
  }

  readString(input, "id", "packet", errors);
  readString(input, "slug", "packet", errors);
  readString(input, "title", "packet", errors);
  readString(input, "summary", "packet", errors);
  
  if (input.publishStatus !== "live" && input.publishStatus !== "archived") {
    errors.push("publishStatus must be 'live' or 'archived'.");
  }

  const framework = isRecord(input.framework) ? input.framework : null;
  if (!framework) {
    errors.push("framework must be an object.");
  } else {
    if (!Array.isArray(framework.principles)) {
      errors.push("framework.principles must be an array.");
    }
    if (!Array.isArray(framework.exercises)) {
      errors.push("framework.exercises must be an array.");
    }
  }

  readString(input, "essayVersion", "packet", errors);

  const provenance = isRecord(input.provenance) ? input.provenance : null;
  if (!provenance) {
    errors.push("provenance must be an object.");
  } else {
    readString(provenance, "sourceArtifactHash", "provenance", errors);
    readString(provenance, "publishedAt", "provenance", errors);
  }

  if (errors.length) {
    return { ok: false, packet: null, errors, warnings };
  }

  return { ok: true, packet: input as HgoPublicCoachingPacket, errors: [], warnings };
}

export function parseHgoPublicCoachingPacket(json: string): HgoPublicCoachingPacketValidationResult {
  try {
    return validateHgoPublicCoachingPacket(JSON.parse(json));
  } catch (err) {
    return { ok: false, packet: null, errors: ["Invalid JSON format."], warnings: [] };
  }
}
