/** @jest-environment node */

import type { AiEditProposalSet } from "@/lib/editor/ai-edit-proposal-contract";
import {
  appendEpisodeEditReviewReceipt,
  appendEpisodeTimelineSavedReceipt,
  EpisodeEditReviewLedgerError,
  persistEpisodeEditProposalSet,
} from "./episode-edit-review-ledger";

const actor = { id: "user-1", email: "editor@example.test", name: "Editor", isStaff: false, source: "embedded-cookie" as const };
const proposalSet: AiEditProposalSet = {
  kind: "quipsly-ai-edit-proposal-set-v1",
  version: 1,
  proposalSetId: "edit_proposal_set_test",
  createdAt: "2026-08-03T20:00:00.000Z",
  binding: {
    projectSlug: "high-ground-odyssey",
    episodeSlug: "episode-1",
    timelineFingerprintSha256: "a".repeat(64),
    transcriptSha256: "b".repeat(64),
    blockCount: 2,
    startSeconds: 2,
    endSeconds: 5,
    signalEvidence: {
      recordingAssetId: "recording-1",
      sourceSha256: "c".repeat(64),
      storageGeneration: "42",
      signalProfileSha256: "d".repeat(64),
    },
  },
  provider: { kind: "deterministic", model: "quipsly-source-evidence-v2" },
  proposals: [{
    proposalId: "proposal-1",
    type: "deactivate_range",
    sourceRange: { startSeconds: 2, endSeconds: 5 },
    evidence: {
      blockIds: ["block-1", "block-2"],
      transcriptTextSha256: "e".repeat(64),
    },
    rationale: "Review the exact low-energy interval.",
    confidence: "medium",
    changesSource: false,
    applied: false,
  }],
  reviewCandidates: [],
  boundaries: {
    sourceMediaUnchanged: true,
    proposalsOnly: true,
    proofWatchBeforeApply: true,
    staleBindingRejectsApply: true,
    noAutomaticSaveRenderOrPublish: true,
  },
};

function fakePrisma() {
  const proposals: any[] = [];
  const receipts: any[] = [];
  const prisma: any = {
    studioEpisodeProduction: {
      findUnique: jest.fn(async () => ({ id: "production-1" })),
    },
    studioEpisodeEditProposalSet: {
      findUnique: jest.fn(async ({ where }: any) => proposals.find((item) => item.id === where.id) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { ...data, createdAt: data.createdAt ?? new Date() };
        proposals.push(row);
        return row;
      }),
      findMany: jest.fn(async () => proposals),
    },
    studioEpisodeEditReviewReceipt: {
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.episodeProductionId_actorEmail_clientRequestId;
        return receipts.find((item) => item.episodeProductionId === key.episodeProductionId && item.actorEmail === key.actorEmail && item.clientRequestId === key.clientRequestId) ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) => receipts.filter((item) => (
        item.episodeProductionId === where.episodeProductionId
        && (!where.id?.in || where.id.in.includes(item.id))
        && (!where.actorEmail || item.actorEmail === where.actorEmail)
        && (!where.scope || item.scope === where.scope)
      ))),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `receipt-${receipts.length + 1}`, ...data, createdAt: new Date() };
        receipts.push(row);
        return row;
      }),
    },
  };
  prisma.$transaction = jest.fn(async (operation: (tx: any) => unknown) => operation(prisma));
  return { prisma, proposals, receipts };
}

