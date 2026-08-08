import {
  advancedStudioHandoffHref,
  parseAdvancedStudioHandoff,
  validateAdvancedStudioHandoff,
} from "@/lib/editor/advanced-studio-handoff";
import { getPrismaClient } from "@/lib/prisma";

import { loadEpisodeEditDesk } from "./episode-edit-store";

const runDatabaseSmoke =
  process.env.QUIPSLY_ADVANCED_STUDIO_HANDOFF_DB_SMOKE === "1"
    ? describe
    : describe.skip;
if (process.env.QUIPSLY_ADVANCED_STUDIO_HANDOFF_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for the retained Studio handoff operation.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runDatabaseSmoke("retained Episode to Advanced Studio handoff", () => {
  afterAll(async () => {
    await getPrismaClient().$disconnect();
  });

  it("validates the exact retained edit and refuses a newer branch revision", async () => {
    const projectSlug =
      process.env.QUIPSLY_ADVANCED_STUDIO_HANDOFF_PROJECT || "";
    const episodeSlug =
      process.env.QUIPSLY_ADVANCED_STUDIO_HANDOFF_EPISODE || "";
    if (!projectSlug || !episodeSlug) {
      throw new Error(
        "Set the retained project and Episode slugs before running this database operation.",
      );
    }

    const payload = await loadEpisodeEditDesk(projectSlug, episodeSlug, true, {
      includeInspection: false,
    });
    expect(payload.selectedEpisode?.slug).toBe(episodeSlug);
    expect(payload.branch?.stateFingerprint).toEqual(expect.any(String));
    expect(payload.timelineFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.state.sourceProjectionFingerprint).toEqual(
      expect.any(String),
    );

    const href = advancedStudioHandoffHref({
      projectSlug,
      episodeSlug,
      branch: payload.branch,
      timelineFingerprintSha256: payload.timelineFingerprintSha256,
      sourceProjectionFingerprint: payload.state.sourceProjectionFingerprint,
      sequenceAtSeconds: 42.25,
    });
    const request = parseAdvancedStudioHandoff(
      new URL(href, "http://127.0.0.1:3012").searchParams,
    );
    expect(href.length).toBeLessThan(1_200);
    expect(href).not.toContain("timelineFingerprint");
    expect(request).not.toBeNull();
    expect(validateAdvancedStudioHandoff(request!, payload)).toEqual({
      status: "verified",
      request,
    });
    expect(
      validateAdvancedStudioHandoff(request!, {
        ...payload,
        branch: payload.branch
          ? {
              ...payload.branch,
              headRevision: payload.branch.headRevision + 1,
            }
          : null,
      }),
    ).toEqual(
      expect.objectContaining({
        status: "stale",
        reason: expect.stringMatching(/shared edit changed/i),
      }),
    );
  });
});
