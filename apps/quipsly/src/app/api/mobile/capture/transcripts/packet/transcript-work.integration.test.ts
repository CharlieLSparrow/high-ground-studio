/** @jest-environment node */
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { SESSION_PACKET_TEMPLATE_VERSION } from "@high-ground/quipsly-domain/coaching-packet-version";
import { transcriptPacketNoteCandidateId } from "@high-ground/quipsly-domain/coaching-packet";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { buildCoachingPacketFromTranscriptJob, transcriptPacketSnapshot } from "@/lib/server/coaching-packets";
import { loadSessionWork } from "@/lib/server/session-work";
import { MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION, MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT, MOBILE_CAPTURE_CONSENT_TEXT_SHA256 } from "@/lib/mobile-capture-consent-policy.js";
import { POST } from "../notes/route";
import { POST as mergeTask } from "./actions/route";
import { POST as mergeGoal } from "./goals/route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "invalid:");
  if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || url.pathname === "/") throw new Error("Transcript work integration requires an explicit loopback database.");
  process.env.DATABASE_URL = url.toString();
}
const actualPrisma = jest.requireActual<typeof import("@/lib/prisma")>("@/lib/prisma");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function fixture(tx: Prisma.TransactionClient) {
  const nonce = randomUUID();
  const owner = await tx.user.create({ data: { name: "Note author", primaryEmail: `note-merge-${nonce}@example.test` } });
  const member = await tx.user.create({ data: { name: "Other participant", primaryEmail: `note-member-${nonce}@example.test` } });
  const outsider = await tx.user.create({ data: { name: "Uninvited", primaryEmail: `note-outsider-${nonce}@example.test` } });
  const room = await tx.callRoom.create({ data: { title: "Synthetic transcript merge", createdByUserId: owner.id, status: "ENDED" } });
  for (const user of [owner, member]) {
    const participant = await tx.callParticipant.create({ data: { roomId: room.id, userId: user.id, role: user.id === owner.id ? "COACH" : "CLIENT" } });
    await tx.recordingConsent.create({ data: { roomId: room.id, participantId: participant.id, userId: user.id,
      consentText: MOBILE_CAPTURE_CONSENT_TEXT, policyVersion: MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
      status: "GRANTED", canRecordAudio: true, canTranscribe: true, consentedAt: new Date(),
      metadataJson: { fixture: true, consentTextHash: MOBILE_CAPTURE_CONSENT_TEXT_SHA256,
        consentEvidenceVersion: MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION, recordingChoiceExplicit: true,
        transcriptionChoiceExplicit: true, allAudibleParticipantsNotifiedAndAgreed: true,
        presentationEvidence: { surface: "quipsly-session-workspace-consent-v1", version: 1 } },
    } });
  }
  // Metadata fixture only: this suite proves API/data behavior, not audio capture or playback.
  const asset = await tx.recordingAsset.create({ data: { roomId: room.id, status: "VERIFIED", kind: "LOCAL_AUDIO",
    checksum: sha("synthetic source"), byteSize: 1024, durationSeconds: 12,
    storageBucket: "synthetic-local", storageObjectPath: `${nonce}/source.wav`,
    localManifestJson: { promotion: { sourceId: nonce, playbackUrl: `/api/ingest/media/${nonce}`, mediaKind: "audio" } } } });
  const uploadSessionId = randomUUID();
  await tx.mobileCaptureFinalizationReceipt.create({ data: { uploadSessionId, captureId: randomUUID(), roomId: room.id,
    actorUserId: owner.id, recordingAssetId: asset.id, processingDisposition: "RELEASED", transcriptDisposition: "RELEASED",
    metadataJson: { fixture: true, immutableUploadBinding: { uploadSessionId, roomId: room.id, sha256: asset.checksum,
      sizeBytes: 1024, bucketName: asset.storageBucket, objectName: asset.storageObjectPath } } } });
  const job = await tx.transcriptJob.create({ data: { roomId: room.id, assetId: asset.id, requestedBy: owner.id,
    status: "COMPLETED", provider: "synthetic-integration", sourceSha256: asset.checksum } });
  const segments = [];
  for (const [index, text] of ["I learned that writing one page", "each morning helps me start", "and I want to keep that habit."].entries()) {
    segments.push(await tx.transcriptSegment.create({ data: { transcriptJobId: job.id, speakerLabel: "Note author",
      speakerUserId: owner.id, text, startSeconds: index * 4, endSeconds: (index + 1) * 4 } }));
  }
  const sourceText = segments.map((segment) => segment.text).join(" ");
  const build = `build-${nonce}`;
  const lane = "coaching-insights";
  const summary = await tx.coachingNote.create({ data: { roomId: room.id, authorUserId: owner.id, kind: "SUMMARY",
    visibility: "AUTHOR_PRIVATE", body: "Synthetic source-backed recap", sourceJson: {
      source: "transcript-packet-builder", packetTemplateVersion: SESSION_PACKET_TEMPLATE_VERSION,
      roomId: room.id, transcriptJobId: job.id, recordingAssetId: asset.id, packetBuildId: build,
      transcriptSnapshot: transcriptPacketSnapshot(segments),
      reviewLanes: [{ id: lane, label: "Insights", status: "READY_FOR_HUMAN_REVIEW", items: [{
        segmentId: segments[0]!.id, segmentIds: segments.map((segment) => segment.id),
        sourceTextSha256: sha(sourceText), text: sourceText,
      }] }],
    } as Prisma.InputJsonValue } });
  const target = await tx.coachingNote.create({ data: { roomId: room.id, authorUserId: owner.id,
    kind: "SESSION_NOTE", visibility: "AUTHOR_PRIVATE", title: "My writing practice", body: "Keep my own observations.",
    sourceJson: { schema: "quipsly-session-note-v1" },
    revisions: { create: { revision: 1, operation: "created", actorUserId: owner.id, snapshotJson: { body: "Keep my own observations." } } } } });
  const request = {
    roomId: room.id, segmentId: segments[0]!.id, expectedProviderTextSha256: sha(segments[0]!.text),
    clientRequestId: transcriptPacketNoteCandidateId(build, lane, segments[0]!.id),
    packetNoteCandidateId: transcriptPacketNoteCandidateId(build, lane, segments[0]!.id),
    transcriptJobId: job.id, recordingAssetId: asset.id, summaryNoteId: summary.id, packetBuildId: build, packetLaneId: lane,
    decision: "MERGE", title: "Writing insight", body: sourceText, kind: "SESSION_NOTE", visibility: "AUTHOR_PRIVATE",
    mergeTargetNoteId: target.id, mergeExpectedUpdatedAt: target.updatedAt.toISOString(),
    mergedTitle: "A practice I can sustain", mergedBody: `${target.body}\n\n${sourceText}`,
    mergedKind: "SESSION_NOTE", mergedVisibility: "AUTHOR_PRIVATE",
  };
  const actAs = (user: typeof owner) => jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { ...user, isStaff: false } } as never);
  actAs(owner);
  const submit = async (changes = {}) => {
    const response = await POST(new Request("http://localhost/api/mobile/capture/transcripts/notes", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, ...changes }),
    }));
    return { status: response.status, body: await response.json() };
  };
  return { owner, member, outsider, room, asset, job, segments, sourceText, summary, build, target, request, submit, actAs };
}

