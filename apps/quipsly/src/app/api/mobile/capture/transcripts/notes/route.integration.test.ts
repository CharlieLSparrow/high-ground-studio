/** @jest-environment node */
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { SESSION_PACKET_TEMPLATE_VERSION } from "@high-ground/quipsly-domain/coaching-packet-version";
import { transcriptPacketNoteCandidateId } from "@high-ground/quipsly-domain/coaching-packet";
import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { transcriptPacketSnapshot } from "@/lib/server/coaching-packets";
import { MOBILE_CAPTURE_CONSENT_EVIDENCE_VERSION, MOBILE_CAPTURE_CONSENT_POLICY_VERSION,
  MOBILE_CAPTURE_CONSENT_TEXT, MOBILE_CAPTURE_CONSENT_TEXT_SHA256 } from "@/lib/mobile-capture-consent-policy.js";
import { POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

const enabled = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1";
if (enabled) {
  const url = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL || "invalid:");
  if (!["postgres:", "postgresql:"].includes(url.protocol)
      || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || url.pathname === "/") throw new Error("Transcript note integration requires an explicit loopback database.");
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
  return { owner, member, outsider, room, asset, job, segments, sourceText, target, request, submit, actAs };
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

(enabled ? describe : describe.skip)("transcript note merging against a fresh database fixture", () => {
  afterAll(async () => { if (enabled) await actualPrisma.getPrismaClient().$disconnect(); });

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
});
