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
    label: "Original content document",
    description: "Books, articles, talks, scripts, and episode manuscripts you are actively authoring.",
    starterTitle: "Welcome to your Writing Nest",
  },
  {
    value: "study",
    label: "Study document",
    description: "Imported books, course pages, research sources, highlights, notes, and analysis layered over source text.",
    starterTitle: "Study Document: Source Notes and Questions",
  },
  {
    value: "production",
    label: "Media production",
    description: "Audio, video, clips, transcripts, publish packets, and episode production rooms.",
    starterTitle: "Production Nest: Episode Control Room",
  },
  {
    value: "research",
    label: "Research library",
    description: "A source-first Nest for Quipslys to organize references, examples, quotes, and packets.",
    starterTitle: "Research Library: Examples, Sources, and Receipts",
  },
  {
    value: "fiction",
    label: "Fiction world",
    description: "Characters, places, scenes, story maps, romance chaos, and continuity notes.",
    starterTitle: "Story Bible: World, Characters, and Scenes",
  },
  {
    value: "course",
    label: "Course / lesson package",
    description: "SCORM-ready lessons, quizzes, flashcards, and mobile-friendly learning flows.",
    starterTitle: "Course Source: Lessons, Checks, and Learner Flow",
  },
  {
    value: "gallery",
    label: "Photo client gallery",
    description: "Photo groups, comments, selects, client review, and publishable galleries.",
    starterTitle: "Gallery Review: Client Selection Notes",
  },
  {
    value: "mixed",
    label: "Mixed media lab",
    description: "A flexible sandbox when you are not ready to choose one shape yet.",
    starterTitle: "Quipsly Mixed Nest: Start Anywhere",
  },
];

export function starterTitleForNestKind(kind: StudioNestKind) {
  return nestCreationTemplates.find((template) => template.value === kind)?.starterTitle;
}

export function isCreatableNestKind(kind: StudioNestKind) {
  return nestCreationTemplates.some((template) => template.value === kind);
}