describe("episode edit review ledger", () => {
  it("persists the exact proposal payload and an append-only creation receipt atomically", async () => {
    const { prisma, proposals, receipts } = fakePrisma();
    await persistEpisodeEditProposalSet({ prisma, projectId: "project-1", episodeSlug: "episode-1", actor, proposalSet });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toEqual(expect.objectContaining({
      id: proposalSet.proposalSetId,
      timelineFingerprintSha256: "a".repeat(64),
      sourceSha256: "c".repeat(64),
      signalProfileSha256: "d".repeat(64),
    }));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toEqual(expect.objectContaining({
      action: "PROPOSAL_CREATED",
      scope: "REVIEW_ONLY",
      proposalTimelineFingerprintSha256: "a".repeat(64),
    }));
  });

  it("replays an identical review request and rejects a changed use of the same id", async () => {
    const { prisma } = fakePrisma();
    await persistEpisodeEditProposalSet({ prisma, projectId: "project-1", episodeSlug: "episode-1", actor, proposalSet });
    const base = {
      clientRequestId: "0f981d5d-f453-4b5e-8bb0-b8e359b7b837",
      proposalSetId: proposalSet.proposalSetId,
      action: "PROOF_LISTENED" as const,
      subjectId: "proposal-1",
      subjectKind: "proposal" as const,
      sourceRange: { startSeconds: 2, endSeconds: 5 },
      proposalTimelineFingerprintSha256: "a".repeat(64),
      timelineFingerprintBeforeSha256: "e".repeat(64),
      occurredAt: "2026-08-03T20:00:01.000Z",
    };
    jest.useFakeTimers().setSystemTime(new Date("2026-08-03T20:00:02.000Z"));
    try {
      const first = await appendEpisodeEditReviewReceipt({ prisma, projectId: "project-1", episodeSlug: "episode-1", actor, review: base });
      const replay = await appendEpisodeEditReviewReceipt({ prisma, projectId: "project-1", episodeSlug: "episode-1", actor, review: base });
      expect(replay.id).toBe(first.id);
      await expect(appendEpisodeEditReviewReceipt({
        prisma,
        projectId: "project-1",
        episodeSlug: "episode-1",
        actor,
        review: { ...base, action: "DISMISSED" },
      })).rejects.toEqual(expect.objectContaining({ code: "EDIT_REVIEW_IDEMPOTENCY_CONFLICT", status: 409 }));
    } finally {
      jest.useRealTimers();
    }
  });

  it("rejects stale proposal binding and keeps canonical save distinct from local draft actions", async () => {
    const { prisma, receipts } = fakePrisma();
    await persistEpisodeEditProposalSet({ prisma, projectId: "project-1", episodeSlug: "episode-1", actor, proposalSet });
    jest.useFakeTimers().setSystemTime(new Date("2026-08-03T20:00:02.000Z"));
    try {
      await expect(appendEpisodeEditReviewReceipt({
        prisma,
        projectId: "project-1",
        episodeSlug: "episode-1",
        actor,
        review: {
          clientRequestId: "1d444c16-af55-4b06-b37c-04c41927d73f",
          proposalSetId: proposalSet.proposalSetId,
          action: "APPLIED_TO_DRAFT",
          subjectId: "proposal-1",
          subjectKind: "proposal",
          sourceRange: { startSeconds: 2, endSeconds: 5 },
          proposalTimelineFingerprintSha256: "f".repeat(64),
          timelineFingerprintBeforeSha256: "a".repeat(64),
        },
      })).rejects.toBeInstanceOf(EpisodeEditReviewLedgerError);

      const draft = await appendEpisodeEditReviewReceipt({
        prisma,
        projectId: "project-1",
        episodeSlug: "episode-1",
        actor,
        review: {
          clientRequestId: "2d444c16-af55-4b06-b37c-04c41927d73f",
          proposalSetId: proposalSet.proposalSetId,
          action: "APPLIED_TO_DRAFT",
          subjectId: "proposal-1",
          subjectKind: "proposal",
          sourceRange: { startSeconds: 2, endSeconds: 5 },
          proposalTimelineFingerprintSha256: "a".repeat(64),
          timelineFingerprintBeforeSha256: "a".repeat(64),
        },
      });
      const saved = await appendEpisodeTimelineSavedReceipt({
        prisma,
        episodeProductionId: "production-1",
        actor,
        clientRequestId: "3d444c16-af55-4b06-b37c-04c41927d73f",
        timelineFingerprintBeforeSha256: "a".repeat(64),
        timelineFingerprintAfterSha256: "9".repeat(64),
        linkedReviewReceiptIds: [draft.id],
        saveMode: "manual",
        occurredAt: new Date("2026-08-03T20:00:02.000Z"),
      });
      const replayedSave = await appendEpisodeTimelineSavedReceipt({
        prisma,
        episodeProductionId: "production-1",
        actor,
        clientRequestId: "3d444c16-af55-4b06-b37c-04c41927d73f",
        timelineFingerprintBeforeSha256: "a".repeat(64),
        timelineFingerprintAfterSha256: "9".repeat(64),
        linkedReviewReceiptIds: [draft.id],
        saveMode: "manual",
        occurredAt: new Date("2026-08-03T20:00:08.000Z"),
      });
      expect(saved).toEqual(expect.objectContaining({ action: "TIMELINE_SAVED", scope: "CANONICAL_TIMELINE" }));
      expect(replayedSave.id).toBe(saved.id);
      expect(receipts.filter((item) => item.action === "APPLIED_TO_DRAFT")).toHaveLength(1);
      expect(receipts.filter((item) => item.action === "TIMELINE_SAVED")).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("rejects a forged subject range even when the proposal-set identity is valid", async () => {
    const { prisma } = fakePrisma();
    await persistEpisodeEditProposalSet({ prisma, projectId: "project-1", episodeSlug: "episode-1", actor, proposalSet });
    jest.useFakeTimers().setSystemTime(new Date("2026-08-03T20:00:02.000Z"));
    try {
      await expect(appendEpisodeEditReviewReceipt({
        prisma,
        projectId: "project-1",
        episodeSlug: "episode-1",
        actor,
        review: {
          clientRequestId: "4d444c16-af55-4b06-b37c-04c41927d73f",
          proposalSetId: proposalSet.proposalSetId,
          action: "PROOF_LISTENED",
          subjectId: "proposal-1",
          subjectKind: "proposal",
          sourceRange: { startSeconds: 2, endSeconds: 6 },
          proposalTimelineFingerprintSha256: "a".repeat(64),
          timelineFingerprintBeforeSha256: "a".repeat(64),
        },
      })).rejects.toEqual(expect.objectContaining({ code: "EDIT_REVIEW_SUBJECT_RANGE_CONFLICT", status: 409 }));
    } finally {
      jest.useRealTimers();
    }
  });

  it("records a bounded speaker-cut draft and a later reversible camera-range restore", async () => {
    const { prisma, receipts } = fakePrisma();
    await persistEpisodeEditProposalSet({ prisma, projectId: "project-1", episodeSlug: "episode-1", actor, proposalSet });
    jest.useFakeTimers().setSystemTime(new Date("2026-08-03T20:00:02.000Z"));
    try {
      const assembled = await appendEpisodeEditReviewReceipt({
        prisma,
        projectId: "project-1",
        episodeSlug: "episode-1",
        actor,
        review: {
          clientRequestId: "5d444c16-af55-4b06-b37c-04c41927d73f",
          proposalSetId: proposalSet.proposalSetId,
          action: "APPLIED_TO_DRAFT",
          subjectId: proposalSet.proposalSetId,
          subjectKind: "proposal-set",
          sourceRange: { startSeconds: 2, endSeconds: 5 },
          proposalTimelineFingerprintSha256: "a".repeat(64),
          timelineFingerprintBeforeSha256: "a".repeat(64),
          evidence: {
            editKind: "deterministic-speaker-camera-cut",
            decisionIds: ["camera-switch:map-charlie:2000"],
            sourceMediaUnchanged: true,
          },
        },
      });
      const proofWatched = await appendEpisodeEditReviewReceipt({
        prisma,
        projectId: "project-1",
        episodeSlug: "episode-1",
        actor,
        review: {
          clientRequestId: "7d444c16-af55-4b06-b37c-04c41927d73f",
          proposalSetId: proposalSet.proposalSetId,
          action: "PROOF_WATCHED",
          subjectId: "camera-switch:map-charlie:2000",
          subjectKind: "camera-switch",
          sourceRange: { startSeconds: 2, endSeconds: 4 },
          proposalTimelineFingerprintSha256: "a".repeat(64),
          timelineFingerprintBeforeSha256: "9".repeat(64),
          evidence: {
            editKind: "deterministic-speaker-camera-cut",
            targetClipId: "charlie-camera",
            playbackMode: "assembled-edit",
            sourceMediaUnchanged: true,
          },
        },
      });
      const restored = await appendEpisodeEditReviewReceipt({
        prisma,
        projectId: "project-1",
        episodeSlug: "episode-1",
        actor,
        review: {
          clientRequestId: "6d444c16-af55-4b06-b37c-04c41927d73f",
          proposalSetId: proposalSet.proposalSetId,
          action: "RESTORED_TO_DRAFT",
          subjectId: "camera-switch:map-charlie:2000",
          subjectKind: "camera-switch",
          sourceRange: { startSeconds: 2, endSeconds: 4 },
          proposalTimelineFingerprintSha256: "a".repeat(64),
          timelineFingerprintBeforeSha256: "9".repeat(64),
          evidence: {
            editKind: "deterministic-speaker-camera-cut",
            targetClipId: "charlie-camera",
            sourceMediaUnchanged: true,
          },
        },
      });

      expect(assembled).toEqual(expect.objectContaining({ scope: "LOCAL_DRAFT", subjectKind: "proposal-set" }));
      expect(proofWatched).toEqual(expect.objectContaining({ action: "PROOF_WATCHED", scope: "REVIEW_ONLY", subjectKind: "camera-switch" }));
      expect(restored).toEqual(expect.objectContaining({ scope: "LOCAL_DRAFT", subjectKind: "camera-switch" }));
      expect(receipts.filter((receipt) => ["APPLIED_TO_DRAFT", "PROOF_WATCHED", "RESTORED_TO_DRAFT"].includes(receipt.action))).toHaveLength(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
