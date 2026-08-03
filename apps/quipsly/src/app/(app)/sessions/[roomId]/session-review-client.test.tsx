import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionReviewClient } from "./session-review-client";
import type { SessionReviewCandidate, SessionReviewGoalCandidate, SessionReviewNoteCandidate, SessionReviewPacket } from "./session-review-model";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

jest.mock("./transcript-correction-desk", () => ({ TranscriptCorrectionDesk: () => <div>Exact transcript desk</div> }));
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

function packetReadyToBuild() {
  const value = packet();
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
  afterEach(() => {
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
    expect(screen.getByRole("heading", { name: "Current runway" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Prepare" })).toHaveAttribute("href", "/sessions/room-1?mode=prepare");
    expect(screen.getByRole("link", { name: "Recordings" })).toHaveAttribute("href", "/sessions/room-1?mode=recordings");
    expect(screen.getByRole("link", { name: "Transcript" })).toHaveAttribute("href", "/sessions/room-1?mode=transcript");
    expect(screen.getByRole("link", { name: "Notes" })).toHaveAttribute("href", "/sessions/room-1?mode=notes");
    expect(screen.getByRole("link", { name: "Work" })).toHaveAttribute("href", "/sessions/room-1?mode=work");
    expect(screen.getByRole("link", { name: "Outputs" })).toHaveAttribute("href", "/sessions/room-1?mode=outputs");
    expect(screen.getByRole("heading", { name: "Needs an honest decision" })).toBeInTheDocument();
    expect(screen.getByText("Transcription permission is incomplete")).toBeInTheDocument();
    expect(screen.getByText("0 of 1 standalone consent records permit transcription.")).toBeInTheDocument();
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

    expect(screen.getByRole("link", { name: new RegExp(`^${mode}$`, "i") })).toHaveAttribute("aria-current", "page");
    if (mode === "outputs") {
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sessions/room-1/client-follow-up",
        { cache: "no-store" },
      );
      expect(
        await screen.findByRole("heading", { name: "Client follow-up unavailable" }),
      ).toBeInTheDocument();
    } else {
      expect(fetchMock).not.toHaveBeenCalled();
    }
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/transcripts/")),
    ).toBe(false);
  });

  it("starts the durable released transcript job from the Session workspace", async () => {
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
    const running = JSON.parse(JSON.stringify(queued)) as SessionReviewPacket;
    running.transcriptJob!.status = "RUNNING";
    running.packet!.safeActions = [];
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(queued))
      .mockResolvedValueOnce(jsonResponse({ ok: true, status: "RUNNING", executionRequested: true }, 202))
      .mockResolvedValueOnce(jsonResponse(running));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 3, granted: 3, transcriptionPermitted: 3 }} />);
    const start = await screen.findByRole("button", { name: "Start transcription" });
    expect(screen.getByText(/creates derived text—not notes, tasks, goals, or client delivery/i)).toBeInTheDocument();
    await user.click(start);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/mobile/capture/transcripts/run");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ transcriptJobId: "job-1" });
    expect(await screen.findByRole("status")).toHaveTextContent(/Transcription started from the released immutable source/i);
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start transcription" })).not.toBeInTheDocument();
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
    expect(await screen.findByRole("status")).toHaveTextContent(/Transcription started from the released immutable source/i);
  });

  it("persists source-grounded packet lane review without creating downstream work", async () => {
    const reviewed = packet();
    reviewed.packet!.reviewLanes![0] = {
      ...reviewed.packet!.reviewLanes![0],
      status: "APPROVED_FOR_INTERNAL_USE",
      humanApprovalRequired: false,
      humanReview: {
        status: "APPROVED_FOR_INTERNAL_USE",
        note: "Useful recap once the client-safe wording is authored deliberately.",
        reviewedAt: "2026-08-01T18:30:00.000Z",
      },
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packet()))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse(reviewed));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);

    expect(await screen.findByRole("heading", { name: "Review notes by purpose" })).toBeInTheDocument();
    expect(screen.getByText("1 category has no candidates")).toBeInTheDocument();
    expect(screen.getByText("1 review category has no candidates")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Goals and tasks" })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Review note")).toHaveLength(1);
    expect(screen.getByText(/does not make the text a canonical Session note or authorize client delivery/i)).toBeInTheDocument();
    expect(screen.getByText(/creates no canonical note, task, goal, client delivery, message, calendar event, or publication/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Review note"), "Useful recap once the client-safe wording is authored deliberately.");
    await user.click(screen.getByRole("button", { name: "Approve inside Quipsly" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/mobile/capture/transcripts/packet");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({
        callRoomId: "room-1",
        transcriptJobId: "job-1",
        summaryNoteId: "summary-1",
        laneId: "client-follow-up",
        status: "APPROVED_FOR_INTERNAL_USE",
        note: "Useful recap once the client-safe wording is authored deliberately.",
      }),
    });
    expect(await screen.findByText(/No canonical note, task, goal, client delivery, message, calendar event, or publication was created/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen for review" })).toBeInTheDocument();
    expect(screen.getByText("Useful recap once the client-safe wording is authored deliberately.")).toBeInTheDocument();
  });

  it("builds the available review packet from the exact transcript without forcing a rebuild", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packetReadyToBuild()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, idempotentReplay: false }))
      .mockResolvedValueOnce(jsonResponse(packet()));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);
    const build = await screen.findByRole("button", { name: "Build review packet" });
    expect(screen.getByText(/creates no task or goal and sends or publishes nothing/i)).toBeInTheDocument();

    await user.click(build);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/mobile/capture/transcripts/packet");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ transcriptJobId: "job-1", force: false });
    expect(await screen.findByRole("status")).toHaveTextContent("remain internal until you explicitly review them");
    expect(screen.getByRole("heading", { name: "Session brief" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Candidate goals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /00:12-00:17.*build a repeatable coaching review habit/i })).toHaveAttribute("href", "#transcript-segment-segment-1");
    expect(screen.getByText("Every brief item points to immutable transcript evidence.")).toBeInTheDocument();
    expect(screen.getByText("Inspect exact saved packet text")).toBeInTheDocument();
  });

  it("locks stale packet decisions and offers an append-only rebuild from current transcript review", async () => {
    const stale = packet();
    stale.packet = {
      ...stale.packet!,
      status: "TRANSCRIPT_REVIEW_CHANGED",
      transcriptReview: {
        snapshotSha256: "b".repeat(64),
        segmentCount: 1,
        humanReviewedSegmentCount: 1,
        providerOnlySegmentCount: 0,
        fullyHumanReviewed: true,
        packetStale: true,
      },
      safeActions: [{
        id: "build-review-packet",
        label: "Build review packet",
        enabled: true,
        risk: "medium",
        why: "Transcript review changed.",
        boundary: "Creates a new internal review packet only.",
      }],
      nextAction: "Build a new packet before accepting any candidate.",
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(stale));
    global.fetch = fetchMock as typeof fetch;

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);

    expect(await screen.findByText("Transcript review changed after this packet was built.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build current packet" })).toBeInTheDocument();
    expect(screen.getByText(/Task review is held because this packet predates/i)).toBeInTheDocument();
    expect(screen.getByText(/Goal review is held because this packet predates/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve inside Quipsly" })).not.toBeInTheDocument();
  });

  it("accepts only through the packet review ledger and preserves its success readback", async () => {
    const accepted: SessionReviewGoalCandidate = { ...candidate, reviewStatus: "ACCEPTED_AS_GOAL", humanApprovalRequired: false, committedGoalId: "goal-1" };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packet()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, idempotentReplay: false, goal: { id: "goal-1" } }))
      .mockResolvedValueOnce(jsonResponse(packet(accepted)));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);
    expect(await screen.findByRole("heading", { name: "Choose what deserves to become a goal" })).toBeInTheDocument();
    expect(screen.getByText(/“Review & create goal” writes one new actor-owned ACTIVE Goal/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Review & create goal" }));
    expect(screen.getByRole("textbox", { name: "Goal title" })).toHaveValue("Build a repeatable coaching review habit.");
    expect(screen.getByText(/tasks, focus blocks, reminders, calendar placement, messages, delivery, and publication remain separate decisions/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create goal" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe("/api/mobile/capture/transcripts/packet/goals");
    expect(JSON.parse(String(request[1]?.body))).toEqual({
      callRoomId: "room-1",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      summaryNoteId: "summary-1",
      packetBuildId: "build-1",
      goalCandidateId: "packet-goal-build-1-segment-1",
      decision: "ACCEPT",
      title: "Build a repeatable coaching review habit.",
      description: "My goal is to build a repeatable coaching review habit.",
      targetAt: null,
      tagIds: [],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("One actor-owned canonical goal was created. No task, focus block, calendar event, message, or delivery was added.");
    expect(screen.getByRole("link", { name: "Open goal and source evidence" })).toHaveAttribute("href", "/work?goal=goal-1");
  });

  it("adds reviewed transcript evidence to one explicitly selected goal without sending goal mutations", async () => {
    const merged: SessionReviewGoalCandidate = {
      ...candidate,
      reviewStatus: "MERGED_INTO_GOAL",
      humanApprovalRequired: false,
      committedGoalId: "goal-existing",
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packetWithGoalMergeTarget()))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        decision: "MERGE",
        idempotentReplay: false,
        goal: { id: "goal-existing", targetAt: "2026-09-01T18:00:00.000Z", tags: [] },
        receipt: {
          decision: "MERGE",
          goalCandidateId: candidate.id,
          goalId: "goal-existing",
          goalProgressReceiptId: "progress-receipt-1",
        },
        boundaries: {
          mergeAppendsOneActorOwnedGoalEvidenceReceipt: true,
          mergeChangesNoGoalDefinitionStatusTargetOrTags: true,
          taskCreated: false,
          targetDateCreated: false,
          projectTagsApplied: false,
          reminderCreated: false,
          calendarMutated: false,
          externalDelivery: false,
          publication: false,
        },
      }))
      .mockResolvedValueOnce(jsonResponse(packetWithGoalMergeTarget(merged)));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);
    await user.click(await screen.findByRole("button", { name: "Add evidence to existing goal" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Add evidence to goal" }), "goal-existing");

    expect(screen.getByText("Use one evidence-backed review every Friday.")).toBeInTheDocument();
    expect(screen.getByText(/2 existing evidence receipts/i)).toBeInTheDocument();
    expect(screen.getByText(/will not rewrite the selected goal/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add reviewed evidence" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const request = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(request).toEqual({
      callRoomId: "room-1",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      summaryNoteId: "summary-1",
      packetBuildId: "build-1",
      goalCandidateId: candidate.id,
      decision: "MERGE",
      mergeTargetGoalId: "goal-existing",
      mergeExpectedUpdatedAt: "2026-08-03T14:00:00.000Z",
    });
    expect(request).not.toHaveProperty("title");
    expect(request).not.toHaveProperty("description");
    expect(request).not.toHaveProperty("targetAt");
    expect(request).not.toHaveProperty("tagIds");
    expect(await screen.findByRole("status")).toHaveTextContent("Its definition, status, target, tags, tasks, and project did not change");
    expect(screen.getByText("Added as reviewed evidence to one existing goal.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open goal and source evidence" })).toHaveAttribute("href", "/work?goal=goal-existing");
  });

  it("loads late Session tags into the task review form and submits the explicit materialization choices", async () => {
    const acceptedAction: SessionReviewCandidate = {
      ...actionCandidate,
      reviewStatus: "ACCEPTED_AS_ACTION_ITEM",
      humanApprovalRequired: false,
      committedActionItemId: "task-1",
    };
    const taxonomy = {
      project: { id: "project-1", name: "High Ground Odyssey", slug: "high-ground" },
      tags: [
        { id: "tag-follow", label: "Follow-through", slug: "follow-through", category: "workflow", projectId: "project-1" },
        { id: "tag-coaching", label: "Coaching", slug: "coaching", category: "format", projectId: "project-1" },
      ],
      catalog: [
        { id: "tag-follow", label: "Follow-through", slug: "follow-through", category: "workflow", projectId: "project-1" },
        { id: "tag-coaching", label: "Coaching", slug: "coaching", category: "format", projectId: "project-1" },
      ],
      canManage: true,
      canManageVocabulary: true,
      updatedAt: "2026-08-01T18:00:00.000Z",
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packetWithAction()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, idempotentReplay: false, actionItem: { id: "task-1", assignedUserId: null, dueAt: null, tagIds: ["tag-follow"] } }))
      .mockResolvedValueOnce(jsonResponse(packetWithAction(acceptedAction)));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    const { rerender } = render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);

    expect(await screen.findByRole("button", { name: "Review & create task" })).toBeInTheDocument();
    rerender(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} sessionTaxonomy={taxonomy} />);
    await user.click(screen.getByRole("button", { name: "Review & create task" }));

    expect(screen.getByRole("checkbox", { name: "Follow-through" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Coaching" })).toBeChecked();
    await user.selectOptions(screen.getByRole("combobox", { name: "Owner" }), "unassigned");
    await user.click(screen.getByRole("checkbox", { name: "Coaching" }));
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/mobile/capture/transcripts/packet/actions");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      callRoomId: "room-1",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      summaryNoteId: "summary-1",
      packetBuildId: "build-1",
      actionCandidateId: "action-candidate-1",
      decision: "ACCEPT",
      title: "Send the revised episode outline",
      detail: "Share the source-backed outline after the coaching review.",
      assignToMe: false,
      dueAt: null,
      tagIds: ["tag-follow"],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("One unassigned Quipsly task was created and 1 project tag");
    expect(screen.getByRole("link", { name: "Open task" })).toHaveAttribute("href", "/work?task=task-1");
  });

  it("reviews packet wording, purpose, and audience before saving a source-linked note", async () => {
    const acceptedNote: SessionReviewNoteCandidate = {
      ...noteCandidate,
      humanApprovalRequired: false,
      committedNoteId: "note-1",
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packetWithNote()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, idempotentReplay: false, note: { id: "note-1", visibility: "CLIENT_SAFE" } }))
      .mockResolvedValueOnce(jsonResponse(packetWithNote(acceptedNote)));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);

    await user.click(await screen.findByRole("button", { name: "Review & save note" }));
    const noteBody = screen.getByRole("textbox", { name: "Note" });
    await user.clear(noteBody);
    await user.type(noteBody, "The weekly review makes follow-through visible.");
    await user.selectOptions(screen.getByRole("combobox", { name: "Purpose" }), "DECISION");
    await user.selectOptions(screen.getByRole("combobox", { name: "Audience" }), "CLIENT_SAFE");
    expect(screen.getByText(/Eligible for a separately reviewed client follow-up/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save source-linked note" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/mobile/capture/transcripts/notes");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "packet-note-build-1-coaching-insights-segment-1",
      expectedProviderTextSha256: "a".repeat(64),
      title: "Insights and decisions",
      body: "The weekly review makes follow-through visible.",
      kind: "DECISION",
      visibility: "CLIENT_SAFE",
      surface: "nest-session-packet-review",
      transcriptJobId: "job-1",
      recordingAssetId: "asset-1",
      summaryNoteId: "summary-1",
      packetBuildId: "build-1",
      packetNoteCandidateId: "packet-note-build-1-coaching-insights-segment-1",
      packetLaneId: "coaching-insights",
      decision: "ACCEPT",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("client-safe visibility");
    expect(screen.getByRole("link", { name: "Open notes" })).toHaveAttribute("href", "/sessions/room-1?mode=notes");
  });

  it("keeps an edited packet-note candidate non-canonical and auditable", async () => {
    const editedNote: SessionReviewNoteCandidate = {
      ...noteCandidate,
      suggestedTitle: "Weekly follow-through insight",
      reviewStatus: "EDITED_FOR_REVIEW",
      lastHumanReview: { receiptId: "receipt-1", decision: "EDIT", reviewedAt: "2026-08-03T12:00:00.000Z", reviewedByUserId: "user-1" },
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packetWithNote()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, decision: "EDIT", note: null }))
      .mockResolvedValueOnce(jsonResponse(packetWithNote(editedNote)));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);

    await user.click(await screen.findByRole("button", { name: "Edit candidate" }));
    const title = screen.getByRole("textbox", { name: /Note title/i });
    await user.clear(title);
    await user.type(title, "Weekly follow-through insight");
    await user.click(screen.getByRole("button", { name: "Save for review" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      decision: "EDIT",
      title: "Weekly follow-through insight",
      packetNoteCandidateId: noteCandidate.id,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("No canonical note");
    expect(screen.getByText("Edited For Review")).toBeInTheDocument();
  });

  it("reviews the complete combined note before merging into one recoverable revision", async () => {
    const mergedCandidate: SessionReviewNoteCandidate = {
      ...noteCandidate,
      reviewStatus: "MERGED_INTO_NOTE",
      committedNoteId: "existing-note-1",
      lastHumanReview: { receiptId: "merge-receipt-1", decision: "MERGE", reviewedAt: "2026-08-03T14:01:00.000Z", reviewedByUserId: "user-1" },
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packetWithNote(noteCandidate, true)))
      .mockResolvedValueOnce(jsonResponse({ ok: true, decision: "MERGE", note: { id: "existing-note-1", visibility: "AUTHOR_PRIVATE" }, idempotentReplay: false }))
      .mockResolvedValueOnce(jsonResponse(packetWithNote(mergedCandidate, true)));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);

    await user.click(await screen.findByRole("button", { name: "Merge into note" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Merge into note" }), "existing-note-1");
    expect(screen.getByRole("textbox", { name: /^Note$/i })).toHaveValue("Keep the strongest editorial decisions together.\n\nI realized the weekly review makes follow-through visible.");
    await user.click(screen.getByRole("button", { name: "Merge as new revision" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      decision: "MERGE",
      mergeTargetNoteId: "existing-note-1",
      mergeExpectedUpdatedAt: "2026-08-03T14:00:00.000Z",
      mergedTitle: "Episode direction",
      mergedBody: "Keep the strongest editorial decisions together.\n\nI realized the weekly review makes follow-through visible.",
      mergedKind: "SESSION_NOTE",
      mergedVisibility: "AUTHOR_PRIVATE",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/new recoverable revision/i);
    expect(screen.getByText(/Merged into one revisioned Session note/i)).toBeInTheDocument();
  });

  it("persists an edited goal draft without creating a goal or task", async () => {
    const edited: SessionReviewGoalCandidate = { ...candidate, suggestedTitle: "Build the weekly review habit", reviewStatus: "EDITED_FOR_REVIEW" };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packet()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, decision: "EDIT", goal: null }))
      .mockResolvedValueOnce(jsonResponse(packet(edited)));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionReviewClient roomId="room-1" sessionTitle="Coaching review" mode="transcript" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);
    await screen.findByRole("heading", { name: "Choose what deserves to become a goal" });
    await user.click(screen.getByRole("button", { name: "Edit candidate" }));
    const title = screen.getByRole("textbox", { name: "Goal title" });
    await user.clear(title);
    await user.type(title, "Build the weekly review habit");
    await user.click(screen.getByRole("button", { name: "Save for review" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ decision: "EDIT", title: "Build the weekly review habit" });
    expect(await screen.findByRole("status")).toHaveTextContent("No goal or task was created");
    expect(screen.queryByRole("link", { name: "Open goal" })).not.toBeInTheDocument();
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
        purpose: "COACHING",
        status: "PLANNED",
        provider: "planned",
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

    expect(screen.getByRole("heading", { name: "Preparation runway" })).toBeInTheDocument();
    expect(screen.getByText("Private coaching")).toBeInTheDocument();
    expect(screen.getByText("Homer")).toBeInTheDocument();
    expect(screen.getByText("All participants ready")).toBeInTheDocument();
    expect(screen.getByText("Transcript not ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage room setup" })).toHaveAttribute("href", "/coaching/sessions");
    expect(screen.getByText(/Transcript separately enforces the complete release receipt/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the durable Studio attachment receipt and opens the exact episode", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(packet())) as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      sessionTitle="Coaching review"
      mode="outputs"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }}
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
    expect(await screen.findByRole("heading", { name: "Client follow-up unavailable" })).toBeInTheDocument();
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
    expect(await screen.findByRole("heading", { name: "1 deliberate note" })).toBeInTheDocument();
    expect(screen.getAllByText("Let the opening breathe.")[0]).toBeInTheDocument();
    expect(screen.getByText("#Opening")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find all accessible work tagged Opening" })).toHaveAttribute("href", "/find?tag=tag-1");
    expect(screen.getByRole("heading", { name: "Quick note" }).closest("article")).toHaveAttribute("id", "session-note-mobile-note-1");
    expect(screen.queryByText("Proof-listen act one")).not.toBeInTheDocument();
    expect(screen.queryByText("Make coaching follow-through obvious")).not.toBeInTheDocument();
    expect(screen.getByText(/Transcript candidates and committed work stay in their own modes/i)).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "2 deliberate iPhone work captures" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open same task in Work" })).toHaveAttribute("href", "/work?task=mobile-task-1");
    expect(screen.getByRole("link", { name: "Open same goal in Work" })).toHaveAttribute("href", "/work?goal=mobile-goal-1");
    expect(screen.queryByText("Quick note")).not.toBeInTheDocument();
    expect(screen.getByText(/distinct from transcript candidates/i)).toBeInTheDocument();
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
    expect(await screen.findByRole("status")).toHaveTextContent("append-only revision history");
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
    expect(await screen.findByRole("status")).toHaveTextContent("Canonical Nest tags are saved");
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
    expect(screen.getByText(/not attached as a participant/i)).toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: "Source → private vault → Nest evidence" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "homer-camera.mov" })).toBeInTheDocument();
    expect(screen.getByText("Verified Match")).toBeInTheDocument();
    expect(screen.getByText("Quipsly Capture 1.0 (9)")).toBeInTheDocument();
    expect(screen.getByText("iPhone17,3 · iOS 26.2")).toBeInTheDocument();
    expect(screen.getByText("Shure MV7i · USBAudio")).toBeInTheDocument();
    expect(screen.getByText("4,096 bytes · generation 1742")).toBeInTheDocument();
    expect(screen.getByText(/Phone exports and browser claims are never treated as authority/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download Nest receipt" })).toHaveAttribute(
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
