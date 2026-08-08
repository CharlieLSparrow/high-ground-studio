import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type {
  EpisodeEditDeskPayload,
  EpisodeProgramRenderPlan,
  EpisodeRenderPlan,
} from "@/lib/editor/program-edit-contract";
import type { VerifiedAdvancedStudioHandoff } from "./AdvancedStudioHandoffBanner";
import { ExportQueueModule } from "./ExportQueueModule";

const branchFingerprint = "a".repeat(64);
const timelineFingerprint = "b".repeat(64);
const sourceFingerprint = "c".repeat(64);

const payload: EpisodeEditDeskPayload = {
  inspectionFresh: true,
  projectId: "project-1",
  projectSlug: "high-ground-odyssey",
  timelineFingerprint: "timeline-1",
  timelineFingerprintSha256: timelineFingerprint,
  episodes: [],
  selectedEpisode: {
    id: "episode-1",
    slug: "episode-9",
    title: "Episode 9",
    status: "draft",
    updatedAt: "2026-08-08T12:00:00.000Z",
  },
  baseline: null,
  branch: {
    id: "branch-1",
    slug: "shared-editor-cut",
    name: "Shared editor cut",
    headRevision: 7,
    stateFingerprint: branchFingerprint,
    updatedAt: "2026-08-08T12:00:00.000Z",
  },
  state: {
    version: "quipsly-program-edit.v1",
    durationSeconds: 120,
    sources: [],
    sourceProjectionFingerprint: sourceFingerprint,
    programDecisions: [],
  },
  watchDerivatives: [],
  annotations: [],
  transcript: {
    status: "unavailable",
    reason: "Not available.",
    sourceFormat: null,
    segmentCount: 0,
    reviewedSegmentCount: 0,
    segments: [],
  },
  mediaChoices: [],
  selectedMediaAssetId: null,
  signalInspection: {
    status: "unavailable",
    reason: "Not available.",
    candidateCount: 0,
    evidence: null,
  },
  executionInspection: {
    browser: { status: "ready", detail: "Browser ready." },
    native: { status: "observed", detail: "Mac ready." },
    workers: [],
    jobs: [],
  },
  document: null,
  canEdit: true,
};

const handoff: VerifiedAdvancedStudioHandoff = {
  request: {
    schema: "quipsly-episode-studio-handoff-v1",
    projectSlug: "high-ground-odyssey",
    episodeSlug: "episode-9",
    branchId: "branch-1",
    branchRevision: 7,
    branchFingerprint,
    timelineFingerprintSha256: timelineFingerprint,
    sourceProjectionFingerprint: sourceFingerprint,
    sequenceAtSeconds: 42.25,
    storyCardId: null,
    storyPlacementId: null,
  },
  payload,
};

const plan: EpisodeRenderPlan = {
  schema: "quipsly-episode-render-plan-v1",
  branchRevision: 7,
  renderProfile: "proof-10s",
  profileLabel: "Fast proof",
  profileDescription: "Ten seconds for checking picture and sound.",
  sequenceStartSeconds: 42.25,
  sequenceEndSeconds: 52.25,
  durationSeconds: 10,
  output: {
    width: 1280,
    height: 720,
    fps: 24,
    videoCodec: "h264",
    audioCodec: "aac",
  },
  sources: {
    requiredCount: 2,
    browserPlayableCount: 2,
    exactLocalCount: 2,
    totalBytes: 2_097_152,
    labels: ["Charlie", "Homer"],
  },
  executors: [{
    id: "local-mac",
    label: "Wall-E Mac",
    executorNodeId: "execution_worker_test",
    artifactPortability: "executor-local",
    status: "ready",
    canQueue: true,
    detail: "This Mac owns both exact sources.",
    costKind: "none",
    costDetail: "No cloud compute",
    qualityDetail: "Exact local source bytes",
  }],
  boundaries: {
    createsNoJob: true,
    sourceMediaRemainsImmutable: true,
    cloudUploadNotStarted: true,
    publicationNotStarted: true,
  },
};

const programPlan: EpisodeProgramRenderPlan = {
  schema: "quipsly-episode-program-render-plan-v1",
  branchRevision: 7,
  renderProfile: "episode-program-review-1280x720-24fps-v1",
  profileLabel: "Full program review",
  profileDescription: "One exact-source review candidate of the complete Play Edit.",
  program: {
    sequenceDurationSeconds: 120,
    outputDurationSeconds: 110,
    skippedDurationSeconds: 10,
    chunkCount: 4,
    visibleDecisionCount: 3,
  },
  output: {
    width: 1280,
    height: 720,
    fps: 24,
    videoCodec: "h264",
    audioCodec: "aac",
  },
  sources: {
    requiredCount: 2,
    exactLocalCount: 2,
    totalBytes: 2_097_152,
    labels: ["Charlie", "Homer"],
  },
  executor: {
    id: "local-mac",
    label: "Wall-E Mac",
    executorNodeId: "execution_worker_test",
    artifactPortability: "executor-local",
    status: "ready",
    canQueue: true,
    detail: "This Mac owns every exact source generation.",
    costKind: "none",
    costDetail: "No cloud compute",
    qualityDetail: "Exact local source bytes",
  },
  boundaries: {
    createsNoJob: true,
    sourceMediaRemainsImmutable: true,
    outputIsNotApprovedMaster: true,
    publicationNotStarted: true,
  },
};

function response(value: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => value } as Response);
}

