/** @jest-environment node */
import { POST } from "./route";
import { authorizeGoogleOidcWorker } from "@/lib/server/google-oidc-worker-auth";
import { reconcileLiveSessionAccess } from "@/lib/server/session-access-reconciliation";
jest.mock("@/lib/server/google-oidc-worker-auth", () => ({
  authorizeGoogleOidcWorker: jest.fn(),
}));
jest.mock("@/lib/server/session-access-reconciliation", () => ({
  reconcileLiveSessionAccess: jest.fn(),
}));
beforeEach(() => jest.clearAllMocks());
const request = () =>
  new Request("https://nest.example/api/cron/session-access", {
    method: "POST",
  });

it.each(["not-configured", "unauthorized"] as const)(
  "does not process access without worker identity: %s",
  async (status) => {
    jest.mocked(authorizeGoogleOidcWorker).mockResolvedValue(status);
    expect((await POST(request())).status).toBe(
      status === "unauthorized" ? 401 : 503,
    );
    expect(reconcileLiveSessionAccess).not.toHaveBeenCalled();
  },
);

it.each([
  { failed: 0, deferred: 0 },
  { failed: 1, deferred: 0 },
  { failed: 0, deferred: 1 },
])("returns retryable status for incomplete processing: %j", async (result) => {
  jest.mocked(authorizeGoogleOidcWorker).mockResolvedValue("authorized");
  jest
    .mocked(reconcileLiveSessionAccess)
    .mockResolvedValue({ checkedParticipants: 1, ...result });
  const response = await POST(request());
  expect(response.status).toBe(result.failed || result.deferred ? 503 : 200);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
