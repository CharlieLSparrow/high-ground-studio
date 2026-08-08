import {
  SOURCE_VISUAL_OVERVIEW_COLUMNS,
  SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
  SOURCE_VISUAL_OVERVIEW_PROFILE,
  SOURCE_VISUAL_OVERVIEW_ROWS,
  SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
  newSourceVisualOverviewJob,
  newSourceVisualOverviewResult,
  parseSourceVisualOverviewJob,
  parseSourceVisualOverviewResult,
  sourceVisualOverviewIdentity,
  sourceVisualOverviewSampleTimes,
} from "@high-ground/quipsly-media-processing";

const hash = (character: string) => character.repeat(64);

function job() {
  return newSourceVisualOverviewJob({
    jobId: "svjob_12345678",
    derivativeId: "svderivative_12345678",
    projectId: "project_12345678",
    projectSlug: "homer-source-room",
    actorUserId: "user_12345678",
    actorEmail: "homer@example.com",
    queuedAt: "2026-08-07T12:00:00.000Z",
    source: {
      sourceRevisionId: "revision_12345678",
      identitySha256: hash("a"),
      expectedContentSha256: hash("b"),
    },
    input: {
      derivativeId: "proxy_12345678",
      provider: "local",
      locator: "/private/tmp/quipsly-media-ingest/source/proxy.mp4",
      generation: `sha256:${hash("c")}`,
      contentSha256: hash("c"),
      sizeBytes: 12_000,
      contentType: "video/mp4",
      durationSeconds: 42,
    },
    target: {
      provider: "local",
      locator:
        "source-story/homer-source-room/revision_12345678/contact-sheet.jpg",
      contentType: "image/jpeg",
      derivativeKind: SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
      profile: SOURCE_VISUAL_OVERVIEW_PROFILE,
      columns: SOURCE_VISUAL_OVERVIEW_COLUMNS,
      rows: SOURCE_VISUAL_OVERVIEW_ROWS,
      sampleCount: SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
    },
  });
}

describe("source visual overview contract", () => {
  test("creates deterministic source and input-generation identity", () => {
    expect(
      sourceVisualOverviewIdentity({
        projectId: "project_12345678",
        sourceRevisionId: "revision_12345678",
        sourceIdentitySha256: hash("a"),
        inputGeneration: `sha256:${hash("c")}`,
      }),
    ).toContain(
      `${hash("a")}:sha256:${hash("c")}:${SOURCE_VISUAL_OVERVIEW_PROFILE}`,
    );
    const scoped = (inputDerivativeId: string) =>
      sourceVisualOverviewIdentity({
        projectId: "project_12345678",
        sourceRevisionId: "revision_12345678",
        sourceIdentitySha256: hash("a"),
        inputGeneration: `sha256:${hash("c")}`,
        inputDerivativeId,
      });
    expect(scoped("proxy_executor_a_12345678")).not.toBe(
      scoped("proxy_executor_b_12345678"),
    );
  });

  test("places samples at stable interior source times", () => {
    expect(sourceVisualOverviewSampleTimes(8)).toEqual([
      0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5,
    ]);
    expect(sourceVisualOverviewSampleTimes(0)).toEqual([]);
  });

  test("rejects target traversal and unverified input generations", () => {
    const valid = job();
    expect(() =>
      parseSourceVisualOverviewJob({
        ...valid,
        target: { ...valid.target, locator: "../escape.jpg" },
      }),
    ).toThrow();
    expect(() =>
      parseSourceVisualOverviewJob({
        ...valid,
        input: { ...valid.input, generation: "unverified" },
      }),
    ).toThrow();
  });

  test("binds a result to the exact proxy and ordered sample map", () => {
    const validJob = job();
    const result = newSourceVisualOverviewResult({
      jobId: validJob.jobId,
      derivativeId: validJob.derivativeId,
      completedAt: "2026-08-07T12:00:10.000Z",
      source: validJob.source,
      input: {
        ...validJob.input,
        observedContentSha256: validJob.input.contentSha256,
        observedSizeBytes: validJob.input.sizeBytes,
      },
      output: {
        provider: "local",
        locator:
          "/private/tmp/quipsly-media-ingest/source-story/homer-source-room/revision_12345678/contact-sheet.jpg",
        generation: `sha256:${hash("d")}`,
        contentType: "image/jpeg",
        derivativeKind: SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
        profile: SOURCE_VISUAL_OVERVIEW_PROFILE,
        sha256: hash("d"),
        sizeBytes: 5_000,
        widthPixels: 1_140,
        heightPixels: 336,
        columns: SOURCE_VISUAL_OVERVIEW_COLUMNS,
        rows: SOURCE_VISUAL_OVERVIEW_ROWS,
        sampleTimesSeconds: sourceVisualOverviewSampleTimes(
          validJob.input.durationSeconds,
        ),
      },
      worker: { executionId: "worker-1", buildId: "build-1", attempt: 1 },
    });
    expect(
      parseSourceVisualOverviewResult(result, validJob).output
        .sampleTimesSeconds,
    ).toHaveLength(8);
    expect(() =>
      parseSourceVisualOverviewResult(
        {
          ...result,
          input: { ...result.input, observedContentSha256: hash("e") },
        },
        validJob,
      ),
    ).toThrow();
  });
});
