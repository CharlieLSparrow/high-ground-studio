/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import { buildAccountDeletionInventory } from "./account-deletion-inventory";
import {
  acknowledgeClientFollowUp,
  ClientFollowUpError,
  createClientFollowUpDraft,
  readClientFollowUp,
  releaseClientFollowUp,
  revokeClientFollowUp,
  updateClientFollowUpDraft,
} from "./session-client-follow-up";

const runLocalDatabaseSmoke =
  process.env.QUIPSLY_CLIENT_FOLLOW_UP_DB_SMOKE === "1"
    ? describe
    : describe.skip;

if (process.env.QUIPSLY_CLIENT_FOLLOW_UP_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for the client follow-up smoke.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("client follow-up local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const coachEmail = `follow-up-coach-${nonce}@example.test`;
  const clientEmail = `follow-up-client-${nonce}@example.test`;
  const outsiderEmail = `follow-up-outsider-${nonce}@example.test`;
  let coachUserId = "";
  let clientUserId = "";
  let outsiderUserId = "";
  let bookingId = "";
  let roomId = "";
  let clientSafeNoteId = "";
  let privateNoteId = "";
  let sharedNoteId = "";
  let taskId = "";
  let candidateTaskId = "";
  let goalId = "";

  const actor = (id: string, email: string) => ({
    id,
    email,
    primaryEmail: email,
    isStaff: false,
  });

  beforeAll(async () => {
    const [coach, client, outsider] = await Promise.all([
      prisma.user.create({
        data: { primaryEmail: coachEmail, name: "Retained-test coach" },
      }),
      prisma.user.create({
        data: { primaryEmail: clientEmail, name: "Retained-test client" },
      }),
      prisma.user.create({
        data: { primaryEmail: outsiderEmail, name: "Retained-test outsider" },
      }),
    ]);
    coachUserId = coach.id;
    clientUserId = client.id;
    outsiderUserId = outsider.id;

    const booking = await prisma.coachingBooking.create({
      data: {
        clientUserId,
        coachUserId,
        status: "COMPLETED",
        scheduledStart: new Date("2026-07-31T16:00:00.000Z"),
        scheduledEnd: new Date("2026-07-31T17:00:00.000Z"),
        timezone: "America/Denver",
        paymentPolicy: "FREE",
      },
    });
    bookingId = booking.id;
    const room = await prisma.callRoom.create({
      data: {
        bookingId,
        createdByUserId: coachUserId,
        purpose: "COACHING",
        status: "ENDED",
        title: "Client follow-up boundary smoke",
        scheduledStart: booking.scheduledStart,
        scheduledEnd: booking.scheduledEnd,
        participants: {
          create: [
            {
              userId: coachUserId,
              email: coachEmail,
              displayName: "Coach",
              role: "COACH",
            },
            {
              userId: clientUserId,
              email: clientEmail,
              displayName: "Client",
              role: "CLIENT",
            },
            {
              userId: outsiderUserId,
              email: outsiderEmail,
              displayName: "Room producer without coaching authority",
              role: "PRODUCER",
            },
          ],
        },
      },
    });
    roomId = room.id;
    const sourceAnchor = (schema: string, segmentId: string) => ({
      schema,
      roomId,
      transcriptJobId: `follow-up-transcript-${nonce}`,
      segmentId,
      startSeconds: 63.4,
      endSeconds: 68.9,
      providerTextSha256: "a".repeat(64),
      providerSpeakerLabel: "Speaker 2",
      effectiveTextSnapshot: "I will rehearse the boundary once and bring the evidence back.",
      effectiveSpeakerLabelSnapshot: "Client",
      acceptedCorrectionId: `follow-up-correction-${nonce}`,
      recordingAssetId: `follow-up-recording-${nonce}`,
      playbackSourceId: `follow-up-playback-${nonce}`,
    });

    const [clientSafeNote, privateNote, sharedNote, task, candidateTask, goal] =
      await Promise.all([
        prisma.coachingNote.create({
          data: {
            roomId,
            bookingId,
            authorUserId: coachUserId,
            visibility: "CLIENT_SAFE",
            kind: "FOLLOW_UP",
            title: "Practice evidence",
            body: "Bring one specific example of the new boundary in use.",
            sourceJson: sourceAnchor("quipsly-transcript-derived-note-v1", "follow-up-note-segment"),
          },
        }),
        prisma.coachingNote.create({
          data: {
            roomId,
            bookingId,
            authorUserId: coachUserId,
            visibility: "AUTHOR_PRIVATE",
            kind: "SESSION_NOTE",
            title: "Coach-only formulation",
            body: "This must never enter the client artifact.",
          },
        }),
        prisma.coachingNote.create({
          data: {
            roomId,
            bookingId,
            authorUserId: coachUserId,
            visibility: "SESSION_SHARED",
            kind: "SESSION_NOTE",
            title: "Shared room note",
            body: "Room visibility alone is not client-follow-up consent.",
          },
        }),
        prisma.actionItem.create({
          data: {
            roomId,
            bookingId,
            assignedUserId: clientUserId,
            title: "Run one protected rehearsal",
            detail: "Write down what changed and what stayed difficult.",
            dueAt: new Date("2026-08-03T18:00:00.000Z"),
            sourceJson: sourceAnchor("quipsly-transcript-derived-task-v1", "follow-up-task-segment"),
          },
        }),
        prisma.actionItem.create({
          data: {
            roomId,
            bookingId,
            assignedUserId: clientUserId,
            title: "Unreviewed transcript guess",
            sourceJson: {
              source: "transcript-packet-builder",
              candidate: true,
            },
          },
        }),
        prisma.goal.create({
          data: {
            roomId,
            bookingId,
            ownerUserId: clientUserId,
            title: "Use a sustainable boundary",
            description:
              "Prefer repeatable evidence over a perfect performance.",
            targetAt: new Date("2026-08-14T18:00:00.000Z"),
            sourceJson: sourceAnchor("quipsly-transcript-derived-goal-v1", "follow-up-goal-segment"),
          },
        }),
      ]);
    clientSafeNoteId = clientSafeNote.id;
    privateNoteId = privateNote.id;
    sharedNoteId = sharedNote.id;
    taskId = task.id;
    candidateTaskId = candidateTask.id;
    goalId = goal.id;
  });

  afterAll(async () => {
    try {
      if (roomId) {
        await prisma.callRoom.deleteMany({ where: { id: roomId } });
      }
      if (bookingId) {
        await prisma.coachingBooking.deleteMany({ where: { id: bookingId } });
      }
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [coachUserId, clientUserId, outsiderUserId].filter(Boolean),
          },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("requires a reviewed coach release, keeps private sources out, and records recipient readback", async () => {
    const coach = actor(coachUserId, coachEmail);
    const client = actor(clientUserId, clientEmail);
    const outsider = actor(outsiderUserId, outsiderEmail);

    const coachBefore = await readClientFollowUp(prisma as never, {
      roomId,
      actor: coach,
    });
    expect(coachBefore).toMatchObject({
      role: "COACH",
      output: null,
      eligible: {
        notes: [{ id: clientSafeNoteId }],
        goals: [{ id: goalId }],
        tasks: [{ id: taskId }],
      },
      boundaries: {
        draftsVisibleToClient: false,
        privateNotesEligible: false,
        unreviewedCandidatesEligible: false,
      },
    });
    expect(JSON.stringify(coachBefore)).not.toContain(privateNoteId);
    expect(JSON.stringify(coachBefore)).not.toContain(sharedNoteId);
    expect(JSON.stringify(coachBefore)).not.toContain(candidateTaskId);
    expect(coachBefore.eligible?.notes[0]?.sourceAnchor).toMatchObject({
      roomId,
      segmentId: "follow-up-note-segment",
      playbackSourceId: `follow-up-playback-${nonce}`,
    });
    expect(coachBefore.eligible?.tasks[0]?.sourceAnchor?.segmentId).toBe("follow-up-task-segment");
    expect(coachBefore.eligible?.goals[0]?.sourceAnchor?.segmentId).toBe("follow-up-goal-segment");

    const draftRequestId = randomUUID();
    const draft = await createClientFollowUpDraft(prisma as never, {
      roomId,
      actor: coach,
      draft: {
        clientRequestId: draftRequestId,
        title: "Your coaching follow-up",
        intro: "Here is the exact work we agreed to carry forward.",
        nextSessionFocus: "Review the protected rehearsal evidence together.",
        noteIds: [clientSafeNoteId],
        taskIds: [taskId],
        goalIds: [goalId],
      },
    });
    const draftReplay = await createClientFollowUpDraft(prisma as never, {
      roomId,
      actor: coach,
      draft: {
        clientRequestId: draftRequestId,
        title: "Your coaching follow-up",
        intro: "Here is the exact work we agreed to carry forward.",
        nextSessionFocus: "Review the protected rehearsal evidence together.",
        noteIds: [clientSafeNoteId],
        taskIds: [taskId],
        goalIds: [goalId],
      },
    });
    expect(draft).toMatchObject({
      idempotentReplay: false,
      output: {
        status: "DRAFT",
        revision: 1,
        recipient: { id: clientUserId },
      },
    });
    expect(draftReplay).toMatchObject({
      idempotentReplay: true,
      output: { id: draft.output.id },
    });
    expect(draft.output.body).toMatchObject({
      notes: [{ id: clientSafeNoteId, sourceAnchor: { segmentId: "follow-up-note-segment" } }],
      tasks: [{ id: taskId, sourceAnchor: { segmentId: "follow-up-task-segment" } }],
      goals: [{ id: goalId, sourceAnchor: { segmentId: "follow-up-goal-segment" } }],
    });
    expect(draft.output.sourceManifest).toMatchObject({
      boundaries: { sourceAnchorsRestrictedToSession: true },
      records: {
        notes: [{ sourceAnchor: { roomId, segmentId: "follow-up-note-segment" } }],
        tasks: [{ sourceAnchor: { roomId, segmentId: "follow-up-task-segment" } }],
        goals: [{ sourceAnchor: { roomId, segmentId: "follow-up-goal-segment" } }],
      },
    });

    const updateRequestId = randomUUID();
    const revisedDraftInput = {
      clientRequestId: updateRequestId,
      title: "Your revised coaching follow-up",
      intro: "Here is the clearer work we agreed to carry forward.",
      nextSessionFocus: "Review the revised rehearsal evidence together.",
      noteIds: [clientSafeNoteId],
      taskIds: [taskId],
      goalIds: [goalId],
    };
    const revised = await updateClientFollowUpDraft(prisma as never, {
      roomId,
      outputId: draft.output.id,
      actor: coach,
      expectedRevision: 1,
      draft: revisedDraftInput,
    });
    const revisedReplay = await updateClientFollowUpDraft(prisma as never, {
      roomId,
      outputId: draft.output.id,
      actor: coach,
      expectedRevision: 1,
      draft: revisedDraftInput,
    });
    expect(revised).toMatchObject({
      idempotentReplay: false,
      output: {
        id: draft.output.id,
        status: "DRAFT",
        revision: 2,
        title: "Your revised coaching follow-up",
        intro: "Here is the clearer work we agreed to carry forward.",
      },
    });
    expect(revisedReplay).toMatchObject({
      idempotentReplay: true,
      output: { id: draft.output.id, revision: 2 },
    });

    const concurrentResults = await Promise.allSettled([
      updateClientFollowUpDraft(prisma as never, {
        roomId,
        outputId: draft.output.id,
        actor: coach,
        expectedRevision: 2,
        draft: {
          ...revisedDraftInput,
          clientRequestId: randomUUID(),
          title: "Concurrent coaching follow-up A",
        },
      }),
      updateClientFollowUpDraft(prisma as never, {
        roomId,
        outputId: draft.output.id,
        actor: coach,
        expectedRevision: 2,
        draft: {
          ...revisedDraftInput,
          clientRequestId: randomUUID(),
          title: "Concurrent coaching follow-up B",
        },
      }),
    ]);
    const concurrentSuccesses = concurrentResults.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof updateClientFollowUpDraft>>
      > => result.status === "fulfilled",
    );
    const concurrentConflicts = concurrentResults.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(concurrentSuccesses).toHaveLength(1);
    expect(concurrentSuccesses[0].value.output).toMatchObject({
      status: "DRAFT",
      revision: 3,
      title: expect.stringMatching(/^Concurrent coaching follow-up [AB]$/),
    });
    expect(concurrentConflicts).toHaveLength(1);
    expect(concurrentConflicts[0].reason).toMatchObject({
      status: 409,
      code: "STALE_FOLLOW_UP",
    } satisfies Partial<ClientFollowUpError>);
    const concurrentWinner = concurrentSuccesses[0].value.output;

    await expect(
      updateClientFollowUpDraft(prisma as never, {
        roomId,
        outputId: draft.output.id,
        actor: coach,
        expectedRevision: 1,
        draft: { ...revisedDraftInput, clientRequestId: randomUUID() },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "STALE_FOLLOW_UP",
    } satisfies Partial<ClientFollowUpError>);
    await expect(
      updateClientFollowUpDraft(prisma as never, {
        roomId,
        outputId: draft.output.id,
        actor: client,
        expectedRevision: 2,
        draft: { ...revisedDraftInput, clientRequestId: randomUUID() },
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "COACH_REQUIRED",
    } satisfies Partial<ClientFollowUpError>);

    await expect(
      readClientFollowUp(prisma as never, { roomId, actor: client }),
    ).resolves.toMatchObject({
      role: "CLIENT",
      output: null,
    });
    await expect(
      readClientFollowUp(prisma as never, { roomId, actor: outsider }),
    ).rejects.toMatchObject({
      status: 404,
      code: "FOLLOW_UP_UNAVAILABLE",
    } satisfies Partial<ClientFollowUpError>);

    const releaseRequestId = randomUUID();
    const released = await releaseClientFollowUp(prisma as never, {
      roomId,
      outputId: draft.output.id,
      actor: coach,
      expectedRevision: 3,
      clientRequestId: releaseRequestId,
    });
    expect(released).toMatchObject({
      idempotentReplay: false,
      output: {
        id: draft.output.id,
        status: "RELEASED",
        revision: 4,
        contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        deliveryEvents: [
          {
            kind: "RELEASED_IN_APP",
            destination: "quipsly-session",
            status: "CONFIRMED",
          },
        ],
      },
    });

    await prisma.coachingNote.update({
      where: { id: clientSafeNoteId },
      data: { body: "Later source edit that must not rewrite the release." },
    });
    const clientReleased = await readClientFollowUp(prisma as never, {
      roomId,
      actor: client,
    });
    expect(clientReleased).toMatchObject({
      role: "CLIENT",
      eligible: null,
      output: {
        id: draft.output.id,
        status: "RELEASED",
        body: {
          title: concurrentWinner.title,
          notes: [
            {
              id: clientSafeNoteId,
              body: "Bring one specific example of the new boundary in use.",
              sourceAnchor: {
                roomId,
                segmentId: "follow-up-note-segment",
                effectiveTextSnapshot: "I will rehearse the boundary once and bring the evidence back.",
              },
            },
          ],
          tasks: [{ id: taskId, sourceAnchor: { segmentId: "follow-up-task-segment" } }],
          goals: [{ id: goalId, sourceAnchor: { segmentId: "follow-up-goal-segment" } }],
        },
      },
    });
    expect(JSON.stringify(clientReleased)).not.toContain(
      "Later source edit that must not rewrite the release.",
    );

    const acknowledgeRequestId = randomUUID();
    const acknowledged = await acknowledgeClientFollowUp(prisma as never, {
      roomId,
      outputId: draft.output.id,
      actor: client,
      clientRequestId: acknowledgeRequestId,
    });
    const acknowledgedReplay = await acknowledgeClientFollowUp(
      prisma as never,
      {
        roomId,
        outputId: draft.output.id,
        actor: client,
        clientRequestId: acknowledgeRequestId,
      },
    );
    expect(acknowledged).toMatchObject({
      idempotentReplay: false,
      output: {
        deliveryEvents: [
          { kind: "RELEASED_IN_APP" },
          { kind: "OPENED_IN_APP", actorUserId: clientUserId },
        ],
      },
    });
    expect(acknowledgedReplay.idempotentReplay).toBe(true);

    const deletionInventory = await buildAccountDeletionInventory({
      userId: clientUserId,
      prisma,
    });
    expect(deletionInventory).toMatchObject({
      eligibleForAutomatedExecution: false,
      blockers: expect.arrayContaining([
        expect.objectContaining({
          category: "coaching-bookings",
        }),
        expect.objectContaining({
          category: "shared-authored-content",
        }),
      ]),
    });

    const revoked = await revokeClientFollowUp(prisma as never, {
      roomId,
      outputId: draft.output.id,
      actor: coach,
      expectedRevision: 4,
      clientRequestId: randomUUID(),
    });
    expect(revoked).toMatchObject({
      output: {
        status: "REVOKED",
        revision: 5,
        deliveryEvents: [
          { kind: "RELEASED_IN_APP" },
          { kind: "OPENED_IN_APP" },
          { kind: "REVOKED" },
        ],
      },
    });
    await expect(
      readClientFollowUp(prisma as never, { roomId, actor: client }),
    ).resolves.toMatchObject({
      role: "CLIENT",
      output: null,
    });
    await expect(
      prisma.sessionOutputRevision.count({
        where: { outputId: draft.output.id },
      }),
    ).resolves.toBe(5);
  });
});
