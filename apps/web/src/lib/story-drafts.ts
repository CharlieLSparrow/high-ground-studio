export const STORY_DRAFT_STATUSES = [
  "ROUGH",
  "NEEDS_HOMER_REVIEW",
  "NEEDS_CHUCK_REVIEW",
  "APPROVED_FOR_PROMOTION",
  "PROMOTED",
  "PARKED",
] as const;

export type StoryDraftStatus = (typeof STORY_DRAFT_STATUSES)[number];

export type StoryDraftActionState = {
  ok: boolean;
  message: string;
};

export type StoryDraftClientRecord = {
  id: string;
  storyCandidateId: string;
  storyCandidateTitle: string | null;
  sourceBlockId: string;
  episodeKey: string | null;
  episodeNumber: number | null;
  arrangementKey: string | null;
  title: string;
  body: string;
  notes: string | null;
  supportNotes: string | null;
  status: StoryDraftStatus;
  createdAt: string;
  updatedAt: string;
  createdByLabel: string;
  updatedByLabel: string | null;
};

export const EMPTY_STORY_DRAFT_ACTION_STATE: StoryDraftActionState = {
  ok: false,
  message: "",
};

export function buildSourceSeedStoryCandidateId({
  episodeKey,
  sourceBlockId,
}: {
  episodeKey: string;
  sourceBlockId: string;
}) {
  return `source-seed:${episodeKey}:${sourceBlockId}`;
}
