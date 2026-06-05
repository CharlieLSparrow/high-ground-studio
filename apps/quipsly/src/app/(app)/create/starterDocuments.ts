import {
  DEV_PROJECT_SLUG,
  STARTER_DEMO_PROJECT_SLUG,
  type StudioNestKind,
} from "./projectConfig";

export type StarterBlock = {
  id: string;
  text: string;
  tags: string[];
};

const BLANK_MANUSCRIPT_BLOCKS: StarterBlock[] = [
  {
    id: "blank-chapter",
    text: "Chapter 1",
    tags: ["chapter"],
  },
  {
    id: "blank-opening",
    text: "Start writing here.",
    tags: [],
  },
  {
    id: "blank-episode",
    text: "Episode 1",
    tags: ["episode"],
  },
  {
    id: "blank-episode-body",
    text: "Add the episode script, show notes, and clip reminders under this heading.",
    tags: [],
  },
];

export const QUIPSLY_STARTER_BLOCKS: StarterBlock[] = [
  {
    id: "starter-title",
    text: "Quipsly, or A Sensible Guide to Keeping All the Nonsense in One Place",
    tags: ["chapter", "voice-homer"],
  },
  {
    id: "starter-welcome",
    text: "Welcome. This is not a tutorial page. Tutorial pages are where good intentions go to wear beige trousers. This is a working document, which means you may poke it, tag it, split it, hide bits of it, and generally treat it as if it has been placed on your desk rather than behind glass.",
    tags: ["educational", "voice-homer"],
  },
  {
    id: "starter-core-quote",
    text: "The trick is simple: keep one living document, then use lenses to see the version of it you need right now.",
    tags: ["quote", "educational", "voice-charlie"],
  },
  {
    id: "starter-everything-mode",
    text: "Everything Mode is the ordinary state of affairs. Manuscript paragraphs, show notes, research scraps, embedded clip cues, quotes, and mildly suspicious ideas all remain visible together. This is deliberate. A workshop with every tool hidden in a locked cabinet is not tidy; it is merely smug.",
    tags: ["educational", "voice-homer"],
  },
  {
    id: "starter-book-mode",
    text: "Book Mode is subtractive. It hides production scaffolding so you can read the prose without tripping over ladders, paint tins, and the person in the corner saying 'we should clip that for socials.' Nothing is copied. Nothing is forked. It is the same document wearing cleaner boots.",
    tags: ["educational", "chapter"],
  },
  {
    id: "starter-note",
    text: "Show Note: This paragraph is intentionally tagged as a show note. Everything Mode shows it. Book Mode should hide it. That is the whole magic trick, except unlike most magic tricks it remains useful after you know how it works.",
    tags: ["show-note", "voice-charlie"],
  },
  {
    id: "starter-clip-cue",
    text: "Clip: https://www.youtube.com/watch?v=ysz5S6PUM-U\nSegment: 0:05-0:12\nSegment: 0:20-0:27\n\nClip: https://www.youtube.com/watch?v=jNQXAC9IVRw\nSegment: 0:01-0:06\n\nNote: Clip cues live in the manuscript as readable text. The card above merely makes them easier to rehearse during a recording.",
    tags: ["clip-cue", "youtube-clip", "media", "show-note"],
  },
  {
    id: "starter-episode-heading",
    text: "Episode Example",
    tags: ["episode", "episode-8"],
  },
  {
    id: "starter-episode-body",
    text: "Episodes and chapters are not separate piles of paper. They are stretches of the same document. Click an episode or chapter in the outline and Quipsly focuses from that heading until the next one, which is exactly how a sensible person expects headings to behave.",
    tags: ["episode-8", "educational", "voice-homer"],
  },
  {
    id: "starter-research",
    text: "Research Note: Later, this is where example-finding agents should become useful: not as a mysterious oracle in a velvet box, but as a sidebar that says, 'Here are three places your library has wrestled with the same idea.' Helpful. Specific. Unimpressed by hype.",
    tags: ["internal_note", "educational"],
  },
  {
    id: "starter-ending",
    text: "Now write over this, duplicate it, or leave it here as a small brass plaque on the door. The important part is that Quipsly starts as a place where your work can be messy, structured, searchable, performable, and publishable without becoming five different documents wearing a trench coat.",
    tags: ["quote", "voice-charlie"],
  },
];

