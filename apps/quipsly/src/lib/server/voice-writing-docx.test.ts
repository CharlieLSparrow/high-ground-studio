/** @jest-environment node */

import {
  buildVoiceWritingDocxDocument,
  renderVoiceWritingDocx,
  voiceWritingDocxFileName,
  VoiceWritingDocxError,
} from "./voice-writing-docx";

describe("voice writing Word export", () => {
  it("preserves portable formatting while rendering a real Word file", async () => {
    const body = "Research direction\nSpeak the first complete draft.\n• Keep the source audio";
    const document = buildVoiceWritingDocxDocument({
      title: "Dissertation opening",
      body,
      richText: {
        schema: "quipsly-writing-runs-v1",
        text: body,
        marks: [{ kind: "bold", startUtf16: 19, endUtf16: 24 }],
        structures: [{ kind: "heading", startUtf16: 0, endUtf16: 18 }],
      },
    });

    expect(document).toMatchObject({
      title: "Dissertation opening",
      body,
      richText: { text: body },
    });
    expect(voiceWritingDocxFileName(document)).toBe("Dissertation opening.docx");
    const buffer = await renderVoiceWritingDocx(document);
    expect(buffer.byteLength).toBeGreaterThan(1_000);
    expect(buffer.subarray(0, 4).toString("hex")).toBe("504b0304");
  });

  it("rejects formatting that points outside the searchable text", () => {
    expect(() => buildVoiceWritingDocxDocument({
      title: "Draft",
      body: "Words",
      richText: {
        schema: "quipsly-writing-runs-v1",
        text: "Different words",
        marks: [],
        structures: [],
      },
    })).toThrow(VoiceWritingDocxError);
  });

  it("uses a calm default title and requires actual writing", () => {
    expect(buildVoiceWritingDocxDocument({ title: "", body: "A useful thought" }).title)
      .toBe("Voice note");
    expect(() => buildVoiceWritingDocxDocument({ title: "Blank", body: "  " }))
      .toThrow("Speak or write something before sharing a Word document.");
  });
});
