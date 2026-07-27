export const CAPTURE_CLOCK_PROTOCOL_VERSION = 1;

export const CAPTURE_CLOCK_CLIENT_KINDS = [
  "ios",
  "macos",
  "web",
] as const;

export type CaptureClockClientKind =
  (typeof CAPTURE_CLOCK_CLIENT_KINDS)[number];

export type CaptureClockProbe = {
  protocolVersion: number;
  sampleId: string;
  callRoomId: string;
  captureGroupId: string | null;
  clientKind: CaptureClockClientKind;
  deviceWallSentAt: string;
  deviceMonotonicSentNanoseconds: string;
};

type ParseResult =
  | { ok: true; probe: CaptureClockProbe }
  | { ok: false; code: string; error: string };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isUInt64String(value: string) {
  if (!/^(0|[1-9][0-9]{0,19})$/.test(value)) return false;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n && parsed <= 18_446_744_073_709_551_615n;
  } catch {
    return false;
  }
}

export function parseCaptureClockProbe(
  value: Record<string, unknown>,
): ParseResult {
  const protocolVersion = Number(value.protocolVersion);
  if (protocolVersion !== CAPTURE_CLOCK_PROTOCOL_VERSION) {
    return {
      ok: false,
      code: "CLOCK_PROTOCOL_UNSUPPORTED",
      error: `Capture clock protocolVersion must be ${CAPTURE_CLOCK_PROTOCOL_VERSION}.`,
    };
  }

  const sampleId = text(value.sampleId).toLowerCase();
  if (!isUuid(sampleId)) {
    return {
      ok: false,
      code: "CLOCK_SAMPLE_ID_INVALID",
      error: "Capture clock sampleId must be a UUID.",
    };
  }

  const callRoomId = text(value.callRoomId);
  if (!callRoomId || callRoomId.length > 256) {
    return {
      ok: false,
      code: "CALL_ROOM_REQUIRED",
      error: "Choose a valid Quipsly capture room before measuring its clock.",
    };
  }

  const captureGroupCandidate = text(value.captureGroupId).toLowerCase();
  if (captureGroupCandidate && !isUuid(captureGroupCandidate)) {
    return {
      ok: false,
      code: "CAPTURE_GROUP_ID_INVALID",
      error: "Capture clock captureGroupId must be a UUID when provided.",
    };
  }

  const clientKind = text(value.clientKind).toLowerCase();
  if (
    !CAPTURE_CLOCK_CLIENT_KINDS.includes(
      clientKind as CaptureClockClientKind,
    )
  ) {
    return {
      ok: false,
      code: "CLOCK_CLIENT_KIND_INVALID",
      error: "Capture clock clientKind must be ios, macos, or web.",
    };
  }

  const deviceWallSentAt = text(value.deviceWallSentAt);
  const wallMilliseconds = Date.parse(deviceWallSentAt);
  if (!deviceWallSentAt || !Number.isFinite(wallMilliseconds)) {
    return {
      ok: false,
      code: "DEVICE_WALL_TIME_INVALID",
      error: "Capture clock deviceWallSentAt must be an ISO-8601 timestamp.",
    };
  }

  const deviceMonotonicSentNanoseconds = text(
    value.deviceMonotonicSentNanoseconds,
  );
  if (!isUInt64String(deviceMonotonicSentNanoseconds)) {
    return {
      ok: false,
      code: "DEVICE_MONOTONIC_TIME_INVALID",
      error:
        "Capture clock deviceMonotonicSentNanoseconds must be an unsigned 64-bit integer encoded as a string.",
    };
  }

  return {
    ok: true,
    probe: {
      protocolVersion,
      sampleId,
      callRoomId,
      captureGroupId: captureGroupCandidate || null,
      clientKind: clientKind as CaptureClockClientKind,
      deviceWallSentAt: new Date(wallMilliseconds).toISOString(),
      deviceMonotonicSentNanoseconds,
    },
  };
}
