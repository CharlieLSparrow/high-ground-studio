import { DEV_PROJECT_SLUG, STARTER_DEMO_PROJECT_SLUG } from "./projectConfig";

export type StarterBlock = {
  id: string;
  text: string;
  tags: string[];
};

const LEGACY_STARTER_BLOCKS: StarterBlock[] = [
  {
    id: "b1",
    text: "Welcome to the future of content creation. For decades, we've treated content as a final destination-a file you save, a post you publish, a video you render. But this is a fundamental misunderstanding of what content actually is.",
    tags: ["chapter", "educational"],
  },
  {
    id: "b2",
    text: "Content is not a destination. It is a raw material. It's time to rethink the studio.",
    tags: ["quote", "social-clip", "episode-4"],
  },
  {
    id: "b3",
    text: "When you record a one-hour podcast, you haven't just created an audio file. You have created a dataset containing insights, jokes, stories, frameworks, and data points. The old way is to chop it up destructively.",
    tags: ["educational", "internal_note", "episode-8"],
  },
  {
    id: "b4",
    text: "Imagine a world where your manuscript knows what parts of it are meant for a Twitter thread, what parts are meant for the private community, and what parts are just notes to your co-author. That is the promise of the Tag-Powered OS.",
    tags: ["episode-9", "media", "episode"],
  },
  {
    id: "b5",
    text: "This architecture enables true 'Create Once, Publish Everywhere' without the copy-paste nightmare. We just query the graph for the pieces we need.",
    tags: ["episode-4", "quote"],
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

export function createStarterBlocks(projectSlug: string): StarterBlock[] {
  if (projectSlug === DEV_PROJECT_SLUG || projectSlug === STARTER_DEMO_PROJECT_SLUG) return QUIPSLY_STARTER_BLOCKS;
  return LEGACY_STARTER_BLOCKS;
}
