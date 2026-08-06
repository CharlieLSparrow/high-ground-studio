import {
  assembleSpeakerCameraCut,
  cameraAssemblyPolicyPreset,
  cameraAssemblyReadiness,
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
  it("reports exact canonical readiness without treating timeline placement as sync proof", () => {
    const ready = cameraAssemblyReadiness(twoCameraTimeline());
    expect(ready).toEqual(expect.objectContaining({ status: "ready", videoSourceCount: 2, speakerCount: 2, mappedSpeakerCount: 2 }));
    expect(ready.boundaries.timelinePlacementIsNotSourceSyncProof).toBe(true);

    const fragmented = twoCameraTimeline();
    fragmented.clips = [fragmented.clips[0]!];
    fragmented.transcript = [];
    fragmented.speakerCameraMappings = [];
    const blocked = cameraAssemblyReadiness(fragmented);
    expect(blocked.status).toBe("blocked");
    expect(blocked.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "single-video-source", severity: "warning" }),
      expect.objectContaining({ code: "no-transcript", severity: "block" }),
    ]));
  });

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

  it("uses an explicitly mapped wide angle for overlap, silence, intro, and outro", () => {
    const timeline = twoCameraTimeline();
    timeline.clips.push({ id: "wide-cam", assetId: "wide.mp4", kind: "video", trackId: "V3", startIn: 0, duration: 30, sourceStart: 0, sourceEnd: 30, name: "Wide", color: "#333" });
    timeline.transcript = [
      { id: "b1", time: 0, duration: 5, text: "Opening", speaker: "Charlie", deleted: false, alert: null },
      { id: "b2", time: 4.5, duration: 2.5, text: "Overlap", speaker: "Homer", deleted: false, alert: null },
      { id: "b3", time: 9, duration: 5, text: "After a pause", speaker: "Homer", deleted: false, alert: null },
    ];
    timeline.cameraAssemblyPolicy = cameraAssemblyPolicyPreset("natural-conversation", { wideClipId: "wide-cam", createdAt: "2026-08-07T00:00:00.000Z" });

    const result = assembleSpeakerCameraCut({ timeline, createdAt: "2026-08-07T01:00:00.000Z" });

    expect(result.warnings).toEqual([]);
    expect(result.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetClipId: "wide-cam", evidence: expect.objectContaining({ assemblyReason: "wide-intro" }) }),
      expect.objectContaining({ targetClipId: "wide-cam", evidence: expect.objectContaining({ assemblyReason: "wide-overlap" }) }),
      expect.objectContaining({ targetClipId: "wide-cam", evidence: expect.objectContaining({ assemblyReason: "wide-silence" }) }),
      expect.objectContaining({ targetClipId: "wide-cam", evidence: expect.objectContaining({ assemblyReason: "wide-outro" }) }),
    ]));
    expect(result.decisions.every((decision, index, decisions) => index === 0 || decision.startSeconds >= decisions[index - 1]!.startSeconds + decisions[index - 1]!.durationSeconds - 0.001)).toBe(true);
  });

  it("reports unavailable wide coverage instead of selecting an arbitrary or blank angle", () => {
    const timeline = twoCameraTimeline();
    timeline.cameraAssemblyPolicy = cameraAssemblyPolicyPreset("dynamic", { wideClipId: "missing-wide" });

    const result = assembleSpeakerCameraCut({ timeline, createdAt: "2026-08-07T01:00:00.000Z" });

    expect(result.warnings).toContainEqual(expect.objectContaining({ reason: "wide-camera-not-mapped" }));
    expect(result.decisions.every((decision) => decision.targetClipId !== "missing-wide")).toBe(true);
  });

  it("applies a bounded switch delay and periodic wide cutaways without changing audio decisions", () => {
    const timeline = twoCameraTimeline();
    timeline.clips.forEach((clip) => { clip.duration = 90; clip.sourceEnd = 90; });
    timeline.clips.push({ id: "wide-cam", assetId: "wide.mp4", kind: "video", trackId: "V3", startIn: 0, duration: 90, sourceStart: 0, sourceEnd: 90, name: "Wide", color: "#333" });
    timeline.transcript = [
      { id: "b1", time: 0, duration: 40, text: "Long opening", speaker: "Charlie", deleted: false, alert: null },
      { id: "b2", time: 40, duration: 40, text: "Long response", speaker: "Homer", deleted: false, alert: null },
    ];
    timeline.cameraAssemblyPolicy = { ...cameraAssemblyPolicyPreset("dynamic", { wideClipId: "wide-cam" }), useWideForIntroOutro: false };

    const result = assembleSpeakerCameraCut({ timeline, createdAt: "2026-08-07T01:00:00.000Z" });

    expect(result.decisions).toContainEqual(expect.objectContaining({ startSeconds: 40.15, targetClipId: "homer-cam" }));
    expect(result.decisions).toContainEqual(expect.objectContaining({ startSeconds: 30, durationSeconds: 2.5, targetClipId: "wide-cam", evidence: expect.objectContaining({ assemblyReason: "wide-cutaway" }) }));
    expect(result.decisions.every((decision) => decision.source !== "deterministic-assembly" || decision.targetClipId === "wide-cam")).toBe(true);
  });
});
