import { hasNamedTranscriptCommitment, resolveTranscriptWorkOwnership } from "./transcript-work-ownership";

const participants = [
  { id: "casey", userId: "coach", displayName: "Casey Park", accessStatus: "ACTIVE" },
  { id: "riley", userId: "client", displayName: "Riley Wells", accessStatus: "ACTIVE" },
];
const owner = (excerpt: string, kind: "task" | "goal" = "task", people = participants) =>
  resolveTranscriptWorkOwnership({ excerpt, kind, participants: people, speakerParticipantId: "casey" });

it("separates the person speaking from the named owner of work", () => {
  expect(owner("Riley will read three papers on Tuesday and send Casey an outline by Friday.")).toMatchObject({ userId: "client", basis: "named-commitment" });
  expect(owner("Riley’s goal is to finish the literature review.", "goal")).toMatchObject({ userId: "client", basis: "named-commitment" });
  expect(owner("I will email Riley tomorrow.")).toMatchObject({ userId: "coach", basis: "speaker" });
  expect(owner("Casey will email the writing rubric tomorrow.")).toMatchObject({ userId: "coach", basis: "named-commitment" });
});

it("recognizes explicit commitments without a narrow action-verb vocabulary", () => {
  expect(hasNamedTranscriptCommitment("Riley will first write for twenty minutes without editing.", participants)).toBe(true);
  expect(hasNamedTranscriptCommitment("Casey is going to email the rubric.", participants)).toBe(true);
  for (const text of ["If Riley will write, we can start.", "Maybe Casey will email it.", "Riley will not read it.", "Riley will never do that.", "Will Riley write tomorrow?"])
    expect(hasNamedTranscriptCommitment(text, participants)).toBe(false);
});

it("leaves ambiguous, inactive, and outside-session owners unassigned", () => {
  expect(owner("Riley will write.", "task", [...participants, {id: "other-riley", userId: "other", displayName: "Riley Smith", accessStatus: "ACTIVE"}]).userId).toBeNull();
  expect(owner("Riley Wells will write.", "task", [...participants, {id: "other-riley", userId: "other", displayName: "Riley Smith", accessStatus: "ACTIVE"}]).userId).toBe("client");
  expect(owner("Riley will write.", "task", participants.map(p => p.id === "riley" ? {...p, accessStatus: "REVOKED"} : p)).userId).toBeNull();
  expect(owner("Jordan's goal is to publish my book.", "goal").userId).toBeNull();
  expect(owner("Jordan will send my draft.").userId).toBeNull();
  expect(owner("You will send the outline.").userId).toBeNull();
});

it("does not resolve first-person commitments from a display label alone", () => {
  expect(resolveTranscriptWorkOwnership({excerpt: "I will write tomorrow.", kind: "task", participants, speakerParticipantId: null}).userId).toBeNull();
});
