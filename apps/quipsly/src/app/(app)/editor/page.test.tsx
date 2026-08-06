import React from "react";
import { createHash, webcrypto } from "node:crypto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSearchParams } from "next/navigation";

import CloudEditor from "./page";
import { canonicalAiEditTranscript } from "@/lib/editor/ai-edit-proposal-contract";

jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));
jest.mock("@remotion/player", () => ({
  Player: () => <div aria-label="Program preview" />,
}));

function response(payload: unknown, ok = false, status = ok ? 200 : 503) {
  return Promise.resolve({
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response);
}

function productionState(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    mode: "database",
    id: "production-1",
    projectSlug: "high-ground-odyssey-manuscript",
    slug: "current-episode",
    title: "Current Episode",
    boundaryLabel: "Current Episode",
    status: "active",
    actorEmail: "editor@example.com",
    accessRole: "EDITOR",
    accessSource: "grant",
    recordingRoomJson: null,
    timelineJson: null,
    transcriptJson: null,
    productionJson: null,
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

function mockEpisodeProduction(overrides: Record<string, unknown>) {
  const previous = jest.mocked(globalThis.fetch).getMockImplementation();
  jest.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/episode-production") {
      return response(productionState(overrides), true, 200);
    }
    return previous?.(input, init) ?? response({ ok: false, error: "Unavailable" });
  });
}

