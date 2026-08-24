/** @jest-environment node */

import { studioTranscriptSpeakerAuthority } from "./studio-transcript-speaker-authority";

describe("studioTranscriptSpeakerAuthority", () => {
  it("distinguishes reviewed, automatic, and unresolved Studio speaker labels", () => {
    expect(studioTranscriptSpeakerAuthority({
      correctedSpeakerLabel: "Homer",
      providerSpeakerLabel: "Speaker 1",
    })).toBe("correction");
    expect(studioTranscriptSpeakerAuthority({
      confirmedAsIs: true,
      providerSpeakerLabel: "Homer",
    })).toBe("correction");
    expect(studioTranscriptSpeakerAuthority({
      providerSpeakerLabel: "Speaker 1",
    })).toBe("provider");
    expect(studioTranscriptSpeakerAuthority({})).toBe("unresolved");
  });
});
