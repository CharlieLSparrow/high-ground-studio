import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionReviewClient } from "./session-review-client";
import type { SessionReviewCandidate, SessionReviewGoalCandidate, SessionReviewNoteCandidate, SessionReviewPacket } from "./session-review-model";
import type { SessionSourceEvidence } from "./session-source-evidence-model";
import { buildSessionSourceClockAttention } from "./session-source-clock-attention";

jest.mock("./transcript-correction-desk", () => ({ TranscriptCorrectionDesk: () => <div>Exact transcript desk</div> }));
jest.mock("./session-source-alignment-card", () => ({
  SessionSourceAlignmentCard: () => <div>Source alignment evidence</div>,
}));
jest.mock("./coaching-session-plan-card", () => ({
  CoachingSessionPlanCard: () => <div>Optional coaching Session plan</div>,
}));
jest.mock("@/components/session-invitations", () => ({ SessionInvitations: () => <div>Session invitation manager</div> }));
const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRouterRefresh }) }));

const candidate: SessionReviewGoalCandidate = {
  id: "packet-goal-build-1-segment-1",
  clientRequestId: "packet-goal-build-1-segment-1",
  roomId: "room-1",
  transcriptJobId: "job-1",
  recordingAssetId: "asset-1",
  packetBuildId: "build-1",
  segmentId: "segment-1",
  speakerLabel: "Homer",
  startSeconds: 12.4,
  endSeconds: 17.8,
  sourceText: "My goal is to build a repeatable coaching review habit.",
  providerTextSha256: "a".repeat(64),
  transcriptReviewStatus: "human-reviewed",
  suggestedTitle: "Build a repeatable coaching review habit.",
  suggestedDescription: "My goal is to build a repeatable coaching review habit.",
  reviewStatus: "READY_FOR_HUMAN_REVIEW",
  humanApprovalRequired: true,
  committedGoalId: null,
};

const actionCandidate: SessionReviewCandidate = {
  id: "action-candidate-1",
  title: "Send the revised episode outline",
  detail: "Share the source-backed outline after the coaching review.",
  transcriptJobId: "job-1",
  recordingAssetId: "asset-1",
  roomId: "room-1",
  packetBuildId: "build-1",
  segmentId: "segment-1",
  speakerLabel: "Homer",
  startSeconds: 12.4,
  endSeconds: 17.8,
  transcriptReviewStatus: "human-reviewed",
  reviewStatus: "READY_FOR_HUMAN_REVIEW",
  humanApprovalRequired: true,
  committedActionItemId: null,
};

const noteCandidate: SessionReviewNoteCandidate = {
  id: "packet-note-build-1-coaching-insights-segment-1",
  clientRequestId: "packet-note-build-1-coaching-insights-segment-1",
  roomId: "room-1",
  transcriptJobId: "job-1",
  recordingAssetId: "asset-1",
  summaryNoteId: "summary-1",
  packetBuildId: "build-1",
  laneId: "coaching-insights",
  laneLabel: "Insights and decisions",
  laneStatus: "READY_FOR_HUMAN_REVIEW",
  segmentId: "segment-1",
  speakerLabel: "Homer",
  startSeconds: 12.4,
  endSeconds: 17.8,
  sourceText: "I realized the weekly review makes follow-through visible.",
  providerTextSha256: "a".repeat(64),
  acceptedReviewId: "verification-1",
  acceptedCorrectionId: null,
  transcriptReviewStatus: "human-reviewed",
  suggestedTitle: "Insights and decisions",
  suggestedBody: "I realized the weekly review makes follow-through visible.",
  suggestedKind: "SESSION_NOTE",
  suggestedVisibility: "AUTHOR_PRIVATE",
  reviewStatus: "READY_FOR_HUMAN_REVIEW",
  humanApprovalRequired: true,
  committedNoteId: null,
};

function packet(goalCandidate = candidate): SessionReviewPacket {
  return {
    ok: true,
    room: { id: "room-1", title: "Coaching review", purpose: "COACHING", status: "ENDED" },
    transcriptJob: { id: "job-1", status: "COMPLETED", provider: "deepgram", segmentCount: 1, asset: { id: "asset-1", fileName: "session.m4a", status: "VERIFIED", kind: "AUDIO" } },
    transcriptProcessingGate: { allowed: true },
    packet: {
      status: "READY_FOR_REVIEW",
      build: { packetBuildId: "build-1", correlationMode: "PACKET_BUILD_ID" },
      summary: {
        id: "summary-1",
        title: "Session brief",
        body: "Candidate goals require review.",
        source: {
          packetBrief: {
            kind: "quipsly-transcript-packet-brief-v1",
            overview: { segmentCount: 1, speakerCount: 1, startSeconds: 12.4, endSeconds: 17.8 },
            humanApprovalRequired: true,
            sourceTruth: "Every brief item points to immutable transcript evidence.",
            sections: [
              { id: "goals", label: "Candidate goals", items: [{ segmentId: "segment-1", timeLabel: "00:12-00:17", speakerLabel: "Homer", text: "Build a repeatable coaching review habit." }] },
              { id: "quotes", label: "Quote candidates", items: [] },
            ],
          },
        },
        createdAt: "2026-07-18T18:00:00.000Z",
      },
      highlights: [],
      actionCandidates: [],
      goalCandidates: [goalCandidate],
      reviewLanes: [{
        id: "client-follow-up",
        label: "Client follow-up notes",
        status: "READY_FOR_HUMAN_REVIEW",
        itemCount: 1,
        meaning: "Candidate recap material for the client or coachee.",
        sourceTruth: "Derived from transcript packet summary evidence only.",
        reviewRule: "Human approval is required before client delivery.",
        humanApprovalRequired: true,
        externalSideEffects: false,
        humanReview: null,
      }, {
        id: "goals-and-tasks",
        label: "Goals and tasks",
        status: "EMPTY",
        itemCount: 0,
        meaning: "Candidate commitments that may become work.",
        sourceTruth: "Derived from transcript-backed candidates only.",
        reviewRule: "Only actual candidates may be reviewed.",
        humanApprovalRequired: true,
        externalSideEffects: false,
        humanReview: null,
      }],
      actionItems: [],
      nextAction: "Review the packet.",
    },
  };
}

function packetWithAction(candidateValue = actionCandidate): SessionReviewPacket {
  const value = packet();
  return {
    ...value,
    packet: {
      ...value.packet!,
      actionCandidates: [candidateValue],
      goalCandidates: [],
    },
  };
}

function packetWithActionMergeTarget(candidateValue = actionCandidate): SessionReviewPacket {
  const value = packetWithAction(candidateValue);
  return {
    ...value,
    packet: {
      ...value.packet!,
      taskMergeTargets: [{
        id: "task-existing",
        title: "Finish the episode package",
        detail: "Keep the source receipts together.",
        status: "OPEN",
        dueAt: "2026-08-12T18:00:00.000Z",
        updatedAt: "2026-08-03T15:00:00.000Z",
        projectId: "project-1",
        roomId: "room-1",
        evidenceCount: 2,
      }],
    },
  };
}

function packetWithNote(candidateValue = noteCandidate, withMergeTarget = false): SessionReviewPacket {
  const value = packet();
  return {
    ...value,
    packet: {
      ...value.packet!,
      noteCandidates: [candidateValue],
      noteMergeTargets: withMergeTarget ? [{
        id: "existing-note-1",
        title: "Episode direction",
        body: "Keep the strongest editorial decisions together.",
        kind: "SESSION_NOTE",
        visibility: "AUTHOR_PRIVATE",
        updatedAt: "2026-08-03T14:00:00.000Z",
        revisionCount: 2,
      }] : [],
      goalCandidates: [],
    },
  };
}

function packetWithGoalMergeTarget(candidateValue = candidate): SessionReviewPacket {
  const value = packet(candidateValue);
  return {
    ...value,
    packet: {
      ...value.packet!,
      goalMergeTargets: [{
        id: "goal-existing",
        title: "Build the weekly review habit",
        description: "Use one evidence-backed review every Friday.",
        status: "ACTIVE",
        targetAt: "2026-09-01T18:00:00.000Z",
        updatedAt: "2026-08-03T14:00:00.000Z",
        projectId: "project-1",
        roomId: null,
        evidenceCount: 2,
      }],
    },
  };
}

function jsonResponse(value: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value } as Response;
}

function packetReadyToBuild(): SessionReviewPacket {
  const value = packet();
  if (!value.packet) throw new Error("Expected packet fixture.");
  return {
    ...value,
    packet: {
      ...value.packet,
      status: "PACKET_READY_TO_BUILD",
      build: null,
      summary: null,
      goalCandidates: [],
      nextAction: "Build a packet from the completed transcript.",
      safeActions: [{
        id: "build-review-packet",
        label: "Build review packet",
        enabled: true,
        risk: "medium",
        why: "Completed transcript evidence is ready.",
        boundary: "Creates internal review artifacts only.",
      }],
    },
  };
}

