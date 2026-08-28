/** @jest-environment node */

import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { POST } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));

function request(body: unknown) {
  return new Request("http://localhost/api/mobile/capture/voice-writing/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("mobile voice writing Word export", () => {
  beforeEach(() => jest.clearAllMocks());

  it("authenticates before processing private writing", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null as never);
    const response = await POST(request({ title: "Private", body: "Private words" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns the current writing as a private Word download", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "actor-1", primaryEmail: "person@example.com" },
    } as never);
    const response = await POST(request({
      title: "PhD reflection",
      body: "A complete thought",
      richText: {
        schema: "quipsly-writing-runs-v1",
        text: "A complete thought",
        marks: [{ kind: "italic", startUtf16: 2, endUtf16: 10 }],
        structures: [],
      },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("wordprocessingml.document");
    expect(response.headers.get("content-disposition")).toContain("PhD reflection.docx");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 4)).toString("hex")).toBe("504b0304");
  });

  it("returns a useful error for blank writing", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "actor-1" } } as never);
    const response = await POST(request({ title: "Blank", body: "" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "VOICE_WRITING_EXPORT_EMPTY",
    });
  });
});