describe("CloudEditor production truth UX", () => {
  let reviewReceiptSequence = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
    );
    reviewReceiptSequence = 0;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/ai-edit")) {
          const request = JSON.parse(String(init?.body || "{}")) as {
            transcriptBlocks?: Array<{ id: string; time: number; duration: number; text: string }>;
            timelineFingerprintSha256?: string;
            projectSlug?: string;
            episodeSlug?: string;
            analysisMode?: string;
          };
          const deterministic = request.analysisMode === "deterministic";
          const hasMeasuredRangeFixture = deterministic && request.transcriptBlocks?.some((block) => block.id === "range-left");
          const transcriptSha256 = createHash("sha256")
            .update(canonicalAiEditTranscript(request.transcriptBlocks || []))
            .digest("hex");
          return response({
            ok: true,
            applied: false,
            proposalSet: {
              kind: "quipsly-ai-edit-proposal-set-v2",
              version: 2,
              proposalSetId: "edit_proposal_set_test",
              createdAt: "2026-08-03T20:00:00.000Z",
              binding: {
                projectSlug: request.projectSlug,
                episodeSlug: request.episodeSlug,
                timelineFingerprintSha256: request.timelineFingerprintSha256,
                transcriptSha256,
                blockCount: request.transcriptBlocks?.length || 0,
                startSeconds: 0,
                endSeconds: 8,
                ...(hasMeasuredRangeFixture ? {
                  signalEvidence: {
                    mediaAssetKind: "capture-recording",
                    mediaAssetId: "recording-range-test",
                    sourceSha256: "a".repeat(64),
                    storageGeneration: "generation-range-test",
                    signalProfileSha256: "b".repeat(64),
                    protectedPlaybackSourceId: "source-range-test",
                  },
                } : {}),
              },
              provider: deterministic
                ? { kind: "deterministic", model: "quipsly-source-evidence-v2" }
                : { kind: "google-gemini", model: "test-model" },
              proposals: hasMeasuredRangeFixture ? [{
                proposalId: "deterministic_range_test",
                type: "deactivate_range",
                sourceRange: { startSeconds: 2, endSeconds: 5 },
                evidence: {
                  blockIds: ["range-left", "range-right"],
                  transcriptTextSha256: "e".repeat(64),
                  audioSignal: {
                    mediaAssetKind: "capture-recording",
                    mediaAssetId: "recording-range-test",
                    sourceSha256: "a".repeat(64),
                    storageGeneration: "generation-range-test",
                    signalProfileSha256: "b".repeat(64),
                    algorithm: "capture-energy-v1",
                    measuredStartSeconds: 2,
                    measuredEndSeconds: 5,
                    coverageFraction: 1,
                    maximumRmsDbfs: -78,
                    nearSilenceDbfs: -72,
                    surroundingSignalDbfs: -45,
                    classification: "measured-low-energy",
                  },
                },
                rationale: "Decoded signal confirms a measured low-energy interval for reversible review.",
                confidence: "medium",
                changesSource: false,
                applied: false,
              }] : deterministic ? [] : [{
                proposalId: "edit_proposal_test",
                type: "deactivate",
                blockId: "t2",
                sourceRange: { startSeconds: 0, endSeconds: 8 },
                evidence: { blockIds: ["t2"], transcriptTextSha256: "c".repeat(64) },
                rationale: "This is a bounded test proposal.",
                confidence: "medium",
                changesSource: false,
                applied: false,
              }],
              reviewCandidates: deterministic && !hasMeasuredRangeFixture ? [{
                candidateId: "candidate_gap_test",
                kind: "transcript-timing-gap",
                sourceRange: { startSeconds: 2, endSeconds: 5 },
                evidence: { blockIds: ["left", "right"], transcriptTextSha256: "d".repeat(64) },
                rationale: "The transcript has a 3.00 second timing gap. This is not proof of silence.",
                confidence: "low",
                suggestedAction: "listen",
                requiresSignalEvidence: true,
                changesSource: false,
              }] : [],
              boundaries: {
                sourceMediaUnchanged: true,
                proposalsOnly: true,
                proofWatchBeforeApply: true,
                staleBindingRejectsApply: true,
                noAutomaticSaveRenderOrPublish: true,
              },
            },
            ...(deterministic ? {
              signalEvidence: {
                status: hasMeasuredRangeFixture ? "available" : "unavailable",
                reason: hasMeasuredRangeFixture ? "One immutable source is available." : "No Capture recording is attached to this episode.",
                candidateCount: hasMeasuredRangeFixture ? 1 : 0,
                boundMediaAssetKind: hasMeasuredRangeFixture ? "capture-recording" : null,
                boundMediaAssetId: hasMeasuredRangeFixture ? "recording-range-test" : null,
              },
              signalVisualization: hasMeasuredRangeFixture ? {
                mediaAssetKind: "capture-recording",
                mediaAssetId: "recording-range-test",
                sourceSha256: "a".repeat(64),
                storageGeneration: "generation-range-test",
                signalProfileSha256: "b".repeat(64),
                algorithm: "capture-energy-v1",
                durationSeconds: 7,
                nearSilenceDbfs: -72,
                surroundingSignalDbfs: -45,
                protectedPlayback: {
                  sourceId: "source-range-test",
                  url: "/api/ingest/media/source-range-test",
                  kind: "audio",
                  label: "Hash-bound measured fixture",
                  durationSeconds: 7,
                },
                waveform: [{ startSeconds: 2, durationSeconds: 3, rmsDbfs: -78, samplePeakDbfs: -70, clippedFrameCount: 0 }],
              } : null,
            } : {}),
          }, true, 200);
        }
        if (url.includes("/api/editor/edit-review")) {
          if (!init?.method || init.method === "GET") {
            return response({ ok: true, productionId: "production-1", proposalSets: [], receipts: [] }, true, 200);
          }
          const review = JSON.parse(String(init.body || "{}")) as Record<string, unknown>;
          reviewReceiptSequence += 1;
          return response({
            ok: true,
            receipt: {
              id: `review-receipt-${reviewReceiptSequence}`,
              proposalSetId: review.proposalSetId,
              actorEmail: "editor@example.com",
              action: review.action,
              scope: review.action === "APPLIED_TO_DRAFT" || review.action === "RESTORED_TO_DRAFT" ? "LOCAL_DRAFT" : "REVIEW_ONLY",
              subjectId: review.subjectId,
              subjectKind: review.subjectKind,
              sourceRange: review.sourceRange,
              proposalTimelineFingerprintSha256: review.proposalTimelineFingerprintSha256,
              timelineFingerprintBeforeSha256: review.timelineFingerprintBeforeSha256,
              timelineFingerprintAfterSha256: null,
              transcriptSha256: "f".repeat(64),
              sourceSha256: null,
              storageGeneration: null,
              signalProfileSha256: null,
              evidence: review.evidence,
              occurredAt: review.occurredAt,
              createdAt: review.occurredAt,
            },
          }, true, 201);
        }
        if (url === "/api/episode-production") {
          return response(productionState(), true, 200);
        }
        return response({ ok: false, error: "Persistence unavailable in component test" });
      }),
    });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("renders the current editor modes and source/program distinction after access resolves", async () => {
    render(<CloudEditor />);

    expect(await screen.findByRole("heading", { name: /Episode Editor/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TIMELINE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TRANSCRIPT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Source Monitor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Program Monitor" })).toBeInTheDocument();
  });

  it("configures, assembles, receipts, and persists a wide-aware camera policy", async () => {
    mockEpisodeProduction({
      timelineJson: {
        payloadVersion: 5,
        projectSlug: "high-ground-odyssey-manuscript",
        episodeSlug: "current-episode",
        source: "quipsly-editor",
        timelineClips: [
          { id: "charlie-cam", assetId: "charlie.mp4", kind: "video", trackId: "V1", startIn: 0, duration: 20, sourceStart: 0, sourceEnd: 20, name: "Charlie camera", color: "#111" },
          { id: "homer-cam", assetId: "homer.mp4", kind: "video", trackId: "V2", startIn: 0, duration: 20, sourceStart: 0, sourceEnd: 20, name: "Homer camera", color: "#222" },
          { id: "wide-cam", assetId: "wide.mp4", kind: "video", trackId: "V3", startIn: 0, duration: 20, sourceStart: 0, sourceEnd: 20, name: "Wide camera", color: "#333" },
        ],
        transcript: [
          { id: "speaker-charlie", time: 0, duration: 5, text: "Opening", speaker: "Charlie", deleted: false, deactivated: false, alert: null },
          { id: "speaker-homer", time: 7, duration: 6, text: "Response", speaker: "Homer", deleted: false, deactivated: false, alert: null },
        ],
        speakerCameraMappings: [
          { id: "map-charlie", speakerKey: "charlie", speakerLabel: "Charlie", targetClipId: "charlie-cam", targetAssetId: "charlie.mp4", source: "manual", createdAt: "2026-08-07T00:00:00.000Z" },
          { id: "map-homer", speakerKey: "homer", speakerLabel: "Homer", targetClipId: "homer-cam", targetAssetId: "homer.mp4", source: "manual", createdAt: "2026-08-07T00:00:00.000Z" },
        ],
        cameraSwitchDecisions: [],
        generatedFrom: "test",
        savedAt: "2026-08-07T00:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    render(<CloudEditor />);

    expect(await screen.findByText(/Loaded Current Episode from saved timeline/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Assembly style" }), "natural-conversation");
    await user.selectOptions(screen.getByRole("combobox", { name: "Wide camera" }), "wide-cam");
    expect(screen.getByText(/shot grammar is now part of the editable timeline/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Bind current evidence" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Assemble speaker cut" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Assemble speaker cut" }));

    expect(await screen.findByText(/receipt-backed camera ranges/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Wide coverage/i).length).toBeGreaterThan(0);
    const appliedReceiptRequest = jest.mocked(globalThis.fetch).mock.calls.find(([url, init]) => String(url).includes("/api/editor/edit-review") && JSON.parse(String(init?.body || "{}")).evidence?.editKind === "deterministic-speaker-camera-cut");
    expect(JSON.parse(String(appliedReceiptRequest?.[1]?.body || "{}"))).toEqual(expect.objectContaining({
      evidence: expect.objectContaining({
        assemblyPolicy: expect.objectContaining({ style: "natural-conversation", wideClipId: "wide-cam" }),
        sourceMediaUnchanged: true,
      }),
    }));

    await user.click(screen.getByRole("button", { name: "Save Episode Timeline" }));
    await waitFor(() => {
      const saveCall = jest.mocked(globalThis.fetch).mock.calls.find(([, init]) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return body.action === "save-timeline" && body.timelineJson?.cameraAssemblyPolicy?.wideClipId === "wide-cam" && body.timelineJson?.cameraSwitchDecisions?.length > 0;
      });
      expect(saveCall).toBeDefined();
      const saved = JSON.parse(String(saveCall?.[1]?.body)).timelineJson;
      expect(saved.payloadVersion).toBe(5);
      expect(saved.cameraAssemblyPolicy).toEqual(expect.objectContaining({ style: "natural-conversation", wideClipId: "wide-cam" }));
      expect(saved.cameraSwitchDecisions).toEqual(expect.arrayContaining([expect.objectContaining({ source: "deterministic-assembly", evidence: expect.objectContaining({ policyId: "camera-assembly-policy" }) })]));
    });
  });

  it("opens an exact Capture take as a transparent source set without approving placement", async () => {
    const user = userEvent.setup();
    const captureGroupId = "55555555-5555-4555-8555-555555555555";
    const alignment = (input: {
      recordingAssetId: string;
      offsetMilliseconds: number;
      uncertaintyMilliseconds: number;
    }) => ({
      schema: "quipsly-capture-alignment-proposal-v1",
      status: "proposal-ready",
      captureGroupId,
      sourceClockEvidence: "lowest-rtt-monotonic-projection",
      method: "lowest-rtt-monotonic-server-projection-v1",
      estimatedServerStartedAt: "2026-08-05T05:00:00.000Z",
      uncertaintyMilliseconds: input.uncertaintyMilliseconds,
      sampleAccurateClaimed: false,
      reviewRequired: true,
      reviewGate: {
        waveformCorrelationRequired: true,
        driftReviewRequired: true,
        humanApprovalRequired: true,
      },
      captureGroup: {
        baselineRecordingAssetId: "recording-audio",
        baselineEstimatedServerStartedAt: "2026-08-05T05:00:00.000Z",
        estimatedOffsetMilliseconds: input.offsetMilliseconds,
        proposalSourceCount: 2,
        sampleAccurateClaimed: false,
      },
      clockDriftEvidence: {
        status: "measured",
        openingSampleId: `opening-${input.recordingAssetId}`,
        laterSampleId: `later-${input.recordingAssetId}`,
        observationIntervalSeconds: 3600,
        residualDriftMilliseconds: 12,
        observedPartsPerMillion: 3.333,
        uncertaintyMilliseconds: 99,
        sampleAccurateClaimed: false,
      },
      startBoundary: { receiptId: `start-${input.recordingAssetId}` },
      reason: "Clock evidence is ready for waveform, drift, and human review.",
    });
    jest.mocked(useSearchParams).mockReturnValue(new URLSearchParams({
      project: "high-ground-odyssey",
      episode: "episode-9",
      captureGroup: captureGroupId,
    }) as unknown as ReturnType<typeof useSearchParams>);
    mockEpisodeProduction({
      projectSlug: "high-ground-odyssey",
      slug: "episode-9",
      title: "Episode 9",
      productionJson: {
        importedMedia: [
          {
            id: "asset-audio",
            sourceId: "source-audio",
            originalName: "Homer clean audio.m4a",
            contentType: "audio/mp4",
            kind: "audio",
            playbackUrl: "/api/ingest/media/source-audio",
            importedAt: "2026-08-05T05:01:00.000Z",
            importRole: "phone-audio",
            sync: {
              recordingAssetId: "recording-audio",
              recordingSync: { recordingAssetId: "recording-audio", captureGroupId },
              alignment: alignment({ recordingAssetId: "recording-audio", offsetMilliseconds: 0, uncertaintyMilliseconds: 6.2 }),
            },
          },
          {
            id: "asset-video",
            sourceId: "source-video",
            originalName: "Homer iPhone 4K.mov",
            contentType: "video/quicktime",
            kind: "video",
            playbackUrl: "/api/ingest/media/source-video",
            importedAt: "2026-08-05T05:01:01.000Z",
            importRole: "camera-video",
            sync: {
              recordingAssetId: "recording-video",
              recordingSync: { recordingAssetId: "recording-video", captureGroupId },
              alignment: alignment({ recordingAssetId: "recording-video", offsetMilliseconds: 240, uncertaintyMilliseconds: 8.5 }),
            },
          },
        ],
      },
    });

    render(<CloudEditor />);

    expect(await screen.findByText("Opened from Capture — exact take focused")).toBeInTheDocument();
    const sourceSet = screen.getByRole("region", { name: "Capture take source set" });
    expect(within(sourceSet).getByText("Homer clean audio.m4a")).toBeInTheDocument();
    expect(within(sourceSet).getByText("Homer iPhone 4K.mov")).toBeInTheDocument();
    expect(within(sourceSet).getByText("2 sources")).toBeInTheDocument();
    expect(within(sourceSet).getByText(/provider room mix, when present, is an optional witness/i)).toBeInTheDocument();
    expect(within(sourceSet).getByText("Group baseline")).toBeInTheDocument();
    expect(within(sourceSet).getByText("+0.240s from baseline · ±8.5ms")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(sourceSet).getByText("Spine selection")).toBeInTheDocument();
      expect(within(sourceSet).getByText("Target selection")).toBeInTheDocument();
    });
    expect(within(sourceSet).queryByText("Reviewed sync")).not.toBeInTheDocument();
    expect(screen.getAllByText(/No placement or episode-spine decision has been made/i).length).toBeGreaterThan(0);

    const clockWitness = await screen.findByTestId("guided-sync-clock-drift-evidence");
    expect(within(clockWitness).getByText("Device-clock drift witness")).toBeInTheDocument();
    expect(within(clockWitness).getByText(/survives with provider recording off/i)).toBeInTheDocument();
    expect(within(clockWitness).getByText("3600.000 s")).toBeInTheDocument();
    expect(within(clockWitness).getByText("+12.000 ms")).toBeInTheDocument();
    await user.click(within(clockWitness).getByRole("button", { name: "Use as comparison start" }));
    expect(screen.getByLabelText("Seconds between review points")).toHaveValue(3600);
    expect(screen.getByLabelText("Residual drift at later point (ms)")).toHaveValue(12);
    expect(screen.getByLabelText(/Later event compared/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Approve this reversible placement/i)).not.toBeChecked();
    expect(screen.getByText(/no timeline placement changed/i)).toBeInTheDocument();
    const exactAlignment = screen.getByTestId("exact-source-audio-alignment-status");
    expect(within(exactAlignment).getByText("Two-point exact-source alignment")).toBeInTheDocument();
    expect(within(exactAlignment).getByText(/creates evidence only/i)).toBeInTheDocument();
    expect(within(exactAlignment).getByRole("button", { name: "Analyze exact sources" })).toBeDisabled();
    expect(screen.getByLabelText(/Approve this reversible placement/i)).not.toBeChecked();
  });

  it("opens the paper edit from the transcript mode control", async () => {
    const user = userEvent.setup();
    render(<CloudEditor />);

    await screen.findByRole("heading", { name: /Episode Editor/i });
    await user.click(screen.getByRole("button", { name: "TRANSCRIPT" }));

    expect(screen.getByRole("heading", { name: "Paper Edit" })).toBeInTheDocument();
    expect(screen.getByText(/Shift\+Click a block/i)).toBeInTheDocument();
  });

  it("shows the honest render-worker boundary without queuing a fake job", async () => {
    const user = userEvent.setup();
    render(<CloudEditor />);

    await screen.findByRole("heading", { name: /Episode Editor/i });
    await user.click(screen.getByRole("button", { name: "Render & Export..." }));

    expect(screen.getByRole("dialog", { name: "Web rendering is not connected yet" })).toBeInTheDocument();
    expect(screen.getByText(/Quipsly will not pretend this timeline was packaged or rendered/i)).toBeInTheDocument();
    expect(screen.getByText("No job queued")).toBeInTheDocument();
    expect(screen.queryByText("Render Package Ready")).not.toBeInTheDocument();
  });

  it("discloses the provider handoff and returns proposals without auto-applying them", async () => {
    mockEpisodeProduction({
      transcriptJson: {
        blocks: [{ id: "t2", time: 0, duration: 8, text: "A real transcript block for proposal review." }],
      },
    });
    const user = userEvent.setup();
    render(<CloudEditor />);

    await screen.findByRole("heading", { name: /Episode Editor/i });
    await screen.findByText(/Loaded Current Episode from transcript payload/i);
    await user.click(screen.getByRole("button", { name: "Suggest edits" }));

    expect(screen.getByRole("alertdialog", { name: "Send this transcript for suggestions?" })).toBeInTheDocument();
    expect(screen.getByText(/nothing changes until you apply one here/i)).toBeInTheDocument();
    expect((globalThis.fetch as jest.Mock).mock.calls.some(([url]) => String(url).includes("/api/ai-edit"))).toBe(false);

    await user.click(screen.getByRole("button", { name: "Send for suggestions" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Edit evidence and proposals" })).toBeInTheDocument());
    expect(screen.getByText(/Nothing has been applied/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply proposal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Proof-watch source for proposal/i })).toBeInTheDocument();
    expect(screen.getByText(/source 00:00–00:08 · original unchanged/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Proof-watch source for proposal/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Proof-watching untouched source/i);
    expect(screen.getByRole("status")).toHaveTextContent(/00:00 to 00:08/i);
    expect(screen.getByRole("status")).toHaveTextContent(/Nothing has been applied/i);
    expect(screen.getByRole("region", { name: "Durable edit review history" })).toHaveTextContent(/PROOF WATCHED/i);

    await user.click(screen.getByRole("button", { name: "Apply proposal" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Transcript cut applied to the editable timeline/i);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Timeline undo completed/i);
    expect(screen.getByRole("status")).toHaveTextContent(/source media was never changed/i);
  });

  it("analyzes timing evidence locally without opening provider disclosure", async () => {
    mockEpisodeProduction({
      transcriptJson: {
        blocks: [
          { id: "left", time: 0, duration: 2, text: "The first complete thought." },
          { id: "right", time: 5, duration: 2, text: "The next complete thought." },
        ],
      },
    });
    const user = userEvent.setup();
    render(<CloudEditor />);

    await screen.findByText(/Loaded Current Episode from transcript payload/i);
    await user.click(screen.getByRole("button", { name: "Analyze locally" }));

    expect(screen.queryByRole("alertdialog", { name: "Send this transcript for suggestions?" })).not.toBeInTheDocument();
    expect(await screen.findByText("Transcript timing gap")).toBeInTheDocument();
    expect(screen.getByText(/Timing evidence only—not confirmed silence/i)).toBeInTheDocument();
    expect(screen.getByText(/Decoded signal: unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply proposal" })).not.toBeInTheDocument();
    const analysisRequest = (globalThis.fetch as jest.Mock).mock.calls.find(([url]) => String(url).includes("/api/ai-edit"));
    expect(JSON.parse(String(analysisRequest?.[1]?.body))).toEqual(expect.objectContaining({
      analysisMode: "deterministic",
      providerDisclosureAccepted: false,
    }));

    await user.click(screen.getByRole("button", { name: /Proof-listen source for evidence/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Proof-listening to untouched source/i);
    expect(screen.getByRole("status")).toHaveTextContent(/00:00 to 00:06/i);
    expect(screen.getByRole("status")).toHaveTextContent(/Nothing has been applied/i);
  });

  it("persists, proof-listens, restores, and undoes a measured range decision without changing source media", async () => {
    mockEpisodeProduction({
      transcriptJson: {
        blocks: [
          { id: "range-left", time: 0, duration: 2, text: "The first complete thought.", speaker: "Charlie" },
          { id: "range-right", time: 5, duration: 2, text: "The next complete thought.", speaker: "Homer" },
        ],
      },
    });
    const user = userEvent.setup();
    const play = jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(<CloudEditor />);

    await screen.findByText(/Loaded Current Episode from transcript payload/i);
    await user.click(screen.getByRole("button", { name: "Analyze locally" }));

    expect(await screen.findByText("Proposed low-energy range skip at 00:02")).toBeInTheDocument();
    expect(screen.getByText(/Decoded coverage 100% · strongest RMS window -78.0 dBFS/i)).toBeInTheDocument();
    expect(screen.getByText(/Applying creates reversible timeline metadata only/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play bound source" }));
    const protectedSource = screen.getByLabelText("Protected automated edit source");
    Object.defineProperty(protectedSource, "currentTime", { configurable: true, value: 2.5, writable: true });
    fireEvent.timeUpdate(protectedSource);
    await user.click(screen.getByRole("checkbox", { name: /I listened inside this exact source range/i }));
    await user.click(screen.getByRole("button", { name: "Record proof-listen" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Proof-listened through the exact protected Capture recording/i);
    expect(screen.queryByRole("region", { name: "Exact range edit decisions" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply proposal" }));
    const ledger = await screen.findByRole("region", { name: "Exact range edit decisions" });
    expect(ledger).toHaveTextContent("00:02–00:05 · 00:03 skipped");
    expect(ledger).toHaveTextContent("decoded signal bound");
    expect(screen.getByText(/1 deactivated section · 1 exact range/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save Episode Timeline" }));
    await waitFor(() => {
      const saveCall = jest.mocked(globalThis.fetch).mock.calls.find(([, init]) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return body.action === "save-timeline" && body.timelineJson?.deactivatedRanges?.length === 1;
      });
      expect(saveCall).toBeDefined();
      const saved = JSON.parse(String(saveCall?.[1]?.body)).timelineJson;
      expect(saved.payloadVersion).toBe(5);
      expect(saved.deactivatedRanges[0]).toEqual(expect.objectContaining({
        startSeconds: 2,
        durationSeconds: 3,
        source: "deterministic-signal",
        sourceEvidence: expect.objectContaining({
          sourceSha256: "a".repeat(64),
          signalProfileSha256: "b".repeat(64),
        }),
      }));
      expect(saved.transcript).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "range-left", speaker: "Charlie", deactivated: false }),
      ]));
      const saveBody = JSON.parse(String(saveCall?.[1]?.body));
      expect(saveBody.editReviewSaveRequestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(saveBody.editReviewReceiptIds).toEqual(expect.arrayContaining([expect.stringMatching(/^review-receipt-/)]));
      expect(saveBody.timelineFingerprintBeforeSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(saveBody.timelineFingerprintAfterSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    await user.click(screen.getByRole("button", { name: "Restore to edit" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Restored 00:02–00:05 to the active edit/i);
    expect(screen.queryByRole("region", { name: "Exact range edit decisions" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("region", { name: "Exact range edit decisions" })).toBeInTheDocument();
    play.mockRestore();
  });

  it("keeps a new episode honestly empty instead of injecting sample media or a representative cut", async () => {
    render(<CloudEditor />);

    expect(await screen.findByText("Current Episode has no saved timeline or playable recording media yet.")).toBeInTheDocument();
    expect(screen.getByText("No timeline sources yet.")).toBeInTheDocument();
    expect(screen.getByText("No media assets available.")).toBeInTheDocument();
    expect(screen.queryByText("Episode 4 Intro Audio")).not.toBeInTheDocument();
    expect(screen.queryByText("B-Roll: Coffee Pour")).not.toBeInTheDocument();
    expect(screen.queryByText(/audio spine \(placeholder\)/i)).not.toBeInTheDocument();
  });

  it("materializes a played source clip at its structured recording timestamp", async () => {
    mockEpisodeProduction({
      recordingRoomJson: {
        payloadVersion: 2,
        version: "quipsly-recording-room.v1",
        roomName: "Curiosity rehearsal",
        durationMs: 60_000,
        clips: [{
          id: "clip-be-curious",
          title: "Be Curious",
          url: "https://www.youtube.com/watch?v=example",
          segments: [{ id: "segment-opening", start: "0:02", end: "0:18", note: "Opening reaction" }],
        }],
        events: [{
          id: "event-played-opening",
          kind: "clip",
          label: "Played Be Curious 0:02-0:18",
          atMs: 12_000,
          note: "Opening reaction",
          clipPlayback: {
            clipId: "clip-be-curious",
            segmentId: "segment-opening",
            sourceUrl: "https://www.youtube.com/watch?v=example",
            sourceStartSeconds: 2,
            sourceEndSeconds: 18,
          },
        }],
        tracks: [],
      },
    });

    render(<CloudEditor />);

    expect(await screen.findByText("Loaded Current Episode from recording room")).toBeInTheDocument();
    expect((await screen.findAllByText(/Be Curious.*00:02-00:18/)).length).toBeGreaterThan(0);
    expect(screen.queryByText("No timeline sources yet.")).not.toBeInTheDocument();
    expect(screen.queryByText(/audio spine \(placeholder\)/i)).not.toBeInTheDocument();
  });

  it("projects receipt-backed Shared Watch spans into the production timeline", async () => {
    const user = userEvent.setup();
    mockEpisodeProduction({
      timelineJson: {
        payloadVersion: 2,
        contentFingerprint: "saved-base-fingerprint",
        projectSlug: "high-ground-odyssey-manuscript",
        episodeSlug: "current-episode",
        timelineClips: [{
          id: "primary-camera",
          assetId: "camera-asset",
          trackId: "V1",
          kind: "video",
          startIn: 0,
          duration: 60,
          sourceStart: 0,
          sourceEnd: 60,
          name: "Primary camera",
          color: "#2563eb",
        }],
        transcript: [],
      },
      productionJson: {
        episodeRoom: { timelineSync: { sourceRevision: 7, segmentCount: 1 } },
        timelineClips: [{
          id: "episode-room-watch-segment-1",
          assetId: "vault-curiosity",
          trackId: "V9",
          kind: "video",
          startIn: 12,
          duration: 8,
          sourceStart: 2,
          sourceEnd: 10,
          name: "Watched · Be Curious",
          color: "#d37b43",
          generatedFrom: "quipsly-episode-room-watch.v1",
          recordingSync: {
            episodeRoomSessionId: "episode-room-session-1",
            recordingRoomId: "capture-room-1",
            recordingStartedAt: "2026-07-31T12:00:00.000Z",
            watchSegmentId: "segment-1",
            startReceiptId: "receipt-play-1",
            endReceiptId: "receipt-pause-1",
            watchedAt: "2026-07-31T12:00:12.000Z",
          },
        }],
      },
    });

    render(<CloudEditor />);

    expect(await screen.findByText(
      "Loaded Current Episode from saved timeline with 1 Shared Watch span",
    )).toBeInTheDocument();
    expect((await screen.findAllByText("Watched · Be Curious")).length).toBeGreaterThan(0);
    expect(screen.getByText("1 receipt-backed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save Episode Timeline" }));
    await waitFor(() => {
      const saveCall = jest.mocked(globalThis.fetch).mock.calls.find(([, init]) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return body.action === "save-timeline";
      });
      expect(saveCall).toBeDefined();
      const body = JSON.parse(String(saveCall?.[1]?.body));
      expect(body.expectedTimelineFingerprint).toBe("saved-base-fingerprint");
      expect(body.timelineJson.timelineClips[1]).toMatchObject({
        id: "episode-room-watch-segment-1",
        generatedFrom: "quipsly-episode-room-watch.v1",
        recordingSync: {
          watchSegmentId: "segment-1",
          startReceiptId: "receipt-play-1",
          endReceiptId: "receipt-pause-1",
        },
      });
    });
  });

  it("does not manufacture a canonical timeline save while hydrating older persisted shapes", async () => {
    mockEpisodeProduction({
      timelineJson: {
        payloadVersion: 3,
        // Deliberately represents an older embedded fingerprint. Hydration may
        // normalize the local editor state, but opening is still read-only.
        contentFingerprint: "older-persisted-fingerprint",
        projectSlug: "high-ground-odyssey-manuscript",
        episodeSlug: "current-episode",
        timelineClips: [{
          id: "primary-camera",
          assetId: "camera-asset",
          trackId: "V1",
          kind: "video",
          startIn: 0,
          duration: 60,
          sourceStart: 0,
          sourceEnd: 60,
          name: "Primary camera",
          color: "#2563eb",
        }],
        transcript: [],
      },
    });

    render(<CloudEditor />);
    expect(await screen.findByText("Loaded Current Episode from saved timeline")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const saveCalls = jest.mocked(globalThis.fetch).mock.calls.filter(([, init]) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return body.action === "save-timeline";
    });
    expect(saveCalls).toHaveLength(0);
  });

  it("probes a timeline derivative through its canonical imported-media playback URL", async () => {
    mockEpisodeProduction({
      timelineJson: {
        payloadVersion: 3,
        projectSlug: "high-ground-odyssey",
        episodeSlug: "episode-8-i-wasnt-born-a-leader",
        timelineClips: [{
          id: "episode-room-watch-be-curious",
          assetId: "vault-asset-be-curious",
          trackId: "V9",
          kind: "video",
          startIn: 9.064,
          duration: 13.182,
          sourceStart: 0,
          sourceEnd: 13.182,
          name: "Watched · Ted Lasso Be Curious.mp4",
          color: "#d37b43",
          generatedFrom: "quipsly-episode-room-watch.v1",
        }],
        transcript: [],
      },
      productionJson: {
        importedMedia: [{
          id: "vault-asset-be-curious",
          sourceId: "ingest-source-be-curious",
          projectSlug: "high-ground-odyssey",
          episodeSlug: "episode-8-i-wasnt-born-a-leader",
          originalName: "Ted Lasso Be Curious.mp4",
          contentType: "video/mp4",
          size: 19_100_059,
          kind: "video",
          gcsUri: "gcs://quipsly-media/be-curious.mp4",
          playbackUrl: "/api/ingest/media/ingest-source-be-curious",
          importedAt: "2026-08-02T00:00:00.000Z",
        }],
      },
    });

    render(<CloudEditor />);

    await waitFor(() => {
      const healthCall = jest.mocked(globalThis.fetch).mock.calls.find(([url]) => (
        String(url) === "/api/episode-production/media-health"
      ));
      expect(healthCall).toBeDefined();
      const body = JSON.parse(String(healthCall?.[1]?.body));
      expect(body.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "clip:episode-room-watch-be-curious",
          sourceUrl: "/api/ingest/media/ingest-source-be-curious",
          expectedKind: "video",
        }),
      ]));
      expect(body.items).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "clip:episode-room-watch-be-curious",
          sourceUrl: "vault-asset-be-curious",
        }),
      ]));
    });
  });

  it("loads a transcript-only saved artifact without borrowing demo clips", async () => {
    mockEpisodeProduction({
      timelineJson: {
        payloadVersion: 3,
        projectSlug: "high-ground-odyssey-manuscript",
        episodeSlug: "current-episode",
        timelineClips: [],
        transcript: [{ id: "real-line", time: 4, duration: 3, text: "The retained transcript is the only edit evidence." }],
      },
    });
    const user = userEvent.setup();
    render(<CloudEditor />);

    await screen.findByText("Loaded Current Episode from saved timeline");
    await user.click(screen.getByRole("button", { name: "TRANSCRIPT" }));

    expect(screen.getByText("retained")).toBeInTheDocument();
    expect(screen.getByText("evidence.")).toBeInTheDocument();
    expect(screen.getByText("No timeline sources yet.")).toBeInTheDocument();
    expect(screen.queryByText("A-Roll_Take_1")).not.toBeInTheDocument();
  });

  it("does not paint a representative timeline when Nest access is denied", async () => {
    jest.mocked(globalThis.fetch).mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === "/api/episode-production") {
        return response({
          ok: true,
          mode: "fallback",
          id: "fallback-private",
          projectSlug: "private-nest",
          slug: "current-episode",
          title: "Current Episode",
          boundaryLabel: "Current Episode",
          status: "access-denied",
          message: "You do not have access to this Nest.",
        }, true, 200);
      }
      return response({ ok: false, error: "Unavailable" });
    });

    render(<CloudEditor />);

    expect(await screen.findByRole("heading", { name: "This Nest editor is private." })).toBeInTheDocument();
    expect(screen.getByText(/No timeline, transcript, media, or representative starter content was loaded/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Episode Editor/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Episode 4 Intro Audio")).not.toBeInTheDocument();
  });
});
