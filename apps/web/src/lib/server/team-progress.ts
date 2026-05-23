import progressStoryData from "../../../content/internal/progress-story.json";

export type TeamProgressCommit = {
  sha: string;
  label: string;
};

export type TeamProgressLink = {
  label: string;
  href: string;
};

export type TeamProgressEntry = {
  id: string;
  date: string;
  title: string;
  kicker: string;
  mood: string;
  summary: string;
  body: string[];
  commits: TeamProgressCommit[];
  links: TeamProgressLink[];
  tags: string[];
};

export type TeamProgressStory = {
  updatedAt: string;
  intro: string;
  entries: TeamProgressEntry[];
};

function isProgressStory(value: unknown): value is TeamProgressStory {
  if (!value || typeof value !== "object") {
    return false;
  }

  const story = value as Partial<TeamProgressStory>;
  return (
    typeof story.updatedAt === "string" &&
    typeof story.intro === "string" &&
    Array.isArray(story.entries)
  );
}

export function getTeamProgressStory(): TeamProgressStory {
  if (!isProgressStory(progressStoryData)) {
    throw new Error("Team progress story data is malformed.");
  }

  return {
    ...progressStoryData,
    entries: [...progressStoryData.entries].sort((left, right) =>
      right.date.localeCompare(left.date),
    ),
  };
}