async function existingWork(tx: Prisma.TransactionClient, f: Awaited<ReturnType<typeof fixture>>, kind: "task" | "goal") {
  const project = await tx.studioProject.create({ data: { slug: randomUUID(), name: "Writing",
    workspace: { create: { slug: randomUUID(), name: "Synthetic Nest" } } } });
  await tx.callRoom.update({ where: { id: f.room.id }, data: { projectId: project.id } });
  const goal = await tx.goal.create({ data: { roomId: f.room.id, projectId: project.id, ownerUserId: f.owner.id,
    title: "Write my book", description: "My own definition of success", status: "PAUSED",
    targetAt: new Date("2027-01-01T12:00:00Z"), sourceJson: { manual: true } } });
  const task = await tx.actionItem.create({ data: { roomId: f.room.id, projectId: project.id, assignedUserId: f.owner.id,
    title: "Draft the introduction", detail: "My own next step", dueAt: new Date("2026-12-01T12:00:00Z"),
    noteId: f.target.id, sourceJson: { manual: true } } });
  const link = await tx.goalTaskLink.create({ data: { goalId: goal.id, actionItemId: task.id, createdByUserId: f.owner.id } });
  const reminder = await tx.taskReminder.create({ data: { id: randomUUID(), actionItemId: task.id,
    ownerUserId: f.owner.id, remindAt: new Date("2026-11-30T12:00:00Z") } });
  const tag = await tx.studioTag.create({ data: { projectId: project.id, slug: "writing", label: "Writing" } });
  const taskTag = await tx.actionItemTagLink.create({ data: { actionItemId: task.id, tagId: tag.id } });
  const goalTag = await tx.goalTagLink.create({ data: { goalId: goal.id, tagId: tag.id } });
  const series = await tx.taskRecurrenceSeries.create({ data: { ownerUserId: f.owner.id, projectId: project.id,
    title: task.title, cadence: "FIXED", frequency: "WEEKLY", timezone: "America/Denver",
    localTimeMinutes: 600, anchorLocalDate: "2026-12-01", anchorDayOfMonth: 1 } });
  const occurrence = await tx.taskOccurrence.create({ data: { seriesId: series.id, actionItemId: task.id,
    occurrenceKey: "2026-12-01T10:00[America/Denver]", scheduledLocalDate: "2026-12-01",
    scheduledFor: new Date("2026-12-01T17:00:00Z") } });
  const plan = await tx.workPlanBlock.create({ data: { ownerUserId: f.owner.id,
    ...(kind === "task" ? { actionItemId: task.id } : { goalId: goal.id }),
    startsAt: new Date("2026-12-01T17:00:00Z"), endsAt: new Date("2026-12-01T17:30:00Z"),
    timezone: "America/Denver" } });
  const progress = await tx.goalProgressReceipt.create({ data: { goalId: goal.id, actorUserId: f.owner.id,
    kind: "PROGRESS_UPDATED", progressPercent: 35, note: "My assessment", occurredAt: new Date() } });
  const actionCandidateId = `quipsly-transcript-action-candidate-v1:${f.job.id}:${f.segments[0]!.id}`;
  const goalCandidateId = `packet-goal-${f.build}-${f.segments[0]!.id}`;
  const span = { segmentId: f.segments[0]!.id, segmentIds: f.segments.map((segment) => segment.id),
    sourceTextSha256: sha(f.sourceText), text: f.sourceText };
  await tx.coachingNote.update({ where: { id: f.summary.id }, data: { sourceJson: {
    ...(f.summary.sourceJson as Prisma.JsonObject),
    actionCandidates: [{ ...span, id: actionCandidateId, kind: "quipsly-transcript-action-candidate-v1",
      reviewStatus: "READY_FOR_HUMAN_REVIEW", title: "Write every morning", detail: f.sourceText,
      sourceText: f.sourceText, transcriptJobId: f.job.id, recordingAssetId: f.asset.id,
      roomId: f.room.id, packetBuildId: f.build, speakerLabel: "Note author", startSeconds: 0, endSeconds: 12,
      humanApprovalRequired: false, committedActionItemId: null }],
    // Historical packets still support adding evidence to existing work.
    // These old projection flags must not require a playback/review ceremony.
    // Current automatic packets expose their already-created ordinary goals.
    packetBrief: { kind: "quipsly-transcript-packet-brief-v1", candidateOnly: true,
      humanApprovalRequired: true, sections: [{ id: "goals", items: [span] }] },
  } as Prisma.InputJsonValue } });
  const target = kind === "task" ? task : goal;
  const request = { callRoomId: f.room.id, transcriptJobId: f.job.id, recordingAssetId: f.asset.id,
    summaryNoteId: f.summary.id, packetBuildId: f.build, decision: "MERGE",
    mergeExpectedUpdatedAt: target.updatedAt.toISOString(),
    ...(kind === "task" ? { actionCandidateId, mergeTargetTaskId: task.id } : { goalCandidateId, mergeTargetGoalId: goal.id }) };
  const submit = async () => {
    const response = await (kind === "task" ? mergeTask : mergeGoal)(new Request(
      `http://localhost/api/mobile/capture/transcripts/packet/${kind === "task" ? "actions" : "goals"}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) },
    ));
    return { status: response.status, body: await response.json() };
  };
  const evidence = () => kind === "task"
    ? tx.actionItemEvidenceReceipt.findMany({ where: { actionItemId: task.id } })
    : tx.goalProgressReceipt.findMany({ where: { goalId: goal.id, kind: "TRANSCRIPT_CANDIDATE_MERGED" } });
  const assertUnchanged = async () => {
    expect(await tx.actionItem.findUniqueOrThrow({ where: { id: task.id } })).toEqual(task);
    expect(await tx.goal.findUniqueOrThrow({ where: { id: goal.id } })).toEqual(goal);
    expect(await tx.goalTaskLink.findMany({ where: { goalId: goal.id } })).toEqual([link]);
    expect(await tx.taskReminder.findUniqueOrThrow({ where: { id: reminder.id } })).toEqual(reminder);
    expect(await tx.actionItemTagLink.findMany({ where: { actionItemId: task.id } })).toEqual([taskTag]);
    expect(await tx.goalTagLink.findMany({ where: { goalId: goal.id } })).toEqual([goalTag]);
    expect(await tx.taskRecurrenceSeries.findUniqueOrThrow({ where: { id: series.id } })).toEqual(series);
    expect(await tx.taskOccurrence.findUniqueOrThrow({ where: { id: occurrence.id } })).toEqual(occurrence);
    expect(await tx.workPlanBlock.findUniqueOrThrow({ where: { id: plan.id } })).toEqual(plan);
    expect(await tx.goalProgressReceipt.findUniqueOrThrow({ where: { id: progress.id } })).toEqual(progress);
    expect(await tx.transcriptSegment.findMany({ where: { transcriptJobId: f.job.id }, orderBy: { startSeconds: "asc" } })).toEqual(f.segments);
    expect(await tx.deliveryEvent.count({ where: { roomId: f.room.id } })).toBe(0);
  };
  return { task, goal, submit, evidence, assertUnchanged };
}

async function withFixture(run: (tx: Prisma.TransactionClient, f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const db = actualPrisma.getPrismaClient();
  const rollback = new Error("Rollback this synthetic test only");
  let created: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    await db.$transaction(async (tx) => {
      // The endpoint uses the real transaction client; its application, access,
      // consent, revision and source-binding code is not mocked. Roll back once
      // assertions finish so reruns never depend on a retained test account.
      jest.mocked(getPrismaClient).mockReturnValue(new Proxy(tx, {
        get(target, property) {
          if (property === "$transaction") return async (operation: (client: Prisma.TransactionClient) => Promise<unknown>) => operation(target);
          return Reflect.get(target, property);
        },
      }) as never);
      created = await fixture(tx);
      await run(tx, created);
      throw rollback;
    }, { timeout: 30_000 });
  } catch (error) { if (error !== rollback) throw error; }
  if (created) {
    expect(await db.callRoom.count({ where: { id: created.room.id } })).toBe(0);
    expect(await db.user.count({ where: { id: { in: [created.owner.id, created.member.id, created.outsider.id] } } })).toBe(0);
  }
}

async function automaticSession(tx: Prisma.TransactionClient, f: Awaited<ReturnType<typeof fixture>>) {
  const engagement = await tx.coachingEngagement.create({ data: {
    title: "Writing practice", primaryCoach: { connect: { id: f.owner.id } }, primaryClient: { connect: { id: f.member.id } },
    project: { create: { slug: randomUUID(), name: "Coaching",
      workspace: { create: { slug: randomUUID(), name: "Synthetic coaching Nest" } } } },
    members: { create: [{ userId: f.owner.id, role: "COACH" }, { userId: f.member.id, role: "CLIENT" }] },
  } });
  await tx.callRoom.update({ where: { id: f.room.id }, data: { purpose: "COACHING",
    projectId: engagement.projectId, coachingEngagementId: engagement.id } });
  const participant = await tx.callParticipant.findFirstOrThrow({ where: { roomId: f.room.id, userId: f.member.id } });
  await tx.recordingAsset.update({ where: { id: f.asset.id }, data: { participantId: participant.id } });
  await tx.transcriptJob.update({ where: { id: f.job.id }, data: { resultJson: {
    processingControl: { routing: { schema: "quipsly-transcript-routing-summary-v1",
      sourceTopology: "participant-isolated", speakerAuthority: "source-binding", participantLabel: "Other participant" } },
  } } });
  const words = ["My goal is to write every morning.", "Tomorrow I will draft one page.", "I learned that small steps help me start."];
  const segments = [];
  for (const [index, segment] of f.segments.entries()) {
    segments.push(await tx.transcriptSegment.update({ where: { id: segment.id }, data: {
      text: words[index], speakerLabel: "Other participant", speakerUserId: f.member.id,
    } }));
  }
  const build = () => buildCoachingPacketFromTranscriptJob({ prisma: tx, transcriptJobId: f.job.id, authorUserId: f.owner.id });
  const read = (user: typeof f.owner) => loadSessionWork({ prisma: tx, roomId: f.room.id, actor: { id: user.id, primaryEmail: user.primaryEmail } });
  return { engagement, segments, build, read };
}

(enabled ? describe : describe.skip)("transcript work against a fresh database fixture", () => {
  afterAll(async () => { if (enabled) await actualPrisma.getPrismaClient().$disconnect(); });

  it("creates useful shared work automatically, attributes it to the speaker, and reuses it on retry", async () => {
    await withFixture(async (tx, f) => {
      const session = await automaticSession(tx, f);
      const result = await session.build();
      expect(result).toMatchObject({ ok: true, actionItemCount: 1, goalCount: 1, humanReviewedSegmentCount: 0 });
      const tasks = await tx.actionItem.findMany({ where: { roomId: f.room.id } });
      const goals = await tx.goal.findMany({ where: { roomId: f.room.id } });
      expect(tasks).toHaveLength(1);
      expect(goals).toHaveLength(1);
      expect(tasks[0]).toMatchObject({ assignedUserId: f.member.id, status: "OPEN", engagementId: session.engagement.id,
        title: "Tomorrow I will draft one page", sourceJson: { recordingAssetId: f.asset.id, automaticallyCreated: true } });
      expect(goals[0]).toMatchObject({ ownerUserId: f.member.id, status: "ACTIVE", engagementId: session.engagement.id,
        title: "My goal is to write every morning", sourceJson: { recordingAssetId: f.asset.id, automaticallyCreated: true } });
      const notes = await tx.coachingNote.findMany({ where: { roomId: f.room.id, engagementId: session.engagement.id } });
      expect(notes.some(note => note.kind === "SUMMARY")).toBe(true);
      expect(notes.some(note => note.kind === "HIGHLIGHT")).toBe(true);
      expect(notes.every(note => note.visibility === "SESSION_SHARED")).toBe(true);
      for (const user of [f.owner, f.member]) {
        const work = await session.read(user);
        expect(work.map(item => item.id).sort()).toEqual([tasks[0]!.id, goals[0]!.id].sort());
        expect(work.every(item => item.canEdit && item.fromTranscript && item.sourceHref?.includes(f.asset.id))).toBe(true);
      }
      expect(await session.read(f.outsider)).toEqual([]);
      expect(await session.build()).toMatchObject({ ok: true, reusedExistingPacket: true });
      expect(await tx.actionItem.findMany({ where: { roomId: f.room.id } })).toEqual(tasks);
      expect(await tx.goal.findMany({ where: { roomId: f.room.id } })).toEqual(goals);
      expect(await tx.coachingNote.count({ where: { roomId: f.room.id, engagementId: session.engagement.id } })).toBe(notes.length);
      expect(await tx.transcriptSegment.findMany({ where: { transcriptJobId: f.job.id }, orderBy: { startSeconds: "asc" } })).toEqual(session.segments);
      expect(await tx.transcriptSegmentVerification.count({ where: { roomId: f.room.id } })).toBe(0);
      expect(await tx.deliveryEvent.count({ where: { roomId: f.room.id } })).toBe(0);
    });
  });

  it("preserves a person's edited work when a corrected transcript refreshes the automatic results", async () => {
    await withFixture(async (tx, f) => {
      const session = await automaticSession(tx, f);
      expect(await session.build()).toMatchObject({ ok: true });
      const task = await tx.actionItem.findFirstOrThrow({ where: { roomId: f.room.id } });
      const goal = await tx.goal.findFirstOrThrow({ where: { roomId: f.room.id } });
      const summary = await tx.coachingNote.findFirstOrThrow({ where: { roomId: f.room.id, engagementId: session.engagement.id, kind: "SUMMARY" } });
      const taskEdited = await tx.actionItem.update({ where: { id: task.id }, data: { title: "My chosen next step", assignedUserId: f.owner.id } });
      const goalEdited = await tx.goal.update({ where: { id: goal.id }, data: { title: "My longer-term direction", status: "PAUSED" } });
      const summaryEdited = await tx.coachingNote.update({ where: { id: summary.id }, data: { body: "My own reflection", visibility: "AUTHOR_PRIVATE" } });
      const segment = session.segments[1]!;
      await tx.transcriptCorrection.create({ data: { roomId: f.room.id, transcriptJobId: f.job.id, segmentId: segment.id,
        createdByUserId: f.member.id, clientRequestId: randomUUID(), status: "accepted", baseTextSha256: sha(segment.text),
        expectedText: segment.text, expectedSpeakerLabel: segment.speakerLabel, startSecondsSnapshot: segment.startSeconds,
        endSecondsSnapshot: segment.endSeconds, correctedText: "Tomorrow I will draft two pages.", reviewedAt: new Date() } });
      expect(await session.build()).toMatchObject({ ok: true, reusedExistingPacket: false });
      expect(await tx.actionItem.findUniqueOrThrow({ where: { id: task.id } })).toEqual(taskEdited);
      expect(await tx.goal.findUniqueOrThrow({ where: { id: goal.id } })).toEqual(goalEdited);
      expect(await tx.coachingNote.findUniqueOrThrow({ where: { id: summary.id } })).toEqual(summaryEdited);
      expect(await tx.actionItem.count({ where: { roomId: f.room.id } })).toBe(1);
      expect(await tx.goal.count({ where: { roomId: f.room.id } })).toBe(1);
      expect(await tx.transcriptSegment.findUniqueOrThrow({ where: { id: segment.id } })).toEqual(segment);
      expect((await tx.recordingAsset.findUniqueOrThrow({ where: { id: f.asset.id } })).checksum).toBe(f.asset.checksum);
    });
  });

  it.each([
    ["actionItem", "update"], ["goal", "update"],
    ["actionItem", "delete"], ["goal", "delete"],
  ] as const)("uses a real row-version predicate when %s %s races a personal edit", async (model, operation) => {
    await withFixture(async (tx, f) => {
      const session = await automaticSession(tx, f);
      expect(await session.build()).toMatchObject({ ok: true });
      const row = model === "actionItem"
        ? await tx.actionItem.findFirstOrThrow({ where: { roomId: f.room.id } })
        : await tx.goal.findFirstOrThrow({ where: { roomId: f.room.id } });
      if (operation === "delete") {
        for (const segment of session.segments.slice(0, 2)) {
          await tx.transcriptCorrection.create({ data: { roomId: f.room.id, transcriptJobId: f.job.id, segmentId: segment.id,
            createdByUserId: f.member.id, clientRequestId: randomUUID(), status: "accepted", baseTextSha256: sha(segment.text),
            expectedText: segment.text, expectedSpeakerLabel: segment.speakerLabel,
            startSecondsSnapshot: segment.startSeconds, endSecondsSnapshot: segment.endSeconds,
            correctedText: "We spoke about the weather.", reviewedAt: new Date() } });
        }
      }
      let interleaved = false;
      const title = "Edited while the refresh was working";
      const prisma = new Proxy(tx, { get(target, property) {
        if (property !== model) return Reflect.get(target, property);
        const delegate = Reflect.get(target, property);
        return new Proxy(delegate, { get(table, method) {
          if (method !== operation) return Reflect.get(table, method);
          return async (args: { where: { id: string } }) => {
            // Interleave a real SQL edit after the builder inspected this row.
            // This proves its SQL predicate, not two-connection scheduling.
            if (args.where.id === row.id && !interleaved) {
              interleaved = true;
              await Reflect.apply(Reflect.get(table, "update"), table, [{ where: { id: row.id },
                data: { title, updatedAt: new Date(row.updatedAt.getTime() + 1000) } }]);
            }
            return Reflect.apply(Reflect.get(table, operation), table, [args]);
          };
        } });
      } });
      await expect(buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: f.job.id, authorUserId: f.owner.id, force: true }))
        .rejects.toMatchObject({ code: "P2034" });
      expect(interleaved).toBe(true);
      const retained = model === "actionItem"
        ? await tx.actionItem.findUniqueOrThrow({ where: { id: row.id } })
        : await tx.goal.findUniqueOrThrow({ where: { id: row.id } });
      expect(retained.title).toBe(title);
    });
  });

  it("merges an unreviewed three-passage source, retains prior content, and retries without duplication", async () => {
    await withFixture(async (tx, f) => {
      const saved = await f.submit();
      if (saved.status !== 200) throw new Error(JSON.stringify(saved));
      expect(saved).toMatchObject({ status: 200, body: { ok: true, idempotentReplay: false,
        boundaries: { noteCreated: false, noteRevised: true, sourceReviewState: "provider-transcript" } } });
      const note = await tx.coachingNote.findUniqueOrThrow({ where: { id: f.target.id }, include: { revisions: { orderBy: { revision: "asc" } } } });
      expect(note.body).toBe(f.request.mergedBody);
      expect(note.revisions.map((revision) => revision.operation)).toEqual(["created", "merged-transcript-candidate"]);
      expect(note.revisions[1]!.snapshotJson).toMatchObject({ previous: { body: f.target.body }, next: { body: f.request.mergedBody } });
      expect(note.sourceJson).toMatchObject({ schema: "quipsly-session-note-v1", lastTranscriptCandidateMerge: {
        candidateSource: { recordingAssetId: f.asset.id, segmentIds: f.segments.map((segment) => segment.id),
          effectiveTextSnapshot: f.sourceText, sourceReviewState: "provider-transcript", acceptedCorrectionId: null },
      } });
      expect(await tx.transcriptSegmentVerification.count({ where: { roomId: f.room.id } })).toBe(0);
      expect(await tx.transcriptCorrection.count({ where: { roomId: f.room.id } })).toBe(0);
      expect(await tx.transcriptSegment.findMany({ where: { transcriptJobId: f.job.id }, orderBy: { startSeconds: "asc" } })).toEqual(f.segments);
      expect((await tx.recordingAsset.findUniqueOrThrow({ where: { id: f.asset.id } })).checksum).toBe(f.asset.checksum);
      expect(await f.submit()).toMatchObject({ status: 200, body: { idempotentReplay: true, note: { id: f.target.id, revisionCount: 2 } } });
      expect(await tx.coachingNoteRevision.count({ where: { noteId: f.target.id } })).toBe(2);
      expect(await tx.actionItem.count({ where: { roomId: f.room.id } })).toBe(0);
      expect(await tx.goal.count({ where: { roomId: f.room.id } })).toBe(0);
      expect(await tx.deliveryEvent.count({ where: { roomId: f.room.id } })).toBe(0);
    });
  });

  it("does not overwrite a note edited after the merge form was opened", async () => {
    await withFixture(async (tx, f) => {
      await tx.coachingNote.update({ where: { id: f.target.id }, data: { body: "Newer wording", updatedAt: new Date(f.target.updatedAt.getTime() + 1000) } });
      expect(await f.submit()).toMatchObject({ status: 409, body: { code: "PACKET_NOTE_MERGE_TARGET_CHANGED" } });
      expect((await tx.coachingNote.findUniqueOrThrow({ where: { id: f.target.id } })).body).toBe("Newer wording");
      expect(await tx.coachingNoteRevision.count({ where: { noteId: f.target.id } })).toBe(1);
    });
  });

  it("rejects an outsider even with exact Session, note and source identifiers", async () => {
    await withFixture(async (tx, f) => {
      f.actAs(f.outsider);
      expect(await f.submit()).toMatchObject({ status: 404, body: { code: "SESSION_MUTATION_ACCESS_REQUIRED" } });
      expect(await tx.coachingNoteRevision.count({ where: { noteId: f.target.id } })).toBe(1);
    });
  });

  it("does not let Session membership overwrite another participant's private note", async () => {
    await withFixture(async (tx, f) => {
      f.actAs(f.member);
      expect(await f.submit()).toMatchObject({ status: 404, body: { code: "PACKET_NOTE_MERGE_TARGET_UNAVAILABLE" } });
      expect(await tx.coachingNoteRevision.count({ where: { noteId: f.target.id } })).toBe(1);
    });
  });

  it("rejects changed source hashes without revising the note", async () => {
    await withFixture(async (tx, f) => {
      expect(await f.submit({ expectedProviderTextSha256: sha("different words") })).toMatchObject({ status: 409, body: { code: "STALE_PROVIDER_EVIDENCE" } });
      expect(await tx.coachingNoteRevision.count({ where: { noteId: f.target.id } })).toBe(1);
    });
  });

  it.each([
    ["canRecordAudio", "CURRENT_ALL_PARTY_SOURCE_CONSENT_REQUIRED"],
    ["canTranscribe", "CURRENT_ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED"],
  ] as const)("honors a participant's changed %s permission without fabricating review steps", async (permission, code) => {
    await withFixture(async (tx, f) => {
      await tx.recordingConsent.updateMany({ where: { roomId: f.room.id, userId: f.member.id }, data: { [permission]: false } });
      expect(await f.submit()).toMatchObject({ status: 409, body: { code } });
      expect(await tx.coachingNoteRevision.count({ where: { noteId: f.target.id } })).toBe(1);
    });
  });

  describe.each(["task", "goal"] as const)("existing %s evidence", (kind) => {
    const prefix = kind === "task" ? "ACTION" : "GOAL";

    it("appends the whole unreviewed passage exactly once without rewriting existing work", async () => {
      await withFixture(async (tx, f) => {
        const work = await existingWork(tx, f, kind);
        const saved = await work.submit();
        if (saved.status !== 200) throw new Error(JSON.stringify(saved));
        expect(saved.body).toMatchObject({ ok: true, idempotentReplay: false,
          boundaries: { sourceReviewState: "provider-transcript" } });
        const evidence = await work.evidence();
        expect(evidence).toHaveLength(1);
        expect(evidence[0]).toMatchObject({ actorUserId: f.owner.id, kind: "TRANSCRIPT_CANDIDATE_MERGED",
          evidenceJson: { candidateSource: { recordingAssetId: f.asset.id,
            segmentIds: f.segments.map((segment) => segment.id), effectiveTextSnapshot: f.sourceText,
            startSeconds: 0, endSeconds: 12, sourceReviewState: "provider-transcript" } } });
        expect(await work.submit()).toMatchObject({ status: 200, body: { ok: true, idempotentReplay: true } });
        expect(await work.evidence()).toEqual(evidence);
        const activity = await tx.governedAction.findMany({ where: {
          targetObjectId: kind === "task" ? work.task.id : work.goal.id,
        }, include: { attempts: true } });
        expect(activity).toHaveLength(1);
        expect(activity[0]).toMatchObject({ status: "SUCCEEDED", attempts: [{ status: "SUCCEEDED" }] });
        expect(await tx.transcriptSegmentVerification.count({ where: { roomId: f.room.id } })).toBe(0);
        await work.assertUnchanged();
      });
    });

    it("rejects a stale target rather than silently applying to changed work", async () => {
      await withFixture(async (tx, f) => {
        const work = await existingWork(tx, f, kind);
        const title = "My newer wording";
        if (kind === "task") await tx.actionItem.update({ where: { id: work.task.id },
          data: { title, updatedAt: new Date(work.task.updatedAt.getTime() + 1000) } });
        else await tx.goal.update({ where: { id: work.goal.id },
          data: { title, updatedAt: new Date(work.goal.updatedAt.getTime() + 1000) } });
        expect(await work.submit()).toMatchObject({ status: 409, body: { errorCode: `${prefix}_CANDIDATE_MERGE_TARGET_CHANGED` } });
        expect(await work.evidence()).toHaveLength(0);
        const row = kind === "task" ? await tx.actionItem.findUniqueOrThrow({ where: { id: work.task.id } })
          : await tx.goal.findUniqueOrThrow({ where: { id: work.goal.id } });
        expect(row.title).toBe(title);
      });
    });

    it.each(["member", "outsider"] as const)("does not let another %s append to private work", async (identity) => {
      await withFixture(async (tx, f) => {
        const work = await existingWork(tx, f, kind);
        f.actAs(f[identity]);
        const result = await work.submit();
        expect(result).toMatchObject(identity === "outsider"
          ? { status: 404, body: { ok: false, errorCode: "ROOM_ACCESS_DENIED" } }
          : { status: 409, body: { ok: false, errorCode: `${prefix}_CANDIDATE_MERGE_TARGET_UNAVAILABLE` } });
        expect(await work.evidence()).toHaveLength(0);
        await work.assertUnchanged();
      });
    });

    it("rejects another Nest's target even when the requesting user owns it", async () => {
      await withFixture(async (tx, f) => {
        const work = await existingWork(tx, f, kind);
        const project = await tx.studioProject.create({ data: { slug: randomUUID(), name: "Other project",
          workspace: { create: { slug: randomUUID(), name: "Other Nest" } } } });
        if (kind === "task") await tx.actionItem.update({ where: { id: work.task.id }, data: { projectId: project.id } });
        else await tx.goal.update({ where: { id: work.goal.id }, data: { projectId: project.id } });
        expect(await work.submit()).toMatchObject({ status: 409,
          body: { errorCode: `${prefix}_CANDIDATE_MERGE_TARGET_UNAVAILABLE` } });
        expect(await work.evidence()).toHaveLength(0);
      });
    });

    it("rejects a changed passage instead of attaching outdated source evidence", async () => {
      await withFixture(async (tx, f) => {
        const work = await existingWork(tx, f, kind);
        await tx.transcriptSegment.update({ where: { id: f.segments[2]!.id }, data: { text: "Different source wording." } });
        expect(await work.submit()).toMatchObject({ status: 409, body: { errorCode: "TRANSCRIPT_REVIEW_CHANGED" } });
        expect(await work.evidence()).toHaveLength(0);
        expect(await tx.actionItem.findUniqueOrThrow({ where: { id: work.task.id } })).toEqual(work.task);
        expect(await tx.goal.findUniqueOrThrow({ where: { id: work.goal.id } })).toEqual(work.goal);
      });
    });

    it.each([
      ["canRecordAudio", "CURRENT_ALL_PARTY_SOURCE_CONSENT_REQUIRED"],
      ["canTranscribe", "CURRENT_ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED"],
    ] as const)("honors changed %s permission without touching existing work", async (permission, errorCode) => {
      await withFixture(async (tx, f) => {
        const work = await existingWork(tx, f, kind);
        await tx.recordingConsent.updateMany({ where: { roomId: f.room.id, userId: f.member.id }, data: { [permission]: false } });
        expect(await work.submit()).toMatchObject({ status: 409, body: { errorCode } });
        expect(await work.evidence()).toHaveLength(0);
        await work.assertUnchanged();
      });
    });
  });
});
