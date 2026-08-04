import {
  assembleSpeakerCameraCut,
  cameraClipAtTime,
  cameraSwitchDecisionAtTime,
  type TimelineState,
} from "@high-ground/quipsly-domain";

function twoCameraTimeline(): TimelineState {
  return {
    clips: [
      { id: "charlie-cam", assetId: "charlie.mp4", kind: "video", trackId: "V1", startIn: 0, duration: 30, sourceStart: 0, sourceEnd: 30, name: "Charlie", color: "#111" },
      { id: "homer-cam", assetId: "homer.mp4", kind: "video", trackId: "V2", startIn: 0, duration: 30, sourceStart: 0, sourceEnd: 30, name: "Homer", color: "#222" },
    ],
    transcript: [
      { id: "b1", time: 0, duration: 5, text: "Opening", speaker: "Charlie", deleted: false, alert: null },
      { id: "b2", time: 5, duration: 0.8, text: "Yep", speaker: "Homer", deleted: false, alert: null },
      { id: "b3", time: 6, duration: 4, text: "Continuing", speaker: "Charlie", deleted: false, alert: null },
      { id: "b4", time: 10, duration: 5, text: "Response", speaker: "Homer", deleted: false, alert: null },
    ],
    speakerCameraMappings: [
      { id: "map-charlie", speakerKey: "charlie", speakerLabel: "Charlie", targetClipId: "charlie-cam", targetAssetId: "charlie.mp4", source: "manual", createdAt: "2026-08-03T00:00:00.000Z" },
      { id: "map-homer", speakerKey: "homer", speakerLabel: "Homer", targetClipId: "homer-cam", targetAssetId: "homer.mp4", source: "manual", createdAt: "2026-08-03T00:00:00.000Z" },
    ],
  };
}

describe("speaker camera cut assembly", () => {
  it("holds a rapid interjection and creates stable reversible camera ranges", () => {
    const timeline = twoCameraTimeline();
    const result = assembleSpeakerCameraCut({
      timeline,
      createdAt: "2026-08-03T01:00:00.000Z",
      proposalSetId: "proposal-set-1",
      proposalTimelineFingerprintSha256: "a".repeat(64),
    });

    expect(result.holds).toEqual([
      expect.objectContaining({ reason: "rapid-speaker-turn", speakerLabel: "Homer", startSeconds: 5, endSeconds: 5.8 }),
    ]);
    expect(result.decisions).toEqual([
      expect.objectContaining({ targetClipId: "charlie-cam", startSeconds: 0, durationSeconds: 10, status: "draft" }),
      expect.objectContaining({ targetClipId: "homer-cam", startSeconds: 10, durationSeconds: 5, status: "draft" }),
    ]);

    const assembled: TimelineState = { ...timeline, cameraSwitchDecisions: result.decisions };
    expect(cameraSwitchDecisionAtTime(assembled, 5.2)?.targetClipId).toBe("charlie-cam");
    expect(cameraClipAtTime(assembled, 12)?.id).toBe("homer-cam");
  });

  it("refuses to guess when a mapped camera does not cover the speaker range", () => {
    const timeline = twoCameraTimeline();
    timeline.clips[1] = { ...timeline.clips[1], startIn: 12 };
    const result = assembleSpeakerCameraCut({ timeline, createdAt: "2026-08-03T01:00:00.000Z" });

    expect(result.decisions).toHaveLength(1);
    expect(result.holds).toContainEqual(expect.objectContaining({
      reason: "camera-not-covering-range",
      speakerLabel: "Homer",
    }));
  });

  it("holds overlapping speakers instead of flash-cutting between them", () => {
    const timeline = twoCameraTimeline();
    timeline.transcript = [
      { id: "b1", time: 0, duration: 5, text: "Talking", speaker: "Charlie", deleted: false, alert: null },
      { id: "b2", time: 4.5, duration: 3, text: "Overlap", speaker: "Homer", deleted: false, alert: null },
    ];
    const result = assembleSpeakerCameraCut({ timeline, createdAt: "2026-08-03T01:00:00.000Z" });

    expect(result.decisions).toEqual([expect.objectContaining({ targetClipId: "charlie-cam" })]);
    expect(result.holds).toEqual([expect.objectContaining({ reason: "overlapping-speech", speakerLabel: "Homer" })]);
  });
});
