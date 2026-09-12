/** @jest-environment node */

import { createHash } from "node:crypto";

import {
  buildCoachingPacketFromTranscriptJob,
  loadSessionFollowThroughSource,
  sessionFollowThroughAnalysisSource,
  buildTranscriptEvidenceSpans,
  buildTranscriptPacketBrief,
  generatedPacketHighlightCanRemove,
  generatedPacketNoteCanRefresh,
  isUnreviewedTranscriptActionItem,
  mergePacketActionCandidates,
  packetCreatesOrdinarySessionWork,
  packetSnapshotMatches,
  packetSnapshotMatchesTranscriptJob,
  projectTranscriptSegmentsForPacket,
  projectTranscriptJobSegmentsForPacket,
  reviewLaneDefinitionsForPurpose,
  selectLatestCorrelatedPacketNotes,
  sessionRecapTitle,
  SESSION_PACKET_TEMPLATE_VERSION,
  transcriptPacketSnapshot,
  transcriptJobPacketSnapshot,
} from "./coaching-packets";
import { mobileCaptureTranscriptProcessingGate } from "./mobile-capture-processing-gates";
import { analyzeSessionTranscript } from "./session-transcript-analysis";

jest.mock("./mobile-capture-processing-gates", () => ({
  mobileCaptureTranscriptProcessingGate: jest.fn(),
}));

const mockedTranscriptGate = jest.mocked(mobileCaptureTranscriptProcessingGate);

function completedTranscriptJob() {
  return {
    id: "transcript-1",
    roomId: "room-1",
    assetId: "asset-1",
    provider: "test-provider",
    status: "COMPLETED",
    resultJson: {
      processingControl: { routing: {
        schema: "quipsly-transcript-routing-summary-v1",
        sourceTopology: "participant-isolated",
        speakerAuthority: "source-binding",
        participantLabel: "Charlie",
      } },
    },
    asset: {
      id: "asset-1",
      roomId: "room-1",
      participantId: "participant-charlie",
    },
    room: {
      title: "First coaching consultation",
      bookingId: "booking-1",
      purpose: "COACHING",
      booking: { id: "booking-1" },
      projectId: "project-1",
      coachingEngagementId: "engagement-1",
      coachingEngagement: { primaryClientUserId: "client-1" },
      participants: [{ id: "participant-charlie", userId: "client-1", accessStatus: "ACTIVE" }],
    },
    segments: [
      {
        id: "segment-action",
        speakerLabel: "Charlie",
        startSeconds: 12,
        endSeconds: 18,
        text: "I will send the outline before next time.",
        confidence: 0.98,
      },
      {
        id: "segment-context",
        speakerLabel: "Homer",
        startSeconds: 19,
        endSeconds: 24,
        text: "That gives the episode a much clearer shape.",
        confidence: 0.96,
      },
    ],
  };
}

