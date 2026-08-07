import { sourceIDsForDecision, type ProgramEditSource } from "@/lib/editor/program-edit-contract";

function source(id: string, role: ProgramEditSource["role"]): ProgramEditSource {
  return {
    id,
    label: id,
    role,
    offsetSeconds: 0,
    durationSeconds: 30,
  };
}

describe("sourceIDsForDecision", () => {
  it("uses a projected reference camera for clip layouts", () => {
    expect(sourceIDsForDecision("primaryWithClip", [
      source("charlie", "primary"),
      source("participant-camera", "reference"),
    ])).toEqual({
      sourceLaneIDs: ["charlie"],
      clipLaneID: "participant-camera",
    });
  });

  it("prefers an explicit clip over a reference camera", () => {
    expect(sourceIDsForDecision("bothWithClip", [
      source("charlie", "primary"),
      source("watch-clip", "clip"),
      source("participant-camera", "reference"),
    ])).toEqual({
      sourceLaneIDs: ["charlie"],
      clipLaneID: "watch-clip",
    });
  });
});
