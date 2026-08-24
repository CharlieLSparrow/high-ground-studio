import React from "react";
import { render, screen } from "@testing-library/react";

import { TranscriptSpeakerEvidenceBadge } from "./transcript-speaker-evidence-badge";

describe("TranscriptSpeakerEvidenceBadge", () => {
  it.each([
    ["correction", "Name reviewed", "A person reviewed this speaker name."],
    ["attribution", "Speaker reviewed", "A person matched this voice to a Session participant."],
    ["source-binding", "Participant recording", "This speaker comes from that participant's isolated recording."],
    ["provider", "Automatic speaker label", "This speaker name still comes from transcription processing."],
    ["unresolved", "Speaker needs review", "Quipsly has not identified this speaker yet."],
  ] as const)("explains %s authority in plain language", (authority, label, detail) => {
    render(<TranscriptSpeakerEvidenceBadge authority={authority} />);
    expect(screen.getByLabelText(`${label}. ${detail}`)).toHaveTextContent(label);
  });

  it("keeps additive legacy sources calm when authority was not retained", () => {
    const { container } = render(<TranscriptSpeakerEvidenceBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
