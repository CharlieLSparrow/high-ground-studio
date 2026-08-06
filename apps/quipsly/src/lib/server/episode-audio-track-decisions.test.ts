/** @jest-environment node */

import {
  episodeAudioProgramFingerprint,
  projectEpisodeAudioTrackDecisions,
  withdrawEpisodeAudioTrackDecision,
} from "./episode-audio-track-decisions";

jest.mock("@/lib/server/prisma-advisory-lock", () => ({ acquirePrismaAdvisoryTransactionLock: jest.fn() }));

function receipt(input: {
  id: string;
  kind: "TRACK_ROLE" | "PARTICIPANT" | "PROGRAM_CLOCK" | "MIX_DISPOSITION";
  assetId?: string;
  sourceId?: string;
  value: string;
  fingerprint?: string;
  operation?: "SET" | "WITHDRAW";
  targetReceiptId?: string | null;
  second?: number;
}) {
  return {
    id: input.id,
    operation: input.operation ?? "SET",
    decisionKind: input.kind,
    assetId: input.assetId ?? "asset-a",
    sourceId: input.sourceId ?? "source-a",
    decisionValue: input.value,
    decisionLabel: input.value,
    targetReceiptId: input.targetReceiptId ?? null,
    programFingerprintSha256: input.fingerprint ?? "fingerprint-current",
    sourceSha256: "a".repeat(64),
    sourceGeneration: "generation-1",
    sourceSizeBytes: BigInt(2048),
    reason: input.operation === "WITHDRAW" ? "Correcting the reviewed decision." : null,
    actorEmail: "editor@example.test",
    occurredAt: new Date(`2026-08-06T20:00:${String(input.second ?? 0).padStart(2, "0")}.000Z`),
  };
}

describe("episode audio program fingerprint", () => {
  it("is stable across source ordering but changes when the retained source set changes", () => {
    const first = { id: "asset-a", sourceId: "source-a", kind: "audio", contentType: "audio/wav", importRole: "phone-audio" };
    const second = { id: "asset-b", sourceId: "source-b", kind: "video", contentType: "video/mp4", importRole: "camera-video" };
    const forward = episodeAudioProgramFingerprint({ episodeProductionId: "episode-1", importedMedia: [first, second] });
    const reverse = episodeAudioProgramFingerprint({ episodeProductionId: "episode-1", importedMedia: [second, first] });
    const changed = episodeAudioProgramFingerprint({ episodeProductionId: "episode-1", importedMedia: [first] });

    expect(reverse).toBe(forward);
    expect(changed).not.toBe(forward);
  });
});

describe("episode audio decision projection", () => {
  it("projects the latest reviewed value without reviving a superseded value after withdrawal", () => {
    const projected = projectEpisodeAudioTrackDecisions([
      receipt({ id: "role-1", kind: "TRACK_ROLE", value: "dialogue-backup", second: 1 }),
      receipt({ id: "role-2", kind: "TRACK_ROLE", value: "dialogue-primary", second: 2 }),
      receipt({ id: "withdraw-role-2", kind: "TRACK_ROLE", value: "dialogue-primary", operation: "WITHDRAW", targetReceiptId: "role-2", second: 3 }),
    ], "fingerprint-current");

    expect(projected.active).toEqual([]);
    expect(projected.summary).toMatchObject({ activeCount: 0, withdrawnCount: 1 });
    expect(projected.history.map((entry) => entry.id)).toEqual(["withdraw-role-2", "role-2", "role-1"]);
  });

  it("does not let a late withdrawal of an older receipt erase the current replacement", () => {
    const projected = projectEpisodeAudioTrackDecisions([
      receipt({ id: "mix-1", kind: "MIX_DISPOSITION", value: "backup", second: 1 }),
      receipt({ id: "mix-2", kind: "MIX_DISPOSITION", value: "include", second: 2 }),
      receipt({ id: "withdraw-mix-1", kind: "MIX_DISPOSITION", value: "backup", operation: "WITHDRAW", targetReceiptId: "mix-1", second: 3 }),
    ], "fingerprint-current");

    expect(projected.active).toHaveLength(1);
    expect(projected.active[0]).toMatchObject({ id: "mix-2", value: "include" });
  });

  it("keeps one global program clock and ignores decisions bound to an old source set", () => {
    const projected = projectEpisodeAudioTrackDecisions([
      receipt({ id: "clock-a", kind: "PROGRAM_CLOCK", value: "primary", second: 1 }),
      receipt({ id: "clock-b", kind: "PROGRAM_CLOCK", assetId: "asset-b", sourceId: "source-b", value: "primary", second: 2 }),
      receipt({ id: "old-role", kind: "TRACK_ROLE", value: "dialogue-primary", fingerprint: "fingerprint-old", second: 3 }),
    ], "fingerprint-current");

    expect(projected.active).toHaveLength(1);
    expect(projected.active[0]).toMatchObject({ id: "clock-b", assetId: "asset-b", sourceId: "source-b" });
    expect(projected.summary).toMatchObject({ activeCount: 1, staleCount: 1, hasProgramClock: true });
  });
});

describe("episode audio decision retries", () => {
  it("replays a successful withdrawal after its target has correctly become inactive", async () => {
    const importedMedia = [{ id: "asset-a", sourceId: "source-a", kind: "audio", contentType: "audio/wav", importRole: "phone-audio" }];
    const fingerprint = episodeAudioProgramFingerprint({ episodeProductionId: "episode-1", importedMedia });
    const rows: any[] = [receipt({ id: "role-1", kind: "TRACK_ROLE", value: "dialogue-primary", fingerprint })];
    const prisma: any = {
      studioProject: { findFirst: jest.fn(async () => ({ id: "project-1", slug: "project-one" })) },
      studioEpisodeProduction: { findFirst: jest.fn(async () => ({ id: "episode-1", slug: "episode-one", projectId: "project-1", productionJson: { importedMedia }, timelineJson: {} })) },
      studioEpisodeAudioTrackDecisionReceipt: {
        findMany: jest.fn(async () => rows),
        findUnique: jest.fn(async (query: any) => {
          const requestId = query.where?.projectId_actorEmail_clientRequestId?.clientRequestId;
          return requestId ? rows.find((row) => row.clientRequestId === requestId) ?? null : null;
        }),
        create: jest.fn(async ({ data }: any) => {
          const created = { id: "withdrawal-1", createdAt: new Date(), ...data };
          rows.push(created);
          return created;
        }),
      },
    };
    prisma.$transaction = jest.fn(async (operation: (tx: any) => Promise<unknown>) => operation(prisma));
    rows[0].clientRequestId = "set-request-1";
    rows[0].requestSha256 = "s".repeat(64);

    const input = {
      prisma,
      actor: { id: "editor-1", email: "editor@example.test" },
      projectSlug: "project-one",
      episodeProductionId: "episode-1",
      decisionId: "role-1",
      programFingerprintSha256: fingerprint,
      clientRequestId: "withdraw-request-1",
      reason: "The reviewed role assignment was incorrect.",
    };
    const first = await withdrawEpisodeAudioTrackDecision(input);
    const retry = await withdrawEpisodeAudioTrackDecision(input);

    expect(first).toMatchObject({ ok: true, idempotentReplay: false, decision: { id: "withdrawal-1", operation: "withdrawn" } });
    expect(retry).toMatchObject({ ok: true, idempotentReplay: true, decision: { id: "withdrawal-1", operation: "withdrawn" } });
    expect(prisma.studioEpisodeAudioTrackDecisionReceipt.create).toHaveBeenCalledTimes(1);
    expect(retry.ledger.active).toEqual([]);
  });
});
