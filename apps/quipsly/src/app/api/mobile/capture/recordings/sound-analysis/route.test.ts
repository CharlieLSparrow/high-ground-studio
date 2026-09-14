/** @jest-environment node */
import { POST } from "./route";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { attachRecordingSoundAnalysis, RecordingSoundAnalysisError } from "@/lib/server/recording-sound-analysis";
jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: () => ({}) }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/recording-sound-analysis", () => ({
  ...jest.requireActual("@/lib/server/recording-sound-analysis"), attachRecordingSoundAnalysis: jest.fn(),
}));
jest.mock("@/auth", () => ({ auth: jest.fn() }));
const request = (body: string) => new Request("https://nest.quipsly.com/api/mobile/capture/recordings/sound-analysis", {
  method: "POST", headers: { "Content-Type": "application/json" }, body,
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "owner" } } as never);
});
it("requires authentication before reading or mutating", async () => {
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
  expect((await POST(request("{}"))).status).toBe(401);
  expect(attachRecordingSoundAnalysis).not.toHaveBeenCalled();
});
it.each(["null", "[]", "{", '{"recordingAssetId":"../foreign"}'])("rejects malformed body %s", async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(attachRecordingSoundAnalysis).not.toHaveBeenCalled();
});
it("enforces a streaming size limit without trusting Content-Length", async () => {
  expect((await POST(request("x".repeat(512 * 1024 + 1)))).status).toBe(413);
  expect(attachRecordingSoundAnalysis).not.toHaveBeenCalled();
});
it("passes only the authenticated actor and acknowledges durable service success", async () => {
  jest.mocked(attachRecordingSoundAnalysis).mockResolvedValue({ ok: true, recordingAssetId: "source", analysisId: "scan", sourceSHA256: "a".repeat(64), sourceByteCount: 10, applied: true });
  const response = await POST(request(JSON.stringify({ recordingAssetId: "source", actor: { id: "someone-else" }, analysis: { analysisId: "scan" } })));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(attachRecordingSoundAnalysis).toHaveBeenCalledWith(expect.objectContaining({ actor: { id: "owner" }, recordingAssetId: "source" }));
  expect(await response.json()).toMatchObject({ ok: true, analysisId: "scan" });
});
it("returns a source mismatch without acknowledging delivery", async () => {
  jest.mocked(attachRecordingSoundAnalysis).mockRejectedValue(new RecordingSoundAnalysisError(409, "RECORDING_SOURCE_NOT_VERIFIED", "Source mismatch"));
  const response = await POST(request('{"recordingAssetId":"source","analysis":{}}'));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ ok: false, code: "RECORDING_SOURCE_NOT_VERIFIED" });
});
