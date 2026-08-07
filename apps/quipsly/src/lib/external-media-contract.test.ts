import { ExternalMediaContractError, normalizeAttachVerifiedExternalMediaInput } from "./external-media-contract";

function verifiedFile() {
  return {
    provider: "google-drive",
    connectionKey: "drive:account_01",
    externalFileId: "drive_file_01",
    sharedDriveId: "shared_drive_01",
    resourceKey: "resource-key_01",
    fileName: "  Homer Insta360 walk.insv  ",
    mimeType: "video/mp4",
    sizeBytes: "4200000000",
    headRevisionKey: "rev_17",
    checksumMd5: "a".repeat(32),
    providerCreatedAt: "2026-08-01T10:00:00.000Z",
    providerModifiedAt: "2026-08-07T10:00:00.000Z",
    accessState: "available" as const,
    capabilityState: "downloadable" as const,
    canDownload: true,
    canReadRevisions: true,
    canCopy: false,
  };
}

describe("external media contract", () => {
  it("normalizes a verified, provider-owned file snapshot without a credential", () => {
    const result = normalizeAttachVerifiedExternalMediaInput({
      projectId: "project_01",
      actorUserId: "user_01",
      actorEmail: "CHARLIE@example.test",
      clientRequestId: "2c55e4c6-82e4-4c98-a95f-28f9895fe7ad",
      operation: "attach",
      verifiedFile: verifiedFile(),
    });
    expect(result).toMatchObject({
      actorEmail: "charlie@example.test",
      expectedReferenceRevision: null,
      verifiedFile: {
        fileName: "Homer Insta360 walk.insv",
        sizeBytes: BigInt(4_200_000_000),
        checksumMd5: "a".repeat(32),
      },
    });
    expect(JSON.stringify(result, (_key, item) => typeof item === "bigint" ? item.toString() : item)).not.toMatch(/token|credential|authorization/i);
  });

  it("requires optimistic authority for refresh but rejects it on first attach", () => {
    expect(() => normalizeAttachVerifiedExternalMediaInput({
      projectId: "project_01", actorUserId: "user_01", actorEmail: "a@example.test", clientRequestId: crypto.randomUUID(), operation: "refresh", verifiedFile: verifiedFile(),
    })).toThrow("current external reference revision");
    expect(() => normalizeAttachVerifiedExternalMediaInput({
      projectId: "project_01", actorUserId: "user_01", actorEmail: "a@example.test", clientRequestId: crypto.randomUUID(), operation: "attach", expectedReferenceRevision: 1, verifiedFile: verifiedFile(),
    })).toThrow("first attachment");
  });

  it("rejects contradictory provider capability claims and malformed checksums", () => {
    expect(() => normalizeAttachVerifiedExternalMediaInput({
      projectId: "project_01", actorUserId: "user_01", actorEmail: "a@example.test", clientRequestId: crypto.randomUUID(), operation: "attach", verifiedFile: { ...verifiedFile(), canDownload: false },
    })).toThrow(ExternalMediaContractError);
    expect(() => normalizeAttachVerifiedExternalMediaInput({
      projectId: "project_01", actorUserId: "user_01", actorEmail: "a@example.test", clientRequestId: crypto.randomUUID(), operation: "attach", verifiedFile: { ...verifiedFile(), checksumMd5: "not-a-checksum" },
    })).toThrow("checksumMd5 is malformed");
  });

  it("retains local execution locators only for the trusted local vault adapter", () => {
    const local = normalizeAttachVerifiedExternalMediaInput({
      projectId: "project_01",
      actorUserId: "user_01",
      actorEmail: "a@example.test",
      clientRequestId: crypto.randomUUID(),
      operation: "attach",
      verifiedFile: {
        ...verifiedFile(),
        provider: "local-file-vault",
        connectionKey: "local-vault:charlie",
        externalFileId: "sha256:source_01",
        localPath: "/private/tmp/quipsly-media-ingest/source_01.mp4",
      },
    });
    expect(local.verifiedFile.localPath).toBe("/private/tmp/quipsly-media-ingest/source_01.mp4");
    expect(() => normalizeAttachVerifiedExternalMediaInput({
      projectId: "project_01",
      actorUserId: "user_01",
      actorEmail: "a@example.test",
      clientRequestId: crypto.randomUUID(),
      operation: "attach",
      verifiedFile: { ...verifiedFile(), localPath: "/private/tmp/provider-secret.mp4" },
    })).toThrow("trusted local-file-vault");
    expect(() => normalizeAttachVerifiedExternalMediaInput({
      projectId: "project_01",
      actorUserId: "user_01",
      actorEmail: "a@example.test",
      clientRequestId: crypto.randomUUID(),
      operation: "attach",
      verifiedFile: {
        ...verifiedFile(),
        provider: "local-file-vault",
        connectionKey: "local-vault:charlie",
        externalFileId: "sha256:source_01",
        localPath: "../../source_01.mp4",
      },
    })).toThrow("trusted local-file-vault");
  });
});
