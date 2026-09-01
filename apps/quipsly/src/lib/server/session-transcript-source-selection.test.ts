/** @jest-environment node */

import { selectSessionTranscriptSources } from "./session-transcript-source-selection";

function source(input: {
  id: string;
  participantId: string;
  startedAt: string;
  captureGroupId?: string;
  kind?: string;
  jobCreatedAt?: string;
  stoppedAt?: string;
}) {
  return {
    id: input.id,
    participantId: input.participantId,
    kind: input.kind ?? "LOCAL_AUDIO",
    recordedStartedAt: new Date(input.startedAt),
    recordedStoppedAt: input.stoppedAt ? new Date(input.stoppedAt) : null,
    localManifestJson: input.captureGroupId ? { captureGroupId: input.captureGroupId } : {},
    transcriptJobs: [{ id: `job-${input.id}`, createdAt: new Date(input.jobCreatedAt ?? input.startedAt) }],
  };
}

describe("Session transcript source selection", () => {
  it("keeps an anchored capture group isolated from nearby takes", () => {
    const selected = selectSessionTranscriptSources({
      rows: [
        source({ id: "coach-a", participantId: "coach", startedAt: "2026-08-24T15:00:00.000Z", captureGroupId: "take-a" }),
        source({ id: "client-a", participantId: "client", startedAt: "2026-08-24T15:00:00.400Z", captureGroupId: "take-a" }),
        source({ id: "coach-b", participantId: "coach", startedAt: "2026-08-24T15:00:10.000Z", captureGroupId: "take-b" }),
        source({ id: "client-b", participantId: "client", startedAt: "2026-08-24T15:00:10.500Z", captureGroupId: "take-b" }),
      ],
      participantIds: ["coach", "client"],
      anchorRecordingAssetId: "coach-a",
    });

    expect(selected.map((row) => row?.id)).toEqual(["coach-a", "client-a"]);
  });

  it("uses the newest coherent legacy take when no capture group exists", () => {
    const selected = selectSessionTranscriptSources({
      rows: [
        source({ id: "coach-old", participantId: "coach", startedAt: "2026-08-24T14:00:00.000Z" }),
        source({ id: "client-old", participantId: "client", startedAt: "2026-08-24T14:00:00.500Z" }),
        source({ id: "coach-new", participantId: "coach", startedAt: "2026-08-24T15:00:00.000Z" }),
        source({ id: "client-new", participantId: "client", startedAt: "2026-08-24T15:00:01.000Z" }),
      ],
    });

    expect(selected.map((row) => row?.id)).toEqual(["coach-new", "client-new"]);
  });

  it("prefers participant audio over video without losing the anchor", () => {
    const selected = selectSessionTranscriptSources({
      rows: [
        source({ id: "coach-video", participantId: "coach", startedAt: "2026-08-24T15:00:00.000Z", captureGroupId: "take-a", kind: "LOCAL_VIDEO" }),
        source({ id: "coach-audio", participantId: "coach", startedAt: "2026-08-24T15:00:00.000Z", captureGroupId: "take-a", kind: "LOCAL_AUDIO" }),
      ],
      anchorRecordingAssetId: "coach-video",
    });

    expect(selected.map((row) => row?.id)).toEqual(["coach-video"]);
  });

  it("keeps both transcript segments when one participant reconnects", () => {
    const selected = selectSessionTranscriptSources({
      rows: [
        source({ id: "coach-before-crash", participantId: "coach", startedAt: "2026-08-24T15:00:00.000Z", stoppedAt: "2026-08-24T15:20:00.000Z", captureGroupId: "take-a" }),
        source({ id: "client-continuous", participantId: "client", startedAt: "2026-08-24T15:00:01.000Z", stoppedAt: "2026-08-24T15:50:01.000Z", captureGroupId: "take-a" }),
        source({ id: "coach-after-reconnect", participantId: "coach", startedAt: "2026-08-24T15:20:08.000Z", stoppedAt: "2026-08-24T15:50:00.000Z", captureGroupId: "take-a" }),
      ],
      participantIds: ["coach", "client"],
      anchorRecordingAssetId: "coach-before-crash",
    });

    expect(selected.map((row) => row?.id)).toEqual([
      "coach-before-crash",
      "coach-after-reconnect",
      "client-continuous",
    ]);
  });

  it("chooses one transcript from simultaneous participant devices", () => {
    const selected = selectSessionTranscriptSources({
      rows: [
        source({ id: "coach-browser", participantId: "coach", startedAt: "2026-08-24T15:00:00.000Z", stoppedAt: "2026-08-24T15:50:00.000Z", captureGroupId: "take-a", jobCreatedAt: "2026-08-24T16:00:00.000Z" }),
        source({ id: "coach-phone", participantId: "coach", startedAt: "2026-08-24T15:00:02.000Z", stoppedAt: "2026-08-24T15:49:58.000Z", captureGroupId: "take-a", jobCreatedAt: "2026-08-24T16:01:00.000Z" }),
      ],
    });

    expect(selected.map((row) => row?.id)).toEqual(["coach-phone"]);
  });
});
