/** @jest-environment node */
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { SESSION_PACKET_TEMPLATE_VERSION } from "@high-ground/quipsly-domain/coaching-packet-version";
import { transcriptPacketNoteCandidateId } from "@high-ground/quipsly-domain/coaching-packet";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { buildCoachingPacketFromTranscriptJob, transcriptPacketSnapshot, loadSessionFollowThroughSource, sessionFollowThroughAnalysisSource } from "@/lib/server/coaching-packets";
import { analyzeSessionTranscript, SESSION_ANALYSIS_VERSION, sessionAnalysisSourceFingerprint } from "@/lib/server/session-transcript-analysis";
import { reconcileCaptureTranscriptFollowThrough } from "@/lib/server/capture-transcript-follow-through";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { loadSessionWork } from "@/lib/server/session-work";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import { MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION, MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT, MOBILE_CAPTURE_CONSENT_TEXT_SHA256 } from "@/lib/mobile-capture-consent-policy.js";
import { POST } from "../notes/route";
import { POST as mergeTask } from "./actions/route";
import { POST as mergeGoal } from "./goals/route";
import { GET as readPacket, POST as buildPacket } from "./route";
import { POST as createTask } from "../tasks/route";
import { POST as createGoal } from "../goals/route";
import { POST as createDraft } from "../drafts/route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/capture-transcript-follow-through-dispatch", () => ({ dispatchCaptureTranscriptFollowThrough: jest.fn() }));

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "invalid:");
  if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || url.pathname === "/") throw new Error("Transcript work integration requires an explicit loopback database.");
  process.env.DATABASE_URL = url.toString();
  // One lock holder, two independent callers, and one observer connection.
  // This test-only pool does not change the application's deployment defaults.
  process.env.PRISMA_PG_POOL_MAX = "4";
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
  const segments: typeof f.segments = [];
  for (const [index, segment] of f.segments.entries()) {
    segments.push(await tx.transcriptSegment.update({ where: { id: segment.id }, data: {
      text: words[index], speakerLabel: "Other participant", speakerUserId: f.member.id,
    } }));
  }
  const build = () => buildCoachingPacketFromTranscriptJob({ prisma: tx, transcriptJobId: f.job.id, authorUserId: f.owner.id });
  const read = (user: typeof f.owner) => loadSessionWork({ prisma: tx, roomId: f.room.id, actor: { id: user.id, primaryEmail: user.primaryEmail } });
  const removeCommitments = async () => {
    for (const segment of segments.slice(0, 2)) {
      await tx.transcriptCorrection.create({ data: { roomId: f.room.id, transcriptJobId: f.job.id, segmentId: segment.id,
        createdByUserId: f.member.id, clientRequestId: randomUUID(), status: "accepted", baseTextSha256: sha(segment.text),
        expectedText: segment.text, expectedSpeakerLabel: segment.speakerLabel,
        startSecondsSnapshot: segment.startSeconds, endSecondsSnapshot: segment.endSeconds,
        correctedText: "We spoke about the weather.", reviewedAt: new Date() } });
    }
  };
  return { engagement, segments, build, read, removeCommitments };
}

