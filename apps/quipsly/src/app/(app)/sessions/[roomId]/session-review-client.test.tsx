import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionReviewClient } from "./session-review-client";
import type { SessionReviewGoalCandidate } from "./session-review-model";

jest.mock("./transcript-correction-desk", () => ({ TranscriptCorrectionDesk: () => <div>Exact transcript desk</div> }));

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
  suggestedTitle: "Build a repeatable coaching review habit.",
  suggestedDescription: "My goal is to build a repeatable coaching review habit.",
  reviewStatus: "READY_FOR_HUMAN_REVIEW",
  humanApprovalRequired: true,
  committedGoalId: null,
};

function packet(goalCandidate = candidate) {
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
            sections: [{ id: "goals", label: "Candidate goals", items: [{ segmentId: "segment-1", timeLabel: "00:12-00:17", speakerLabel: "Homer", text: "Build a repeatable coaching review habit." }] }],
          },
        },
        createdAt: "2026-07-18T18:00:00.000Z",
      },
      highlights: [],
      actionCandidates: [],
      goalCandidates: [goalCandidate],
      actionItems: [],
      nextAction: "Review the packet.",
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

describe("Session review goal candidates", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("builds the available review packet from the exact transcript without forcing a rebuild", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packetReadyToBuild()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, idempotentReplay: false }))
      .mockResolvedValueOnce(jsonResponse(packet()));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient roomId="room-1" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);
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

  it("accepts only through the packet review ledger and preserves its success readback", async () => {
    const accepted: SessionReviewGoalCandidate = { ...candidate, reviewStatus: "ACCEPTED_AS_GOAL", humanApprovalRequired: false, committedGoalId: "goal-1" };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packet()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, idempotentReplay: false, goal: { id: "goal-1" } }))
      .mockResolvedValueOnce(jsonResponse(packet(accepted)));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();

    render(<SessionReviewClient roomId="room-1" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);
    expect(await screen.findByRole("heading", { name: "Choose what deserves to become a goal" })).toBeInTheDocument();
    expect(screen.getByText(/only “accept as goal” writes one actor-owned active goal/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Accept as goal" }));

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
    });
    expect(await screen.findByRole("status")).toHaveTextContent("No task, date, focus block, calendar event, message, or delivery was added");
    expect(screen.getByRole("link", { name: "Open goal" })).toHaveAttribute("href", "/work?goal=goal-1");
  });

  it("persists an edited goal draft without creating a goal or task", async () => {
    const edited: SessionReviewGoalCandidate = { ...candidate, suggestedTitle: "Build the weekly review habit", reviewStatus: "EDITED_FOR_REVIEW" };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packet()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, decision: "EDIT", goal: null }))
      .mockResolvedValueOnce(jsonResponse(packet(edited)));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionReviewClient roomId="room-1" consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }} />);
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
      .mockResolvedValueOnce(jsonResponse(packet()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, updatedAt: "2026-07-19T08:00:01.000Z", boundaries: { projectScoped: true, externalSideEffects: false } }));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionReviewClient
      roomId="room-1"
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/work/tags");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ entityKind: "session", entityId: "room-1", tagIds: ["tag-proof", "tag-episode"], expectedUpdatedAt: "2026-07-19T08:00:00.000Z" });
    expect(await screen.findByRole("status")).toHaveTextContent("No source, task, provider, calendar, or publication state changed");
    expect(screen.getByText("#Episode 4")).toBeInTheDocument();
  });

  it("shows the durable Studio attachment receipt and opens the exact episode", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(packet())) as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
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
  });

  it("reads iPhone quick captures back as the same canonical task, goal, and private note", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(packet())) as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 1 }}
      sessionQuickEntries={[
        { id: "mobile-note-1", kind: "NOTE", title: "Quick note", body: "Let the opening breathe.", status: "CAPTURED", createdAt: "2026-07-19T09:00:00.000Z", updatedAt: "2026-07-19T09:00:00.000Z", tags: [{ id: "tag-1", label: "Opening", slug: "opening" }] },
        { id: "mobile-task-1", kind: "TASK", title: "Proof-listen act one", body: "Use the room mix.", status: "OPEN", createdAt: "2026-07-19T09:01:00.000Z", updatedAt: "2026-07-19T09:01:00.000Z", tags: [] },
        { id: "mobile-goal-1", kind: "GOAL", title: "Make coaching follow-through obvious", body: null, status: "ACTIVE", createdAt: "2026-07-19T09:02:00.000Z", updatedAt: "2026-07-19T09:02:00.000Z", tags: [] },
      ]}
    />);
    expect(await screen.findByRole("heading", { name: "3 Session notes, tasks, or goals" })).toBeInTheDocument();
    expect(screen.getAllByText("Let the opening breathe.")[0]).toBeInTheDocument();
    expect(screen.getByText("#Opening")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find all accessible work tagged Opening" })).toHaveAttribute("href", "/find?q=Opening");
    expect(screen.getByText("Quick note").closest("article")).toHaveAttribute("id", "quick-entry-mobile-note-1");
    expect(screen.getByRole("link", { name: "Open same task in Work" })).toHaveAttribute("href", "/work?task=mobile-task-1");
    expect(screen.getByRole("link", { name: "Open same goal in Work" })).toHaveAttribute("href", "/work?goal=mobile-goal-1");
    expect(screen.getByText(/not AI candidates or copied phone drafts/i)).toBeInTheDocument();
  });

  it("edits the same iPhone note and replaces its canonical Nest tags with optimistic revisions", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(packet()))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        note: {
          id: "mobile-note-1",
          title: "Opening rhythm",
          body: "Pause, then let the question breathe.",
          updatedAt: "2026-07-19T09:05:00.000Z",
          tags: [{ id: "tag-opening", label: "Opening", slug: "opening" }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, updatedAt: "2026-07-19T09:06:00.000Z" }));
    global.fetch = fetchMock as typeof fetch;
    const user = userEvent.setup();
    render(<SessionReviewClient
      roomId="room-1"
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
      sessionQuickEntries={[{
        id: "mobile-note-1",
        kind: "NOTE",
        title: "Quick note",
        body: "Let the opening breathe.",
        status: "CAPTURED",
        createdAt: "2026-07-19T09:00:00.000Z",
        updatedAt: "2026-07-19T09:00:00.000Z",
        tags: [{ id: "tag-opening", label: "Opening", slug: "opening" }],
      }]}
    />);
    expect(await screen.findByRole("heading", { name: "Coaching review" })).toBeInTheDocument();
    await user.click(screen.getByText("Edit note and tags"));
    const title = screen.getByRole("textbox", { name: "Title" });
    const note = screen.getByRole("textbox", { name: "Note" });
    await user.clear(title);
    await user.type(title, "Opening rhythm");
    await user.clear(note);
    await user.type(note, "Pause, then let the question breathe.");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("status")).toHaveTextContent("original Session identity");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/notes/mobile-note-1");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      title: "Opening rhythm",
      body: "Pause, then let the question breathe.",
      expectedUpdatedAt: "2026-07-19T09:00:00.000Z",
    });

    await user.click(screen.getByRole("checkbox", { name: "#Edit point" }));
    await user.click(screen.getByRole("button", { name: "Save tags" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Canonical Nest tags saved");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
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
      consentSnapshot={{ total: 1, granted: 1, transcriptionPermitted: 0 }}
      captureReceipts={{
        captures: [{
          captureId: "08a8241e-bc80-4410-a917-2b84d285769d",
          status: "START_AND_STOP_RECEIVED",
          startedAt: "2026-07-19T15:30:26.000Z",
          stoppedAt: "2026-07-19T15:30:35.000Z",
          lastReceivedAt: "2026-07-19T15:30:35.704Z",
        }],
      }}
    />);
    expect(await screen.findByRole("heading", { name: "1 phone capture receipt trail" })).toBeInTheDocument();
    expect(screen.getByText("08a8241e-bc80-4410-a917-2b84d285769d")).toBeInTheDocument();
    expect(screen.getByText("Start + stop received")).toBeInTheDocument();
    expect(screen.getByText(/do not claim the audio uploaded/i)).toBeInTheDocument();
    expect(screen.getByText(/remains on the iPhone until upload succeeds/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload|retry|transcribe/i })).not.toBeInTheDocument();
  });

  it("shows simulator uploads as plumbing proof rather than usable production content", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(packet())) as typeof fetch;
    render(<SessionReviewClient
      roomId="room-1"
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
    expect(screen.getByText(/does not call any attached file a production spine/i)).toBeInTheDocument();
    expect(screen.getByText(/production-spine status withheld/i)).toBeInTheDocument();
    expect(screen.queryByText(/episode ready/i)).not.toBeInTheDocument();
  });
});
