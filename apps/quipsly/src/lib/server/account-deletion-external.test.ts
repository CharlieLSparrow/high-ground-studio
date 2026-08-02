/** @jest-environment node */

jest.mock("@google-cloud/storage", () => ({
  Storage: jest.fn(),
}));
jest.mock("@/lib/firebase/firebase-admin", () => ({
  adminAuth: {},
}));

import {
  accountDeletionStorageBucketAllowlist,
  createAccountDeletionExternalServices,
  parseGcsObjectLocation,
  requireAllowedAccountDeletionStorageLocation,
} from "./account-deletion-external";

describe("account deletion confirmation delivery", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY;
    delete process.env.QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM;
  });

  it("uses the isolated provider credentials and forwards the immutable idempotency key", async () => {
    process.env.QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY = "re_account_delete";
    process.env.QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM =
      "Quipsly <account@notify.quipsly.com>";
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await createAccountDeletionExternalServices().sendCompletionConfirmation({
      email: "deleted-user@example.test",
      requestId: "request-1",
      idempotencyKey: "account-deletion:request-1:completion-email",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer re_account_delete",
          "idempotency-key": "account-deletion:request-1:completion-email",
        }),
      }),
    );
    const request = jest.mocked(global.fetch).mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      from: "Quipsly <account@notify.quipsly.com>",
      to: ["deleted-user@example.test"],
    });
  });

  it("refuses generic or invalid sender configuration before contacting Resend", async () => {
    process.env.RESEND_API_KEY = "generic";
    process.env.HGO_EMAIL_FROM = "Generic <generic@example.test>";
    global.fetch = jest.fn();

    await expect(
      createAccountDeletionExternalServices().sendCompletionConfirmation({
        email: "deleted-user@example.test",
        requestId: "request-1",
        idempotencyKey: "account-deletion:request-1:completion-email",
      }),
    ).rejects.toThrow("QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY");
    expect(global.fetch).not.toHaveBeenCalled();
    delete process.env.RESEND_API_KEY;
    delete process.env.HGO_EMAIL_FROM;
  });
});

describe("account deletion GCS references", () => {
  it("parses canonical gs references without changing the object path", () => {
    expect(
      parseGcsObjectLocation({
        assetId: "asset-1",
        kind: "asset",
        provider: "gcs",
        url: "gs://quipsly-media/users/person/original.wav",
      }),
    ).toEqual({
      bucket: "quipsly-media",
      objectPath: "users/person/original.wav",
    });
  });

  it("parses both supported HTTPS storage URL forms", () => {
    expect(
      parseGcsObjectLocation({
        assetId: "asset-1",
        kind: "variant",
        provider: "GCS",
        url: "https://storage.googleapis.com/quipsly-media/proxies%2Fclip.mp4",
      }),
    ).toEqual({
      bucket: "quipsly-media",
      objectPath: "proxies/clip.mp4",
    });
    expect(
      parseGcsObjectLocation({
        assetId: "asset-1",
        kind: "variant",
        provider: "gcs",
        url: "https://quipsly-media.storage.googleapis.com/waveforms/clip.json",
      }),
    ).toEqual({
      bucket: "quipsly-media",
      objectPath: "waveforms/clip.json",
    });
  });

  it("rejects storage providers without a verified deletion adapter", () => {
    expect(() =>
      parseGcsObjectLocation({
        assetId: "asset-1",
        kind: "asset",
        provider: "local",
        url: "/Volumes/Media/private.wav",
      }),
    ).toThrow("Unsupported account-deletion storage provider");
  });

  it("requires an explicit, validated deletion bucket allowlist", () => {
    expect(() => accountDeletionStorageBucketAllowlist("")).toThrow(
      "QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS",
    );
    expect(() => accountDeletionStorageBucketAllowlist("UPPER CASE")).toThrow(
      "storage bucket is invalid",
    );
    expect(
      accountDeletionStorageBucketAllowlist(
        "quipsly-media, quipsly-private,quipsly-media",
      ),
    ).toEqual(["quipsly-media", "quipsly-private"]);
  });

  it("refuses a syntactically valid GCS object outside the approved buckets", () => {
    const reference = {
      assetId: "asset-1",
      kind: "asset" as const,
      provider: "gcs",
      url: "gs://unrelated-bucket/users/person/original.wav",
    };
    expect(() =>
      requireAllowedAccountDeletionStorageLocation(reference, "quipsly-media"),
    ).toThrow("outside the approved bucket allowlist");
    expect(
      requireAllowedAccountDeletionStorageLocation(
        { ...reference, url: "gs://quipsly-media/users/person/original.wav" },
        "quipsly-media",
      ),
    ).toEqual({
      bucket: "quipsly-media",
      objectPath: "users/person/original.wav",
    });
  });
});