(enabled ? describe : describe.skip)("transcript work against a fresh database fixture", () => {
  afterAll(async () => { if (enabled) await actualPrisma.getPrismaClient().$disconnect(); });

  it("serializes an explicit rebuild with the background worker on the same committed Session", async () => {
    const db = actualPrisma.getPrismaClient();
    const setup = await db.$transaction(async tx => {
      const f = await fixture(tx);
      const session = await automaticSession(tx, f);
      const project = await tx.studioProject.findUniqueOrThrow({ where: { id: session.engagement.projectId! } });
      return { f, engagementId: session.engagement.id, projectId: project.id, workspaceId: project.workspaceId };
    });
    const { f } = setup;
    jest.mocked(getPrismaClient).mockReturnValue(db);
    f.actAs(f.owner);
    let unlock!: () => void;
    const release = new Promise<void>(resolve => { unlock = resolve; });
    let announce!: (pid: number) => void;
    const locked = new Promise<number>(resolve => { announce = resolve; });
    const holder = db.$transaction(async tx => {
      await acquirePrismaAdvisoryTransactionLock(tx, `capture-transcript-follow-through-room:${f.room.id}`);
      const [connection] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      announce(connection!.pid);
      await release;
    }, { timeout: 15_000 });
    const pending: Promise<unknown>[] = [holder];
    try {
      const pid = await locked;
      const explicit = buildPacket(new Request("http://localhost/api/mobile/capture/transcripts/packet", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcriptJobId: f.job.id }),
      }));
      const worker = reconcileCaptureTranscriptFollowThrough({ prisma: db, transcriptJobId: f.job.id, analysisProvider: null });
      pending.push(explicit, worker);
      let waiters = 0;
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && waiters < 2) {
        const [state] = await db.$queryRaw<{ count: number }[]>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
        waiters = state!.count;
        if (waiters < 2) await new Promise(resolve => setTimeout(resolve, 20));
      }
      // This is PostgreSQL-observed contention, not a sleep-based assumption
      // that both code paths happened to use the same lock.
      expect(waiters).toBe(2);
      unlock();
      const [response, followed] = await Promise.all([explicit, worker]);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
      expect(followed).toMatchObject({ packetStatus: "ready" });
      expect(await db.actionItem.count({ where: { roomId: f.room.id } })).toBe(1);
      expect(await db.goal.count({ where: { roomId: f.room.id } })).toBe(1);
      expect(await db.coachingNote.count({ where: { roomId: f.room.id, engagementId: setup.engagementId, kind: "SUMMARY" } })).toBe(1);
    } finally {
      unlock();
      await Promise.allSettled(pending);
      // Only this test's newly created metadata is removed. No source file was
      // uploaded; no retained persona or existing project is touched.
      await db.$transaction(async tx => {
        await tx.actionItem.deleteMany({ where: { roomId: f.room.id } });
        await tx.goal.deleteMany({ where: { roomId: f.room.id } });
        await tx.mobileCaptureFinalizationReceipt.deleteMany({ where: { roomId: f.room.id } });
        await tx.callRoom.delete({ where: { id: f.room.id } });
        await tx.coachingEngagement.delete({ where: { id: setup.engagementId } });
        await tx.studioProject.delete({ where: { id: setup.projectId } });
        if (setup.workspaceId) await tx.studioWorkspace.delete({ where: { id: setup.workspaceId } });
        await tx.user.deleteMany({ where: { id: { in: [f.owner.id, f.member.id, f.outsider.id] } } });
      });
    }
  }, 20_000);

  it.each(["task", "goal", "note", "draft"] as const)("creates and retries a %s from a known transcript before playback is available", async (kind) => {
    await withFixture(async (tx, f) => {
      await tx.recordingAsset.update({ where: { id: f.asset.id }, data: { localManifestJson: {} } });
      const { readTranscriptCorrectionDesk } = await import("@/lib/server/transcript-corrections");
      const desk = await readTranscriptCorrectionDesk({ prisma: tx, roomId: f.room.id,
        actor: { id: f.owner.id, email: f.owner.primaryEmail, isStaff: false }, segmentId: f.segments[0]!.id });
      expect(desk).toMatchObject({ gate: { allowed: true }, recording: { id: f.asset.id }, playback: null });
      const handler = { task: createTask, goal: createGoal, note: POST, draft: createDraft }[kind];
      const body = { roomId: f.room.id, segmentId: f.segments[0]!.id,
        expectedProviderTextSha256: sha(f.segments[0]!.text), clientRequestId: randomUUID(),
        title: "Keep writing while audio prepares", body: f.sourceText,
        kind: "SESSION_NOTE", visibility: "AUTHOR_PRIVATE" };
      const submit = () => handler(new Request(`http://localhost/api/mobile/capture/transcripts/${kind}s`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }));
      const response = await submit();
      const payload = await response.json();
      expect({ status: response.status, error: payload.error }).toEqual({ status: 200, error: undefined });
      const saved = kind === "draft" ? await tx.studioDocumentOperation.findFirstOrThrow({ where: { documentId: payload.document.id } })
        : kind === "task" ? await tx.actionItem.findUniqueOrThrow({ where: { id: payload.task.id } })
          : kind === "goal" ? await tx.goal.findUniqueOrThrow({ where: { id: payload.goal.id } })
            : await tx.coachingNote.findUniqueOrThrow({ where: { id: payload.note.id } });
      const source = "payloadJson" in saved ? saved.payloadJson : saved.sourceJson;
      expect(source).toMatchObject({ transcriptJobId: f.job.id, recordingAssetId: f.asset.id,
        segmentId: f.segments[0]!.id, playbackSourceId: null });
      const retry = await submit();
      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({ idempotentReplay: true });
      expect(await tx.recordingAsset.findUniqueOrThrow({ where: { id: f.asset.id } }))
        .toMatchObject({ localManifestJson: {}, checksum: f.asset.checksum });
    });
  });

  it.each(["task", "goal"] as const)("binds a %s retry to its original passage and wording while preserving later edits", async (kind) => {
    await withFixture(async (tx, f) => {
      const handler = kind === "task" ? createTask : createGoal;
      const body = { roomId: f.room.id, segmentId: f.segments[0]!.id,
        expectedProviderTextSha256: sha(f.segments[0]!.text), clientRequestId: randomUUID(),
        title: "Write the opening", detail: "Keep it brief", description: "Keep it brief" };
      const submit = (changes: Record<string, unknown> = {}) => handler(new Request(`http://localhost/api/mobile/capture/transcripts/${kind}s`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, ...changes }),
      }));
      const created = await submit();
      expect(created.status).toBe(200);
      const payload = await created.json();
      const id = payload[kind].id;
      for (const changes of [
        { segmentId: f.segments[1]!.id, expectedProviderTextSha256: sha(f.segments[1]!.text) },
        { title: "A different opening" },
        { detail: "Different details", description: "Different details" },
      ]) {
        const conflict = await submit(changes);
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
      }
      if (kind === "task") {
        await tx.actionItem.update({ where: { id }, data: { title: "Edited after creation", detail: "Keep my edits", status: "DONE" } });
      } else {
        await tx.goal.update({ where: { id }, data: { title: "Edited after creation", description: "Keep my edits", status: "ACHIEVED" } });
      }
      const retry = await submit();
      expect(retry.status).toBe(200);
      expect(await retry.json()).toMatchObject({ idempotentReplay: true, [kind]: { id, title: "Edited after creation" } });
      const rows = kind === "task" ? await tx.actionItem.findMany({ where: { roomId: f.room.id } })
        : await tx.goal.findMany({ where: { roomId: f.room.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ title: "Edited after creation", sourceJson: { segmentId: f.segments[0]!.id } });
    });
  });

  it("recovers successive lost task replies into one item while preserving tags, deadlines, and disjoint edits", async () => {
    await withFixture(async (tx, f) => {
      const original = { title: "First task wording", detail: "Original details" };
      const command = { roomId: f.room.id, segmentId: f.segments[0]!.id,
        expectedProviderTextSha256: sha(f.segments[0]!.text), clientRequestId: randomUUID() };
      const submit = async (revision: number, title: string, changes: Record<string, unknown> = {}) => {
        const response = await createTask(new Request("http://localhost/api/mobile/capture/transcripts/tasks", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...command, ...original, title, save: { revision, original }, ...changes }),
        }));
        return { status: response.status, body: await response.json() };
      };
      const first = await submit(0, original.title);
      expect(first.status).toBe(200);
      const id = first.body.task.id;
      const initial = await tx.actionItem.findUniqueOrThrow({ where: { id } });
      const project = await tx.studioProject.create({ data: { slug: randomUUID(), name: "Writing",
        workspace: { create: { slug: randomUUID(), name: "Synthetic Nest" } } } });
      const tag = await tx.studioTag.create({ data: { projectId: project.id, slug: "writing", label: "Writing", hexColor: "#506b46" } });
      const tagLink = await tx.actionItemTagLink.create({ data: { actionItemId: id, tagId: tag.id } });
      const dueAt = new Date("2027-01-02T12:00:00Z");
      const reminder = await tx.taskReminder.create({ data: { id: randomUUID(), actionItemId: id,
        ownerUserId: f.owner.id, remindAt: new Date("2027-01-01T12:00:00Z") } });
      await tx.actionItem.update({ where: { id }, data: { detail: "Details edited in the browser", dueAt } });
      // The client has not received either successful response; each edit still targets the same ID.
      for (const [revision, title] of [[1, "Second wording"], [2, "Third wording"]] as const) {
        const saved = await submit(revision, title);
        expect(saved).toMatchObject({ status: 200, body: { task: { id, title, detail: "Details edited in the browser" } } });
      }
      const current = await tx.actionItem.findUniqueOrThrow({ where: { id } });
      expect(current).toMatchObject({ dueAt, status: "OPEN", assignedUserId: f.owner.id,
        sourceJson: { materializationIntent: original, draftSave: { revision: 2, fields: { ...original, title: "Third wording" } },
          segmentId: f.segments[0]!.id, recordingAssetId: f.asset.id } });
      expect((current.sourceJson as any).governance).toEqual((initial.sourceJson as any).governance);
      expect((current.sourceJson as any).editReceipts).toHaveLength(2);
      expect(await tx.actionItemTagLink.findMany({ where: { actionItemId: id } })).toEqual([tagLink]);
      expect(await tx.taskReminder.findUniqueOrThrow({ where: { id: reminder.id } })).toEqual(reminder);
      const replay = await submit(2, "Third wording");
      expect(replay).toMatchObject({ status: 200, body: { idempotentReplay: true, task: { id } } });
      expect(await tx.actionItem.findUniqueOrThrow({ where: { id } })).toEqual(current);
      for (const [revision, title, changes] of [
        [1, "Second wording", {}], [2, "Reused revision", {}],
        [3, "Third wording", { detail: "Conflicting browser details" }],
        [3, "Third wording", { segmentId: f.segments[1]!.id, expectedProviderTextSha256: sha(f.segments[1]!.text) }],
      ] as const) expect((await submit(revision, title, changes)).status).toBe(409);
      f.actAs(f.outsider);
      expect((await submit(3, "Unauthorized task")).status).toBe(404);
      f.actAs(f.owner);
      expect(await tx.actionItem.findMany({ where: { roomId: f.room.id } })).toEqual([current]);
      await tx.actionItem.update({ where: { id }, data: { status: "DONE" } });
      expect((await submit(3, "Do not reopen this task")).status).toBe(409);
      expect((await submit(2, "Third wording")).status).toBe(200);
      expect(await tx.recordingAsset.findUniqueOrThrow({ where: { id: f.asset.id } })).toEqual(f.asset);
    });
  });

  it("saves the newest task revision when earlier requests never arrived", async () => {
    await withFixture(async (tx, f) => {
      const command = { roomId: f.room.id, segmentId: f.segments[0]!.id,
        expectedProviderTextSha256: sha(f.segments[0]!.text), clientRequestId: randomUUID(),
        title: "Newest wording", detail: null, save: { revision: 4, original: { title: "Unsent wording", detail: null } } };
      const submit = () => createTask(new Request("http://localhost/api/mobile/capture/transcripts/tasks", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command),
      }));
      const first = await submit();
      expect(first.status).toBe(200);
      const { task } = await first.json();
      const retry = await submit();
      expect(await retry.json()).toMatchObject({ idempotentReplay: true, task: { id: task.id, title: "Newest wording" } });
      expect(await tx.actionItem.count({ where: { roomId: f.room.id } })).toBe(1);
    });
  });

  it.each(["task", "goal", "note", "draft"] as const)("creates a %s from the selected older recording while a newer recording is processing", async (kind) => {
    await withFixture(async (tx, f) => {
      await existingWork(tx, f, "task");
      const newerAsset = await tx.recordingAsset.create({ data: {
        roomId: f.room.id, kind: "LOCAL_AUDIO", status: "UPLOADING", fileName: "Newer recording.m4a",
      } });
      await tx.transcriptJob.create({ data: {
        roomId: f.room.id, assetId: newerAsset.id, requestedBy: f.owner.id, status: "QUEUED",
        createdAt: new Date(f.job.createdAt.getTime() + 60_000),
      } });
      const handler = { task: createTask, goal: createGoal, note: POST, draft: createDraft }[kind];
      const response = await handler(new Request(`http://localhost/api/mobile/capture/transcripts/${kind}s`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: f.room.id, segmentId: f.segments[0]!.id,
          expectedProviderTextSha256: sha(f.segments[0]!.text), clientRequestId: randomUUID(),
          title: "Keep writing from this passage", body: f.sourceText,
          kind: "SESSION_NOTE", visibility: "AUTHOR_PRIVATE" }),
      }));
      const payload = await response.json();
      expect({ status: response.status, error: payload.error }).toEqual({ status: 200, error: undefined });
      if (kind === "draft") {
        const document = await tx.studioDocument.findUniqueOrThrow({ where: { id: payload.document.id }, include: { project: true } });
        const sourceRoom = await tx.callRoom.findUniqueOrThrow({ where: { id: f.room.id } });
        expect(document.projectId).not.toBe(sourceRoom.projectId);
        expect(document.personalOwnerUserId).toBe(f.owner.id);
        expect(document.isPrivate).toBe(true);
        expect(payload.document.href).toContain(`project=${encodeURIComponent(document.project.slug)}`);
        for (const [email, allowed] of [[f.owner.primaryEmail, true], [f.member.primaryEmail, false], [f.outsider.primaryEmail, false]] as const) {
          expect(await resolveStudioProjectAccess({ projectSlug: document.project.slug, email, action: "write", prisma: tx as never }))
            .toMatchObject({ allowed });
        }
        const operation = await tx.studioDocumentOperation.findFirstOrThrow({ where: { documentId: payload.document.id } });
        expect(operation.projectId).toBe(document.projectId);
        expect(operation.payloadJson).toMatchObject({ transcriptJobId: f.job.id, recordingAssetId: f.asset.id, segmentId: f.segments[0]!.id });
      } else {
        const saved = kind === "task" ? await tx.actionItem.findUniqueOrThrow({ where: { id: payload.task.id } })
          : kind === "goal" ? await tx.goal.findUniqueOrThrow({ where: { id: payload.goal.id } })
            : await tx.coachingNote.findUniqueOrThrow({ where: { id: payload.note.id } });
        expect(saved.sourceJson).toMatchObject({ transcriptJobId: f.job.id, recordingAssetId: f.asset.id, segmentId: f.segments[0]!.id });
      }
    });
  });

  it.each(["task", "goal", "note", "draft"] as const)("does not create a %s from another room's passage or for an uninvited account", async (kind) => {
    await withFixture(async (tx, f) => {
      await existingWork(tx, f, "task");
      const other = await fixture(tx);
      const handler = { task: createTask, goal: createGoal, note: POST, draft: createDraft }[kind];
      const counts = async () => Promise.all([
        tx.actionItem.count({ where: { roomId: f.room.id } }),
        tx.goal.count({ where: { roomId: f.room.id } }),
        tx.coachingNote.count({ where: { roomId: f.room.id } }),
        tx.studioDocument.count({ where: { personalOwnerUserId: { in: [f.owner.id, f.outsider.id] } } }),
      ]);
      const before = await counts();
      for (const [user, segment] of [[f.owner, other.segments[0]!], [f.outsider, f.segments[0]!]] as const) {
        f.actAs(user);
        const response = await handler(new Request(`http://localhost/api/mobile/capture/transcripts/${kind}s`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ roomId: f.room.id, segmentId: segment.id,
            expectedProviderTextSha256: sha(segment.text), clientRequestId: randomUUID(),
            title: "Must not be created", body: segment.text, kind: "SESSION_NOTE", visibility: "AUTHOR_PRIVATE" }),
        }));
        expect(response.status).toBe(404);
        expect(await counts()).toEqual(before);
      }
    });
  });

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
        title: "Write every morning", sourceJson: { recordingAssetId: f.asset.id, automaticallyCreated: true } });
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

  it("persists analysis retry intent before responding without resetting attempts on an automatic build", async () => {
    await withFixture(async (tx, f) => {
      await automaticSession(tx, f);
      expect(await reconcileCaptureTranscriptFollowThrough({ prisma: getPrismaClient(), transcriptJobId: f.job.id, analysisProvider: null }))
        .toMatchObject({ packetStatus: "ready" });
      const loaded = await loadSessionFollowThroughSource({ prisma: tx, transcriptJobId: f.job.id });
      if (!loaded.ok) throw new Error(loaded.error);
      const source = sessionFollowThroughAnalysisSource(loaded.job, loaded.resolvedTranscript);
      await tx.sessionFollowThroughAnalysis.create({ data: {
        roomId: f.room.id, sourceFingerprint: sessionAnalysisSourceFingerprint(source),
        version: SESSION_ANALYSIS_VERSION, provider: "synthetic", model: "retry-test",
        status: "failed", attemptCount: 3, errorCode: "PROVIDER_UNAVAILABLE",
      } });
      const beforeFlag = process.env.SESSION_FOLLOW_THROUGH_AI_ENABLED;
      process.env.SESSION_FOLLOW_THROUGH_AI_ENABLED = "true";
      try {
        for (const retryAnalysis of [false, true]) {
          const response = await buildPacket(new Request("http://localhost/api/mobile/capture/transcripts/packet", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ transcriptJobId: f.job.id, retryAnalysis }),
          }));
          expect(response.status).toBe(200);
          expect(await response.json()).toMatchObject({ ok: true, analysisQueued: true });
          expect(await tx.sessionFollowThroughAnalysis.findUniqueOrThrow({ where: { roomId: f.room.id } }))
            .toMatchObject({ status: "failed", attemptCount: retryAnalysis ? 0 : 3 });
          const job = await tx.transcriptJob.findUniqueOrThrow({ where: { id: f.job.id } });
          expect(job.resultJson).toMatchObject({ followThrough: { packetStatus: "waiting" },
            processingControl: { routing: { sourceTopology: "participant-isolated" } } });
        }
      } finally {
        if (beforeFlag === undefined) delete process.env.SESSION_FOLLOW_THROUGH_AI_ENABLED;
        else process.env.SESSION_FOLLOW_THROUGH_AI_ENABLED = beforeFlag;
      }
      // No after-response callback ran. A normal recovery pass can consume the
      // durable request and its explicitly reset attempt allowance instead.
      const generate = jest.fn(async () => JSON.stringify({ goals: [], notes: [], tasks: [{
        sourceId: source.segments.find(segment => segment.text.includes("Tomorrow I will draft one page."))!.id,
        title: "Draft one page", excerpt: "Tomorrow I will draft one page.",
      }] }));
      expect(await reconcileCaptureTranscriptFollowThrough({ prisma: getPrismaClient(), transcriptJobId: f.job.id,
        analysisProvider: { name: "synthetic", model: "retry-test", generate }, runAnalysis: true,
      })).toMatchObject({ packetStatus: "ready" });
      expect(generate).toHaveBeenCalledTimes(1);
      expect(await tx.sessionFollowThroughAnalysis.findUniqueOrThrow({ where: { roomId: f.room.id } }))
        .toMatchObject({ status: "materialized", attemptCount: 1 });
    });
  });

  it("materializes semantic work from one passage, shares it only with members, and preserves edits on retry", async () => {
    await withFixture(async (tx, f) => {
      const session = await automaticSession(tx, f);
      await tx.transcriptSegment.update({ where: { id: session.segments[1]!.id }, data: {
        text: "Tomorrow I will draft one page. Then I will read it aloud.",
      } });
      const loaded = await loadSessionFollowThroughSource({ prisma: tx, transcriptJobId: f.job.id });
      if (!loaded.ok) throw new Error(loaded.error);
      const source = sessionFollowThroughAnalysisSource(loaded.job, loaded.resolvedTranscript);
      const item = (title: string, excerpt: string) => ({
        sourceId: source.segments.find(segment => segment.text.includes(excerpt))!.id, title, excerpt,
      });
      // Deterministic provider output exercises the real materialization and
      // access boundary, not model quality or a paid external request.
      const analysis = await analyzeSessionTranscript(source, { name: "synthetic", model: "integration", generate: async () => JSON.stringify({
        tasks: [item("Draft a page tomorrow", "Tomorrow I will draft one page."), item("Read the draft aloud", "Then I will read it aloud.")],
        goals: [item("A daily writing habit", "My goal is to write every morning.")],
        notes: [item("Small steps help", "I learned that small steps help me start.")],
      }) });
      await tx.sessionFollowThroughAnalysis.create({ data: {
        roomId: f.room.id, sourceFingerprint: analysis.sourceFingerprint, provider: analysis.provider,
        model: analysis.model, version: analysis.version, status: "completed", attemptCount: 1,
        resultJson: analysis as unknown as Prisma.InputJsonValue,
      } });
      const build = () => buildCoachingPacketFromTranscriptJob({ prisma: tx, transcriptJobId: f.job.id,
        authorUserId: f.owner.id, requireAnalysisFingerprint: analysis.sourceFingerprint });
      expect(await build()).toMatchObject({ ok: true, actionItemCount: 2, goalCount: 1 });
      const tasks = await tx.actionItem.findMany({ where: { roomId: f.room.id }, orderBy: { title: "asc" } });
      const goal = await tx.goal.findFirstOrThrow({ where: { roomId: f.room.id } });
      expect(tasks.map(task => task.title)).toEqual(["Draft a page tomorrow", "Read the draft aloud"]);
      expect(new Set(tasks.map(task => task.id)).size).toBe(2);
      for (const user of [f.owner, f.member]) {
        expect((await session.read(user)).map(work => work.id).sort()).toEqual([...tasks.map(task => task.id), goal.id].sort());
      }
      expect(await session.read(f.outsider)).toEqual([]);
      const edited = await tx.actionItem.update({ where: { id: tasks[0]!.id }, data: { title: "My chosen next step", status: "DONE" } });
      const counts = { tasks: tasks.length, notes: await tx.coachingNote.count({ where: { roomId: f.room.id } }) };
      const generate = jest.fn(async () => { throw new Error("A completed analysis must not spend again"); });
      expect(await reconcileCaptureTranscriptFollowThrough({ prisma: getPrismaClient(), transcriptJobId: f.job.id,
        analysisProvider: { name: "synthetic", model: "integration", generate }, runAnalysis: true,
      })).toMatchObject({ packetStatus: "ready" });
      expect(await tx.sessionFollowThroughAnalysis.findUniqueOrThrow({ where: { roomId: f.room.id } }))
        .toMatchObject({ status: "materialized" });
      expect(generate).not.toHaveBeenCalled();
      expect(await build()).toMatchObject({ ok: true, reusedExistingPacket: true });
      expect(await tx.actionItem.findUniqueOrThrow({ where: { id: edited.id } })).toEqual(edited);
      expect(await tx.actionItem.count({ where: { roomId: f.room.id } })).toBe(counts.tasks);
      expect(await tx.coachingNote.count({ where: { roomId: f.room.id } })).toBe(counts.notes);
      await tx.transcriptSegment.update({ where: { id: session.segments[1]!.id }, data: { text: "I have changed my plan." } });
      expect(await build()).toMatchObject({ ok: false, errorCode: "SESSION_ANALYSIS_SOURCE_CHANGED" });
      expect(await tx.actionItem.findUniqueOrThrow({ where: { id: edited.id } })).toEqual(edited);
      expect(await tx.actionItem.count({ where: { roomId: f.room.id } })).toBe(counts.tasks);
      expect(await tx.coachingNote.count({ where: { roomId: f.room.id } })).toBe(counts.notes);
      expect(await tx.deliveryEvent.count({ where: { roomId: f.room.id } })).toBe(0);
    });
  });

  it.each([false, true])("replaces an unfinished repeated task only while it is untouched (adopted: %s)", async adopted => {
    await withFixture(async (tx, f) => {
      const session = await automaticSession(tx, f);
      const partial = await tx.transcriptSegment.update({where: {id: session.segments[1]!.id}, data: {
        text: "Tomorrow I will draft one page and share it with my", startSeconds: 4, endSeconds: 5,
      }});
      await tx.transcriptSegment.update({where: {id: session.segments[2]!.id}, data: {startSeconds: 10, endSeconds: 12}});
      expect(await session.build()).toMatchObject({ok: true, actionItemCount: 1});
      let originalTask = await tx.actionItem.findFirstOrThrow({where: {roomId: f.room.id}});
      if (adopted) originalTask = await tx.actionItem.update({where: {id: originalTask.id}, data: {title: "My own chosen next step"}});
      const complete = await tx.transcriptSegment.create({data: {
        transcriptJobId: f.job.id, speakerLabel: "Other participant", speakerUserId: f.member.id,
        text: "Tomorrow I will draft one page and share it with my coach.", startSeconds: 20, endSeconds: 25,
      }});
      expect(await session.build()).toMatchObject({ok: true, actionItemCount: 1});
      const tasks = await tx.actionItem.findMany({where: {roomId: f.room.id}});
      expect(tasks).toHaveLength(adopted ? 2 : 1);
      const canonical = tasks.find(task => task.title === "Tomorrow I will draft one page and share it with my coach")!;
      expect(canonical).toMatchObject({assignedUserId: f.member.id, sourceJson: {segmentId: complete.id}});
      expect(await tx.actionItem.findUnique({where: {id: originalTask.id}})).toEqual(adopted ? originalTask : null);
      expect(await tx.transcriptSegment.findUniqueOrThrow({where: {id: partial.id}})).toEqual(partial);
      expect(await session.read(f.outsider)).toEqual([]);
      expect((await session.read(f.member)).some(work => work.id === canonical.id)).toBe(true);
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

  it("refreshes automatic work through the real packet endpoint and accurately describes the write", async () => {
    await withFixture(async (tx, f) => {
      await automaticSession(tx, f);
      const read = async (user: typeof f.owner) => {
        jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user } as never);
        return readPacket(new Request(`http://localhost/api/mobile/capture/transcripts/packet?callRoomId=${f.room.id}`));
      };
      expect((await read(f.outsider)).status).toBe(404);
      expect(await tx.actionItem.count({ where: { roomId: f.room.id } })).toBe(0);
      expect(await tx.goal.count({ where: { roomId: f.room.id } })).toBe(0);
      const response = await read(f.owner);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, boundaries: {
        sideEffectFreeRead: false, readMayRefreshEditableSessionWork: true,
        noTranscriptProviderRunFromPacketRead: true, noExternalDelivery: true,
      } });
      const tasks = await tx.actionItem.findMany({ where: { roomId: f.room.id } });
      const goals = await tx.goal.findMany({ where: { roomId: f.room.id } });
      expect(tasks).toHaveLength(1);
      expect(goals).toHaveLength(1);
      for (const user of [f.owner, f.member]) expect((await read(user)).status).toBe(200);
      expect(await tx.actionItem.findMany({ where: { roomId: f.room.id } })).toEqual(tasks);
      expect(await tx.goal.findMany({ where: { roomId: f.room.id } })).toEqual(goals);
      expect(await tx.transcriptSegmentVerification.count({ where: { roomId: f.room.id } })).toBe(0);
      expect(await tx.deliveryEvent.count({ where: { roomId: f.room.id } })).toBe(0);
    });
  });

  it.each([
    "task-deadline", "task-reminder", "task-recurrence", "task-tag", "task-plan", "task-evidence",
    "goal-target", "goal-progress", "goal-tag", "goal-plan", "goal-child", "goal-task-link",
  ])("keeps adopted work and its %s after a correction removes the original commitment", async (scenario) => {
    await withFixture(async (tx, f) => {
      const session = await automaticSession(tx, f);
      expect(await session.build()).toMatchObject({ ok: true });
      const task = await tx.actionItem.findFirstOrThrow({ where: { roomId: f.room.id } });
      const goal = await tx.goal.findFirstOrThrow({ where: { roomId: f.room.id } });
      const date = new Date("2027-01-01T12:00:00Z");
      const isTask = scenario.startsWith("task-");
      if (scenario === "task-deadline") await tx.actionItem.update({ where: { id: task.id }, data: { dueAt: date } });
      if (scenario === "goal-target") await tx.goal.update({ where: { id: goal.id }, data: { targetAt: date } });
      if (scenario === "task-reminder") await tx.taskReminder.create({ data: { id: randomUUID(), actionItemId: task.id, ownerUserId: f.member.id, remindAt: date } });
      if (scenario === "task-recurrence") await tx.taskOccurrence.create({ data: { actionItem: { connect: { id: task.id } },
        occurrenceKey: "2027-01-01", scheduledLocalDate: "2027-01-01", scheduledFor: date,
        series: { create: { ownerUserId: f.member.id, title: task.title, cadence: "FIXED", frequency: "WEEKLY",
          timezone: "America/Denver", localTimeMinutes: 600, anchorLocalDate: "2027-01-01", anchorDayOfMonth: 1 } } } });
      if (scenario.endsWith("-tag")) {
        const tag = await tx.studioTag.create({ data: { projectId: session.engagement.projectId, slug: randomUUID(), label: "My priority" } });
        if (isTask) await tx.actionItemTagLink.create({ data: { actionItemId: task.id, tagId: tag.id } });
        else await tx.goalTagLink.create({ data: { goalId: goal.id, tagId: tag.id } });
      }
      if (scenario.endsWith("-plan")) await tx.workPlanBlock.create({ data: { ownerUserId: f.member.id,
        ...(isTask ? { actionItemId: task.id } : { goalId: goal.id }), startsAt: date,
        endsAt: new Date(date.getTime() + 30 * 60_000), timezone: "America/Denver" } });
      if (scenario === "task-evidence") await tx.actionItemEvidenceReceipt.create({ data: { id: randomUUID(),
        actionItemId: task.id, actorUserId: f.member.id, kind: "PERSONAL_OBSERVATION", note: "I have started", occurredAt: date } });
      if (scenario === "goal-progress") await tx.goalProgressReceipt.create({ data: { goalId: goal.id,
        actorUserId: f.member.id, kind: "PROGRESS_UPDATED", progressPercent: 35, occurredAt: date } });
      if (scenario === "goal-child") await tx.goal.create({ data: { ownerUserId: f.member.id,
        parentGoalId: goal.id, roomId: f.room.id, title: "My first milestone" } });
      if (scenario === "goal-task-link") await tx.goalTaskLink.create({ data: { goalId: goal.id, actionItemId: task.id } });
      const readTarget = () => isTask
        ? tx.actionItem.findUnique({ where: { id: task.id }, include: { reminder: true, recurrenceOccurrence: true,
          tagLinks: true, planBlocks: true, evidenceReceipts: true, goalLinks: true } })
        : tx.goal.findUnique({ where: { id: goal.id }, include: { progressReceipts: true, tagLinks: true,
          planBlocks: true, children: true, taskLinks: true } });
      const before = await readTarget();
      await session.removeCommitments();
      expect(await session.build()).toMatchObject({ ok: true });
      expect(await readTarget()).toEqual(before);
      expect((await session.read(f.member)).some(item => item.id === (isTask ? task.id : goal.id))).toBe(true);
    });
  });

  it("still cleans up untouched generated tasks and goals after the source commitment disappears", async () => {
    await withFixture(async (tx, f) => {
      const session = await automaticSession(tx, f);
      expect(await session.build()).toMatchObject({ ok: true, actionItemCount: 1, goalCount: 1 });
      await session.removeCommitments();
      expect(await session.build()).toMatchObject({ ok: true, actionItemCount: 0, goalCount: 0 });
      expect(await tx.actionItem.count({ where: { roomId: f.room.id } })).toBe(0);
      expect(await tx.goal.count({ where: { roomId: f.room.id } })).toBe(0);
    });
  });

  it.each(["task-reminder", "goal-progress"])("rechecks related %s at deletion even when the parent version did not change", async (scenario) => {
    await withFixture(async (tx, f) => {
      const session = await automaticSession(tx, f);
      expect(await session.build()).toMatchObject({ ok: true });
      const isTask = scenario === "task-reminder";
      const model = isTask ? "actionItem" : "goal";
      const row = isTask ? await tx.actionItem.findFirstOrThrow({ where: { roomId: f.room.id } })
        : await tx.goal.findFirstOrThrow({ where: { roomId: f.room.id } });
      await session.removeCommitments();
      let interleaved = false;
      const prisma = new Proxy(tx, { get(target, property) {
        if (property !== model) return Reflect.get(target, property);
        return new Proxy(Reflect.get(target, property), { get(table, method) {
          if (method !== "delete") return Reflect.get(table, method);
          return async (args: { where: { id: string } }) => {
            if (args.where.id === row.id && !interleaved) {
              interleaved = true;
              if (isTask) await tx.taskReminder.create({ data: { id: randomUUID(), actionItemId: row.id,
                ownerUserId: f.member.id, remindAt: new Date("2027-01-01T12:00:00Z") } });
              else await tx.goalProgressReceipt.create({ data: { goalId: row.id, actorUserId: f.member.id,
                kind: "PROGRESS_UPDATED", progressPercent: 35, occurredAt: new Date() } });
            }
            return Reflect.apply(Reflect.get(table, "delete"), table, [args]);
          };
        } });
      } });
      await expect(buildCoachingPacketFromTranscriptJob({ prisma, transcriptJobId: f.job.id, authorUserId: f.owner.id }))
        .rejects.toMatchObject({ code: "P2034" });
      expect(interleaved).toBe(true);
      expect(isTask ? await tx.actionItem.findUnique({ where: { id: row.id } })
        : await tx.goal.findUnique({ where: { id: row.id } })).toEqual(row);
      expect(isTask ? await tx.taskReminder.count({ where: { actionItemId: row.id } })
        : await tx.goalProgressReceipt.count({ where: { goalId: row.id } })).toBe(1);
    });
  });

  it.each(["tag", "linked-task", "private", "revision", "untouched"])("handles a superseded highlight with %s without losing adopted notes", async (scenario) => {
    await withFixture(async (tx, f) => {
      const session = await automaticSession(tx, f);
      expect(await session.build()).toMatchObject({ ok: true });
      const highlight = await tx.coachingNote.findFirstOrThrow({ where: { roomId: f.room.id, kind: "HIGHLIGHT" } });
      // Model a superseded generated copy from an earlier packet version.
      // Current source text/media are unchanged, and the newer copy wins the projection.
      const old = await tx.coachingNote.create({ data: { roomId: f.room.id, authorUserId: f.owner.id,
        engagementId: session.engagement.id, kind: "HIGHLIGHT", title: highlight.title, body: highlight.body,
        visibility: scenario === "private" ? "AUTHOR_PRIVATE" : "SESSION_SHARED",
        sourceJson: highlight.sourceJson as Prisma.InputJsonValue, createdAt: new Date("2000-01-01T00:00:00Z") } });
      if (scenario === "tag") {
        const tag = await tx.studioTag.create({ data: { projectId: session.engagement.projectId, slug: randomUUID(), label: "Important" } });
        await tx.coachingNoteTagLink.create({ data: { noteId: old.id, tagId: tag.id } });
      }
      if (scenario === "linked-task") await tx.actionItem.create({ data: { roomId: f.room.id, noteId: old.id,
        assignedUserId: f.member.id, title: "Remember this moment" } });
      if (scenario === "revision") await tx.coachingNoteRevision.create({ data: { noteId: old.id, actorUserId: f.owner.id,
        revision: 1, operation: "edited", snapshotJson: { body: old.body } } });
      const read = () => tx.coachingNote.findUnique({ where: { id: old.id }, include: { tagLinks: true, actionItems: true, revisions: true } });
      const before = await read();
      expect(await buildCoachingPacketFromTranscriptJob({ prisma: tx, transcriptJobId: f.job.id, authorUserId: f.owner.id, force: true }))
        .toMatchObject({ ok: true });
      expect(await read()).toEqual(scenario === "untouched" ? null : before);
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
