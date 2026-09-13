type Participant = {
  id: string;
  userId: string | null;
  accessStatus: string;
  displayName?: string | null;
};

export type TranscriptWorkOwnership = {
  userId: string | null;
  participantId: string | null;
  basis: "named-commitment" | "speaker" | "unassigned";
};

const normalized = (value: string) => value.normalize("NFKC").replace(/[’‘]/g, "'").trim();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function namesFor(participant: Participant) {
  const full = normalized(participant.displayName || "");
  return full ? [...new Set([full, full.split(/\s+/)[0]!])] : [];
}

// Names must be the subject of the commitment, not its recipient. "I will
// email Riley" therefore stays with I, while "Riley will email Casey" is Riley.
function namedSubjects(text: string, participants: Participant[], kind: "task" | "goal") {
  const subjects = new Map<string, { name: string; participant: Participant }[]>();
  for (const participant of participants) {
    for (const name of namesFor(participant).sort((a, b) => b.length - a.length)) {
      const verb = kind === "goal"
        ? "(?:'s\\s+(?:(?:coaching|long-term)\\s+)?(?:goal|objective|commitment)\\b)"
        : "(?:\\s+(?:will|shall|is going to|has committed to|commits to)\\s+(?!not\\b|never\\b))";
      const match = new RegExp(`(?:^|[\\s,;:.!?])(${escape(name)})${verb}`, "iu").exec(text);
      if (!match) continue;
      const before = text.slice(0, match.index).split(/[.!?;]/).at(-1) || "";
      if (/\b(?:if|unless|perhaps|maybe|whether)\b/i.test(before) || text.trim().endsWith("?")) continue;
      const key = match[1]!.toLocaleLowerCase();
      subjects.set(key, [...subjects.get(key) || [], { name, participant }]);
      break;
    }
  }
  return [...subjects.values()].flat();
}

export function hasNamedTranscriptCommitment(text: string, participants: Participant[]) {
  return namedSubjects(normalized(text), participants, "task").length > 0;
}

export function resolveTranscriptWorkOwnership(input: {
  excerpt: string;
  kind: "task" | "goal";
  participants: Participant[];
  speakerParticipantId: string | null;
}): TranscriptWorkOwnership {
  const text = normalized(input.excerpt);
  const named = namedSubjects(text, input.participants, input.kind);
  const ids = new Set(named.map(({ participant }) => participant.id));
  if (ids.size === 1) {
    const participant = named[0]!.participant;
    return participant.accessStatus === "ACTIVE" && participant.userId
      ? { userId: participant.userId, participantId: participant.id, basis: "named-commitment" }
      : { userId: null, participantId: null, basis: "unassigned" };
  }
  if (ids.size > 1) return { userId: null, participantId: null, basis: "unassigned" };
  // A named goal about someone outside this session isn't the speaker's goal.
  const unknownPossessive = input.kind === "goal" && /\b[\p{L}\p{M}]+\s*'s\s+(?:goal|objective|commitment)\b/iu.test(text);
  if (unknownPossessive) return { userId: null, participantId: null, basis: "unassigned" };
  const firstPerson = /\b(?:i(?:'ll)?\s|my\s+(?:goal|objective|commitment)\b|(?:create|add|make)\s+me\b)/i.test(text)
    || /\b(?:create|add|make)\s+(?:a\s+)?(?:task|todo|to-do|action item)\b[^.!?]*\bmy\b/i.test(text);
  const implicitGoal = input.kind === "goal" && !unknownPossessive && !/\b(?:you|your|they|their|his|her)\b/i.test(text);
  if (!firstPerson && !implicitGoal) return { userId: null, participantId: null, basis: "unassigned" };
  const speaker = input.participants.find(participant => participant.id === input.speakerParticipantId
    && participant.accessStatus === "ACTIVE" && participant.userId);
  return speaker
    ? { userId: speaker.userId, participantId: speaker.id, basis: "speaker" }
    : { userId: null, participantId: null, basis: "unassigned" };
}
