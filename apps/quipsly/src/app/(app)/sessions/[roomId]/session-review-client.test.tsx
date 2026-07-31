import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
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
          joinedAt: null,
          consent: {
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

    expect(screen.getByRole("heading", { name: "Phone → cloud → Nest evidence" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "homer-camera.mov" })).toBeInTheDocument();
    expect(screen.getByText("Verified Match")).toBeInTheDocument();
    expect(screen.getByText("Quipsly Capture 1.0 (9)")).toBeInTheDocument();
    expect(screen.getByText("iPhone17,3 · iOS 26.2")).toBeInTheDocument();
    expect(screen.getByText("Shure MV7i · USBAudio")).toBeInTheDocument();
    expect(screen.getByText("4,096 bytes · generation 1742")).toBeInTheDocument();
    expect(screen.getByText(/does not trust or import a phone-exported receipt as authority/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download Nest receipt" })).toHaveAttribute(
      "href",
      "/api/sessions/room-1/source-evidence",
    );
    expect(screen.queryByText(/actor-private/i)).not.toBeInTheDocument();
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