function subject(verifiedHandoff: VerifiedAdvancedStudioHandoff | null = handoff) {
  return render(<ExportQueueModule
    isOpen
    onClose={jest.fn()}
    timelineDurationSeconds={120}
    totalClips={4}
    projectSlug="high-ground-odyssey"
    episodeSlug="episode-9"
    sequenceAtSeconds={42.25}
    verifiedHandoff={verifiedHandoff}
  />);
}

describe("Advanced Studio render readiness", () => {
  afterEach(() => {
    Reflect.deleteProperty(global, "fetch");
  });

  it("refuses to guess a branch when the editor was not opened from a verified Episode", () => {
    global.fetch = jest.fn();
    subject(null);

    expect(screen.getByText("Open this Studio from the Episode workspace")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Episode editor" })).toHaveAttribute(
      "href",
      "/nests/high-ground-odyssey/episodes/episode-9?mode=edit",
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("plans an exact-revision review without presenting it as a final export", async () => {
    global.fetch = jest.fn(() => response({ ...payload, operationResult: plan }));
    subject();

    expect(await screen.findByText("Review render readiness")).toBeInTheDocument();
    expect(await screen.findByText("Wall-E Mac")).toBeInTheDocument();
    expect(screen.getByText(/2\/2 exact here/)).toBeInTheDocument();
    expect(screen.getByText(/does not export a final master/)).toBeInTheDocument();
    expect(screen.getByText(/No job, upload, cloud compute, or publication was started/)).toBeInTheDocument();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0];
    expect(request[0]).toBe("/api/nests/high-ground-odyssey/episode-editor");
    expect(JSON.parse(request[1].body)).toEqual(expect.objectContaining({
      action: "plan-render-proof",
      episodeSlug: "episode-9",
      expectedRevision: 7,
      sequenceTime: 42.25,
      renderProfile: "proof-10s",
    }));
  });

  it("queues the named executor and retains a durable job identity", async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(() => response({ ...payload, operationResult: plan }))
      .mockImplementationOnce(() => response({
        ...payload,
        executionInspection: {
          ...payload.executionInspection,
          jobs: [{
            id: "episode_render_job_12345678",
            type: "episode-render-proof",
            status: "queued",
            lane: "local-worker",
            provider: "local",
            updatedAt: "2026-08-08T12:00:01.000Z",
            completedAt: null,
            error: null,
            manifestSha256: "d".repeat(64),
            renderProfile: "proof-10s",
            branchRevision: 7,
            proofStartSeconds: 42.25,
            proofEndSeconds: 52.25,
            progress: null,
            playbackUrl: null,
          }],
        },
        operationResult: {
          job: {
            id: "episode_render_job_12345678",
            status: "queued",
            branchRevision: 7,
            manifestSha256: "d".repeat(64),
          },
        },
      }));
    subject();

    fireEvent.click(await screen.findByRole("button", {
      name: "Render fast proof on Wall-E Mac",
    }));

    expect(await screen.findByText("Durable render job")).toBeInTheDocument();
    expect(screen.getByText("episode_render_job_12345678")).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const queueRequest = (global.fetch as jest.Mock).mock.calls[1];
    expect(JSON.parse(queueRequest[1].body)).toEqual(expect.objectContaining({
      action: "queue-render-proof",
      expectedRevision: 7,
      executorNodeId: "execution_worker_test",
    }));
  });

  it("plans and queues the complete Play Edit without claiming approval", async () => {
    global.fetch = jest.fn()
      .mockImplementationOnce(() => response({ ...payload, operationResult: plan }))
      .mockImplementationOnce(() => response({ ...payload, operationResult: programPlan }))
      .mockImplementationOnce(() => response({
        ...payload,
        executionInspection: {
          ...payload.executionInspection,
          jobs: [{
            id: "episode_program_job_12345678",
            type: "episode-program-render",
            status: "processing",
            lane: "local-worker",
            provider: "local",
            updatedAt: "2026-08-08T12:00:01.000Z",
            completedAt: null,
            error: null,
            manifestSha256: "e".repeat(64),
            renderProfile: "episode-program-review-1280x720-24fps-v1",
            branchRevision: 7,
            proofStartSeconds: null,
            proofEndSeconds: null,
            progress: {
              completedUnits: 1,
              totalUnits: 4,
              fraction: 0.25,
              unit: "chunks",
            },
            playbackUrl: null,
          }],
        },
        operationResult: {
          job: {
            id: "episode_program_job_12345678",
            status: "processing",
            branchRevision: 7,
            manifestSha256: "e".repeat(64),
          },
        },
      }));
    subject();

    await screen.findByText(/2\/2 exact here/);
    fireEvent.click(await screen.findByRole("button", { name: "Check full program" }));
    expect(await screen.findByText("1:50")).toBeInTheDocument();
    expect(screen.getByText("0:10")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/creates no approval receipt/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "Render full program on Wall-E Mac",
    }));

    expect(await screen.findByText("episode_program_job_12345678")).toBeInTheDocument();
    expect(screen.getByText("1 of 4 chunks assembled")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body)).toEqual(expect.objectContaining({
      action: "plan-program-render",
      expectedRevision: 7,
      executorNodeId: "execution_worker_test",
    }));
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[2][1].body)).toEqual(expect.objectContaining({
      action: "queue-program-render",
      expectedRevision: 7,
      executorNodeId: "execution_worker_test",
    }));
  });
});