const WRITING_NEST_BLOCKS: StarterBlock[] = [
  { id: "welcome-writing-chapter", text: "Welcome to your Writing Nest", tags: ["chapter"] },
  {
    id: "welcome-writing-intro",
    text:
      "This is one living document. Draft here first, then use tags to give the document structure without moving the writing into a different tool. A block tagged Chapter becomes a navigation boundary until the next Chapter. A block tagged Episode becomes a production boundary until the next Episode.",
    tags: ["educational"],
  },
  {
    id: "welcome-writing-rule",
    text:
      "Quipsly rule of thumb: write like a person, organize like a librarian, publish like the same source can become many things.",
    tags: ["quote", "educational"],
  },
  { id: "welcome-writing-episode", text: "First Working Session", tags: ["episode"] },
  {
    id: "welcome-writing-show-note",
    text:
      "Try this: rename this block, tag it Episode, and watch the outline become a clickable map. Add show notes, quotes, clip cues, and private notes inline as you work.",
    tags: ["show-note"],
  },
];

const STUDY_NEST_BLOCKS: StarterBlock[] = [
  { id: "welcome-study-chapter", text: "Study Document: Source Notes and Questions", tags: ["chapter"] },
  {
    id: "welcome-study-intro",
    text:
      "A Study Nest is for reading with a pencil in your hand. Paste or import source material, keep the original context nearby, then tag the useful pieces: quotes, questions, examples, claims, and notes you want Quipsly to retrieve later.",
    tags: ["educational"],
  },
  {
    id: "welcome-study-note",
    text:
      "Private study note: this is where your own understanding goes. Quipsly can help collect and compare sources, but your judgment is the point of the tool.",
    tags: ["internal_note"],
  },
  { id: "welcome-study-packet", text: "Research Packet 1", tags: ["episode"] },
  {
    id: "welcome-study-quote",
    text:
      "Highlight-worthy passages can stay in the source document and also become reusable quote cards, course examples, or episode notes later.",
    tags: ["quote"],
  },
];

const PRODUCTION_NEST_BLOCKS: StarterBlock[] = [
  { id: "welcome-production-chapter", text: "Production Nest: Episode Control Room", tags: ["chapter"] },
  {
    id: "welcome-production-intro",
    text:
      "Use this Nest when the writing, recording, clips, transcript, and publishing plan all belong together. The manuscript is the spine; recorder rooms, sync decks, and timelines attach to the same project and episode boundaries.",
    tags: ["educational", "show-note"],
  },
  { id: "welcome-production-session", text: "Recording Session 1", tags: ["episode"] },
  {
    id: "welcome-production-cue",
    text:
      "Clip cue: add a YouTube or uploaded media source here, then open the editor to turn it into timeline clips, show notes, or publishable social cuts.",
    tags: ["clip-cue", "media", "youtube-clip"],
  },
  {
    id: "welcome-production-save",
    text:
      "Production safety check: imported media, spine audio, sync status, and timeline saves should always point back to this Nest and episode.",
    tags: ["internal_note"],
  },
];

const RESEARCH_NEST_BLOCKS: StarterBlock[] = [
  { id: "welcome-research-chapter", text: "Research Library: Examples, Sources, and Receipts", tags: ["chapter"] },
  {
    id: "welcome-research-intro",
    text:
      "Research Nests are for gathering the material behind your thinking. Tag quotes, examples, counterexamples, and source notes so Quipsly can help you retrieve evidence without becoming a black-box writer.",
    tags: ["educational"],
  },
  { id: "welcome-research-packet", text: "Research Packet 1", tags: ["episode"] },
  {
    id: "welcome-research-quote",
    text:
      "A good research packet should answer: what did we find, why does it matter, where did it come from, and what can we safely do with it next?",
    tags: ["quote", "show-note"],
  },
];

