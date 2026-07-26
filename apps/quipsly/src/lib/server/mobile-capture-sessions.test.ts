/** @jest-environment node */

jest.mock("@high-ground/quipsly-domain/coaching-lifecycle", () => ({ buildQuipslyCoachingLifecycle: jest.fn() }), { virtual: true });
jest.mock("@high-ground/quipsly-domain/coaching-packet", () => ({
  isTranscriptPacketSource: jest.fn(() => false),
  isUnreviewedTranscriptActionItemSource: jest.fn(() => false),
}), { virtual: true });

import { recordingContentReadiness } from "./mobile-capture-content-readiness";
import {
  canonicalMobileSessionEpisodeSlug,
  canonicalMobileSessionProject,
} from "./mobile-capture-sessions";

describe("mobile Session canonical project projection", () => {
  it("uses the relational project and reports legacy slug drift", () => {
    expect(canonicalMobileSessionProject({
      projectId: "project-1",
      projectSlug: "stale-high-ground",
      nestSlug: "older-high-ground",
      project: { id: "project-1", slug: "high-ground", name: "High Ground Odyssey" },
    })).toEqual({
      projectId: "project-1",
      projectSlug: "high-ground",
      projectName: "High Ground Odyssey",
      bindingSource: "canonical-session-project",
      legacySlugDrift: true,
    });
  });

  it("retains a labeled legacy fallback only when no canonical relation exists", () => {
    expect(canonicalMobileSessionProject({ projectSlug: "legacy-coaching" })).toEqual({
      projectId: null,
      projectSlug: "legacy-coaching",
      projectName: null,
      bindingSource: "legacy-session-slug",
      legacySlugDrift: false,
    });
  });

  it("leaves a Session unfiled instead of inventing High Ground Odyssey", () => {
    expect(canonicalMobileSessionProject({})).toEqual({
      projectId: null,
      projectSlug: null,
      projectName: null,
      bindingSource: "unfiled-session",
      legacySlugDrift: false,
    });
  });
});

describe("mobile Session canonical episode projection", () => {
  it("uses the explicit CallRoom episode binding before an offering fallback", () => {
    expect(canonicalMobileSessionEpisodeSlug({
      id: "room-1",
      metadataJson: { episodeSlug: "episode-4-part-2" },
      booking: { offering: { slug: "podcast-offering" } },
    })).toBe("episode-4-part-2");
  });

  it("retains legacy offering and room fallbacks", () => {
    expect(canonicalMobileSessionEpisodeSlug({
      id: "room-1",
      booking: { offering: { slug: "legacy-offering" } },
    })).toBe("legacy-offering");
    expect(canonicalMobileSessionEpisodeSlug({ id: "room-2" })).toBe("room-2");
  });
});

describe("mobile Session recording content readiness", () => {
  it("does not infer content from an empty recording list", () => {
    expect(recordingContentReadiness([], "PODCAST")).toMatchObject({
      status: "none",
      captureAssetCount: 0,
      substantialRecordingCount: 0,
    });
  });

  it("labels short simulator artifacts as capture plumbing proof only", () => {
    expect(recordingContentReadiness([
      {
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        durationSeconds: null,
        segmentsJson: [
          { deviceKind: "Clone 1 of iPhone 17 Pro", durationSeconds: 3.75 },
          { deviceKind: "Clone 1 of iPhone 17 Pro", durationSeconds: 1.57 },
        ],
        localManifestJson: {},
      },
      {
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        durationSeconds: 5,
        segmentsJson: [{ deviceKind: "iPhone 17 Pro Simulator", durationSeconds: 5 }],
        localManifestJson: {},
      },
    ], "PODCAST")).toMatchObject({
      status: "capture-proof-only",
      label: "Capture plumbing proven",
      captureAssetCount: 2,
      knownDurationSeconds: 10.32,
      longestKnownDurationSeconds: 5.32,
      shortCaptureCount: 2,
      simulatorCaptureCount: 2,
      substantialRecordingCount: 0,
    });
  });

  it("requires known duration before calling an asset substantial", () => {
    expect(recordingContentReadiness([
      { kind: "LOCAL_AUDIO", status: "VERIFIED", durationSeconds: null, segmentsJson: [], localManifestJson: {} },
    ], "COACHING")).toMatchObject({
      status: "capture-proof-only",
      unknownDurationCount: 1,
      substantialRecordingCount: 0,
    });
  });

  it("recognizes a non-simulator take without claiming editorial readiness", () => {
    const result = recordingContentReadiness([
      {
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        durationSeconds: 120,
        segmentsJson: [{ deviceKind: "Wall-E’s iPhone", durationSeconds: 120 }],
        localManifestJson: {},
      },
    ], "PODCAST");
    expect(result).toMatchObject({
      status: "substantial",
      captureAssetCount: 1,
      knownDurationSeconds: 120,
      substantialRecordingCount: 1,
    });
    expect(result.detail).toContain("not editorial or release readiness");
  });

  it("does not count provider receipt slots or transcript references as source media", () => {
    expect(recordingContentReadiness([
      { kind: "SERVER_MIX", localManifestJson: { source: "provider-recording-receipt-slot" }, durationSeconds: 3600 },
      { kind: "TRANSCRIPT_SOURCE", durationSeconds: 3600 },
    ], "PODCAST")).toMatchObject({ status: "none", captureAssetCount: 0 });
  });

  it("does not call local-only metadata substantial before uploaded bytes are verified", () => {
    expect(recordingContentReadiness([
      { kind: "LOCAL_AUDIO", status: "LOCAL_READY", durationSeconds: 600, segmentsJson: [{ deviceKind: "Wall-E’s iPhone", durationSeconds: 600 }] },
    ], "PODCAST")).toMatchObject({
      status: "capture-proof-only",
      verifiedCaptureCount: 0,
      substantialRecordingCount: 0,
    });
  });
});
