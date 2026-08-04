import "@testing-library/jest-dom";

import { fireEvent, render, screen } from "@testing-library/react";

import type {
  AiEditProposal,
  AiEditReviewCandidate,
  AiEditSignalVisualization,
} from "@/lib/editor/ai-edit-proposal-contract";

import {
  AutomatedEditEvidenceMap,
  automatedEditEvidenceSummary,
} from "./AutomatedEditEvidenceMap";

const proposal: AiEditProposal = {
  proposalId: "proposal-low-energy",
  type: "deactivate_range",
  sourceRange: { startSeconds: 4, endSeconds: 7 },
  evidence: {
    blockIds: ["left", "right"],
    transcriptTextSha256: "a".repeat(64),
    audioSignal: {
      mediaAssetKind: "capture-recording",
      mediaAssetId: "recording-1",
      sourceSha256: "b".repeat(64),
      storageGeneration: "generation-1",
      signalProfileSha256: "c".repeat(64),
      algorithm: "capture-energy-v1",
      measuredStartSeconds: 4,
      measuredEndSeconds: 7,
      coverageFraction: 1,
      maximumRmsDbfs: -78,
      nearSilenceDbfs: -72,
      surroundingSignalDbfs: -45,
      classification: "measured-low-energy",
    },
  },
  rationale: "Decoded evidence found a low-energy transcript gap.",
  confidence: "medium",
  changesSource: false,
  applied: false,
};

const candidate: AiEditReviewCandidate = {
  candidateId: "candidate-speaker-change",
  kind: "speaker-change",
  sourceRange: { startSeconds: 8, endSeconds: 9.5 },
  evidence: { blockIds: ["left", "right"], transcriptTextSha256: "d".repeat(64) },
  rationale: "The canonical speaker changes at this point.",
  confidence: "high",
  suggestedAction: "review-camera",
  requiresSignalEvidence: false,
  changesSource: false,
};

const signal: AiEditSignalVisualization = {
  mediaAssetKind: "capture-recording",
  mediaAssetId: "recording-1",
  sourceSha256: "b".repeat(64),
  storageGeneration: "generation-1",
  signalProfileSha256: "c".repeat(64),
  algorithm: "capture-energy-v1",
  durationSeconds: 12,
  nearSilenceDbfs: -72,
  surroundingSignalDbfs: -45,
  protectedPlayback: null,
  waveform: [
    { startSeconds: 0, durationSeconds: 4, rmsDbfs: -24, samplePeakDbfs: -8, clippedFrameCount: 0 },
    { startSeconds: 4, durationSeconds: 3, rmsDbfs: -78, samplePeakDbfs: -61, clippedFrameCount: 0 },
    { startSeconds: 7, durationSeconds: 5, rmsDbfs: -20, samplePeakDbfs: -1, clippedFrameCount: 2 },
  ],
};

describe("AutomatedEditEvidenceMap", () => {
  it("shows decoded audio, unapplied proposals, checks, and the live source clock together", () => {
    render(<AutomatedEditEvidenceMap proposals={[proposal]} candidates={[candidate]} signal={signal} sourceStartSeconds={0} sourceEndSeconds={12} currentSeconds={8.2} onSelectTime={jest.fn()} onProofReview={jest.fn()} />);

    expect(screen.getByRole("img", { name: /decoded waveform with automated edit evidence/i })).toBeInTheDocument();
    expect(screen.getByText(/1 proposals · 1 checks/i)).toBeInTheDocument();
    expect(screen.getByText(/1 range is bound to decoded audio/i)).toBeInTheDocument();
    expect(screen.getByText(/1 is a measured low-energy proposal/i)).toBeInTheDocument();
    expect(screen.getByText(/original unchanged · not applied/i)).toBeInTheDocument();
    expect(screen.getByText(/Bound capture recording recording-1 · source b{12} · profile c{12}/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Protected-source proof required" })).toBeDisabled();
    expect(screen.getByText(/will not write a proof-listen receipt from the program monitor/i)).toBeInTheDocument();
  });

  it("moves the shared playhead to an exact evidence range and proof-watches camera evidence", () => {
    const onSelectTime = jest.fn();
    const onProofReview = jest.fn();
    render(<AutomatedEditEvidenceMap proposals={[proposal]} candidates={[candidate]} signal={signal} sourceStartSeconds={0} sourceEndSeconds={12} currentSeconds={0} onSelectTime={onSelectTime} onProofReview={onProofReview} />);

    fireEvent.click(screen.getByRole("button", { name: /0:08\.0 · speaker change/i }));
    expect(onSelectTime).toHaveBeenCalledWith(8);
    expect(screen.getByLabelText("Selected automated edit evidence")).toHaveTextContent("The canonical speaker changes");
    fireEvent.click(screen.getByRole("button", { name: "Proof-watch source" }));
    expect(onProofReview).toHaveBeenCalledWith(candidate);
  });

  it("stays honest when no decoded waveform is bound", () => {
    render(<AutomatedEditEvidenceMap proposals={[]} candidates={[candidate]} signal={null} sourceStartSeconds={0} sourceEndSeconds={12} currentSeconds={2} onSelectTime={jest.fn()} onProofReview={jest.fn()} />);
    expect(screen.getByText("Decoded waveform is not bound to this proposal set")).toBeInTheDocument();
    expect(automatedEditEvidenceSummary([], [candidate])).toEqual({ proposalCount: 0, candidateCount: 1, signalBoundCount: 0, lowEnergyProposalCount: 0 });
  });

  it("records proof only after operating the exact protected source", async () => {
    const onSelectTime = jest.fn();
    const onProofReview = jest.fn();
    const play = jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(<AutomatedEditEvidenceMap proposals={[proposal]} candidates={[]} signal={{ ...signal, protectedPlayback: { sourceId: "source-1", url: "/api/ingest/media/source-1", kind: "audio", label: "Protected take", durationSeconds: 12 } }} sourceStartSeconds={0} sourceEndSeconds={12} currentSeconds={0} onSelectTime={onSelectTime} onProofReview={onProofReview} />);

    const audio = screen.getByLabelText("Protected automated edit source");
    expect(screen.getByText(/Exact protected source · Protected take/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play bound source" }));
    expect(play).toHaveBeenCalled();
    Object.defineProperty(audio, "currentTime", { configurable: true, value: 4.4, writable: true });
    fireEvent.timeUpdate(audio);
    const confirmation = screen.getByRole("checkbox", { name: /I listened inside this exact source range/i });
    expect(confirmation).toBeEnabled();
    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole("button", { name: "Record proof-listen" }));
    expect(onProofReview).toHaveBeenCalledWith(proposal, expect.objectContaining({ mediaAssetKind: "capture-recording", mediaAssetId: "recording-1", sourceId: "source-1", playbackPositionSeconds: 4.4 }));
    play.mockRestore();
  });
});