function participantPacket(): SessionReviewPacket {
  const value = packetReadyToBuild();
  if (!value.packet) throw new Error("Expected packet fixture.");
  return {
    ...value,
    packet: {
      ...value.packet,
      reviewAccess: {
        canReviewPrivatePacket: false,
        role: "SESSION_PARTICIPANT",
        boundary: "Session access does not include another participant's private transcript follow-up.",
      },
      status: "PRIVATE_REVIEWER_ONLY",
      safeActions: [],
      nextAction: "Continue using the shared transcript and Session workspaces.",
    },
  };
}

function heldSourceEvidence(): SessionSourceEvidence {
  return {
    sources: [{
      recordingAssetId: "held-asset-1",
      fileName: "coaching-import.wav",
      kind: "LOCAL_AUDIO",
      recordingStatus: "HELD",
      status: "HELD" as const,
      captureId: "capture-1",
      captureGroupId: null,
      uploadSessionId: "aba9da45-c487-488d-99ae-13ffbf27f7bc",
      startBoundary: null,
      stopBoundary: null,
      sourceOrigin: "NEST_EXTERNAL_IMPORT",
      boundaryAuthority: null,
      cloud: {
        sha256: "a".repeat(64),
        byteSize: "756742",
        generation: "local-generation-1",
        bucket: "local-development",
        objectPath: "mobile/coaching-import.wav",
        verifiedAt: "2026-08-02T20:00:00.000Z",
      },
      captureRuntime: {
        appVersion: null,
        appBuild: null,
        deviceModel: null,
        operatingSystem: null,
        audioRoute: null,
      },
      processingDisposition: "HELD",
      transcriptDisposition: "HELD",
      releaseAudit: null,
      issues: [
        "The applied START boundary is incomplete.",
        "The applied STOP boundary is incomplete.",
      ],
    }],
    counts: { VERIFIED_MATCH: 0, HELD: 1, DRIFT: 0, INCOMPLETE: 0 },
  };
}

