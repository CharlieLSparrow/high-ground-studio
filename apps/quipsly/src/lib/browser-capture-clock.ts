"use client";

import type { BrowserSourceCaptureClockSample } from "@high-ground/quipsly-domain";

const CAPTURE_CLOCK_PROTOCOL_VERSION = 1;
const CAPTURE_CLOCK_BURST_COUNT = 3;
const MAX_CAPTURE_CLOCK_SAMPLES = 48;
const CAPTURE_CLOCK_REQUEST_TIMEOUT_MS = 5_000;

type ClockResponse = {
  ok?: boolean;
  error?: string;
  protocolVersion?: number;
  sampleId?: string;
  callRoomId?: string;
  captureGroupId?: string;
  clientKind?: string;
  deviceWallSentAt?: string;
  deviceMonotonicSentNanoseconds?: string;
  serverReceivedAt?: string;
  serverSentAt?: string;
};

export type BrowserCaptureClockRuntime = {
  wallNow: () => Date;
  monotonicNowMilliseconds: () => number;
  fetch: typeof globalThis.fetch;
};

function finiteTimestamp(value: string | undefined) {
  const milliseconds = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function browserMonotonicNanoseconds(monotonicMilliseconds: number) {
  if (!Number.isFinite(monotonicMilliseconds) || monotonicMilliseconds < 0) {
    throw new Error("The browser monotonic clock is unavailable.");
  }
  return BigInt(Math.round(monotonicMilliseconds * 1_000_000)).toString();
}

export async function measureBrowserCaptureClockSample(input: {
  callRoomId: string;
  captureGroupId: string;
  runtime?: BrowserCaptureClockRuntime;
}): Promise<BrowserSourceCaptureClockSample> {
  const runtime = input.runtime ?? {
    wallNow: () => new Date(),
    monotonicNowMilliseconds: () => performance.now(),
    fetch: globalThis.fetch.bind(globalThis),
  };
  const sampleId = crypto.randomUUID();
  const deviceWallSentAt = runtime.wallNow();
  const monotonicSentMilliseconds = runtime.monotonicNowMilliseconds();
  const deviceMonotonicSentNanoseconds = browserMonotonicNanoseconds(monotonicSentMilliseconds);
  const abortController = new AbortController();
  const timeout = globalThis.setTimeout(
    () => abortController.abort("Capture clock request timed out."),
    CAPTURE_CLOCK_REQUEST_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await runtime.fetch("/api/mobile/capture/clock-sample", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      signal: abortController.signal,
      body: JSON.stringify({
        protocolVersion: CAPTURE_CLOCK_PROTOCOL_VERSION,
        sampleId,
        callRoomId: input.callRoomId,
        captureGroupId: input.captureGroupId,
        clientKind: "web",
        deviceWallSentAt: deviceWallSentAt.toISOString(),
        deviceMonotonicSentNanoseconds,
      }),
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
  const monotonicReceivedMilliseconds = runtime.monotonicNowMilliseconds();
  const deviceWallReceivedAt = runtime.wallNow();
  const packet = await response.json().catch(() => ({})) as ClockResponse;
  if (!response.ok || packet.ok !== true) {
    throw new Error(packet.error || "Nest could not measure the Session clock.");
  }
  if (
    packet.protocolVersion !== CAPTURE_CLOCK_PROTOCOL_VERSION
    || packet.sampleId !== sampleId
    || packet.callRoomId !== input.callRoomId
    || packet.captureGroupId !== input.captureGroupId
    || packet.clientKind !== "web"
    || packet.deviceWallSentAt !== deviceWallSentAt.toISOString()
    || packet.deviceMonotonicSentNanoseconds !== deviceMonotonicSentNanoseconds
  ) {
    throw new Error("Nest returned clock evidence for a different source boundary.");
  }
  const serverReceivedMilliseconds = finiteTimestamp(packet.serverReceivedAt);
  const serverSentMilliseconds = finiteTimestamp(packet.serverSentAt);
  if (
    serverReceivedMilliseconds === null
    || serverSentMilliseconds === null
    || serverSentMilliseconds < serverReceivedMilliseconds
    || monotonicReceivedMilliseconds < monotonicSentMilliseconds
  ) {
    throw new Error("Nest returned invalid Session clock evidence.");
  }
  const monotonicElapsedMilliseconds = monotonicReceivedMilliseconds - monotonicSentMilliseconds;
  const wallElapsedMilliseconds = deviceWallReceivedAt.getTime() - deviceWallSentAt.getTime();
  const serverProcessingMilliseconds = serverSentMilliseconds - serverReceivedMilliseconds;
  const networkRoundTripMilliseconds = Math.max(0, monotonicElapsedMilliseconds - serverProcessingMilliseconds);
  const serverOffsetMilliseconds = (
    (serverReceivedMilliseconds - deviceWallSentAt.getTime())
    + (serverSentMilliseconds - deviceWallReceivedAt.getTime())
  ) / 2;

  return {
    protocolVersion: CAPTURE_CLOCK_PROTOCOL_VERSION,
    sampleId,
    callRoomId: input.callRoomId,
    captureGroupId: input.captureGroupId,
    clientKind: "web",
    deviceWallSentAt: deviceWallSentAt.toISOString(),
    deviceMonotonicSentNanoseconds,
    serverReceivedAt: new Date(serverReceivedMilliseconds).toISOString(),
    serverSentAt: new Date(serverSentMilliseconds).toISOString(),
    deviceWallReceivedAt: deviceWallReceivedAt.toISOString(),
    deviceMonotonicReceivedNanoseconds: browserMonotonicNanoseconds(monotonicReceivedMilliseconds),
    networkRoundTripMilliseconds,
    serverOffsetMilliseconds,
    uncertaintyMilliseconds: networkRoundTripMilliseconds / 2,
    wallClockDiscontinuityMilliseconds: wallElapsedMilliseconds - monotonicElapsedMilliseconds,
  };
}

export async function measureBrowserCaptureClockBurst(input: {
  callRoomId: string;
  captureGroupId: string;
  runtime?: BrowserCaptureClockRuntime;
  sampleCount?: number;
}) {
  const sampleCount = input.sampleCount ?? CAPTURE_CLOCK_BURST_COUNT;
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > CAPTURE_CLOCK_BURST_COUNT) {
    throw new Error("A capture-clock burst must contain between one and three samples.");
  }
  const samples = await Promise.all(Array.from(
    { length: sampleCount },
    () => measureBrowserCaptureClockSample(input).catch(() => null),
  ));
  return samples
    .filter((sample): sample is BrowserSourceCaptureClockSample => sample !== null)
    .sort((left, right) => (
      left.networkRoundTripMilliseconds - right.networkRoundTripMilliseconds
      || left.uncertaintyMilliseconds - right.uncertaintyMilliseconds
      || left.sampleId.localeCompare(right.sampleId)
    ));
}

/**
 * Keeps a bounded, chronological clock history while preserving the complete
 * opening burst and the newest in-take/stop evidence. Sample identity is
 * server-echo-bound; duplicate retries never inflate the source profile.
 */
export function mergeBrowserCaptureClockSamples(
  existing: readonly BrowserSourceCaptureClockSample[],
  incoming: readonly BrowserSourceCaptureClockSample[],
  maximum = MAX_CAPTURE_CLOCK_SAMPLES,
) {
  if (!Number.isSafeInteger(maximum) || maximum < 6 || maximum > MAX_CAPTURE_CLOCK_SAMPLES) {
    throw new Error("Capture-clock history must remain between six and 48 samples.");
  }
  const byId = new Map<string, BrowserSourceCaptureClockSample>();
  for (const sample of [...existing, ...incoming]) byId.set(sample.sampleId, sample);
  const ordered = [...byId.values()].sort((left, right) => {
    const leftMonotonic = BigInt(left.deviceMonotonicSentNanoseconds);
    const rightMonotonic = BigInt(right.deviceMonotonicSentNanoseconds);
    if (leftMonotonic < rightMonotonic) return -1;
    if (leftMonotonic > rightMonotonic) return 1;
    return left.sampleId.localeCompare(right.sampleId);
  });
  if (ordered.length <= maximum) return ordered;
  const opening = ordered.slice(0, CAPTURE_CLOCK_BURST_COUNT);
  const tail = ordered.slice(-(maximum - opening.length));
  return [...opening, ...tail];
}
