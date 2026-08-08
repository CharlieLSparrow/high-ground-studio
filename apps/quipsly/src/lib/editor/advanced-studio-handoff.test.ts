import {
  ADVANCED_STUDIO_HANDOFF_SCHEMA,
  advancedStudioHandoffHref,
  advancedStudioReturnHref,
  parseAdvancedStudioHandoff,
  validateAdvancedStudioHandoff,
} from "./advanced-studio-handoff";

const BRANCH_FINGERPRINT = "a".repeat(64);
const TIMELINE_FINGERPRINT_SHA256 = "b".repeat(64);
const SOURCE_PROJECTION_FINGERPRINT = "c".repeat(64);

const branch = {
  id: "branch-1",
  slug: "shared-editor-cut",
  name: "Shared editor cut",
  headRevision: 7,
  stateFingerprint: BRANCH_FINGERPRINT,
  updatedAt: "2026-08-07T12:00:00.000Z",
};

describe("Advanced Studio handoff contract", () => {
  it("round-trips an exact Episode edit revision and optional Story context", () => {
    const href = advancedStudioHandoffHref({
      projectSlug: "high ground/odyssey",
      episodeSlug: "episode 9",
      branch,
      timelineFingerprintSha256: TIMELINE_FINGERPRINT_SHA256,
      sourceProjectionFingerprint: SOURCE_PROJECTION_FINGERPRINT,
      sequenceAtSeconds: 42.2519,
      storyCardId: "card-curious",
      storyPlacementId: "placement-1",
    });
    const url = new URL(href, "http://quipsly.test");
    const parsed = parseAdvancedStudioHandoff(url.searchParams);

    expect(url.pathname).toBe("/editor");
    expect(parsed).toEqual({
      schema: ADVANCED_STUDIO_HANDOFF_SCHEMA,
      projectSlug: "high ground/odyssey",
      episodeSlug: "episode 9",
      branchId: "branch-1",
      branchRevision: 7,
      branchFingerprint: BRANCH_FINGERPRINT,
      timelineFingerprintSha256: TIMELINE_FINGERPRINT_SHA256,
      sourceProjectionFingerprint: SOURCE_PROJECTION_FINGERPRINT,
      sequenceAtSeconds: 42.252,
      storyCardId: "card-curious",
      storyPlacementId: "placement-1",
    });
    expect(advancedStudioReturnHref(parsed!)).toBe(
      "/nests/high%20ground%2Fodyssey/episodes/episode%209?mode=edit&storyCard=card-curious&storyPlacement=placement-1",
    );
  });

  it("does not claim a versioned handoff when canonical evidence is absent", () => {
    const href = advancedStudioHandoffHref({
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      branch: null,
      timelineFingerprintSha256: null,
      sourceProjectionFingerprint: null,
      sequenceAtSeconds: 12,
    });
    const url = new URL(href, "http://quipsly.test");

    expect(url.searchParams.get("handoff")).toBeNull();
    expect(parseAdvancedStudioHandoff(url.searchParams)).toBeNull();
  });

  it("rejects malformed, negative, and oversized handoff fields", () => {
    const params = new URLSearchParams({
      handoff: ADVANCED_STUDIO_HANDOFF_SCHEMA,
      project: "high-ground-odyssey",
      episode: "episode-9",
      editBranch: "branch-1",
      editRevision: "-1",
      editFingerprint: BRANCH_FINGERPRINT,
      timelineSha256: TIMELINE_FINGERPRINT_SHA256,
      sourceFingerprint: SOURCE_PROJECTION_FINGERPRINT,
      sequenceAt: "NaN",
    });
    expect(parseAdvancedStudioHandoff(params)).toBeNull();
  });

  it("verifies only the same episode, branch revision, and both fingerprints", () => {
    const request = parseAdvancedStudioHandoff(
      new URL(
        advancedStudioHandoffHref({
          projectSlug: "high-ground-odyssey",
          episodeSlug: "episode-9",
          branch,
          timelineFingerprintSha256: TIMELINE_FINGERPRINT_SHA256,
          sourceProjectionFingerprint: SOURCE_PROJECTION_FINGERPRINT,
          sequenceAtSeconds: 42.25,
        }),
        "http://quipsly.test",
      ).searchParams,
    )!;
    const current = {
      selectedEpisode: { slug: "episode-9" },
      branch,
      timelineFingerprintSha256: TIMELINE_FINGERPRINT_SHA256,
      state: { sourceProjectionFingerprint: SOURCE_PROJECTION_FINGERPRINT },
    };

    expect(validateAdvancedStudioHandoff(request, current as never)).toEqual({
      status: "verified",
      request,
    });
    expect(
      validateAdvancedStudioHandoff(request, {
        ...current,
        branch: { ...branch, headRevision: 8 },
      } as never),
    ).toEqual(
      expect.objectContaining({ status: "stale", reason: expect.stringMatching(/changed/) }),
    );
    expect(
      validateAdvancedStudioHandoff(request, {
        ...current,
        timelineFingerprintSha256: "d".repeat(64),
      } as never),
    ).toEqual(
      expect.objectContaining({ status: "stale", reason: expect.stringMatching(/timeline changed/) }),
    );
    expect(
      validateAdvancedStudioHandoff(request, {
        ...current,
        state: { sourceProjectionFingerprint: "e".repeat(64) },
      } as never),
    ).toEqual(
      expect.objectContaining({ status: "stale", reason: expect.stringMatching(/source projection changed/) }),
    );
    expect(
      validateAdvancedStudioHandoff(request, {
        ...current,
        selectedEpisode: { slug: "another-episode" },
      } as never),
    ).toEqual(
      expect.objectContaining({ status: "stale", reason: expect.stringMatching(/does not match/) }),
    );
  });
});
