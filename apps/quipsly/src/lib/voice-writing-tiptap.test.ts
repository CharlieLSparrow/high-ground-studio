import {
  tiptapToVoiceWritingRichText,
  voiceWritingRichTextToTiptap,
} from "./voice-writing-tiptap";

describe("portable voice writing and Tiptap", () => {
  it("round trips overlapping formatting with UTF-16 offsets", () => {
    const source = {
      schema: "quipsly-writing-runs-v1" as const,
      text: "Homer 🦉 writes\nwith his voice.",
      marks: [
        { kind: "bold" as const, startUtf16: 0, endUtf16: 8 },
        { kind: "italic" as const, startUtf16: 6, endUtf16: 15 },
        { kind: "underline" as const, startUtf16: 16, endUtf16: 30 },
        { kind: "strikethrough" as const, startUtf16: 25, endUtf16: 30 },
      ],
    };

    expect(tiptapToVoiceWritingRichText(voiceWritingRichTextToTiptap(source, source.text))).toEqual(source);
  });

  it("keeps blank lines as real editable paragraphs", () => {
    const source = {
      schema: "quipsly-writing-runs-v1" as const,
      text: "Opening\n\nNew thought",
      marks: [],
    };
    const document = voiceWritingRichTextToTiptap(source, source.text);

    expect(document.content).toHaveLength(3);
    expect(tiptapToVoiceWritingRichText(document)).toEqual(source);
  });

  it("degrades pasted lists to portable readable text", () => {
    expect(tiptapToVoiceWritingRichText({
      type: "doc",
      content: [{
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }] },
        ],
      }],
    }).text).toBe("• First\n• Second");
  });

  it("falls back to the searchable body when rich text is absent or stale", () => {
    expect(tiptapToVoiceWritingRichText(voiceWritingRichTextToTiptap(null, "Recovered body"))).toMatchObject({
      text: "Recovered body",
      marks: [],
    });
  });
});
