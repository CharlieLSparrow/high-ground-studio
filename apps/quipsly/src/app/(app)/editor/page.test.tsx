import React from "react";
import { createHash, webcrypto } from "node:crypto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  beforeEach(() => {
    jest.clearAllMocks();
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
          const transcriptSha256 = createHash("sha256")
            .update(canonicalAiEditTranscript(request.transcriptBlocks || []))
            .digest("hex");
          return response({
            ok: true,
            applied: false,
            proposalSet: {
              kind: "quipsly-ai-edit-proposal-set-v1",
              version: 1,
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
              },
              provider: deterministic
                ? { kind: "deterministic", model: "quipsly-transcript-evidence-v1" }
                : { kind: "google-gemini", model: "test-model" },
              proposals: deterministic ? [] : [{
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
              reviewCandidates: deterministic ? [{
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
          }, true, 200);
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
    expect(screen.getByRole("button", { name: "Proof-watch source" })).toBeInTheDocument();
    expect(screen.getByText(/source 00:00–00:08 · original unchanged/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Proof-watch source" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Proof-watching untouched source/i);
    expect(screen.getByRole("status")).toHaveTextContent(/Nothing has been applied/i);

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
    expect(screen.queryByRole("button", { name: "Apply proposal" })).not.toBeInTheDocument();
    const analysisRequest = (globalThis.fetch as jest.Mock).mock.calls.find(([url]) => String(url).includes("/api/ai-edit"));
    expect(JSON.parse(String(analysisRequest?.[1]?.body))).toEqual(expect.objectContaining({
      analysisMode: "deterministic",
      providerDisclosureAccepted: false,
    }));

    await user.click(screen.getByRole("button", { name: "Proof-listen source" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Proof-listening to untouched source/i);
    expect(screen.getByRole("status")).toHaveTextContent(/Nothing has been applied/i);
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
