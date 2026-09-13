/** @jest-environment node */
import { GET } from "./route";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readSessionRecordingShareTranscript, SessionRecordingShareError } from "@/lib/server/session-recording-share";
jest.mock("@/lib/prisma", () => ({getPrismaClient: () => ({})}));
jest.mock("@/lib/server/quipsly-session", () => ({getQuipslySessionFromRequest: jest.fn()}));
jest.mock("@/lib/server/session-recording-share", () => ({
  readSessionRecordingShareTranscript: jest.fn(),
  SessionRecordingShareError: class extends Error {constructor(public status: number, public code: string, message: string) {super(message);}},
}));
const run = (query = "") => GET(new Request(`http://localhost/api/sessions/room/recording-share/transcript/output${query}`), {params: Promise.resolve({roomId: "room", outputId: "output"})});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({user: {id: "client"}} as never);
  jest.mocked(readSessionRecordingShareTranscript).mockResolvedValue({title: "Edited session", outputId: "output", outputSha256: "a".repeat(64),
    segments: [{text: "Kept corrected text", speakerLabel: "Riley", startSeconds: 3.99, endSeconds: 5}], durationSeconds: 8, omittedBoundaryPassages: 1, untranscribedSources: 0});
});
it("requires sign-in and carries exact output identity to the scoped service", async () => {
  jest.mocked(getQuipslySessionFromRequest).mockResolvedValueOnce(null);
  expect((await run()).status).toBe(401);
  expect(readSessionRecordingShareTranscript).not.toHaveBeenCalled();
  expect((await run()).status).toBe(200);
  expect(readSessionRecordingShareTranscript).toHaveBeenCalledWith({}, {roomId: "room", outputId: "output", actor: {id: "client"}});
});
it.each(["txt", "md", "srt", "vtt"])("exports %s with private headers and boundary information", async format => {
  const response = await run(`?format=${format}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-disposition")).toContain(`edited-session-transcript.${format}`);
  expect(response.headers.get("x-quipsly-omitted-boundary-passages")).toBe("1");
  const text = await response.text();
  expect(text).toContain("Kept corrected text");
  if (format === "srt") expect(text).toContain("00:00:03,990 --> 00:00:05,000");
});
it("supplies only the edited projection to the dialog and preserves access denials", async () => {
  const payload = await (await run("?format=json")).json();
  expect(payload.notice).toContain("cut at a boundary");
  expect(payload).not.toHaveProperty("sourceManifest");
  jest.mocked(readSessionRecordingShareTranscript).mockRejectedValueOnce(new SessionRecordingShareError(404, "NOT_FOUND", "Not found"));
  const denied = await run("?format=json");
  expect(denied.status).toBe(404);
  expect(await denied.text()).not.toContain("Kept corrected text");
});
