import { voiceWritingViewLayout } from "./voice-writing-view";

describe("voice writing web layout", () => {
  it("keeps writing visible when no timed transcript exists", () => {
    expect(voiceWritingViewLayout("transcript", false)).toEqual({
      showsWriting: true,
      showsTranscript: false,
      usesSideBySideColumns: false,
    });
  });

  it("supports focused writing, source-only, and side-by-side work", () => {
    expect(voiceWritingViewLayout("writing", true)).toMatchObject({
      showsWriting: true,
      showsTranscript: false,
      usesSideBySideColumns: false,
    });
    expect(voiceWritingViewLayout("transcript", true)).toMatchObject({
      showsWriting: false,
      showsTranscript: true,
      usesSideBySideColumns: false,
    });
    expect(voiceWritingViewLayout("split", true)).toEqual({
      showsWriting: true,
      showsTranscript: true,
      usesSideBySideColumns: true,
    });
  });
});
