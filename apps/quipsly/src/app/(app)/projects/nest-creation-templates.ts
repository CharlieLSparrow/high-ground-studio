import type { StudioNestKind } from "@/lib/studio/project-registry";

export type NestCreationTemplate = {
  value: StudioNestKind;
  label: string;
  description: string;
  starterTitle: string;
};

export const nestCreationTemplates: NestCreationTemplate[] = [
  {
    value: "writing",
    label: "Writing",
    description: "Books, articles, talks, scripts, and episode manuscripts you are actively authoring.",
    starterTitle: "Draft",
  },
  {
    value: "study",
    label: "Study",
    description: "Imported books, course pages, research sources, highlights, notes, and analysis layered over source text.",
    starterTitle: "Source notes",
  },
  {
    value: "production",
    label: "Podcast and video",
    description: "Audio, video, clips, transcripts, publish packets, and episode production rooms.",
    starterTitle: "Production notes",
  },
  {
    value: "research",
    label: "Research library",
    description: "A source-first Nest for Quipslys to organize references, examples, quotes, and packets.",
    starterTitle: "Research notes",
  },
  {
    value: "fiction",
    label: "Fiction",
    description: "Characters, places, scenes, story maps, romance chaos, and continuity notes.",
    starterTitle: "Story bible",
  },
  {
    value: "course",
    label: "Course or training",
    description: "SCORM-ready lessons, quizzes, flashcards, and mobile-friendly learning flows.",
    starterTitle: "Course notes",
  },
  {
    value: "gallery",
    label: "Photography",
    description: "Photo groups, comments, selects, client review, and publishable galleries.",
    starterTitle: "Gallery notes",
  },
  {
    value: "mixed",
    label: "General",
    description: "A flexible sandbox when you are not ready to choose one shape yet.",
    starterTitle: "Notes",
  },
];

export function starterTitleForNestKind(kind: StudioNestKind) {
  return nestCreationTemplates.find((template) => template.value === kind)?.starterTitle;
}

export function isCreatableNestKind(kind: unknown): kind is StudioNestKind {
  return nestCreationTemplates.some((template) => template.value === kind);
}
