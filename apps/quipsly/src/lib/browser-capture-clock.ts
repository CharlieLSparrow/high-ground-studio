"use client";

import type { BrowserSourceCaptureClockSample } from "@high-ground/quipsly-domain";

const CAPTURE_CLOCK_PROTOCOL_VERSION = 1;
const CAPTURE_CLOCK_BURST_COUNT = 3;

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
  const response = await runtime.fetch("/api/mobile/capture/clock-sample", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
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
}) {
  const samples = await Promise.all(Array.from(
    { length: CAPTURE_CLOCK_BURST_COUNT },
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