describe("Session review goal candidates", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    mockRouterRefresh.mockReset();
    jest.restoreAllMocks();
  });

  it("opens as a focused overview without fetching or rendering transcript machinery", () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="overview"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 0 }}
    />);

    expect(screen.getByRole("heading", { name: "Coaching review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your Session, start to finish" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Everything stays connected" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Prepare" })).toHaveAttribute("href", "/sessions/room-1?mode=prepare");
    expect(screen.getByRole("link", { name: "Recordings" })).toHaveAttribute("href", "/sessions/room-1?mode=recordings");
    expect(screen.getByRole("link", { name: "Transcript" })).toHaveAttribute("href", "/sessions/room-1?mode=transcript");
    expect(screen.getByRole("link", { name: "Coaching notes" })).toHaveAttribute("href", "/sessions/room-1?mode=notes");
    expect(screen.getAllByRole("link", { name: "Goals & commitments" })[0]).toHaveAttribute("href", "/sessions/room-1?mode=work");
    expect(screen.getByRole("link", { name: "Follow-up" })).toHaveAttribute("href", "/sessions/room-1?mode=outputs");
    expect(screen.queryByRole("heading", { name: "Current runway" })).not.toBeInTheDocument();
    expect(screen.queryByText("Transcription permission is incomplete")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Decide candidate by candidate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh transcript truth" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not mistake an empty standalone-consent projection for the complete release gate", () => {
    global.fetch = jest.fn() as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Episode review"
      mode="overview"
      preparation={{ purpose: "PODCAST", participants: [] } as any}
      consentSnapshot={{ total: 0, granted: 0, transcriptionPermitted: 0 }}
      contentReadiness={{
        status: "substantial",
        label: "Substantial recording ready",
        tone: "ready",
        detail: "One verified source recording is ready for gated review.",
        nextAction: "Open Transcript to verify the complete release receipt.",
        captureAssetCount: 1,
        knownDurationSeconds: 3600,
        longestKnownDurationSeconds: 3600,
        shortCaptureCount: 0,
        simulatorCaptureCount: 0,
        unknownDurationCount: 0,
        verifiedCaptureCount: 1,
        substantialRecordingCount: 1,
        substantialThresholdSeconds: 60,
      }}
    />);

    expect(screen.getByText("No standalone consent rows are projected here; Transcript verifies the complete release receipt before review")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No overview blocker" })).toBeInTheDocument();
    expect(screen.getByText(/Transcript and Outputs still enforce their own evidence gates/)).toBeInTheDocument();
  });

  it("keeps the transcript and ordinary editor ahead of optional audio diagnostics", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => packet(),
    }) as typeof fetch;
    const sourceClockAttention = buildSessionSourceClockAttention({
      transcript: [{
        id: "segment-audio-detail",
        segmentId: "segment-audio-detail",
        source: {
          roomId: "room-1",
          recordingAssetId: "asset-1",
          projectSlug: "coaching-practice",
          episodeSlug: null,
          mediaAssetId: "media-1",
          sourceId: "source-1",
          sourceUrl: "/api/ingest/media/source-1",
          sourceKind: "audio",
          durationSeconds: 60,
          label: "Coach source",
        },
        startSeconds: 8,
        endSeconds: 10,
        text: "A passage worth a closer listen.",
        speakerLabel: "Coach",
        providerConfidence: 0.62,
        reviewState: "unreviewed",
      }],
      audibleEvents: [],
      dialogueRepairs: [],
      mastery: [],
      edits: [],
    });

    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="transcript"
      consentSnapshot={{ total: 2, granted: 2, transcriptionPermitted: 2 }}
      sourceClockAttention={sourceClockAttention}
    />);

    await screen.findByText("Exact transcript desk");
    const details = screen.getByText("Audio details").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText(/ordinary editing tools work without opening this section/i)).toBeInTheDocument();
  });

  it("turns a validated podcast relationship into exact Episode Room, thread, and editor paths", () => {
    global.fetch = jest.fn() as typeof fetch;
    render(<SessionReviewClient
      roomId="room-episode-4"
      sessionTitle="The Swear Jar · take 2"
      mode="overview"
      consentSnapshot={{ total: 2, granted: 2, transcriptionPermitted: 2 }}
      preparation={{
        captureGroupId: "55555555-5555-4555-8555-555555555551",
        purpose: "PODCAST",
        status: "PLANNED",
        provider: "livekit",
        providerRoomId: "provider-episode-4",
        providerCanJoin: true,
        providerReadiness: "livekit-ready",
        providerNextAction: "Choose and test the exact devices, then join from browser or iPhone.",
        scheduledStart: null,
        scheduledEnd: null,
        project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
        participants: [],
        allAudioReady: false,
        allTranscriptionReady: false,
      }}
      collaborationContext={{
        project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
        episode: { id: "episode-4-id", title: "The Swear Jar", slug: "episode-4" },
        binding: "EPISODE",
        engagement: null,
        episodeBindingHistory: [{
          id: "binding-receipt-1",
          action: "BIND",
          previousEpisodeSlug: null,
          nextEpisodeSlug: "episode-4",
          reason: null,
          createdAt: "2026-08-04T20:00:00.000Z",
        }],
      }}
    />);

    expect(screen.getByRole("link", { name: "Run of show" })).toHaveAttribute("href", "/sessions/room-episode-4?mode=prepare");
    expect(screen.getByRole("link", { name: "Recording room" })).toHaveAttribute("href", "/sessions/room-episode-4?mode=live");
    expect(screen.getByRole("link", { name: "Takes" })).toHaveAttribute("href", "/sessions/room-episode-4?mode=recordings");
    expect(screen.getByRole("link", { name: "Editor & publish" })).toHaveAttribute("href", "/sessions/room-episode-4?mode=outputs");
    expect(screen.getByRole("heading", { name: "Episode Room · The Swear Jar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open exact Episode Room" })).toHaveAttribute("href", "/nests/high-ground/episodes/episode-4");
    expect(screen.getByRole("link", { name: "Episode thread" })).toHaveAttribute("href", "/nests/high-ground/episodes/episode-4#episode-thread");
    expect(screen.getByRole("link", { name: "Episode editor" })).toHaveAttribute("href", "/nests/high-ground/episodes/episode-4?mode=edit");
    expect(screen.getByText("Relationship history · 1")).toBeInTheDocument();
    expect(screen.getByText(/authorized collaborator · no external side effects/)).toBeInTheDocument();
  });

  it.each([
    ["prepare"],
    ["recordings"],
    ["notes"],
    ["work"],
    ["outputs"],
  ] as const)("keeps the %s workspace independent from transcript requests", async (mode) => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ ok: true }));
    global.fetch = fetchMock as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode={mode}
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }}
    />);

    const coachingLabels = {
      prepare: "Prepare",
      recordings: "Recordings",
      notes: "Coaching notes",
      work: "Goals & commitments",
      outputs: "Follow-up",
    } as const;
    expect(screen.getByRole("link", { name: coachingLabels[mode] })).toHaveAttribute("aria-current", "page");
    if (mode === "outputs") {
      await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/sessions/room-1/client-follow-up")).toHaveLength(1));
      expect(
        await screen.findByRole("heading", { name: "Client follow-up unavailable" }),
      ).toBeInTheDocument();
      const followUp = screen.getByRole("heading", { name: "Client follow-up unavailable" });
      const advancedEvidence = screen.getByText("Advanced production evidence and recovery");
      expect(
        followUp.compareDocumentPosition(advancedEvidence) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(advancedEvidence.closest("details")).not.toHaveAttribute("open");
    } else {
      expect(fetchMock).not.toHaveBeenCalled();
    }
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/transcripts/")),
    ).toBe(false);
  });

  it("creates explicitly shared canonical Session work from the browser", async () => {
    const createdAt = "2026-08-19T20:30:00.000Z";
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      ok: true,
      entry: {
        id: "session-task-request-1",
        kind: "TASK",
        title: "Send the reflection worksheet",
        body: "Share it before Friday.",
        status: "OPEN",
        createdAt,
        updatedAt: createdAt,
        tags: [],
        visibility: "SESSION_SHARED",
        ownedByCurrentActor: true,
      },
      nextAction: "The task is visible to permitted Session participants. No message, reminder, calendar event, or delivery occurred.",
    }));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="work"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }}
    />);

    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Send the reflection worksheet");
    await user.type(screen.getByRole("textbox", { name: /Context/ }), "Share it before Friday.");
    await user.click(screen.getByRole("button", { name: "Save task" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/sessions/room-1/work");
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      kind: "TASK",
      title: "Send the reflection worksheet",
      body: "Share it before Friday.",
      visibility: "SESSION_SHARED",
      targetAt: null,
    });
    expect(request.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText("Send the reflection worksheet")).toBeInTheDocument();
    expect(screen.getByText(/Everyone in this Session · Mine/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Task saved");
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps an automatically queued transcript hands-off while background refresh owns progress", async () => {
    const queued = packetReadyToBuild();
    queued.transcriptJob = {
      ...queued.transcriptJob!,
      status: "QUEUED",
      segmentCount: 0,
    };
    queued.packet = {
      ...queued.packet!,
      status: "NOT_READY",
      safeActions: [{
        id: "repair-transcript-first",
        label: "Repair transcript first",
        enabled: true,
        risk: "medium",
        why: "The released transcript job is queued.",
        boundary: "Creates derived transcript evidence only.",
      }],
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(queued));
    global.fetch = fetchMock as typeof fetch;

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 3, granted: 3, transcriptionPermitted: 3 }} />);
    expect(await screen.findByText("Queued")).toBeInTheDocument();
    const workflow = screen.getByRole("region", { name: "Post-call workflow" });
    expect(within(workflow).getByRole("link", { name: /Transcription is running/i })).toHaveAttribute("href", "#transcript-status");
    expect(within(workflow).getByText("Recording")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start transcription" })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/transcripts/run"),
      ),
    ).toBe(false);
  });

  it("keeps private coach notes out of the participant workflow", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(participantPacket()));
    global.fetch = fetchMock as typeof fetch;

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 2, granted: 2, transcriptionPermitted: 2 }} />);

    expect(await screen.findByRole("heading", { name: "Nothing shared yet" })).toBeInTheDocument();
    expect(screen.getByText(/Private coach notes stay private/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open transcript" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ hash: "#transcript-correction-review" })]),
    );
    expect(screen.queryByText("Internal editorial decisions")).not.toBeInTheDocument();
    expect(screen.queryByText("Preparing your follow-up")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mobile/capture/transcripts/packet?callRoomId=room-1",
      { cache: "no-store" },
    );
  });

  it("shows shared transcript results to the client without exposing private review candidates", async () => {
    const shared = participantPacket();
    shared.packet!.status = "RESULTS_READY";
    shared.packet!.summary = {
      id: "summary-shared",
      title: "Session recap",
      body: "The client chose one practical next step.",
      createdAt: "2026-08-26T12:00:00.000Z",
    };
    shared.packet!.results = {
      automaticallyCreated: true,
      editable: true,
      removable: true,
      summary: { id: "summary-shared", title: "Session recap", body: "The client chose one practical next step." },
      notes: [],
      tasks: [{
        id: "client-task-1",
        title: "Try the reset before Friday",
        detail: null,
        status: "OPEN",
        assignedUserId: "client-1",
        dueAt: null,
        completedAt: null,
        source: { segmentId: "segment-shared", startSeconds: 44, endSeconds: 51, speakerLabel: "Client" },
      }],
      goals: [],
    };
    shared.packet!.goalCandidates = [];
    shared.packet!.noteCandidates = [];
    shared.packet!.actionCandidates = [];
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(shared));
    global.fetch = fetchMock as typeof fetch;

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 2, granted: 2, transcriptionPermitted: 2 }} />);

    expect(await screen.findByRole("heading", { name: "Session results" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Try the reset before Friday" })[0]).toHaveAttribute("href", "/work?task=client-task-1");
    expect(screen.getByRole("link", { name: "Client · 00:44–00:51" })).toHaveAttribute("href", "/sessions/room-1?mode=transcript#transcript-segment-segment-shared");
    expect(screen.queryByText("Candidate goals")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Review note")).not.toBeInTheDocument();
  });

  it("summarizes source, timing, speaker, and human-review confidence without exposing diagnostics by default", async () => {
    const ready = packet();
    ready.transcriptJob!.wordCount = 14;
    ready.transcriptJob!.readiness = {
      schema: "quipsly-session-transcript-confidence-v1",
      state: "READY_TO_REVIEW",
      label: "Transcript ready to review",
      detail: "Timed text is bound to the exact recording. Listen, correct words, and identify speakers where needed.",
      exactSourceBound: true,
      segmentTimingReady: true,
      wordEditingReady: true,
      speakerAttributionComplete: false,
      humanReviewComplete: false,
      segmentCount: 1,
      wordCount: 14,
      reviewedSegmentCount: 0,
      speakerClusterCount: 1,
      attributedSpeakerClusterCount: 0,
      transcriptStartSeconds: 0.2,
      transcriptEndSeconds: 5.4,
      nextAction: "Listen to a sample from each speaker and confirm who they are.",
      boundaries: { providerConfidenceIsNotMeasuredAccuracy: true, speakerLabelIsNotParticipantIdentity: true, completedJobAloneIsNotExactSourceProof: true, textEditingRequiresImmutableWordTiming: true },
    };
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(ready)) as typeof fetch;

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);

    expect(await screen.findByTestId("transcript-confidence-summary")).toHaveTextContent("Transcript ready to review");
    expect(screen.getByText("✓ Exact recording")).toBeInTheDocument();
    expect(screen.getByText("✓ Timed transcript")).toBeInTheDocument();
    expect(screen.getByText("✓ Text editing ready")).toBeInTheDocument();
    expect(screen.getByText("0/1 speakers identified")).toBeInTheDocument();
    expect(screen.getByText("0/1 segments reviewed")).toBeInTheDocument();
    expect(screen.getByText("How Quipsly decides")).toBeInTheDocument();
    expect(screen.queryByText("Recording permission")).not.toBeInTheDocument();
    expect(screen.queryByText("Recording choice")).not.toBeInTheDocument();
  });

  it("shows the familiar recording choice only when transcript processing is actually held", async () => {
    const waiting = packet();
    waiting.transcriptProcessingGate = {
      allowed: false,
      error: "The transcript is waiting for the client to allow transcription.",
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(waiting)) as typeof fetch;

    render(
      <SessionReviewClient
        roomId="room-1"
        sessionTitle="Coaching review"
        mode="transcript"
        consentSnapshot={{ total: 2, granted: 2, transcriptionPermitted: 1 }}
      />,
    );

    expect(await screen.findByText("Recording choice")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The transcript is waiting for the client to allow transcription.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Details").closest("details"),
    ).not.toHaveAttribute("open");
    expect(screen.queryByText("Permission details")).not.toBeInTheDocument();
  });

  it("updates a running transcript to completed without a manual refresh", async () => {
    jest.useFakeTimers();
    const running = packetReadyToBuild();
    running.transcriptJob = {
      ...running.transcriptJob!,
      status: "RUNNING",
      segmentCount: 0,
    };
    running.packet = {
      ...running.packet!,
      status: "NOT_READY",
      safeActions: [],
    };
    const completed = packetReadyToBuild();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(running))
      .mockResolvedValueOnce(jsonResponse(completed))
      .mockResolvedValueOnce(jsonResponse({ ok: true, idempotentReplay: false }))
      .mockResolvedValueOnce(jsonResponse(packet()));
    global.fetch = fetchMock as typeof fetch;

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 2, granted: 2, transcriptionPermitted: 2 }} />);
    expect(await screen.findByText("Running")).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(2_500);
      await Promise.resolve();
    });

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(await screen.findByRole("heading", { name: "Session brief" })).toBeInTheDocument();
    expect(screen.queryByText(/Loading transcript packet/i)).not.toBeInTheDocument();
  });

  it("retries a failed transcript from its immutable recording binding", async () => {
    const failed = packetReadyToBuild();
    failed.transcriptJob = {
      ...failed.transcriptJob!,
      status: "FAILED",
      segmentCount: 0,
    };
    failed.packet = {
      ...failed.packet!,
      status: "NOT_READY",
      safeActions: [{
        id: "repair-transcript-first",
        label: "Repair transcript first",
        enabled: true,
        risk: "medium",
        why: "The released transcript job failed.",
        boundary: "Creates a retry from the immutable recording binding.",
      }],
    };
    const running = JSON.parse(JSON.stringify(failed)) as SessionReviewPacket;
    running.transcriptJob!.status = "RUNNING";
    running.packet!.safeActions = [];
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(failed))
      .mockResolvedValueOnce(jsonResponse({ ok: true, status: "RUNNING", executionRequested: false }, 202))
      .mockResolvedValueOnce(jsonResponse(running));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 3, granted: 3, transcriptionPermitted: 3 }} />);
    await user.click(await screen.findByRole("button", { name: "Retry transcription" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ recordingAssetId: "asset-1" });
    expect(await screen.findByRole("status")).toHaveTextContent(/Transcription started\. This page updates automatically while Quipsly works/i);
  });

  it("retries a released transcript that was held before current consent became ready", async () => {
    const held = packetReadyToBuild();
    held.transcriptJob = {
      ...held.transcriptJob!,
      status: "HELD",
      segmentCount: 0,
    };
    held.packet = {
      ...held.packet!,
      status: "NOT_READY",
      safeActions: [{
        id: "repair-transcript-first",
        label: "Repair transcript first",
        enabled: true,
        risk: "medium",
        why: "The source is currently held.",
        boundary: "Rechecks consent and release against the immutable recording.",
      }],
    };
    const running = JSON.parse(JSON.stringify(held)) as SessionReviewPacket;
    running.transcriptJob!.status = "RUNNING";
    running.packet!.safeActions = [];
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(held))
      .mockResolvedValueOnce(jsonResponse({ ok: true, status: "RUNNING", executionRequested: true }, 202))
      .mockResolvedValueOnce(jsonResponse(running));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 2, granted: 2, transcriptionPermitted: 2 }} focusedRecordingAssetId="asset-1" />);
    await user.click(await screen.findByRole("button", { name: "Retry transcription" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/mobile/capture/transcripts/run");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      recordingAssetId: "asset-1",
    });
  });

  it("starts the first transcript job for the exact source selected by the source journey", async () => {
    const sourceOnly = packetReadyToBuild();
    sourceOnly.transcriptJob = null;
    sourceOnly.selectedRecordingAsset = {
      id: "asset-recovered-2",
      fileName: "DJI backup delayed.wav",
      status: "VERIFIED",
      kind: "LOCAL_AUDIO",
      explicitlySelected: true,
    };
    sourceOnly.packet = {
      ...sourceOnly.packet!,
      status: "NOT_READY",
      safeActions: [{
        id: "repair-transcript-first",
        label: "Start source-bound transcript",
        enabled: true,
        risk: "medium",
        why: "This released source has no transcript job yet.",
        boundary: "Creates derived transcript evidence only.",
      }],
    };
    const running = JSON.parse(JSON.stringify(sourceOnly)) as SessionReviewPacket;
    running.transcriptJob = {
      id: "job-recovered-2",
      status: "RUNNING",
      provider: "pending",
      segmentCount: 0,
      asset: { id: "asset-recovered-2", fileName: "DJI backup delayed.wav", status: "VERIFIED", kind: "LOCAL_AUDIO" },
    };
    running.packet!.safeActions = [];
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(sourceOnly))
      .mockResolvedValueOnce(jsonResponse({ ok: true, status: "RUNNING", transcriptJobId: "job-recovered-2" }, 202))
      .mockResolvedValueOnce(jsonResponse(running));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient roomId="room-1" sessionTitle="Episode 9" mode="transcript" focusedRecordingAssetId="asset-recovered-2" consentSnapshot={{ total: 2, granted: 2, transcriptionPermitted: 2 }} />);

    expect(await screen.findByText("Recording details")).toBeInTheDocument();
    expect(screen.getByText("RecordingAsset · asset-recovered-2")).not.toBeVisible();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/mobile/capture/transcripts/packet?callRoomId=room-1&recordingAssetId=asset-recovered-2");
    await user.click(screen.getByRole("button", { name: "Start transcription" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ recordingAssetId: "asset-recovered-2" });
    expect(await screen.findByText("Running")).toBeInTheDocument();
  });

  it("shows ready Session results without an approval queue", async () => {
    const ready = packet();
    ready.packet!.results = {
      automaticallyCreated: true,
      editable: true,
      removable: true,
      summary: { id: "summary-1", title: "Session recap", body: "A practical reset emerged." },
      notes: [{
        id: "note-result-1",
        title: "Reset insight",
        body: "Pause before responding.",
        source: { segmentId: "segment-note", startSeconds: 8, endSeconds: 12, speakerLabel: "Client" },
      }],
      tasks: [{
        id: "task-result-1",
        title: "Practice two-minute reset",
        detail: "Try it before the next Session.",
        status: "OPEN",
        assignedUserId: "client-1",
        dueAt: null,
        completedAt: null,
        source: { segmentId: "segment-task", startSeconds: 18, endSeconds: 24, speakerLabel: "Coach" },
      }],
      goals: [{
        id: "goal-result-1",
        title: "Respond with intention",
        description: "Use the reset consistently.",
        status: "ACTIVE",
        ownerUserId: "client-1",
        targetAt: null,
        achievedAt: null,
        source: { segmentId: "segment-goal", startSeconds: 30, endSeconds: 38, speakerLabel: "Client" },
      }],
    };
    const fetchMock = jest.fn().mockResolvedValueOnce(jsonResponse(ready));
    global.fetch = fetchMock as typeof fetch;

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);

    expect(await screen.findByRole("heading", { name: "Session results" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Use Session results/i })).toHaveAttribute("href", "#session-results");
    expect(screen.getAllByText("1 category has no results")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Goals and tasks" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Follow-through is ready" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open session work" })).toHaveAttribute("href", "/sessions/room-1?mode=work");
    expect(screen.queryByLabelText("Review note")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve inside Quipsly" })).not.toBeInTheDocument();
    expect(screen.getByText(/ordinary editable items, not proposals waiting for approval/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1 note" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reset insight" })).toHaveAttribute("href", "/sessions/room-1?mode=notes#session-note-note-result-1");
    expect(screen.getAllByRole("link", { name: "Practice two-minute reset" })[0]).toHaveAttribute("href", "/work?task=task-result-1");
    expect(screen.getByRole("link", { name: "Respond with intention" })).toHaveAttribute("href", "/work?goal=goal-result-1");
    expect(screen.getByRole("link", { name: "Client · 00:30–00:38" })).toHaveAttribute("href", "/sessions/room-1?mode=transcript#transcript-segment-segment-goal");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("automatically prepares review material from the exact transcript without forcing a rebuild", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packetReadyToBuild()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, idempotentReplay: false }))
      .mockResolvedValueOnce(jsonResponse(packet()));
    global.fetch = fetchMock as typeof fetch;

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/mobile/capture/transcripts/packet");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ transcriptJobId: "job-1", force: false });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your Session recap, notes, tasks, and goals are ready. Everything stays editable and linked to the recording.",
    );
    expect(screen.getByRole("heading", { name: "Session brief" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Goals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /00:12-00:17.*build a repeatable coaching review habit/i })).toHaveAttribute("href", "#transcript-segment-segment-1");
    expect(screen.getByText("Every brief item points to immutable transcript evidence.")).toBeInTheDocument();
    expect(screen.getByText("Inspect exact saved packet text")).toBeInTheDocument();
  });

  it("offers one plain retry when automatic follow-up preparation fails", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packetReadyToBuild()))
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: "temporary worker error" }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true, idempotentReplay: false }))
      .mockResolvedValueOnce(jsonResponse(packet()));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);

    expect(await screen.findByRole("status")).toHaveTextContent("Your transcript is safe; try again below");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(screen.getByRole("link", { name: /Retry Session results/i })).toHaveAttribute("href", "#review-material");

    await user.click(retry);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ transcriptJobId: "job-1", force: false });
    expect(await screen.findByRole("heading", { name: "Session brief" })).toBeInTheDocument();
  });

  it("carries canonical Nest tags into Session review and saves through the shared ledger", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, updatedAt: "2026-07-19T08:00:01.000Z", boundaries: { projectScoped: true, externalSideEffects: false } }));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="prepare"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }}
      sessionTaxonomy={{
        project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
        tags: [{ id: "tag-proof", label: "Proof listen", slug: "proof-listen", category: "workflow", projectId: "project-1" }],
        catalog: [
          { id: "tag-proof", label: "Proof listen", slug: "proof-listen", category: "workflow", projectId: "project-1" },
          { id: "tag-episode", label: "Episode 4", slug: "episode-4", category: "meaning", projectId: "project-1" },
        ],
        canManage: true,
        canManageVocabulary: true,
        updatedAt: "2026-07-19T08:00:00.000Z",
      }}
    />);
    expect(await screen.findByRole("heading", { name: "High Ground Odyssey" })).toBeInTheDocument();
    expect(screen.getByText("#Proof listen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Studio editor" })).toHaveAttribute("href", "/editor?project=high-ground");
    await user.click(screen.getByText("Edit Session tags"));
    await user.click(screen.getByRole("checkbox", { name: "Episode 4" }));
    await user.click(screen.getByRole("button", { name: "Save Session tags" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/work/tags");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ entityKind: "session", entityId: "room-1", tagIds: ["tag-proof", "tag-episode"], expectedUpdatedAt: "2026-07-19T08:00:00.000Z" });
    expect(await screen.findByRole("status")).toHaveTextContent("No source, task, provider, calendar, or publication state changed");
    expect(screen.getByText("#Episode 4")).toBeInTheDocument();
  });

  it("shows schedule, participants, and versioned consent in Prepare without claiming capture readiness from an empty room", () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="prepare"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 0 }}
      preparation={{
        captureGroupId: "55555555-5555-4555-8555-555555555552",
        purpose: "COACHING",
        status: "PLANNED",
        provider: "planned",
        providerRoomId: null,
        providerCanJoin: false,
        providerReadiness: "local-fallback",
        providerNextAction: "Prepare LiveKit for a shared call, or keep this Session local-only.",
        scheduledStart: "2026-07-26T15:00:00.000Z",
        scheduledEnd: "2026-07-26T16:00:00.000Z",
        project: { id: "project-1", name: "Private coaching", slug: "private-coaching" },
        participants: [{
          id: "participant-1",
          label: "Homer",
          role: "CLIENT",
          isCurrentActor: false,
          joinedAt: null,
          consent: {
            id: "consent-1",
            status: "GRANTED",
            policyVersion: "2026-07-04",
            canRecordAudio: true,
            canRecordVideo: false,
            canTranscribe: false,
            recordingReady: true,
            transcriptionReady: false,
            consentedAt: "2026-07-25T18:00:00.000Z",
            revokedAt: null,
            updatedAt: "2026-07-25T18:00:00.000Z",
          },
        }],
        allAudioReady: true,
        allTranscriptionReady: false,
      }}
    />);

    expect(screen.getByRole("heading", { name: "Your session is scheduled" })).toBeInTheDocument();
    expect(screen.getByText("Homer")).toBeInTheDocument();
    expect(screen.getByText("People and recording choices")).toBeInTheDocument();
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
    expect(screen.getByText("All sessions").closest("a")).toHaveAttribute("href", "/coaching/sessions");
    expect(screen.getByText(/signed-in account is not attached as a participant/i)).toBeInTheDocument();
    expect(screen.queryByText(/complete release receipt/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves the current participant's explicit consent from the exact Session workspace", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      ok: true,
      session: { nextAction: "Consent saved for this exact Session." },
    }));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient
      roomId="room-episode-9"
      sessionTitle="Episode 9: The Swear Jar"
      mode="prepare"
      consentSnapshot={{ total: 1, granted: 0, transcriptionPermitted: 0 }}
      preparation={{
        captureGroupId: "55555555-5555-4555-8555-555555555552",
        purpose: "PODCAST",
        status: "PLANNED",
        provider: "planned",
        providerRoomId: null,
        providerCanJoin: false,
        providerReadiness: "local-fallback",
        providerNextAction: "Prepare the exact participant and consent evidence.",
        scheduledStart: null,
        scheduledEnd: null,
        project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
        participants: [{
          id: "participant-charlie",
          label: "Charlie",
          role: "HOST",
          isCurrentActor: true,
          joinedAt: null,
          consent: {
            id: "consent-requested",
            status: "REQUESTED",
            policyVersion: "2026-07-04",
            canRecordAudio: false,
            canRecordVideo: false,
            canTranscribe: false,
            recordingReady: false,
            transcriptionReady: false,
            consentedAt: null,
            revokedAt: null,
            updatedAt: "2026-08-20T17:50:00.000Z",
          },
        }],
        allAudioReady: false,
        allTranscriptionReady: false,
      }}
    />);

    expect(screen.getByLabelText("Record audio from this device")).toBeChecked();
    expect(screen.getByLabelText("Record camera video from this device")).toBeChecked();
    expect(screen.getByLabelText("Create a transcript and suggested notes/tasks")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Allow recording" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/mobile/capture/consent", expect.objectContaining({ method: "POST" }));
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload).toEqual(expect.objectContaining({
      callRoomId: "room-episode-9",
      participantId: "participant-charlie",
      consentAction: "GRANT",
      canRecordAudio: true,
      canRecordVideo: true,
      canTranscribe: true,
      allAudibleParticipantsNotifiedAndAgreed: true,
      presentationEvidence: expect.objectContaining({
        surface: "quipsly-session-workspace-consent-v1",
        recordingChoicePresented: true,
        transcriptionChoicePresented: true,
        audibleParticipantAttestationPresented: true,
      }),
    }));
    expect(payload.consentPolicyVersion).toBeTruthy();
    expect(payload.consentTextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "You're ready. Recording starts only when someone presses Record.",
    );
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the call entrance free of recording paperwork", () => {
    global.fetch = jest.fn() as typeof fetch;
    render(<SessionReviewClient
      roomId="room-live-coaching"
      sessionTitle="Coaching Session"
      mode="live"
      consentSnapshot={{ total: 2, granted: 0, transcriptionPermitted: 0 }}
      preparation={{
        captureGroupId: "55555555-5555-4555-8555-555555555554",
        purpose: "COACHING",
        status: "PLANNED",
        provider: "livekit",
        providerRoomId: "provider-live-room",
        providerCanJoin: true,
        providerReadiness: "livekit-ready",
        providerNextAction: "Join when ready.",
        scheduledStart: "2026-08-25T18:00:00.000Z",
        scheduledEnd: "2026-08-25T19:00:00.000Z",
        project: { id: "project-1", name: "Coaching", slug: "coaching" },
        participants: [{
          id: "participant-client",
          label: "Client",
          role: "CLIENT",
          isCurrentActor: true,
          joinedAt: null,
          consent: {
            id: "consent-requested",
            status: "REQUESTED",
            policyVersion: "2026-07-04",
            canRecordAudio: false,
            canRecordVideo: false,
            canTranscribe: false,
            recordingReady: false,
            transcriptionReady: false,
            consentedAt: null,
            revokedAt: null,
            updatedAt: "2026-08-25T17:55:00.000Z",
          },
        }],
        allAudioReady: false,
        allTranscriptionReady: false,
      }}
    />);

    expect(screen.getByRole("heading", { name: "Coaching Session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue in this browser" })).toBeInTheDocument();
    expect(screen.queryByTestId("session-consent-control")).not.toBeInTheDocument();
    expect(screen.getByText(/choose whether to record after you join/i)).toBeInTheDocument();
    expect(screen.queryByText("Recording status")).not.toBeInTheDocument();
  });

  it("keeps saved consent compact until the participant chooses to change it", async () => {
    global.fetch = jest.fn() as typeof fetch;
    const user = userEvent.setup();
    render(<SessionReviewClient
      roomId="room-coaching-ready"
      sessionTitle="Coaching Session"
      mode="prepare"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }}
      preparation={{
        captureGroupId: "55555555-5555-4555-8555-555555555553",
        purpose: "COACHING",
        status: "PLANNED",
        provider: "livekit",
        providerRoomId: "provider-room",
        providerCanJoin: true,
        providerReadiness: "livekit-ready",
        providerNextAction: "Join when ready.",
        scheduledStart: "2026-08-20T18:00:00.000Z",
        scheduledEnd: "2026-08-20T19:00:00.000Z",
        project: { id: "project-1", name: "Coaching", slug: "coaching" },
        participants: [{
          id: "participant-coach",
          label: "Coach",
          role: "COACH",
          isCurrentActor: true,
          joinedAt: null,
          consent: {
            id: "consent-current",
            status: "GRANTED",
            policyVersion: "2026-07-04",
            canRecordAudio: true,
            canRecordVideo: false,
            canTranscribe: true,
            recordingReady: true,
            transcriptionReady: true,
            consentedAt: "2026-08-20T17:55:00.000Z",
            revokedAt: null,
            updatedAt: "2026-08-20T17:55:00.000Z",
          },
        }],
        allAudioReady: true,
        allTranscriptionReady: true,
      }}
    />);

    const control = screen.getByTestId("session-consent-control");
    expect(within(control).getByRole("heading", { name: "Recording ready" })).toBeInTheDocument();
    expect(within(control).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(control).getByText("Audio")).toBeInTheDocument();
    expect(within(control).getByText("Transcript")).toBeInTheDocument();

    expect(within(control).queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
    await user.click(within(control).getByRole("button", { name: "Options" }));
    expect(within(control).getByLabelText("Record audio from this device")).toBeChecked();
    expect(within(control).getByLabelText("Create a transcript and suggested notes/tasks")).toBeChecked();
    expect(within(control).queryByLabelText(/anyone else who may be heard/i)).not.toBeInTheDocument();
    expect(within(control).getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("changes only the canonical Quipsly time from the exact Session workspace", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      ok: true,
      boundaries: { nextAction: "Quipsly Session time saved without external side effects." },
    }));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient
      roomId="room-episode-9"
      sessionTitle="Episode 9: The Swear Jar"
      mode="prepare"
      consentSnapshot={{ total: 1, granted: 0, transcriptionPermitted: 0 }}
      preparation={{
        captureGroupId: "55555555-5555-4555-8555-555555555552",
        purpose: "PODCAST",
        status: "PLANNED",
        provider: "planned",
        providerRoomId: null,
        providerCanJoin: false,
        providerReadiness: "local-fallback",
        providerNextAction: "Prepare the Session.",
        scheduledStart: null,
        scheduledEnd: null,
        updatedAt: "2026-08-05T18:00:00.000Z",
        canSchedule: true,
        project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
        participants: [{ id: "participant-charlie", label: "Charlie", role: "HOST", isCurrentActor: true, joinedAt: null, consent: null }],
        allAudioReady: false,
        allTranscriptionReady: false,
      }}
    />);

    await user.click(screen.getByRole("button", { name: "Choose time" }));
    const start = screen.getByLabelText("Session starts");
    const end = screen.getByLabelText("Session ends");
    await user.clear(start);
    await user.type(start, "2026-08-06T10:00");
    await user.clear(end);
    await user.type(end, "2026-08-06T11:00");
    await user.click(screen.getByRole("button", { name: "Save time" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(fetchMock).toHaveBeenCalledWith("/api/mobile/capture/sessions", expect.objectContaining({ method: "PATCH" }));
    expect(payload).toEqual(expect.objectContaining({
      callRoomId: "room-episode-9",
      scheduledStart: new Date("2026-08-06T10:00").toISOString(),
      scheduledEnd: new Date("2026-08-06T11:00").toISOString(),
      expectedUpdatedAt: "2026-08-05T18:00:00.000Z",
      reason: "Scheduled from the exact Quipsly Session workspace.",
    }));
    expect(payload.clientRequestId).toBeTruthy();
    expect(payload.timezone).toBeTruthy();
    expect(await screen.findByRole("status")).toHaveTextContent("Session time saved");
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows the durable Studio attachment receipt and opens the exact episode", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(packet())) as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Episode review"
      mode="outputs"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }}
      preparation={{
        captureGroupId: "capture-episode-1",
        purpose: "PODCAST",
        status: "ENDED",
        provider: "local",
        providerRoomId: null,
        providerCanJoin: false,
        providerReadiness: "local-fallback",
        providerNextAction: "No live call is active.",
        scheduledStart: null,
        scheduledEnd: null,
        project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
        participants: [],
        allAudioReady: false,
        allTranscriptionReady: false,
      }}
      studioHandoff={{
        project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
        recordings: [{
          recordingAssetId: "recording-1",
          fileName: "Episode 4 room mix.wav",
          kind: "SERVER_MIX",
          recordingStatus: "VERIFIED",
          status: "ATTACHED",
          mediaAssetId: "media-1",
          attachmentId: "attachment-1",
          attachmentUpdatedAt: "2026-07-19T08:00:00.000Z",
          episodeSlug: "episode-4",
          importRole: "room-mix-audio",
          promotedAt: "2026-07-19T08:00:00.000Z",
        }],
      }}
    />);
    expect(await screen.findByRole("heading", { name: "1 immutable source attachment" })).toBeInTheDocument();
    expect(screen.getByText("Episode 4 room mix.wav")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Episode 4 in Studio" })).toHaveAttribute("href", "/editor?project=high-ground&episode=episode-4");
    expect(screen.getByText(/provenance receipt—not proof that the take is substantial/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /promote|attach|send/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Client follow-up unavailable" })).not.toBeInTheDocument();
  });

  it("keeps deliberate iPhone notes in Notes without mixing in tasks or goals", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(packet())) as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="notes"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }}
      sessionNotes={[{
        id: "mobile-note-1",
        title: "Quick note",
        body: "Let the opening breathe.",
        kind: "SESSION_NOTE",
        visibility: "AUTHOR_PRIVATE",
        author: { id: "actor-1", label: "Charlie", isCurrentActor: true },
        originLabel: "iPhone Capture",
        canEdit: true,
        revisionCount: 1,
        createdAt: "2026-07-19T09:00:00.000Z",
        updatedAt: "2026-07-19T09:00:00.000Z",
        tags: [{ id: "tag-1", label: "Opening", slug: "opening" }],
      }]}
      sessionQuickEntries={[
        { id: "mobile-note-1", kind: "NOTE", title: "Quick note", body: "Let the opening breathe.", status: "CAPTURED", createdAt: "2026-07-19T09:00:00.000Z", updatedAt: "2026-07-19T09:00:00.000Z", tags: [{ id: "tag-1", label: "Opening", slug: "opening" }] },
        { id: "mobile-task-1", kind: "TASK", title: "Proof-listen act one", body: "Use the room mix.", status: "OPEN", createdAt: "2026-07-19T09:01:00.000Z", updatedAt: "2026-07-19T09:01:00.000Z", tags: [] },
        { id: "mobile-goal-1", kind: "GOAL", title: "Make coaching follow-through obvious", body: null, status: "ACTIVE", createdAt: "2026-07-19T09:02:00.000Z", updatedAt: "2026-07-19T09:02:00.000Z", tags: [] },
      ]}
    />);
    expect(await screen.findByRole("heading", { name: "1 note" })).toBeInTheDocument();
    expect(screen.getAllByText("Let the opening breathe.")[0]).toBeInTheDocument();
    expect(screen.getByText("#Opening")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find all accessible work tagged Opening" })).toHaveAttribute("href", "/find?tag=tag-1");
    expect(screen.getByRole("heading", { name: "Quick note" }).closest("article")).toHaveAttribute("id", "session-note-mobile-note-1");
    expect(screen.queryByText("Proof-listen act one")).not.toBeInTheDocument();
    expect(screen.queryByText("Make coaching follow-through obvious")).not.toBeInTheDocument();
    expect(screen.getByText(/capture what matters.*private or is shared in this Session/i)).toBeInTheDocument();
  });

  it("keeps canonical iPhone tasks and goals in Work without mixing in notes", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(packet())) as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="work"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }}
      sessionQuickEntries={[
        { id: "mobile-note-1", kind: "NOTE", title: "Quick note", body: "Let the opening breathe.", status: "CAPTURED", createdAt: "2026-07-19T09:00:00.000Z", updatedAt: "2026-07-19T09:00:00.000Z", tags: [] },
        { id: "mobile-task-1", kind: "TASK", title: "Proof-listen act one", body: "Use the room mix.", status: "OPEN", createdAt: "2026-07-19T09:01:00.000Z", updatedAt: "2026-07-19T09:01:00.000Z", tags: [] },
        { id: "mobile-goal-1", kind: "GOAL", title: "Make coaching follow-through obvious", body: null, status: "ACTIVE", createdAt: "2026-07-19T09:02:00.000Z", updatedAt: "2026-07-19T09:02:00.000Z", tags: [] },
      ]}
    />);

    expect(await screen.findByRole("heading", { name: "Tasks and goals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open same task in Work" })).toHaveAttribute("href", "/work?task=mobile-task-1");
    expect(screen.getByRole("link", { name: "Open same goal in Work" })).toHaveAttribute("href", "/work?goal=mobile-goal-1");
    expect(screen.queryByText("Quick note")).not.toBeInTheDocument();
    expect(screen.getByText(/1 task · 1 goal.*continue it in Work/i)).toBeInTheDocument();
  });

  it("edits the same iPhone note and replaces its canonical Nest tags with optimistic revisions", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        note: {
          id: "mobile-note-1",
          title: "Opening rhythm",
          body: "Pause, then let the question breathe.",
          kind: "SESSION_NOTE",
          visibility: "AUTHOR_PRIVATE",
          updatedAt: "2026-07-19T09:05:00.000Z",
          revisionCount: 2,
          tags: [{ id: "tag-opening", label: "Opening", slug: "opening" }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, updatedAt: "2026-07-19T09:06:00.000Z" }));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="notes"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }}
      sessionTaxonomy={{
        project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
        tags: [],
        catalog: [
          { id: "tag-opening", label: "Opening", slug: "opening", category: "meaning", projectId: "project-1" },
          { id: "tag-edit", label: "Edit point", slug: "edit-point", category: "workflow", projectId: "project-1" },
        ],
        canManage: true,
        canManageVocabulary: true,
        updatedAt: "2026-07-19T09:00:00.000Z",
      }}
      sessionNotes={[{
        id: "mobile-note-1",
        title: "Quick note",
        body: "Let the opening breathe.",
        kind: "SESSION_NOTE",
        visibility: "AUTHOR_PRIVATE",
        author: { id: "actor-1", label: "Charlie", isCurrentActor: true },
        originLabel: "iPhone Capture",
        canEdit: true,
        revisionCount: 1,
        createdAt: "2026-07-19T09:00:00.000Z",
        updatedAt: "2026-07-19T09:00:00.000Z",
        tags: [{ id: "tag-opening", label: "Opening", slug: "opening" }],
      }]}
    />);
    expect(await screen.findByRole("heading", { name: "Coaching review" })).toBeInTheDocument();
    const article = screen.getByRole("heading", { name: "Quick note" }).closest("article")!;
    await user.click(within(article).getByText("Edit note, audience, and tags"));
    const title = within(article).getByRole("textbox", { name: "Title" });
    const note = within(article).getByRole("textbox", { name: "Note" });
    await user.clear(title);
    await user.type(title, "Opening rhythm");
    await user.clear(note);
    await user.type(note, "Pause, then let the question breathe.");
    await user.click(within(article).getByRole("button", { name: "Save revision" }));
    expect(await screen.findByRole("status")).toHaveTextContent("earlier versions remain available");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/notes/mobile-note-1");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      title: "Opening rhythm",
      body: "Pause, then let the question breathe.",
      kind: "SESSION_NOTE",
      visibility: "AUTHOR_PRIVATE",
      expectedUpdatedAt: "2026-07-19T09:00:00.000Z",
    });

    const updatedArticle = screen.getByRole("heading", { name: "Opening rhythm" }).closest("article")!;
    await user.click(within(updatedArticle).getByRole("checkbox", { name: "#Edit point" }));
    await user.click(within(updatedArticle).getByRole("button", { name: "Save tags" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Tags saved");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      entityKind: "note",
      entityId: "mobile-note-1",
      tagIds: ["tag-opening", "tag-edit"],
      expectedUpdatedAt: "2026-07-19T09:05:00.000Z",
    });
  });

  it("shows exact phone capture receipt IDs without pretending the audio uploaded", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(packet())) as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="recordings"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 0 }}
      captureReceipts={{
        captures: [{
          captureId: "08a8241e-bc80-4410-a917-2b84d285769d",
          status: "START_AND_STOP_RECEIVED",
          startedAt: "2026-07-19T15:30:26.000Z",
          stoppedAt: "2026-07-19T15:30:35.000Z",
          startReceiptId: "start-receipt-1",
          stopReceiptId: "stop-receipt-1",
          lastReceivedAt: "2026-07-19T15:30:35.704Z",
        }],
      }}
    />);
    expect(await screen.findByRole("heading", { name: "1 phone capture receipt trail" })).toBeInTheDocument();
    expect(screen.getByText("08a8241e-bc80-4410-a917-2b84d285769d")).toBeInTheDocument();
    expect(screen.getByText("Start + stop received")).toBeInTheDocument();
    expect(screen.getByText("start-receipt-1")).toBeInTheDocument();
    expect(screen.getByText("stop-receipt-1")).toBeInTheDocument();
    expect(screen.getByText(/do not claim the audio uploaded/i)).toBeInTheDocument();
    expect(screen.getByText(/remains on the iPhone until upload succeeds/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Import an existing session recording" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload|retry|transcribe/i })).not.toBeInTheDocument();
  });

  it("shows an independently matched phone-to-cloud source without leaking actor identity", () => {
    global.fetch = jest.fn() as typeof fetch;
    const sourceEvidence = {
      sources: [{
        recordingAssetId: "asset-1",
        fileName: "homer-camera.mov",
        kind: "LOCAL_VIDEO",
        recordingStatus: "VERIFIED",
        status: "VERIFIED_MATCH" as const,
        captureId: "capture-1",
        captureGroupId: "group-1",
        uploadSessionId: "upload-1",
        startBoundary: { receiptId: "start-receipt-1", occurredAt: "2026-07-29T15:00:00.000Z" },
        stopBoundary: { receiptId: "stop-receipt-1", occurredAt: "2026-07-29T15:04:00.000Z" },
        sourceOrigin: "CAPTURE" as const,
        cloud: {
          sha256: "a".repeat(64),
          byteSize: "4096",
          generation: "1742",
          bucket: "quipsly-private-media",
          objectPath: "mobile/room-1/homer-camera.mov",
          verifiedAt: "2026-07-29T15:05:00.000Z",
        },
        captureRuntime: {
          appVersion: "1.0",
          appBuild: "9",
          deviceModel: "iPhone17,3",
          operatingSystem: "iOS 26.2",
          audioRoute: "Shure MV7i · USBAudio",
          audioFormat: {
            signal: {
              status: "attention",
              rmsDbfs: -20.1,
              samplePeakDbfs: -0.2,
              clippedFrameCount: 15,
              nearSilentFrameFraction: 0.01,
              durationSeconds: 240,
              waveform: [
                { startSeconds: 0, durationSeconds: 120, rmsDbfs: -28, samplePeakDbfs: -8, clippedFrameCount: 0 },
                { startSeconds: 120, durationSeconds: 120, rmsDbfs: -18, samplePeakDbfs: -0.2, clippedFrameCount: 15 },
              ],
              loudness: {
                integratedLoudnessLufs: -20.6,
                maximumMomentaryLoudnessLufs: -14.8,
              },
              observations: [{
                kind: "sample-clipping",
                severity: "attention",
                startSeconds: 18,
                endSeconds: 19,
                detail: "A brief peak may be clipped.",
                requiresListening: true,
              }],
            },
          } as any,
          videoFormat: {
            requestedQuality: "production-4k-24",
            intentFulfilled: true,
            systemPressureAtStart: "nominal",
            configured: {
              widthPixels: 3840,
              heightPixels: 2160,
              frameRate: 24,
              codec: "hevc",
              colorSpace: "P3-D65",
              orientation: "landscape",
              cameraPosition: "front",
              rotationDegrees: 0,
            },
            recorded: {
              videoTrackCount: 1,
              encodedWidthPixels: 3840,
              encodedHeightPixels: 2160,
              presentationWidthPixels: 3840,
              presentationHeightPixels: 2160,
              frameRate: 24,
              codec: "hvc1",
              rotationDegrees: 0,
            },
          },
        },
        processingDisposition: "RELEASED",
        transcriptDisposition: "HELD",
        issues: [],
      }],
      counts: { VERIFIED_MATCH: 1, HELD: 0, DRIFT: 0, INCOMPLETE: 0 },
    };
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Episode rehearsal"
      mode="recordings"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }}
      sourceEvidence={sourceEvidence}
    />);

    expect(screen.getByRole("heading", { name: "Your recordings are safe and ready" })).toBeInTheDocument();
    const sourceHeading = screen.getByRole("heading", { name: "homer-camera.mov" });
    expect(sourceHeading).toBeInTheDocument();
    expect(sourceHeading.closest("article")).toHaveClass("min-w-0", "overflow-hidden");
    expect(screen.getByText("Verified Match")).toBeInTheDocument();
    expect(screen.getByText("Quipsly Capture 1.0 (9)")).toBeInTheDocument();
    expect(screen.getByText("iPhone17,3 · iOS 26.2")).toBeInTheDocument();
    expect(screen.getByText("Shure MV7i · USBAudio")).toBeInTheDocument();
    expect(screen.getByText("Video source truth")).toBeInTheDocument();
    expect(screen.getByText("Requested 4K · 24 fps · resolved exactly")).toBeInTheDocument();
    expect(screen.getByText("Configured 3840×2160 · 24 fps · HEVC · P3-D65")).toBeInTheDocument();
    expect(screen.getByText("Recorded 3840×2160 · 24 fps · HVC1 · 1 video track")).toBeInTheDocument();
    expect(screen.getByText("Front camera · Landscape · pressure at Start Nominal")).toBeInTheDocument();
    expect(screen.getByText("4,096 bytes · generation 1742")).toBeInTheDocument();
    expect(screen.getByText(/every participant recording reached private storage intact/i)).toBeInTheDocument();
    expect(screen.getByText("Safely stored")).toBeInTheDocument();
    expect(screen.getByText("1 moment worth checking")).toBeInTheDocument();
    expect(screen.getByText(/programme loudness -20.6 LUFS · loudest 400 ms -14.8 LUFS/i)).toBeInTheDocument();
    expect(screen.getByText(/sample peak is not true peak/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Decoded waveform overview for homer-camera.mov with 1 flagged moment" })).toBeInTheDocument();
    expect(screen.getByText(/flagged at 00:18/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check this audio moment" })).toHaveAttribute(
      "href",
      "/sessions/room-1?mode=transcript&source=asset-1&at=18#transcript-audio-review",
    );
    expect(screen.getByText("Technical recording details")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download technical receipt" })).toHaveAttribute(
      "href",
      "/api/sessions/room-1/source-evidence",
    );
    expect(screen.queryByText(/actor-private/i)).not.toBeInTheDocument();
  });

  it("shows a held source to participants without exposing a release bypass", () => {
    global.fetch = jest.fn() as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="recordings"
      consentSnapshot={{ total: 3, granted: 3, transcriptionPermitted: 3 }}
      sourceEvidence={heldSourceEvidence()}
    />);

    expect(screen.getByText(/staff review is required to release this held external import/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release exact source" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/why is this exact source safe to release/i)).not.toBeInTheDocument();
  });

  it("never offers the external-import exception to a native Capture source", () => {
    global.fetch = jest.fn() as typeof fetch;
    const evidence = heldSourceEvidence();
    evidence.sources[0].sourceOrigin = "CAPTURE";
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="recordings"
      consentSnapshot={{ total: 3, granted: 3, transcriptionPermitted: 3 }}
      sourceEvidence={evidence}
      canReleaseHeldMedia
    />);

    expect(screen.getByText(/restore or reconcile its signed START\/STOP receipt trail/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release exact source" })).not.toBeInTheDocument();
  });

  it("requires an exact-source acknowledgement and sends only the audited release contract", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({
      ok: true,
      processingDisposition: "RELEASED",
      transcriptDisposition: "HELD",
    }));
    global.fetch = fetchMock as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="recordings"
      consentSnapshot={{ total: 3, granted: 3, transcriptionPermitted: 3 }}
      sourceEvidence={heldSourceEvidence()}
      canReleaseHeldMedia
    />);

    const releaseButton = screen.getByRole("button", { name: "Release exact source" });
    expect(releaseButton).toBeDisabled();
    await user.type(screen.getByLabelText(/why is this exact source safe to release/i), "All three participants consented and I reviewed these exact bytes.");
    expect(releaseButton).toBeDisabled();
    await user.click(screen.getByLabelText(/I reviewed this exact source ledger/i));
    expect(releaseButton).toBeEnabled();
    await user.click(releaseButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mobile/capture/uploads/resumable/release",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      uploadSessionId: "aba9da45-c487-488d-99ae-13ffbf27f7bc",
      reason: "All three participants consented and I reviewed these exact bytes.",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Released processing · Held transcript");
    expect(screen.getByRole("status")).not.toHaveTextContent(/transcript released/i);
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders the durable external-import authority without inventing phone boundaries", () => {
    global.fetch = jest.fn() as typeof fetch;
    const evidence = heldSourceEvidence();
    evidence.sources[0] = {
      ...evidence.sources[0],
      status: "VERIFIED_MATCH",
      recordingStatus: "VERIFIED",
      processingDisposition: "RELEASED",
      transcriptDisposition: "RELEASED",
      boundaryAuthority: "STAFF_REVIEWED_EXTERNAL_IMPORT",
      releaseAudit: {
        releasedAt: "2026-08-02T20:00:00.000Z",
        reason: "All three participants consented and staff reviewed these exact imported bytes.",
        transcriptReleasedAt: "2026-08-02T20:00:00.000Z",
        transcriptReason: "All three participants consented to transcription.",
      },
      issues: [],
    };
    evidence.counts = { VERIFIED_MATCH: 1, HELD: 0, DRIFT: 0, INCOMPLETE: 0 };
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="recordings"
      consentSnapshot={{ total: 3, granted: 3, transcriptionPermitted: 3 }}
      sourceEvidence={evidence}
      canReleaseHeldMedia
    />);

    expect(screen.getByText("Audited external-import boundary")).toBeInTheDocument();
    expect(screen.getByText(/No phone START\/STOP receipts exist/i)).toBeInTheDocument();
    expect(screen.getByText(/All three participants consented and staff reviewed/i)).toBeInTheDocument();
    expect(screen.getByText(/Transcript separately released/i)).toBeInTheDocument();
    expect(screen.getByText("START absent")).toBeInTheDocument();
    expect(screen.getByText("STOP absent")).toBeInTheDocument();
    expect(screen.getByText(/No phone boundary is inferred/i)).toBeInTheDocument();
    expect(screen.queryByText(/and applied START\/STOP boundaries/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release exact source" })).not.toBeInTheDocument();
  });

  it("shows simulator uploads as plumbing proof rather than usable production content", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(packet())) as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="recordings"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 0 }}
      contentReadiness={{
        status: "capture-proof-only",
        label: "Capture plumbing proven",
        tone: "attention",
        detail: "8 source-media assets reached Nest, but this is not usable episode evidence. All source-media assets are marked as simulator captures.",
        nextAction: "Record a consented production episode take on a physical device before treating this workflow as content-ready.",
        captureAssetCount: 8,
        knownDurationSeconds: 42.6,
        longestKnownDurationSeconds: 5.32,
        shortCaptureCount: 8,
        simulatorCaptureCount: 8,
        unknownDurationCount: 0,
        verifiedCaptureCount: 8,
        substantialRecordingCount: 0,
        substantialThresholdSeconds: 60,
      }}
      studioHandoff={{
        project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
        recordings: [{
          recordingAssetId: "simulator-recording-1",
          fileName: "five-second-simulator.m4a",
          kind: "LOCAL_AUDIO",
          recordingStatus: "VERIFIED",
          status: "ATTACHED",
          mediaAssetId: "media-simulator-1",
          attachmentId: "attachment-simulator-1",
          attachmentUpdatedAt: "2026-07-19T18:24:10.000Z",
          episodeSlug: "episode-8-rehearsal",
          importRole: "spine-audio-candidate",
          promotedAt: "2026-07-19T18:24:10.000Z",
        }],
      }}
    />);
    expect(await screen.findByRole("heading", { name: "Capture plumbing proven" })).toBeInTheDocument();
    expect(screen.getByText(/not usable episode evidence/i)).toBeInTheDocument();
    expect(screen.getByText("43 sec")).toBeInTheDocument();
    expect(screen.getByText("5.3 sec")).toBeInTheDocument();
    expect(screen.getByText("8 / 8")).toBeInTheDocument();
    expect(screen.getByText(/record a consented production episode take on a physical device/i)).toBeInTheDocument();
    expect(screen.queryByText(/episode ready/i)).not.toBeInTheDocument();
  });

  it("withholds production-spine output status for simulator-only media", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(packet())) as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="outputs"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 0 }}
      contentReadiness={{
        status: "capture-proof-only",
        label: "Capture plumbing proven",
        tone: "attention",
        detail: "The sources are simulator captures.",
        nextAction: "Record on a physical device.",
        captureAssetCount: 1,
        knownDurationSeconds: 5,
        longestKnownDurationSeconds: 5,
        shortCaptureCount: 1,
        simulatorCaptureCount: 1,
        unknownDurationCount: 0,
        verifiedCaptureCount: 1,
        substantialRecordingCount: 0,
        substantialThresholdSeconds: 60,
      }}
      studioHandoff={{
        project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
        recordings: [{
          recordingAssetId: "simulator-recording-1",
          fileName: "five-second-simulator.m4a",
          kind: "LOCAL_AUDIO",
          recordingStatus: "VERIFIED",
          status: "ATTACHED",
          mediaAssetId: "media-simulator-1",
          attachmentId: "attachment-simulator-1",
          attachmentUpdatedAt: "2026-07-19T18:24:10.000Z",
          episodeSlug: "episode-8-rehearsal",
          importRole: "spine-audio-candidate",
          promotedAt: "2026-07-19T18:24:10.000Z",
        }],
      }}
    />);
    expect(screen.getByText(/does not call any attached file a production spine/i)).toBeInTheDocument();
    expect(screen.getByText(/production-spine status withheld/i)).toBeInTheDocument();
    expect(screen.queryByText(/episode ready/i)).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Client follow-up unavailable" })).toBeInTheDocument();
  });
});