function automaticWorkStores() {
  const actionItems = new Map<string, any>();
  const goals = new Map<string, any>();
  return {
    actionItem: {
      findUnique: jest.fn(
        async ({ where }: any) => actionItems.get(where.id) || null,
      ),
      findMany: jest.fn(async () => Array.from(actionItems.values())),
      create: jest.fn(async ({ data }: any) => {
        const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
        actionItems.set(data.id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = {
          ...actionItems.get(where.id),
          ...data,
          updatedAt: new Date(),
        };
        actionItems.set(where.id, row);
        return row;
      }),
      delete: jest.fn(async ({ where }: any) => {
        const row = actionItems.get(where.id) || null;
        actionItems.delete(where.id);
        return row;
      }),
    },
    goal: {
      findUnique: jest.fn(
        async ({ where }: any) => goals.get(where.id) || null,
      ),
      findMany: jest.fn(async () => Array.from(goals.values())),
      create: jest.fn(async ({ data }: any) => {
        const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
        goals.set(data.id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = { ...goals.get(where.id), ...data, updatedAt: new Date() };
        goals.set(where.id, row);
        return row;
      }),
      delete: jest.fn(async ({ where }: any) => {
        const row = goals.get(where.id) || null;
        goals.delete(where.id);
        return row;
      }),
    },
  };
}

describe("transcript coaching follow-through", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTranscriptGate.mockResolvedValue({ allowed: true, receipt: null });
  });

  it("materializes multiple semantic tasks and notes from one passage with original source anchors", async () => {
    const job: any = completedTranscriptJob();
    job.segments = [{ ...job.segments[0],
      text: "Practicaré mañana. Grabaré el viernes. Mi meta es certificarme. Prefiero las tardes. No quiero recordatorios diarios.",
    }];
    const work = automaticWorkStores();
    let noteSequence = 0;
    const noteCreate = jest.fn(async ({ data }: any) => ({ id: `semantic-note-${++noteSequence}`, ...data }));
    const prisma = { transcriptJob: { findUnique: jest.fn().mockResolvedValue(job) },
      coachingNote: { findFirst: jest.fn().mockResolvedValue(null), create: noteCreate }, ...work };
    const loaded = await loadSessionFollowThroughSource({ prisma, transcriptJobId: job.id });
    if (!loaded.ok) throw new Error(loaded.error);
    const source = sessionFollowThroughAnalysisSource(job, loaded.resolvedTranscript);
    const item = (title: string, excerpt: string) => ({ sourceId: source.segments[0]!.id, title, excerpt });
    const analysis = await analyzeSessionTranscript(source, { name: "synthetic", model: "semantic-fixture", generate: async () => JSON.stringify({
      tasks: [item("Practicar mañana", "Practicaré mañana."), item("Grabar el viernes", "Grabaré el viernes.")],
      goals: [item("Obtener la certificación", "Mi meta es certificarme.")],
      notes: [item("Preferencia por las tardes", "Prefiero las tardes."), item("Sin recordatorios diarios", "No quiero recordatorios diarios.")],
    }) });
    job.room.followThroughAnalysis = { status: "completed", resultJson: analysis };
    const result = await buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: job.id,
      authorUserId: "coach-1", requireAnalysisFingerprint: analysis.sourceFingerprint });
    expect(result).toMatchObject({ ok: true, actionItemCount: 2, goalCount: 1 });
    const tasks = await work.actionItem.findMany();
    expect(tasks.map(task => task.title)).toEqual(["Practicar mañana", "Grabar el viernes"]);
    expect(new Set(tasks.map(task => task.id)).size).toBe(2);
    for (const task of tasks) expect(task.sourceJson).toMatchObject({
      transcriptJobId: job.id, segmentId: "segment-action", startSeconds: 12, endSeconds: 18,
    });
    const notes = noteCreate.mock.calls.map(([call]) => call.data).filter(note => note.kind === "HIGHLIGHT");
    expect(notes).toHaveLength(2);
    expect(new Set(notes.map(note => note.sourceJson.analysisItemId)).size).toBe(2);
    expect(notes[1]!.body).toContain("No quiero recordatorios diarios.");
    expect(notes[1]!.body).not.toContain("Practicaré");
    expect((await work.goal.findMany())[0]!.title).toBe("Obtener la certificación");

    work.actionItem.create.mockClear();
    noteCreate.mockClear();
    job.segments[0].text = "He cambiado de opinión.";
    const stale = await buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: job.id,
      authorUserId: "coach-1", requireAnalysisFingerprint: analysis.sourceFingerprint });
    expect(stale).toMatchObject({ ok: false, errorCode: "SESSION_ANALYSIS_SOURCE_CHANGED" });
    expect(work.actionItem.create).not.toHaveBeenCalled();
    expect(noteCreate).not.toHaveBeenCalled();
  });

  it("turns the operated coaching transcript into distinct useful work rather than greeting notes", async () => {
    const job = completedTranscriptJob();
    const original = [
      "Welcome to our coaching session",
      "Today we will clarify your goal and choose one next step",
      "What outcome would make this week feel successful",
      "my goal is to complete the certification practice review by friday please create a task to send the recording to my instructor tomorrow and note that i want accountability without daily reminders",
      "You",
    ];
    job.segments = original.map((text, index) => ({ id: `operated-${index}`, text,
      speakerLabel: "Charlie", startSeconds: index * 6, endSeconds: index * 6 + 4, confidence: 0.98 }));
    const work = automaticWorkStores();
    const noteCreate = jest.fn(async ({ data }: any) => ({ id: `note-${data.kind}`, ...data }));
    const result = await buildCoachingPacketFromTranscriptJob({ prisma: {
      transcriptJob: { findUnique: jest.fn().mockResolvedValue(job) },
      coachingNote: { findFirst: jest.fn().mockResolvedValue(null), create: noteCreate }, ...work,
    }, transcriptJobId: job.id, authorUserId: "coach-1" });
    expect(result).toMatchObject({ actionItemCount: 1, goalCount: 1 });
    expect((await work.goal.findMany())[0].title).toBe("Complete the certification practice review by friday");
    expect((await work.actionItem.findMany())[0].title).toBe("Send the recording to my instructor tomorrow");
    const notes = noteCreate.mock.calls.map(([call]) => call.data);
    const highlights = notes.filter(note => note.kind === "HIGHLIGHT");
    expect(highlights).toHaveLength(1);
    expect(highlights[0].body).toContain("i want accountability without daily reminders");
    expect(highlights[0].body).not.toContain("create a task");
    expect(highlights[0].sourceJson).toMatchObject({ segmentId: "operated-3", startSeconds: 18, endSeconds: 22 });
    const summary = notes.find(note => note.kind === "SUMMARY");
    expect(summary.body).not.toMatch(/Welcome to|What outcome|Today we will|— You(?:\n|$)/);
    expect(summary.body).toContain("i want accountability without daily reminders");
    expect(summary.sourceJson.packetBrief.overview.segmentCount).toBe(5);
    expect(job.segments.map(segment => segment.text)).toEqual(original);
  });

  it("assigns repeated first-person commitments to their recording speaker, not the primary client", async () => {
    const job = completedTranscriptJob();
    job.room.participants[0]!.userId = "coach-1";
    job.segments = [0, 10].flatMap((offset) => [
      { id: `goal-${offset}`, speakerLabel: "Charlie", startSeconds: offset, endSeconds: offset + 3,
        text: "My goal is to write every morning.", confidence: 0.98 },
      { id: `task-${offset}`, speakerLabel: "Charlie", startSeconds: offset + 4, endSeconds: offset + 8,
        text: "Tomorrow I will draft one page.", confidence: 0.98 },
    ]);
    job.segments.push({ id: "clipped-repeat", speakerLabel: "Charlie", startSeconds: 20, endSeconds: 22,
      text: "My goal is to write every...", confidence: 0.98 });
    const work = automaticWorkStores();
    const prisma = {
      transcriptJob: { findUnique: jest.fn().mockResolvedValue(job) },
      coachingNote: { findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({data}: any) => ({ id: `note-${data.kind}-${data.sourceJson.segmentId || "summary"}`, ...data })) },
      ...work,
    };
    const result = await buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: job.id, authorUserId: "coach-1" });
    expect(result).toMatchObject({ actionItemCount: 1, goalCount: 1 });
    expect(work.actionItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ assignedUserId: "coach-1" }) });
    expect(work.goal.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ownerUserId: "coach-1" }) });
    expect(job.segments).toHaveLength(5);
    const generatedNotes = prisma.coachingNote.create.mock.calls.map(([call]) => call.data);
    expect(generatedNotes.filter((note) => note.kind === "HIGHLIGHT")).toHaveLength(2);
    expect(generatedNotes.some((note) => note.body.includes("every..."))).toBe(false);
    const brief = generatedNotes.find((note) => note.kind === "SUMMARY").sourceJson.packetBrief;
    expect(brief.sections.find((section: any) => section.id === "goals").itemCount).toBe(1);
    expect(brief.sections.find((section: any) => section.id === "commitments").itemCount).toBe(1);
    expect(brief.sections.find((section: any) => section.id === "key-moments").itemCount).toBe(0);

    const task = (await work.actionItem.findMany())[0];
    await work.actionItem.update({where: {id: task.id}, data: {assignedUserId: "client-1"}});
    await buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: job.id, authorUserId: "coach-1", force: true });
    expect((await work.actionItem.findMany())[0].assignedUserId).toBe("client-1");
  });

  it.each([
    { ending: "Tomorrow I will draft one page and share it with my", speaker: "Charlie", expected: 1 },
    { ending: "Tomorrow I will draft one page and share it with my.", speaker: "Charlie", expected: 1 },
    // A complete shorter commitment is not an unfinished repetition.
    { ending: "Tomorrow I will draft one page.", speaker: "Charlie", expected: 2 },
    { ending: "Tomorrow I will draft one page and share it with my instructor.", speaker: "Charlie", expected: 2 },
    { ending: "Tomorrow I will draft one page and share it with my", speaker: "Homer", expected: 2 },
  ])("handles repeated speech without discarding a distinct commitment: $ending / $speaker", async ({ending, speaker, expected}) => {
    const job = completedTranscriptJob();
    // A participant-isolated source correctly overrides provider speaker names.
    // Use provider attribution for the two-speaker case instead of inventing a
    // second person on a source explicitly bound to Charlie.
    if (speaker === "Homer") job.resultJson.processingControl.routing.speakerAuthority = "provider";
    job.segments = [
      {id: "complete", speakerLabel: "Charlie", startSeconds: 0, endSeconds: 5,
        text: "Tomorrow I will draft one page and share it with my coach.", confidence: 0.98},
      {id: "repeat", speakerLabel: speaker, startSeconds: 10, endSeconds: 15, text: ending, confidence: 0.98},
    ];
    const original = structuredClone(job.segments);
    const work = automaticWorkStores();
    const result = await buildCoachingPacketFromTranscriptJob({prisma: {
      transcriptJob: {findUnique: jest.fn().mockResolvedValue(job)},
      coachingNote: {findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async ({data}: any) => ({id: "summary", ...data}))},
      ...work,
    }, transcriptJobId: job.id, authorUserId: "coach-1"});
    expect(result).toMatchObject({ok: true, actionItemCount: expected});
    const tasks = await work.actionItem.findMany();
    expect(tasks).toHaveLength(expected);
    expect(tasks[0]).toMatchObject({title: "Tomorrow I will draft one page and share it with my coach",
      sourceJson: {segmentId: "complete", startSeconds: 0, endSeconds: 5}});
    expect(job.segments).toEqual(original);
  });

  it.each([
    { text: "I feel stuck.", goal: null, task: null, note: "I feel stuck" },
    { text: "What outcome would make this week feel successful?", goal: null, task: null, note: null },
    { text: "My goal is to walk 2.5 miles a day. Please create a task to walk 0.5 miles tomorrow. Note that I do not want daily reminders.",
      goal: "Walk 2.5 miles a day", task: "Walk 0.5 miles tomorrow", note: "I do not want daily reminders" },
  ])("keeps useful short statements, numbers, and negation without promoting facilitation prompts: $text", async ({text, goal, task, note}) => {
    const job = completedTranscriptJob();
    job.segments = [{ ...job.segments[0]!, text }];
    const work = automaticWorkStores();
    const noteCreate = jest.fn(async ({data}: any) => ({id: `note-${data.kind}`, ...data}));
    await buildCoachingPacketFromTranscriptJob({ prisma: {
      transcriptJob: {findUnique: jest.fn().mockResolvedValue(job)},
      coachingNote: {findFirst: jest.fn().mockResolvedValue(null), create: noteCreate}, ...work,
    }, transcriptJobId: job.id, authorUserId: "coach-1" });
    expect((await work.goal.findMany()).map(item => item.title)).toEqual(goal ? [goal] : []);
    expect((await work.actionItem.findMany()).map(item => item.title)).toEqual(task ? [task] : []);
    const highlights = noteCreate.mock.calls.map(([call]) => call.data).filter(item => item.kind === "HIGHLIGHT");
    expect(highlights).toHaveLength(note ? 1 : 0);
    if (note) expect(highlights[0].body).toContain(note);
    expect(job.segments[0]!.text).toBe(text);
  });

  it("extracts both the goal and commitment from a single provider passage without inventing tighter timing", async () => {
    const job = completedTranscriptJob();
    job.segments = [{ id: "combined", speakerLabel: "Charlie", startSeconds: 0, endSeconds: 10.18,
      text: "morning. Tomorrow I will draft one page and share it with my coach. My coaching goal is to write every morning.", confidence: 0.98 }];
    const work = automaticWorkStores();
    const noteCreate = jest.fn(async ({data}: any) => ({id: "summary", ...data}));
    await buildCoachingPacketFromTranscriptJob({
      prisma: { transcriptJob: {findUnique: jest.fn().mockResolvedValue(job)},
        coachingNote: {findFirst: jest.fn().mockResolvedValue(null), create: noteCreate}, ...work },
      transcriptJobId: job.id, authorUserId: "coach-1",
    });
    expect(work.actionItem.create).toHaveBeenCalledWith({data: expect.objectContaining({
      title: "Tomorrow I will draft one page and share it with my coach",
      sourceJson: expect.objectContaining({startSeconds: 0, endSeconds: 10.18}),
    })});
    expect(work.goal.create).toHaveBeenCalledWith({data: expect.objectContaining({title: "Write every morning"})});
    const brief = noteCreate.mock.calls.find(([call]) => call.data.kind === "SUMMARY")![0].data.sourceJson.packetBrief;
    expect(brief.sections.find((section: any) => section.id === "goals").items[0]).toMatchObject({
      text: "My coaching goal is to write every morning.", startSeconds: 0, endSeconds: 10.18,
    });
    expect(brief.sections.find((section: any) => section.id === "commitments").items[0]).toMatchObject({
      text: "Tomorrow I will draft one page and share it with my coach.", startSeconds: 0, endSeconds: 10.18,
    });
  });

  it.each(["unresolved", "revoked", "other-room", "second-person"])("does not guess a task owner for %s identity", async (mode) => {
    const job = completedTranscriptJob();
    if (mode === "unresolved") job.resultJson.processingControl.routing.speakerAuthority = "provider";
    if (mode === "revoked") job.room.participants[0]!.accessStatus = "REVOKED";
    if (mode === "other-room") job.room.participants = [];
    if (mode === "second-person") job.segments[0]!.text = "You will send the outline before next time.";
    const work = automaticWorkStores();
    await buildCoachingPacketFromTranscriptJob({
      prisma: { transcriptJob: {findUnique: jest.fn().mockResolvedValue(job)},
        coachingNote: {findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async ({data}: any) => ({id: "summary", ...data}))}, ...work },
      transcriptJobId: job.id, authorUserId: "coach-1",
    });
    expect(work.actionItem.create).toHaveBeenCalledWith({data: expect.objectContaining({assignedUserId: null})});
  });

  it("creates editable shared notes and ordinary open tasks from transcript follow-through", async () => {
    const coachingNoteCreate = jest.fn(async ({ data }: any) => ({
      id:
        data.kind === "SUMMARY"
          ? "summary-1"
          : `highlight-${data.sourceJson.segmentId}`,
      ...data,
    }));
    const work = automaticWorkStores();
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(completedTranscriptJob()),
      },
      coachingNote: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: coachingNoteCreate,
      },
      ...work,
    };

    const result = await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: "transcript-1",
      authorUserId: "coach-1",
    });

    expect(result.ok).toBe(true);
    expect(work.actionItem.create).toHaveBeenCalledTimes(1);
    expect(prisma.coachingNote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roomId: "room-1",
          authorUserId: "coach-1",
          kind: "SUMMARY",
          OR: [
            {
              sourceJson: {
                path: ["source"],
                equals: "transcript-packet-builder",
              },
            },
            {
              sourceJson: {
                path: ["source"],
                equals: "web-transcript-packet-builder",
              },
            },
          ],
        }),
      }),
    );

    const summaryWrite = coachingNoteCreate.mock.calls.find(
      ([call]) => call.data.kind === "SUMMARY",
    )?.[0].data;
    expect(summaryWrite?.sourceJson.actionCandidates).toEqual([
      expect.objectContaining({
        kind: "quipsly-transcript-action-candidate-v1",
        reviewStatus: "ACCEPTED_AS_ACTION_ITEM",
        transcriptJobId: "transcript-1",
        packetBuildId: expect.any(String),
        segmentId: "segment-action",
        humanApprovalRequired: false,
        committedActionItemId: expect.stringMatching(/^transcript-task-/),
      }),
    ]);
    expect(summaryWrite).toMatchObject({
      visibility: "SESSION_SHARED",
      engagementId: "engagement-1",
      title: "First coaching consultation recap",
    });
    expect(summaryWrite?.sourceJson).toMatchObject({
      packetPurpose: "COACHING",
      packetTemplateVersion: SESSION_PACKET_TEMPLATE_VERSION,
    });
    expect(summaryWrite?.sourceJson.packetBrief).toMatchObject({
      kind: "quipsly-transcript-packet-brief-v1",
      candidateOnly: false,
      humanApprovalRequired: false,
      sections: expect.arrayContaining([
        expect.objectContaining({
          id: "commitments",
          itemCount: 1,
          items: [
            expect.objectContaining({
              segmentId: "segment-action",
              startSeconds: 12,
            }),
          ],
        }),
        expect.objectContaining({ id: "key-moments" }),
      ]),
    });
    expect(summaryWrite?.body).toContain("Commitments:");
    expect(summaryWrite?.body).toContain("Everything here is editable.");
    expect(summaryWrite?.body).not.toContain("Transcript packet");
    expect(summaryWrite?.body).not.toContain("candidate");
    expect(result).toEqual(
      expect.objectContaining({
        actionCandidateCount: 1,
        actionItemCount: 1,
        actionItemIds: [expect.stringMatching(/^transcript-task-/)],
      }),
    );
    expect(work.actionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "OPEN",
        assignedUserId: "client-1",
        engagementId: "engagement-1",
        sourceJson: expect.objectContaining({
          automaticallyCreated: true,
          editableAfterCreation: true,
          removableInProduct: true,
        }),
      }),
    });
  });

  it("keeps an explicit task when one transcript turn also states a goal", async () => {
    const coachingNoteCreate = jest.fn(async ({ data }: any) => ({
      id: data.kind === "SUMMARY" ? "summary-compound" : `highlight-${data.sourceJson.segmentId}`,
      ...data,
    }));
    const work = automaticWorkStores();
    const compoundJob = completedTranscriptJob();
    compoundJob.segments = [
      {
        id: "segment-session-agenda",
        speakerLabel: "Coach",
        startSeconds: 0,
        endSeconds: 5,
        text: "Today we will clarify your goal and choose one next step.",
        confidence: 0.98,
      },
      {
        id: "segment-compound-goal-task",
        speakerLabel: "Client",
        startSeconds: 13.4,
        endSeconds: 25.68,
        text: "My goal is to complete the certification practice review by Friday. Please create a task to send the recording to my instructor tomorrow, and note that I want accountability without daily reminders.",
        confidence: 0.97,
      },
    ];

    const result = await buildCoachingPacketFromTranscriptJob({
      prisma: {
        transcriptJob: { findUnique: jest.fn().mockResolvedValue(compoundJob) },
        coachingNote: { findFirst: jest.fn().mockResolvedValue(null), create: coachingNoteCreate },
        ...work,
      },
      transcriptJobId: compoundJob.id,
      authorUserId: "coach-1",
    });

    expect(result).toEqual(expect.objectContaining({
      actionItemCount: 1,
      goalCount: 1,
    }));
    expect(work.actionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Send the recording to my instructor tomorrow",
        assignedUserId: "client-1",
        status: "OPEN",
      }),
    });
    expect(work.goal.create).toHaveBeenCalledTimes(1);
  });

  it("uses a calm, stable recap title", () => {
    expect(sessionRecapTitle("  First coaching   consultation ")).toBe(
      "First coaching consultation recap",
    );
    expect(sessionRecapTitle("Weekly reflection recap")).toBe(
      "Weekly reflection recap",
    );
    expect(sessionRecapTitle(null)).toBe("Session recap");
  });

  it("keeps source-bound participant identity on generated follow-through candidates", async () => {
    const isolatedJob: any = completedTranscriptJob();
    isolatedJob.asset.participantId = "participant-scott";
    isolatedJob.segments = [
      {
        ...isolatedJob.segments[0],
        speakerLabel: null,
      },
    ];
    Object.assign(isolatedJob, {
      resultJson: {
        processingControl: {
          routing: {
            schema: "quipsly-transcript-routing-summary-v1",
            sourceTopology: "participant-isolated",
            participantLabel: "Scott Sparrow",
            speakerAuthority: "source-binding",
          },
        },
      },
    });
    const coachingNoteCreate = jest.fn(async ({ data }: any) => ({
      id:
        data.kind === "SUMMARY"
          ? "summary-isolated"
          : `highlight-${data.sourceJson.segmentId}`,
      ...data,
    }));
    const prisma = {
      transcriptJob: { findUnique: jest.fn().mockResolvedValue(isolatedJob) },
      coachingNote: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: coachingNoteCreate,
      },
      ...automaticWorkStores(),
    };

    await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: isolatedJob.id,
      authorUserId: "coach-1",
    });

    const summaryWrite = coachingNoteCreate.mock.calls.find(
      ([call]) => call.data.kind === "SUMMARY",
    )?.[0].data;
    expect(summaryWrite.sourceJson.actionCandidates[0]).toMatchObject({
      segmentId: "segment-action",
      speakerLabel: "Scott Sparrow",
      speakerAuthority: "source-binding",
    });
    expect(
      summaryWrite.sourceJson.transcriptSnapshot.segmentReviews[0],
    ).toMatchObject({
      resolvedSpeakerLabel: "Scott Sparrow",
      speakerAuthority: "source-binding",
      sourceBoundParticipantId: "participant-scott",
    });
  });

  it("creates one editable goal from an explicit goal commitment across adjacent segments", async () => {
    const raw = [
      {
        id: "segment-1",
        speakerLabel: "Coach",
        startSeconds: 6,
        endSeconds: 11,
        text: "The test goal is to preserve the original recording, verify the exact checksum, and",
        corrections: [],
        verifications: [],
      },
      {
        id: "segment-2",
        speakerLabel: "Coach",
        startSeconds: 11,
        endSeconds: 16,
        text: "hold all transcript work until every participant has consented and a human explicitly releases",
        corrections: [],
        verifications: [],
      },
      {
        id: "segment-3",
        speakerLabel: "Coach",
        startSeconds: 16,
        endSeconds: 17,
        text: "it.",
        corrections: [],
        verifications: [],
      },
      {
        id: "segment-4",
        speakerLabel: "Coach",
        startSeconds: 18,
        endSeconds: 20,
        text: "This is a separate sentence.",
        corrections: [],
        verifications: [],
      },
    ];
    const projected = projectTranscriptSegmentsForPacket(raw);
    const spans = buildTranscriptEvidenceSpans(projected);

    expect(projected.map((segment) => segment.id)).toEqual([
      "segment-1",
      "segment-2",
      "segment-3",
      "segment-4",
    ]);
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({
      id: "segment-1",
      segmentIds: ["segment-1", "segment-2", "segment-3"],
      startSeconds: 6,
      endSeconds: 17,
      text: "The test goal is to preserve the original recording, verify the exact checksum, and hold all transcript work until every participant has consented and a human explicitly releases it.",
      sourceTextSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(spans[0]?.evidenceSegments).toEqual(projected.slice(0, 3));
    expect(spans[1]?.segmentIds).toEqual(["segment-4"]);

    const coachingNoteCreate = jest.fn(async ({ data }: any) => ({
      id:
        data.kind === "SUMMARY"
          ? "summary-goal"
          : `highlight-${data.sourceJson.segmentId}`,
      ...data,
    }));
    const work = automaticWorkStores();
    const result = await buildCoachingPacketFromTranscriptJob({
      prisma: {
        transcriptJob: {
          findUnique: jest.fn().mockResolvedValue({
            ...completedTranscriptJob(),
            segments: raw,
          }),
        },
        coachingNote: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: coachingNoteCreate,
        },
        ...work,
      },
      transcriptJobId: "transcript-1",
      authorUserId: "coach-1",
    });

    const summaryWrite = coachingNoteCreate.mock.calls.find(
      ([call]) => call.data.kind === "SUMMARY",
    )?.[0].data;
    expect(summaryWrite?.sourceJson.actionCandidates).toEqual([]);
    expect(summaryWrite?.sourceJson.goalOutputs).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^transcript-goal-/),
        segmentId: "segment-1",
      }),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        actionCandidateCount: 0,
        actionItemCount: 0,
        goalCount: 1,
        goalIds: [expect.stringMatching(/^transcript-goal-/)],
      }),
    );
    expect(work.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: "client-1",
        status: "ACTIVE",
        sourceJson: expect.objectContaining({
          automaticallyCreated: true,
          editableAfterCreation: true,
          removableInProduct: true,
          segmentId: "segment-1",
        }),
      }),
    });
  });

  it("keeps a joined thought's complete protected-source span separate from its Session clock", () => {
    const sourceProjected = projectTranscriptSegmentsForPacket([
      {
        id: "source-segment-1",
        speakerLabel: "Client",
        startSeconds: 2,
        endSeconds: 4,
        text: "My goal is to pause and",
      },
      {
        id: "source-segment-2",
        speakerLabel: "Client",
        startSeconds: 4,
        endSeconds: 7,
        text: "breathe before answering.",
      },
    ]).map((segment) => ({
      ...segment,
      transcriptJobId: "transcript-client",
      recordingAssetId: "asset-client",
      sourceStartSeconds: segment.startSeconds,
      sourceEndSeconds: segment.endSeconds,
      programOffsetSeconds: 0.75,
      startSeconds: segment.startSeconds + 0.75,
      endSeconds: segment.endSeconds + 0.75,
    }));

    expect(buildTranscriptEvidenceSpans(sourceProjected)).toEqual([
      expect.objectContaining({
        segmentIds: ["source-segment-1", "source-segment-2"],
        startSeconds: 2.75,
        endSeconds: 7.75,
        sourceStartSeconds: 2,
        sourceEndSeconds: 7,
      }),
    ]);
  });

  it("keeps coaching and podcast review lanes purpose-specific", () => {
    const coaching = reviewLaneDefinitionsForPurpose("COACHING").map(
      (lane) => lane.id,
    );
    const podcast = reviewLaneDefinitionsForPurpose("PODCAST").map(
      (lane) => lane.id,
    );
    expect(coaching).toEqual([
      "client-follow-up",
      "coaching-insights",
      "obstacles-and-support",
      "goals-and-tasks",
      "next-session-prep",
    ]);
    expect(podcast).toEqual([
      "goals-and-tasks",
      "next-session-prep",
      "podcast-production",
      "fact-checks-and-rights",
      "quote-candidates",
      "article-seeds",
      "clip-candidates",
    ]);
    expect(coaching).not.toContain("podcast-production");
    expect(podcast).not.toContain("client-follow-up");
  });

  it("builds packet text from accepted review overlays and hashes the exact review snapshot", () => {
    const providerText = "I will send the outline before next time.";
    const providerTextSha256 = createHash("sha256")
      .update(providerText)
      .digest("hex");
    const segments = [
      {
        id: "segment-action",
        speakerLabel: "Speaker 0",
        startSeconds: 12,
        endSeconds: 18,
        text: providerText,
        confidence: 0.98,
        corrections: [
          {
            id: "correction-1",
            status: "accepted",
            baseTextSha256: providerTextSha256,
            expectedSpeakerLabel: "Speaker 0",
            correctedText: "I will send the finished outline before next time.",
            correctedSpeakerLabel: "Charlie",
            updatedAt: new Date("2026-08-01T23:40:00.000Z"),
          },
        ],
        verifications: [],
      },
    ];

    expect(projectTranscriptSegmentsForPacket(segments)).toEqual([
      expect.objectContaining({
        text: "I will send the finished outline before next time.",
        speakerLabel: "Charlie",
        providerText,
        providerTextSha256,
        reviewStatus: "human-reviewed",
        acceptedReviewId: "correction-1",
        acceptedCorrectionId: "correction-1",
      }),
    ]);
    const snapshot = transcriptPacketSnapshot(segments);
    const persisted = {
      transcriptSnapshot: { ...snapshot, projected: undefined },
    };
    expect(snapshot).toMatchObject({
      segmentCount: 1,
      humanReviewedSegmentCount: 1,
      providerOnlySegmentCount: 0,
    });
    expect(packetSnapshotMatches(persisted, segments)).toBe(true);
    expect(
      packetSnapshotMatches(persisted, [{ ...segments[0], corrections: [] }]),
    ).toBe(false);
  });

  it("records confirmed-as-is as reviewed without changing provider packet text", () => {
    const providerText = "That gives the episode a much clearer shape.";
    const providerTextSha256 = createHash("sha256")
      .update(providerText)
      .digest("hex");
    const projected = projectTranscriptSegmentsForPacket([
      {
        id: "segment-context",
        speakerLabel: "Homer",
        startSeconds: 19,
        endSeconds: 24,
        text: providerText,
        verifications: [
          {
            id: "verification-1",
            reviewKind: "confirmed-as-is",
            providerTextSha256,
            providerSpeakerLabel: "Homer",
            createdAt: new Date("2026-08-01T23:41:00.000Z"),
          },
        ],
      },
    ]);
    expect(projected[0]).toMatchObject({
      text: providerText,
      reviewStatus: "human-reviewed",
      acceptedReviewId: "verification-1",
      acceptedCorrectionId: null,
    });
  });

  it("uses a reviewed speaker identity in packets without upgrading provider words to human-reviewed", () => {
    const segments = [
      {
        id: "segment-context",
        speakerLabel: "Speaker 0",
        startSeconds: 19,
        endSeconds: 24,
        text: "That gives the episode a much clearer shape.",
        corrections: [],
        verifications: [],
      },
    ];
    const firstAttribution = [
      {
        id: "speaker-attribution-1",
        status: "active",
        providerSpeakerLabel: "Speaker 0",
        participantId: "participant-scott",
        participantDisplaySnapshot: "Scott",
        providerSnapshotSha256: createHash("sha256")
          .update(
            JSON.stringify({
              providerSpeakerLabel: "Speaker 0",
              evidence: [
                {
                  id: "segment-context",
                  startSeconds: 19,
                  endSeconds: 24,
                  textSha256: createHash("sha256")
                    .update("That gives the episode a much clearer shape.")
                    .digest("hex"),
                },
              ],
            }),
          )
          .digest("hex"),
      },
    ];
    const projected = projectTranscriptSegmentsForPacket(
      segments,
      firstAttribution,
    );
    expect(projected[0]).toMatchObject({
      speakerLabel: "Scott",
      speakerAuthority: "attribution",
      providerSpeakerLabel: "Speaker 0",
      reviewStatus: "provider",
      acceptedReviewId: null,
      acceptedCorrectionId: null,
      acceptedSpeakerAttributionId: "speaker-attribution-1",
    });

    const snapshot = transcriptPacketSnapshot(segments, firstAttribution);
    const persisted = {
      transcriptSnapshot: { ...snapshot, projected: undefined },
    };
    expect(packetSnapshotMatches(persisted, segments, firstAttribution)).toBe(
      true,
    );
    expect(
      packetSnapshotMatches(persisted, segments, [
        {
          ...firstAttribution[0],
          id: "speaker-attribution-2",
          participantDisplaySnapshot: "Charlie",
        },
      ]),
    ).toBe(false);
  });

  it("carries exact participant identity from an isolated source into every packet projection", () => {
    const job = {
      segments: [
        {
          id: "segment-isolated",
          speakerLabel: null,
          startSeconds: 4,
          endSeconds: 8,
          text: "I will bring the completed reflection next time.",
          corrections: [],
          verifications: [],
        },
      ],
      speakerAttributions: [],
      asset: { participantId: "participant-scott" },
      resultJson: {
        processingControl: {
          routing: {
            schema: "quipsly-transcript-routing-summary-v1",
            sourceTopology: "participant-isolated",
            participantLabel: "Scott Sparrow",
            speakerAuthority: "source-binding",
          },
        },
      },
    };

    expect(projectTranscriptJobSegmentsForPacket(job)[0]).toMatchObject({
      speakerLabel: "Scott Sparrow",
      providerSpeakerLabel: null,
      acceptedSpeakerAttributionId: null,
      speakerAuthority: "source-binding",
      sourceBoundParticipantId: "participant-scott",
      reviewStatus: "provider",
    });

    const snapshot = transcriptJobPacketSnapshot(job);
    const persisted = {
      transcriptSnapshot: { ...snapshot, projected: undefined },
    };
    expect(snapshot.segmentReviews[0]).toMatchObject({
      sourceBoundParticipantId: "participant-scott",
    });
    expect(packetSnapshotMatchesTranscriptJob(persisted, job)).toBe(true);
    expect(
      packetSnapshotMatchesTranscriptJob(persisted, {
        ...job,
        resultJson: {
          processingControl: {
            routing: {
              ...job.resultJson.processingControl.routing,
              participantLabel: "Different participant",
            },
          },
        },
      }),
    ).toBe(false);
    expect(
      packetSnapshotMatchesTranscriptJob(persisted, {
        ...job,
        asset: { participantId: "participant-someone-else" },
      }),
    ).toBe(false);
  });

  it("ignores a speaker identity whose full provider cluster no longer matches its reviewed snapshot", () => {
    const segments = [
      {
        id: "segment-context",
        speakerLabel: "Speaker 0",
        startSeconds: 19,
        endSeconds: 24,
        text: "The provider added a later turn after the identity review.",
        corrections: [],
        verifications: [],
      },
    ];
    const projected = projectTranscriptSegmentsForPacket(segments, [
      {
        id: "speaker-attribution-stale",
        status: "active",
        providerSpeakerLabel: "Speaker 0",
        participantId: "participant-scott",
        participantDisplaySnapshot: "Scott",
        providerSnapshotSha256: "f".repeat(64),
      },
    ]);
    expect(projected[0]).toMatchObject({
      speakerLabel: "Speaker 0",
      acceptedSpeakerAttributionId: null,
      reviewStatus: "provider",
    });
  });

  it("keeps decisions, goals, questions, commitments, and key moments in separate source-linked candidate lanes", () => {
    const segments = [
      {
        id: "decision",
        speakerLabel: "Coach",
        startSeconds: 1,
        endSeconds: 2,
        text: "We decided to record the pilot on Friday.",
      },
      {
        id: "goal",
        speakerLabel: "Client",
        startSeconds: 3,
        endSeconds: 4,
        text: "My goal is to make the next session calmer.",
      },
      {
        id: "question",
        speakerLabel: "Client",
        startSeconds: 5,
        endSeconds: 6,
        text: "Which microphone should we verify?",
      },
      {
        id: "commitment",
        speakerLabel: "Coach",
        startSeconds: 7,
        endSeconds: 8,
        text: "I will send the outline before next time.",
      },
    ];
    const brief = buildTranscriptPacketBrief(
      segments,
      [segments[0]],
      [segments[3]],
    );
    expect(brief).toMatchObject({
      kind: "quipsly-transcript-packet-brief-v1",
      candidateOnly: false,
      humanApprovalRequired: false,
      overview: { segmentCount: 4, speakerCount: 2 },
    });
    expect(
      Object.fromEntries(
        brief.sections.map((section) => [
          section.id,
          section.items.map((item) => item.segmentId),
        ]),
      ),
    ).toEqual({
      decisions: ["decision"],
      goals: ["goal"],
      questions: ["question"],
      commitments: ["commitment"],
      "key-moments": [],
    });
  });

  it("keeps explicitly materialized ActionItems separate while projecting legacy candidate rows as candidates", () => {
    const storedCandidate = {
      id: "quipsly-transcript-action-candidate-v1:transcript-1:stored-segment",
      kind: "quipsly-transcript-action-candidate-v1",
      reviewStatus: "READY_FOR_HUMAN_REVIEW",
      title: "Review stored follow-up",
      detail: "Stored detail",
      transcriptJobId: "transcript-1",
      recordingAssetId: "asset-1",
      roomId: "room-1",
      segmentId: "stored-segment",
      speakerLabel: "Charlie",
      startSeconds: 1,
      endSeconds: 2,
      humanApprovalRequired: true,
      committedActionItemId: null,
    } as const;
    const legacyCandidate = {
      id: "legacy-action-item",
      roomId: "room-1",
      title: "Legacy inferred follow-up",
      detail: "Legacy detail",
      status: "OPEN",
      sourceJson: {
        source: "transcript-packet-builder",
        transcriptJobId: "transcript-1",
        recordingAssetId: "asset-1",
        roomId: "room-1",
        segmentId: "legacy-segment",
        candidate: true,
      },
    };
    const explicitlyAccepted = {
      id: "accepted-action-item",
      status: "OPEN",
      sourceJson: {
        source: "transcript-packet-builder",
        transcriptJobId: "transcript-1",
        candidate: false,
        acceptedByUserId: "coach-1",
      },
    };
    const legacyWebCandidate = {
      id: "legacy-web-action-item",
      roomId: "room-1",
      title: "Legacy web inferred follow-up",
      detail: "Legacy web detail",
      status: "OPEN",
      sourceJson: {
        source: "web-transcript-packet-builder",
        transcriptJobId: "transcript-1",
        recordingAssetId: "asset-1",
        roomId: "room-1",
        segmentId: "legacy-web-segment",
        candidate: true,
      },
    };

    expect(isUnreviewedTranscriptActionItem(legacyCandidate)).toBe(true);
    expect(isUnreviewedTranscriptActionItem(legacyWebCandidate)).toBe(true);
    expect(isUnreviewedTranscriptActionItem(explicitlyAccepted)).toBe(false);
    expect(
      mergePacketActionCandidates({
        sourceJson: { actionCandidates: [storedCandidate] },
        legacyActionItems: [
          legacyCandidate,
          legacyWebCandidate,
          explicitlyAccepted,
        ],
      }),
    ).toEqual([
      expect.objectContaining(storedCandidate),
      expect.objectContaining({
        segmentId: "legacy-segment",
        reviewStatus: "READY_FOR_HUMAN_REVIEW",
        committedActionItemId: null,
      }),
      expect.objectContaining({
        segmentId: "legacy-web-segment",
        reviewStatus: "READY_FOR_HUMAN_REVIEW",
        committedActionItemId: null,
      }),
    ]);
  });

  it("prunes only untouched generated highlights that no longer qualify", () => {
    const generated = {
      id: "highlight-generated",
      kind: "HIGHLIGHT",
      title: "A useful moment",
      body: "- 00:12 Client: I will finish the reflection.",
      sourceJson: {
        origin: "quipsly-session-follow-through",
        automaticallyCreated: true,
        transcriptJobId: "transcript-1",
        generatedNoteSnapshot: {
          schema: "quipsly-generated-packet-note-snapshot-v1",
          title: "A useful moment",
          body: "- 00:12 Client: I will finish the reflection.",
          packetBuildId: "packet-1",
          sourceTextSha256: "a".repeat(64),
        },
      },
    };
    expect(generatedPacketNoteCanRefresh(generated)).toBe(true);
    expect(
      generatedPacketHighlightCanRemove({
        existing: generated,
        retainedNoteIds: new Set(),
        transcriptJobIds: new Set(["transcript-1"]),
      }),
    ).toBe(true);
    expect(
      generatedPacketHighlightCanRemove({
        existing: generated,
        retainedNoteIds: new Set([generated.id]),
        transcriptJobIds: new Set(["transcript-1"]),
      }),
    ).toBe(false);
    expect(
      generatedPacketHighlightCanRemove({
        existing: { ...generated, body: "My own note about this moment." },
        retainedNoteIds: new Set(),
        transcriptJobIds: new Set(["transcript-1"]),
      }),
    ).toBe(false);
    expect(
      generatedPacketHighlightCanRemove({
        existing: {
          ...generated,
          sourceJson: {
            ...generated.sourceJson,
            relationshipWorkRemoval: {
              schema: "quipsly-coaching-engagement-work-removal-v1",
              active: true,
              removedAt: "2026-08-02T01:30:00.000Z",
              removedByUserId: "client-1",
            },
          },
        },
        retainedNoteIds: new Set(),
        transcriptJobIds: new Set(["transcript-1"]),
      }),
    ).toBe(false);
    expect(
      generatedPacketHighlightCanRemove({
        existing: generated,
        retainedNoteIds: new Set(),
        transcriptJobIds: new Set(["different-transcript"]),
      }),
    ).toBe(false);
  });

  it("correlates force rebuild summaries and highlights and reads only the newest build", async () => {
    const createdNotes: any[] = [];
    let latestSummary: any = null;
    let sequence = 0;
    const coachingNoteCreate = jest.fn(async ({ data }: any) => {
      sequence += 1;
      const note = {
        id: `${data.kind.toLowerCase()}-${sequence}`,
        ...data,
        createdAt: new Date(Date.UTC(2026, 6, 18, 12, 0, sequence)),
        updatedAt: new Date(Date.UTC(2026, 6, 18, 12, 0, sequence)),
      };
      createdNotes.push(note);
      if (data.kind === "SUMMARY") latestSummary = { ...note, actionItems: [] };
      return note;
    });
    const work = automaticWorkStores();
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn().mockResolvedValue(completedTranscriptJob()),
      },
      coachingNote: {
        findFirst: jest.fn(async () => latestSummary),
        create: coachingNoteCreate,
      },
      ...work,
    };

    const firstBuild = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: "transcript-1",
      authorUserId: "coach-1",
    })) as any;
    const forcedBuild = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: "transcript-1",
      authorUserId: "coach-1",
      force: true,
    })) as any;

    expect(firstBuild.packetBuildId).toEqual(expect.any(String));
    expect(forcedBuild.packetBuildId).toEqual(expect.any(String));
    expect(forcedBuild.packetBuildId).not.toBe(firstBuild.packetBuildId);
    expect(work.actionItem.create).toHaveBeenCalledTimes(1);

    const selected = selectLatestCorrelatedPacketNotes(createdNotes);
    expect(selected.packetBuildId).toBe(forcedBuild.packetBuildId);
    expect(selected.correlationMode).toBe("PACKET_BUILD_ID");
    expect(selected.summary?.sourceJson.packetBuildId).toBe(
      forcedBuild.packetBuildId,
    );
    expect(selected.highlights).toHaveLength(2);
    expect(
      selected.highlights.every(
        (note) => note.sourceJson.packetBuildId === forcedBuild.packetBuildId,
      ),
    ).toBe(true);

    const legacySelected = selectLatestCorrelatedPacketNotes([
      {
        id: "legacy-summary",
        kind: "SUMMARY",
        sourceJson: {
          source: "transcript-packet-builder",
          transcriptJobId: "transcript-1",
        },
        createdAt: new Date("2026-07-18T11:00:00.000Z"),
      },
      {
        id: "legacy-highlight",
        kind: "HIGHLIGHT",
        sourceJson: {
          source: "transcript-packet-builder",
          transcriptJobId: "transcript-1",
        },
        createdAt: new Date("2026-07-18T11:00:01.000Z"),
      },
    ]);
    expect(legacySelected.correlationMode).toBe("LEGACY_TRANSCRIPT_FALLBACK");
    expect(legacySelected.highlights.map((note) => note.id)).toEqual([
      "legacy-highlight",
    ]);
  });

  it("versions a legacy candidate-only packet into ordinary editable work", async () => {
    const job = completedTranscriptJob();
    const summaries: any[] = [];
    let latestSummary: any = null;
    let noteSequence = 0;
    const coachingNoteCreate = jest.fn(async ({ data }: any) => {
      noteSequence += 1;
      const note = {
        id: `note-${noteSequence}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (data.kind === "SUMMARY") {
        latestSummary = { ...note, actionItems: [] };
        summaries.push(latestSummary);
      }
      return note;
    });
    const prisma = {
      transcriptJob: { findUnique: jest.fn(async () => job) },
      coachingNote: {
        findFirst: jest.fn(async () => latestSummary),
        create: coachingNoteCreate,
      },
      ...automaticWorkStores(),
    };

    const first = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    expect(packetCreatesOrdinarySessionWork(latestSummary.sourceJson)).toBe(
      true,
    );

    latestSummary.sourceJson = {
      ...latestSummary.sourceJson,
      reviewRequired: true,
      packetBrief: {
        ...latestSummary.sourceJson.packetBrief,
        candidateOnly: true,
        humanApprovalRequired: true,
      },
    };
    expect(packetCreatesOrdinarySessionWork(latestSummary.sourceJson)).toBe(
      false,
    );

    const upgraded = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    expect(upgraded).toMatchObject({
      reusedExistingPacket: false,
      rebuiltForTranscriptReviewChange: true,
    });
    expect(upgraded.packetBuildId).not.toBe(first.packetBuildId);
    expect(summaries).toHaveLength(2);
    expect(packetCreatesOrdinarySessionWork(summaries[1].sourceJson)).toBe(
      true,
    );
  });

  it("reuses an identical snapshot but automatically versions the packet after transcript review changes", async () => {
    const job = completedTranscriptJob();
    const work = automaticWorkStores();
    const summaries: any[] = [];
    const notes = new Map<string, any>();
    let latestSummary: any = null;
    let noteSequence = 0;
    const coachingNoteCreate = jest.fn(async ({ data }: any) => {
      noteSequence += 1;
      const note = {
        id: data.id || `note-${noteSequence}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      notes.set(note.id, note);
      if (data.kind === "SUMMARY") {
        latestSummary = { ...note, actionItems: [] };
        notes.set(note.id, latestSummary);
        summaries.push(latestSummary);
      }
      return note;
    });
    const coachingNoteUpdate = jest.fn(async ({ where, data }: any) => {
      const note = {
        ...notes.get(where.id),
        ...data,
        updatedAt: new Date(),
      };
      notes.set(note.id, note);
      if (note.kind === "SUMMARY") latestSummary = note;
      return note;
    });
    const coachingNoteDelete = jest.fn(async ({ where }: any) => {
      const note = notes.get(where.id) || null;
      notes.delete(where.id);
      return note;
    });
    const prisma = {
      transcriptJob: { findUnique: jest.fn(async () => job) },
      coachingNote: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.kind === "SUMMARY") return latestSummary;
          if (where.kind !== "HIGHLIGHT") return null;
          const expected = Object.fromEntries(
            (where.AND || []).map((entry: any) => [
              entry.sourceJson.path[0],
              entry.sourceJson.equals,
            ]),
          );
          return (
            Array.from(notes.values())
              .reverse()
              .find(
                (note) =>
                  note.kind === "HIGHLIGHT" &&
                  note.sourceJson.origin === expected.origin &&
                  note.sourceJson.transcriptJobId ===
                    expected.transcriptJobId &&
                  note.sourceJson.segmentId === expected.segmentId,
              ) || null
          );
        }),
        findMany: jest.fn(async () =>
          Array.from(notes.values()).filter(
            (note) => note.kind === "HIGHLIGHT",
          ),
        ),
        create: coachingNoteCreate,
        update: coachingNoteUpdate,
        delete: coachingNoteDelete,
      },
      ...work,
    };

    const first = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    const replay = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    expect(replay).toMatchObject({
      reusedExistingPacket: true,
      packetBuildId: first.packetBuildId,
    });

    const provider = job.segments[0];
    (provider as any).corrections = [
      {
        id: "correction-later",
        status: "accepted",
        baseTextSha256: createHash("sha256")
          .update(provider.text)
          .digest("hex"),
        expectedSpeakerLabel: provider.speakerLabel,
        correctedText: "I will send the finished outline before next time.",
        correctedSpeakerLabel: provider.speakerLabel,
        updatedAt: new Date("2026-08-01T23:50:00.000Z"),
      },
    ];
    const rebuilt = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    expect(rebuilt).toMatchObject({
      reusedExistingPacket: false,
      rebuiltForTranscriptReviewChange: true,
      summaryRefreshedInPlace: true,
      summaryNoteId: first.summaryNoteId,
    });
    expect(rebuilt.packetBuildId).not.toBe(first.packetBuildId);
    expect(summaries).toHaveLength(1);
    expect(latestSummary.body).toContain(
      "I will send the finished outline before next time.",
    );
    expect(latestSummary.sourceJson.transcriptReviewCoverage).toMatchObject({
      humanReviewedSegmentCount: 1,
      providerOnlySegmentCount: 1,
    });
    expect(
      coachingNoteCreate.mock.calls.filter(
        ([{ data }]: any[]) => data.kind === "HIGHLIGHT",
      ),
    ).toHaveLength(2);
    expect(work.actionItem.update).toHaveBeenCalledWith({
      where: { id: first.actionItemIds[0], updatedAt: expect.any(Date) },
      data: expect.objectContaining({
        title: expect.stringMatching(/send the finished outline/i),
        detail: expect.stringContaining(
          "I will send the finished outline before next time.",
        ),
        sourceJson: expect.objectContaining({
          packetBuildId: rebuilt.packetBuildId,
          generatedSnapshot: expect.objectContaining({
            sourceTextSha256: createHash("sha256")
              .update("I will send the finished outline before next time.")
              .digest("hex"),
          }),
        }),
      }),
    });

    const editedTask = await work.actionItem.findUnique({
      where: { id: first.actionItemIds[0] },
    });
    editedTask.title = "My own follow-up wording";
    const editedSummaryID = latestSummary.id;
    latestSummary.title = "My own recap title";
    notes.set(editedSummaryID, latestSummary);
    const editedHighlight = Array.from(notes.values()).find((note) => note.kind === "HIGHLIGHT" && note.sourceJson.segmentId === provider.id)!;
    editedHighlight.title = "My own reflection";
    editedHighlight.body = "This is what the session means to me, in my own words.";
    editedHighlight.visibility = "AUTHOR_PRIVATE";
    const editedHighlightSource = structuredClone(editedHighlight.sourceJson);
    notes.set("stale-generated-highlight", {
      id: "stale-generated-highlight",
      kind: "HIGHLIGHT",
      title: "Old generated highlight",
      body: "- 00:31 Client: This no longer qualifies as a key moment.",
      sourceJson: {
        origin: "quipsly-session-follow-through",
        automaticallyCreated: true,
        transcriptJobId: job.id,
        generatedNoteSnapshot: {
          schema: "quipsly-generated-packet-note-snapshot-v1",
          title: "Old generated highlight",
          body: "- 00:31 Client: This no longer qualifies as a key moment.",
          packetBuildId: rebuilt.packetBuildId,
          sourceTextSha256: "b".repeat(64),
        },
      },
    });
    (provider as any).corrections = [
      {
        ...(provider as any).corrections[0],
        id: "correction-newer",
        correctedText: "I will send the final outline and references tomorrow.",
        updatedAt: new Date("2026-08-02T00:10:00.000Z"),
      },
    ];
    const secondRebuild = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    expect(secondRebuild.summaryRefreshedInPlace).toBe(false);
    expect(secondRebuild.removedHighlightNoteIds).toEqual([
      "stale-generated-highlight",
    ]);
    expect(secondRebuild.summaryNoteId).not.toBe(editedSummaryID);
    expect(notes.get(editedSummaryID).title).toBe("My own recap title");
    expect(notes.has("stale-generated-highlight")).toBe(false);
    expect(summaries).toHaveLength(2);
    const retainedHighlight = notes.get(editedHighlight.id);
    expect(retainedHighlight).toMatchObject({
      title: "My own reflection", body: "This is what the session means to me, in my own words.", visibility: "AUTHOR_PRIVATE",
      sourceJson: { ...editedHighlightSource, includedInPacketBuildId: secondRebuild.packetBuildId },
    });
    expect(secondRebuild.highlightNoteIds).toContain(editedHighlight.id);
    expect(selectLatestCorrelatedPacketNotes(Array.from(notes.values())).highlights.map((note) => note.id)).toContain(editedHighlight.id);
    expect(Array.from(notes.values()).filter((note) => note.kind === "HIGHLIGHT" && note.sourceJson.segmentId === provider.id)).toHaveLength(1);
    expect(
      coachingNoteCreate.mock.calls.filter(
        ([{ data }]: any[]) => data.kind === "HIGHLIGHT",
      ),
    ).toHaveLength(2);
    expect(work.actionItem.update).toHaveBeenCalledTimes(1);
    expect(
      (
        await work.actionItem.findUnique({
          where: { id: first.actionItemIds[0] },
        })
      ).title,
    ).toBe("My own follow-up wording");
  });

  it("retries a packet refresh when a person changes the note after it was read", async () => {
    const updatedAt = new Date("2026-09-07T19:00:00Z");
    const existing = {
      id: "summary-raced", title: "Old recap", body: "Old recap body", updatedAt,
      sourceJson: {
        origin: "quipsly-session-follow-through", automaticallyCreated: true,
        generatedNoteSnapshot: { schema: "quipsly-generated-packet-note-snapshot-v1", title: "Old recap", body: "Old recap body" },
      },
    };
    const update = jest.fn().mockRejectedValue(Object.assign(new Error("Row changed"), { code: "P2025" }));
    const create = jest.fn();
    await expect(buildCoachingPacketFromTranscriptJob({
      prisma: {
        transcriptJob: { findUnique: jest.fn().mockResolvedValue(completedTranscriptJob()) },
        coachingNote: { findFirst: jest.fn().mockResolvedValue(existing), update, create },
      },
      transcriptJobId: "transcript-1", authorUserId: "coach-1",
    })).rejects.toMatchObject({ code: "P2034" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: existing.id, updatedAt } }));
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["actionItem", "update"], ["goal", "update"],
    ["actionItem", "delete"], ["goal", "delete"],
  ] as const)("retries rather than losing a person's concurrent %s edit during %s", async (model, operation) => {
    const job = completedTranscriptJob();
    job.segments[0]!.text = "My goal is to write every morning. Tomorrow I will draft one page.";
    const work = automaticWorkStores();
    const prisma = { transcriptJob: { findUnique: jest.fn(async () => job) },
      coachingNote: { findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: "summary", ...data })) }, ...work };
    await buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: job.id, authorUserId: "coach-1" });
    const existing = (await work[model].findMany())[0];
    expect(existing).toBeDefined();
    // Model the database's compare-and-swap rejection after another writer
    // changes the selected row. The real SQL predicate is covered separately.
    work[model][operation].mockRejectedValue(Object.assign(new Error("Row changed"), { code: "P2025" }));
    if (operation === "delete") job.segments[0]!.text = "The sky is blue today.";
    await expect(buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: job.id, authorUserId: "coach-1" }))
      .rejects.toMatchObject({ code: "P2034" });
    expect(work[model][operation]).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: existing.id, updatedAt: existing.updatedAt }),
    }));
  });

  it.each(["actionItem", "goal"] as const)("retains a person's %s edit history even when wording matches the generated default", async (model) => {
    const job = completedTranscriptJob();
    job.segments[0]!.text = "My goal is to write every morning. Tomorrow I will draft one page.";
    const work = automaticWorkStores();
    const prisma = { transcriptJob: { findUnique: jest.fn(async () => job) },
      coachingNote: { findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: "summary", ...data })) }, ...work };
    const build = () => buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: job.id, authorUserId: "coach-1" });
    await build();
    const existing = (await work[model].findMany())[0];
    const edited = await work[model].update({ where: { id: existing.id }, data: {
      sourceJson: { ...existing.sourceJson, editReceipts: [{ id: "personal-edit", actorUserId: "coach-1" }] },
    } });
    await build();
    expect(await work[model].findUnique({ where: { id: existing.id } })).toEqual(edited);
    job.segments[0]!.text = "The sky is blue today.";
    await build();
    expect(await work[model].findUnique({ where: { id: existing.id } })).toEqual(edited);
  });

  it("removes untouched generated follow-through when a correction removes the commitment", async () => {
    const job = completedTranscriptJob();
    const work = automaticWorkStores();
    let latestSummary: any = null;
    const prisma = {
      transcriptJob: { findUnique: jest.fn(async () => job) },
      coachingNote: {
        findFirst: jest.fn(async () => latestSummary),
        create: jest.fn(async ({ data }: any) => {
          const note = { id: `note-${Date.now()}`, ...data };
          if (data.kind === "SUMMARY") {
            latestSummary = { ...note, actionItems: [] };
          }
          return note;
        }),
      },
      ...work,
    };

    const first = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    expect(first.actionItemIds).toHaveLength(1);

    const provider = job.segments[0];
    (provider as any).corrections = [
      {
        id: "correction-no-commitment",
        status: "accepted",
        baseTextSha256: createHash("sha256")
          .update(provider.text)
          .digest("hex"),
        expectedSpeakerLabel: provider.speakerLabel,
        correctedText: "The outline now has a clear shape.",
        correctedSpeakerLabel: provider.speakerLabel,
        updatedAt: new Date("2026-08-02T01:00:00.000Z"),
      },
    ];

    const rebuilt = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    expect(rebuilt.actionItemIds).toEqual([]);
    expect(rebuilt.removedActionItemIds).toEqual(first.actionItemIds);
    expect(work.actionItem.delete).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: first.actionItemIds[0], updatedAt: expect.any(Date),
        dueAt: null, reminder: { is: null }, recurrenceOccurrence: { is: null } }),
    });
    expect(
      await work.actionItem.findUnique({
        where: { id: first.actionItemIds[0] },
      }),
    ).toBeNull();
  });

  it("keeps user-removed generated work hidden across transcript rebuilds", async () => {
    const job = completedTranscriptJob();
    job.segments[1].text = "My goal is to publish the finished episode.";
    const work = automaticWorkStores();
    const notes = new Map<string, any>();
    let latestSummary: any = null;
    let noteSequence = 0;
    const coachingNoteCreate = jest.fn(async ({ data }: any) => {
      noteSequence += 1;
      const note = {
        id: data.id || `note-${noteSequence}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      notes.set(note.id, note);
      if (data.kind === "SUMMARY") {
        latestSummary = { ...note, actionItems: [] };
        notes.set(note.id, latestSummary);
      }
      return note;
    });
    const coachingNoteUpdate = jest.fn(async ({ where, data }: any) => {
      const note = {
        ...notes.get(where.id),
        ...data,
        updatedAt: new Date(),
      };
      notes.set(note.id, note);
      if (note.kind === "SUMMARY") latestSummary = note;
      return note;
    });
    const coachingNoteDelete = jest.fn(async ({ where }: any) => {
      const note = notes.get(where.id) || null;
      notes.delete(where.id);
      return note;
    });
    const prisma = {
      transcriptJob: { findUnique: jest.fn(async () => job) },
      coachingNote: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.kind === "SUMMARY") return latestSummary;
          if (where.kind !== "HIGHLIGHT") return null;
          const expected = Object.fromEntries(
            (where.AND || []).map((entry: any) => [
              entry.sourceJson.path[0],
              entry.sourceJson.equals,
            ]),
          );
          return (
            Array.from(notes.values())
              .reverse()
              .find(
                (note) =>
                  note.kind === "HIGHLIGHT" &&
                  note.sourceJson.origin === expected.origin &&
                  note.sourceJson.transcriptJobId ===
                    expected.transcriptJobId &&
                  note.sourceJson.segmentId === expected.segmentId,
              ) || null
          );
        }),
        findMany: jest.fn(async () =>
          Array.from(notes.values()).filter(
            (note) => note.kind === "HIGHLIGHT",
          ),
        ),
        create: coachingNoteCreate,
        update: coachingNoteUpdate,
        delete: coachingNoteDelete,
      },
      ...work,
    };

    const first = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    expect(first.actionItemIds).toHaveLength(1);
    expect(first.goalIds).toHaveLength(1);
    expect(first.highlightNoteIds).toHaveLength(2);

    const removedAt = "2026-08-02T01:30:00.000Z";
    const removal = {
      schema: "quipsly-coaching-engagement-work-removal-v1",
      active: true,
      removedAt,
      removedByUserId: "client-1",
    };
    latestSummary.sourceJson = {
      ...latestSummary.sourceJson,
      relationshipWorkRemoval: removal,
    };
    notes.set(latestSummary.id, latestSummary);

    const task = await work.actionItem.findUnique({
      where: { id: first.actionItemIds[0] },
    });
    task.status = "CANCELED";
    task.sourceJson = {
      ...task.sourceJson,
      relationshipWorkRemoval: { ...removal, previousStatus: "OPEN" },
    };
    const goal = await work.goal.findUnique({
      where: { id: first.goalIds[0] },
    });
    goal.status = "ARCHIVED";
    goal.sourceJson = {
      ...goal.sourceJson,
      relationshipWorkRemoval: { ...removal, previousStatus: "ACTIVE" },
    };
    const hiddenHighlight = notes.get(first.highlightNoteIds[0]);
    hiddenHighlight.sourceJson = {
      ...hiddenHighlight.sourceJson,
      relationshipWorkRemoval: removal,
    };
    notes.set(hiddenHighlight.id, hiddenHighlight);

    const firstProvider = job.segments[0];
    (firstProvider as any).corrections = [
      {
        id: "correction-hidden-task",
        status: "accepted",
        baseTextSha256: createHash("sha256")
          .update(firstProvider.text)
          .digest("hex"),
        expectedSpeakerLabel: firstProvider.speakerLabel,
        correctedText: "I will send the revised outline tomorrow.",
        correctedSpeakerLabel: firstProvider.speakerLabel,
        updatedAt: new Date("2026-08-02T01:31:00.000Z"),
      },
    ];
    const secondProvider = job.segments[1];
    (secondProvider as any).corrections = [
      {
        id: "correction-hidden-goal",
        status: "accepted",
        baseTextSha256: createHash("sha256")
          .update(secondProvider.text)
          .digest("hex"),
        expectedSpeakerLabel: secondProvider.speakerLabel,
        correctedText: "My goal is to publish the polished episode.",
        correctedSpeakerLabel: secondProvider.speakerLabel,
        updatedAt: new Date("2026-08-02T01:32:00.000Z"),
      },
    ];

    const rebuilt = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;

    expect(rebuilt).toMatchObject({
      summaryRefreshedInPlace: true,
      summaryNoteId: first.summaryNoteId,
      removedActionItemIds: [],
      removedGoalIds: [],
      removedHighlightNoteIds: [],
    });
    expect(latestSummary.sourceJson.relationshipWorkRemoval).toEqual(removal);
    expect(
      (
        await work.actionItem.findUnique({
          where: { id: first.actionItemIds[0] },
        })
      ).sourceJson.relationshipWorkRemoval,
    ).toMatchObject({ active: true, previousStatus: "OPEN" });
    expect(
      (
        await work.goal.findUnique({ where: { id: first.goalIds[0] } })
      ).sourceJson.relationshipWorkRemoval,
    ).toMatchObject({ active: true, previousStatus: "ACTIVE" });
    expect(
      notes.get(hiddenHighlight.id).sourceJson.relationshipWorkRemoval,
    ).toEqual(removal);
    expect(
      coachingNoteCreate.mock.calls.filter(
        ([{ data }]: any[]) => data.kind === "HIGHLIGHT",
      ),
    ).toHaveLength(2);
    expect(coachingNoteDelete).not.toHaveBeenCalled();
  });

  it("keeps completed or edited generated work when a correction removes the original commitment", async () => {
    const job = completedTranscriptJob();
    job.segments[1].text = "I will send the research links tomorrow.";
    const work = automaticWorkStores();
    let latestSummary: any = null;
    const prisma = {
      transcriptJob: { findUnique: jest.fn(async () => job) },
      coachingNote: {
        findFirst: jest.fn(async () => latestSummary),
        create: jest.fn(async ({ data }: any) => {
          const note = { id: `note-${Date.now()}`, ...data };
          if (data.kind === "SUMMARY") {
            latestSummary = { ...note, actionItems: [] };
          }
          return note;
        }),
      },
      ...work,
    };

    const first = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    const completedTask = await work.actionItem.findUnique({
      where: { id: first.actionItemIds[0] },
    });
    completedTask.status = "DONE";
    const editedTask = await work.actionItem.findUnique({
      where: { id: first.actionItemIds[1] },
    });
    editedTask.title = "Share the sources we actually discussed";

    const provider = job.segments[0];
    (provider as any).corrections = [
      {
        id: "correction-after-completion",
        status: "accepted",
        baseTextSha256: createHash("sha256")
          .update(provider.text)
          .digest("hex"),
        expectedSpeakerLabel: provider.speakerLabel,
        correctedText: "The outline now has a clear shape.",
        correctedSpeakerLabel: provider.speakerLabel,
        updatedAt: new Date("2026-08-02T01:10:00.000Z"),
      },
    ];
    const secondProvider = job.segments[1];
    (secondProvider as any).corrections = [
      {
        id: "correction-after-edit",
        status: "accepted",
        baseTextSha256: createHash("sha256")
          .update(secondProvider.text)
          .digest("hex"),
        expectedSpeakerLabel: secondProvider.speakerLabel,
        correctedText: "The research links clarified the discussion.",
        correctedSpeakerLabel: secondProvider.speakerLabel,
        updatedAt: new Date("2026-08-02T01:11:00.000Z"),
      },
    ];

    const rebuilt = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    expect(rebuilt.removedActionItemIds).toEqual([]);
    expect(work.actionItem.delete).not.toHaveBeenCalled();
    expect(
      (
        await work.actionItem.findUnique({
          where: { id: first.actionItemIds[0] },
        })
      ).status,
    ).toBe("DONE");
    expect(
      (
        await work.actionItem.findUnique({
          where: { id: first.actionItemIds[1] },
        })
      ).title,
    ).toBe("Share the sources we actually discussed");
  });

  it("removes an untouched generated goal when the corrected transcript no longer contains it", async () => {
    const job = completedTranscriptJob();
    job.segments[0].text = "My goal is to publish the final outline.";
    const work = automaticWorkStores();
    let latestSummary: any = null;
    const prisma = {
      transcriptJob: { findUnique: jest.fn(async () => job) },
      coachingNote: {
        findFirst: jest.fn(async () => latestSummary),
        create: jest.fn(async ({ data }: any) => {
          const note = { id: `note-${Date.now()}`, ...data };
          if (data.kind === "SUMMARY") {
            latestSummary = { ...note, actionItems: [] };
          }
          return note;
        }),
      },
      ...work,
    };

    const first = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    expect(first.goalIds).toHaveLength(1);

    const provider = job.segments[0];
    (provider as any).corrections = [
      {
        id: "correction-no-goal",
        status: "accepted",
        baseTextSha256: createHash("sha256")
          .update(provider.text)
          .digest("hex"),
        expectedSpeakerLabel: provider.speakerLabel,
        correctedText: "The final outline is ready for discussion.",
        correctedSpeakerLabel: provider.speakerLabel,
        updatedAt: new Date("2026-08-02T01:20:00.000Z"),
      },
    ];

    const rebuilt = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: job.id,
      authorUserId: "coach-1",
    })) as any;
    expect(rebuilt.goalIds).toEqual([]);
    expect(rebuilt.removedGoalIds).toEqual(first.goalIds);
    expect(work.goal.delete).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: first.goalIds[0], updatedAt: expect.any(Date),
        targetAt: null, progressReceipts: { none: {} }, taskLinks: { none: {} } }),
    });
  });

  it("builds one editable follow-through packet from both participant-owned masters and rebuilds after either transcript changes", async () => {
    const coachJob = {
      id: "transcript-coach",
      assetId: "asset-coach",
      sourceSha256: "a".repeat(64),
      provider: "ios-device-speech",
      status: "COMPLETED",
      createdAt: new Date("2026-08-30T14:02:00.000Z"),
      resultJson: {
        processingControl: {
          routing: {
            schema: "quipsly-transcript-routing-summary-v1",
            sourceTopology: "participant-isolated",
            participantLabel: "Coach",
            speakerAuthority: "source-binding",
          },
        },
      },
      speakerAttributions: [],
      segments: [
        {
          id: "segment-coach-task",
          speakerLabel: null,
          startSeconds: 0,
          endSeconds: 4,
          text: "I will send the reflection prompt this afternoon.",
          confidence: 0.97,
          corrections: [],
          verifications: [],
        },
      ],
    };
    const clientJob = {
      id: "transcript-client",
      assetId: "asset-client",
      sourceSha256: "b".repeat(64),
      provider: "ios-device-speech",
      status: "COMPLETED",
      createdAt: new Date("2026-08-30T14:02:01.000Z"),
      resultJson: {
        processingControl: {
          routing: {
            schema: "quipsly-transcript-routing-summary-v1",
            sourceTopology: "participant-isolated",
            participantLabel: "Client",
            speakerAuthority: "source-binding",
          },
        },
      },
      speakerAttributions: [],
      segments: [
        {
          id: "segment-client-goal",
          speakerLabel: null,
          startSeconds: 1,
          endSeconds: 5,
          text: "My goal is to pause before answering one difficult question.",
          confidence: 0.95,
          corrections: [],
          verifications: [],
        },
      ],
    };
    const clientSource = {
      id: "asset-client",
      roomId: "room-1",
      participantId: "participant-client",
      kind: "LOCAL_AUDIO",
      status: "VERIFIED",
      checksum: "b".repeat(64),
      recordedStartedAt: new Date("2026-08-30T14:00:00.250Z"),
      localManifestJson: { captureGroupId: "capture-group-1" },
      transcriptJobs: [clientJob],
    };
    const coachSource = {
      id: "asset-coach",
      roomId: "room-1",
      participantId: "participant-coach",
      kind: "LOCAL_AUDIO",
      status: "VERIFIED",
      checksum: "a".repeat(64),
      recordedStartedAt: new Date("2026-08-30T14:00:01.000Z"),
      localManifestJson: { captureGroupId: "capture-group-1" },
      transcriptJobs: [coachJob],
    };
    const room = {
      title: "Weekly coaching Session",
      bookingId: "booking-1",
      purpose: "COACHING",
      booking: { id: "booking-1" },
      projectId: "project-1",
      coachingEngagementId: "engagement-1",
      coachingEngagement: { primaryClientUserId: "client-1" },
      participants: [
        { id: "participant-coach", userId: "coach-1", accessStatus: "ACTIVE" },
        { id: "participant-client", userId: "client-1", accessStatus: "ACTIVE" },
      ],
    };
    const anchor = {
      ...coachJob,
      roomId: "room-1",
      room,
      asset: { ...coachSource, transcriptJobs: undefined },
    };
    const clientAnchor = {
      ...clientJob,
      roomId: "room-1",
      room,
      asset: { ...clientSource, transcriptJobs: undefined },
    };
    const summaries: any[] = [];
    let latestSummary: any = null;
    const coachingNoteCreate = jest.fn(async ({ data }: any) => {
      const note = {
        id:
          data.kind === "SUMMARY"
            ? `summary-${summaries.length + 1}`
            : `highlight-${summaries.length + 1}-${data.sourceJson.segmentId}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (data.kind === "SUMMARY") {
        latestSummary = { ...note, actionItems: [] };
        summaries.push(latestSummary);
      }
      return note;
    });
    const work = automaticWorkStores();
    const prisma = {
      transcriptJob: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === clientJob.id ? clientAnchor : anchor,
        ),
      },
      recordingAsset: {
        findMany: jest.fn(async () => [clientSource, coachSource]),
      },
      coachingNote: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (!latestSummary) return null;
          const packetSource = latestSummary.sourceJson?.source;
          const matchesCanonicalSessionPacket =
            Array.isArray(where.OR) &&
            where.OR.some(
              (candidate: any) =>
                candidate?.sourceJson?.path?.[0] === "source" &&
                candidate.sourceJson.equals === packetSource,
            );
          const matchesLegacyAnchor =
            where.sourceJson?.path?.[0] === "transcriptJobId" &&
            where.sourceJson.equals ===
              latestSummary.sourceJson?.transcriptJobId;
          return matchesCanonicalSessionPacket || matchesLegacyAnchor
            ? latestSummary
            : null;
        }),
        create: coachingNoteCreate,
      },
      ...work,
    };

    const first = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: coachJob.id,
      authorUserId: "coach-1",
    })) as any;
    const replay = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: coachJob.id,
      authorUserId: "coach-1",
    })) as any;

    expect(first).toMatchObject({
      ok: true,
      transcriptSourceCount: 2,
      actionItemCount: 1,
      goalCount: 1,
    });
    expect(replay).toMatchObject({
      reusedExistingPacket: true,
      packetBuildId: first.packetBuildId,
      transcriptSourceCount: 2,
    });
    const otherParticipantReplay = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: clientJob.id,
      authorUserId: "coach-1",
    })) as any;
    expect(otherParticipantReplay).toMatchObject({
      reusedExistingPacket: true,
      packetBuildId: first.packetBuildId,
      transcriptSourceCount: 2,
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0].body).toContain("Coach");
    expect(summaries[0].body).toContain("Client");
    expect(summaries[0].sourceJson).toMatchObject({
      provider: "session-source-projection",
      transcriptAssembly: {
        multiSource: true,
        sourceCount: 2,
        programClock: {
          authority: "reported-wall-clock-fallback",
          waveformReviewRequired: true,
        },
      },
      transcriptSources: expect.arrayContaining([
        expect.objectContaining({
          transcriptJobId: "transcript-coach",
          recordingAssetId: "asset-coach",
          programOffsetSeconds: 0.75,
        }),
        expect.objectContaining({
          transcriptJobId: "transcript-client",
          recordingAssetId: "asset-client",
          programOffsetSeconds: 0,
        }),
      ]),
      transcriptSnapshot: {
        segmentReviews: expect.arrayContaining([
          expect.objectContaining({
            transcriptJobId: "transcript-coach",
            recordingAssetId: "asset-coach",
            sourceStartSeconds: 0,
            startSeconds: 0.75,
          }),
          expect.objectContaining({
            transcriptJobId: "transcript-client",
            recordingAssetId: "asset-client",
            sourceStartSeconds: 1,
            startSeconds: 1,
          }),
        ]),
      },
    });
    expect(work.actionItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceJson: expect.objectContaining({
          transcriptJobId: "transcript-coach",
          recordingAssetId: "asset-coach",
          startSeconds: 0,
          sourceStartSeconds: 0,
          programStartSeconds: 0.75,
        }),
      }),
    });
    expect(work.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceJson: expect.objectContaining({
          transcriptJobId: "transcript-client",
          recordingAssetId: "asset-client",
          startSeconds: 1,
          sourceStartSeconds: 1,
          programStartSeconds: 1,
        }),
      }),
    });

    const provider = clientJob.segments[0];
    (provider as any).corrections = [
      {
        id: "client-correction-1",
        status: "accepted",
        baseTextSha256: createHash("sha256")
          .update(provider.text)
          .digest("hex"),
        expectedSpeakerLabel: provider.speakerLabel,
        correctedText:
          "My goal is to pause and breathe before answering one difficult question.",
        correctedSpeakerLabel: null,
        updatedAt: new Date("2026-08-30T14:10:00.000Z"),
      },
    ];
    const rebuilt = (await buildCoachingPacketFromTranscriptJob({
      prisma,
      transcriptJobId: coachJob.id,
      authorUserId: "coach-1",
    })) as any;

    expect(rebuilt).toMatchObject({
      reusedExistingPacket: false,
      rebuiltForTranscriptReviewChange: true,
      transcriptSourceCount: 2,
    });
    expect(rebuilt.packetBuildId).not.toBe(first.packetBuildId);
    expect(summaries).toHaveLength(2);
    expect(summaries[1].body).toContain(
      "My goal is to pause and breathe before answering one difficult question.",
    );
    expect(
      summaries[1].sourceJson.transcriptSnapshot.segmentReviews.find(
        (segment: any) => segment.transcriptJobId === "transcript-client",
      ),
    ).toMatchObject({
      acceptedCorrectionId: "client-correction-1",
      reviewStatus: "human-reviewed",
    });
    expect(work.goal.update).toHaveBeenCalledWith({
      where: { id: first.goalIds[0], updatedAt: expect.any(Date) },
      data: expect.objectContaining({
        title: expect.stringMatching(/pause and breathe/i),
        description: expect.stringContaining(
          "My goal is to pause and breathe before answering one difficult question.",
        ),
        sourceJson: expect.objectContaining({
          packetBuildId: rebuilt.packetBuildId,
          generatedSnapshot: expect.objectContaining({
            detail: expect.stringContaining(
              "Client: My goal is to pause and breathe before answering one difficult question.",
            ),
          }),
        }),
      }),
    });
  });
});
