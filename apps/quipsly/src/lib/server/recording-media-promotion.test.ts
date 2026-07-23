/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));

import {
  recordingSessionHandoffContext,
  resolveRecordingPromotionTarget,
} from "./recording-media-promotion";

describe("capture Session to Studio handoff boundary", () => {
  const room = {
    id: "room-1",
    projectId: "project-1",
    projectSlug: "legacy-high-ground",
    updatedAt: new Date("2026-07-19T08:00:00.000Z"),
    project: { id: "project-1", slug: "high-ground", name: "High Ground Odyssey" },
    tagLinks: [
      { tag: { id: "tag-proof", projectId: "project-1", slug: "proof-listen", label: "Proof listen", category: "workflow" } },
      { tag: { id: "tag-episode", projectId: "project-1", slug: "episode-4", label: "Episode 4", category: "meaning" } },
      { tag: { id: "foreign", projectId: "project-2", slug: "private", label: "Private", category: "meaning" } },
    ],
  };

  it("makes the canonical project relation authoritative over drifted legacy slugs", () => {
    expect(resolveRecordingPromotionTarget({ room, recordingAsset: { localManifestJson: {} } })).toEqual({
      nestSlug: "high-ground",
      source: "canonical-session-project",
      boundNestSlug: "high-ground",
      conflictNestSlug: null,
      legacySlugDrift: true,
    });
  });

  it("holds an explicit cross-project promotion instead of silently moving the recording", () => {
    expect(resolveRecordingPromotionTarget({
      requestedNestSlug: "coaching",
      room,
      recordingAsset: { localManifestJson: {} },
    })).toMatchObject({
      nestSlug: "",
      source: "canonical-project-conflict",
      boundNestSlug: "high-ground",
      conflictNestSlug: "coaching",
    });
  });

  it("holds a capture manifest that conflicts with the canonical Session project", () => {
    expect(resolveRecordingPromotionTarget({
      room,
      recordingAsset: { localManifestJson: { projectSlug: "coaching" } },
    })).toMatchObject({
      source: "binding-conflict",
      boundNestSlug: "high-ground",
      conflictNestSlug: "coaching",
    });
  });

  it("captures only same-project tag ids and labels as a provenance snapshot", () => {
    expect(recordingSessionHandoffContext(room)).toEqual({
      version: 1,
      source: "call-room-canonical-context",
      roomId: "room-1",
      roomUpdatedAt: "2026-07-19T08:00:00.000Z",
      projectId: "project-1",
      projectSlug: "high-ground",
      tagIds: ["tag-episode", "tag-proof"],
      tagSnapshot: [
        { id: "tag-episode", slug: "episode-4", label: "Episode 4", category: "meaning" },
        { id: "tag-proof", slug: "proof-listen", label: "Proof listen", category: "workflow" },
      ],
      canonicalTagSource: "/sessions/room-1",
    });
  });
});