const FICTION_NEST_BLOCKS: StarterBlock[] = [
  { id: "welcome-fiction-chapter", text: "Story Bible: World, Characters, and Scenes", tags: ["chapter"] },
  {
    id: "welcome-fiction-intro",
    text:
      "Use this Nest for fiction planning without losing the actual writing. Chapters can be story arcs, episodes can be scenes or sessions, and notes can track character, setting, romance beats, continuity, or research.",
    tags: ["educational"],
  },
  { id: "welcome-fiction-scene", text: "Scene Packet 1", tags: ["episode"] },
  {
    id: "welcome-fiction-note",
    text:
      "Continuity note: anything that must survive revision belongs in a tagged note, not in your memory where the goblins can eat it.",
    tags: ["internal_note"],
  },
];

const COURSE_NEST_BLOCKS: StarterBlock[] = [
  { id: "welcome-course-chapter", text: "Course Source: Lessons, Checks, and Learner Flow", tags: ["chapter"] },
  {
    id: "welcome-course-intro",
    text:
      "Course Nests turn source material into lessons, examples, quizzes, flash cards, SCORM packages, and short-form learning flows. Keep the source in one document, then tag what each output needs.",
    tags: ["educational"],
  },
  { id: "welcome-course-lesson", text: "Lesson 1", tags: ["episode"] },
  {
    id: "welcome-course-check",
    text:
      "Learner check: write the concept, add an example, then tag the question or media cue that should become the interactive part.",
    tags: ["show-note", "clip-cue"],
  },
];

const GALLERY_NEST_BLOCKS: StarterBlock[] = [
  { id: "welcome-gallery-chapter", text: "Gallery Review: Client Selection Notes", tags: ["chapter"] },
  {
    id: "welcome-gallery-intro",
    text:
      "Gallery Nests organize visual work into collections, selections, comments, and deliverables. The same spine can support a client proofing flow, a story gallery, a course slide deck, or a social carousel.",
    tags: ["educational"],
  },
  { id: "welcome-gallery-collection", text: "Collection 1", tags: ["episode"] },
  {
    id: "welcome-gallery-media",
    text:
      "Media note: attach images or clips to this section, then use tags to group favorites, revision requests, print candidates, and publishing outputs.",
    tags: ["media", "show-note"],
  },
];

const MIXED_NEST_BLOCKS: StarterBlock[] = [
  { id: "welcome-mixed-chapter", text: "Quipsly Mixed Nest: Start Anywhere", tags: ["chapter"] },
  {
    id: "welcome-mixed-intro",
    text:
      "This Nest can hold writing, study notes, media planning, research packets, and publishing tasks together. Start with the work in front of you; structure can emerge by tagging headings as Chapter or Episode.",
    tags: ["educational"],
  },
  { id: "welcome-mixed-session", text: "First Working Session", tags: ["episode"] },
  {
    id: "welcome-mixed-next",
    text:
      "Next action: replace this note with the first real thing you want to make, learn, record, publish, or remember.",
    tags: ["show-note"],
  },
];

const STARTER_BLOCKS_BY_KIND: Record<StudioNestKind, StarterBlock[]> = {
  writing: WRITING_NEST_BLOCKS,
  study: STUDY_NEST_BLOCKS,
  production: PRODUCTION_NEST_BLOCKS,
  research: RESEARCH_NEST_BLOCKS,
  fiction: FICTION_NEST_BLOCKS,
  course: COURSE_NEST_BLOCKS,
  gallery: GALLERY_NEST_BLOCKS,
  mixed: MIXED_NEST_BLOCKS,
};

export function createStarterBlocks(
  projectSlug: string,
  nestKind: StudioNestKind = "writing"
): StarterBlock[] {
  if (projectSlug === DEV_PROJECT_SLUG || projectSlug === STARTER_DEMO_PROJECT_SLUG) {
    return QUIPSLY_STARTER_BLOCKS;
  }

  return STARTER_BLOCKS_BY_KIND[nestKind] ?? BLANK_MANUSCRIPT_BLOCKS;
}
