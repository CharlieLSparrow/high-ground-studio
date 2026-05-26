export type ManuscriptHelpNoteId =
  | "browser-local-draft"
  | "full-draft-json-backup"
  | "manuscript-library"
  | "server-snapshot"
  | "save-snapshot"
  | "load-latest-snapshot"
  | "load-selected-snapshot"
  | "local-changes-since-server-save"
  | "recording-reading-mode"
  | "focus-view"
  | "author-marks"
  | "semantic-meaning-tags"
  | "cited-quotation"
  | "quote-review-metadata"
  | "structure-region"
  | "chapter-book-region"
  | "episode-region"
  | "backup-mode"
  | "mark-mode"
  | "find-mode"
  | "quotes-mode"
  | "publish-mode"
  | "publishing-packet"
  | "recording-handoff-packet"
  | "publish-readiness-report"
  | "quote-review-appendix"
  | "author-contribution-export"
  | "synthetic-smoke-draft"
  | "real-manuscript-readiness-gate"
  | "phone-load-smoke"
  | "first-real-manuscript-import";

export type ManuscriptHelpNote = {
  id: ManuscriptHelpNoteId;
  label: string;
  title: string;
  body: string;
  whatItDoes?: string;
  whatItDoesNot?: string;
  whenToUse?: string;
};

export const manuscriptHelpNotes = {
  "browser-local-draft": {
    id: "browser-local-draft",
    label: "Local draft",
    title: "The copy under this browser's floorboard",
    body: "This is the manuscript copy living in this one browser. It is fast, private, and close at hand, like a marked-up draft tucked under a very specific floorboard.",
    whatItDoes:
      "It keeps the active working draft, including text, block IDs, author marks, structure regions, cited quotations, and quote review metadata.",
    whatItDoesNot:
      "It does not automatically appear on another device. Homer on a phone will not see it unless you export a full draft JSON backup or save a server snapshot.",
    whenToUse:
      "Use it for day-to-day editing. Use Save manuscript before anything needs to travel.",
  },
  "full-draft-json-backup": {
    id: "full-draft-json-backup",
    label: "Full JSON",
    title: "The whole desk in a bottle",
    body: "A full draft JSON backup is a complete portable copy of the Manuscript Desk state. It is not glamorous, but neither is a spare key until the door is locked.",
    whatItDoes:
      "It preserves the full draft envelope: editor JSON, title, source file name, structure regions, cited quotation reviews, active author, and display settings.",
    whatItDoesNot:
      "It does not save to Studio's database and does not update any canonical manuscript file.",
    whenToUse:
      "Download one before a serious import, a risky edit, or the first real manuscript server snapshot.",
  },
  "manuscript-library": {
    id: "manuscript-library",
    label: "Library",
    title: "Named manuscripts above the snapshot stack",
    body: "The manuscript library is the named shelf above manual snapshots. It now lives in Dev Mode because the everyday flow can simply save the current manuscript and use the latest phone link.",
    whatItDoes:
      "It separates working manuscripts from synthetic smoke drafts and makes recent named projects easier to find.",
    whatItDoesNot:
      "It does not autosave, merge devices, delete legacy snapshots, publish content, or turn a snapshot into canonical manuscript truth.",
    whenToUse:
      "Use it only when a checkpoint needs a named manuscript container instead of the simple latest-save flow.",
  },
  "server-snapshot": {
    id: "server-snapshot",
    label: "Snapshot",
    title: "A sturdy envelope for another device",
    body: "A server snapshot is a deliberate checkpoint saved to Studio's database. It is the manuscript equivalent of sealing an envelope and writing the date on it.",
    whatItDoes:
      "It lets another signed-in device load the saved draft, including text and metadata.",
    whatItDoesNot:
      "It is not autosave. It is not simultaneous editing. It is not canonical manuscript truth.",
    whenToUse:
      "Use it when a desktop draft needs to be available on a phone, tablet, or second browser profile.",
  },
  "save-snapshot": {
    id: "save-snapshot",
    label: "Save",
    title: "Make the checkpoint on purpose",
    body: "Save manuscript writes the current browser-local draft to Studio's database as a manual checkpoint. It is the everyday button for moving the draft to another signed-in device.",
    whatItDoes:
      "It creates a new manual server snapshot for the signed-in Studio account.",
    whatItDoesNot:
      "It does not turn on autosave and does not merge with anyone else's browser.",
    whenToUse:
      "Click it after checking that the visible browser-local draft is the version another device should receive.",
  },
  "load-latest-snapshot": {
    id: "load-latest-snapshot",
    label: "Latest",
    title: "Open the newest sealed envelope",
    body: "Load latest fetches the most recently updated manual snapshot for this account and replaces this browser's active draft after confirmation.",
    whatItDoes:
      "It is the quickest phone-load path when the desktop has just saved a checkpoint.",
    whatItDoesNot:
      "It does not preserve unsaved local changes in this browser unless you export them first.",
    whenToUse:
      "Use it on the receiving device when you know the newest snapshot is the one you want.",
  },
  "load-selected-snapshot": {
    id: "load-selected-snapshot",
    label: "Selected",
    title: "Choose the envelope before opening it",
    body: "Load selected snapshot fetches the specific checkpoint chosen in the list. It is for moments when 'latest' is a little too trusting.",
    whatItDoes:
      "It replaces the active browser-local draft with the selected saved draft after confirmation.",
    whatItDoesNot:
      "It does not compare or merge drafts. The old local draft should be backed up first if it matters.",
    whenToUse:
      "Use it when there are several checkpoints and the timestamp or note matters.",
  },
  "local-changes-since-server-save": {
    id: "local-changes-since-server-save",
    label: "Local changes",
    title: "Has this browser wandered off since the checkpoint?",
    body: "This indicator compares the current browser-local draft to the last server snapshot saved or loaded in this browser. It ignores ordinary local timestamp churn.",
    whatItDoes:
      "It tells you whether text or metadata changed after the last known server checkpoint.",
    whatItDoesNot:
      "It cannot know what another browser has done unless you refresh or load server snapshots.",
    whenToUse:
      "Check it before handing the manuscript to another device or before deciding whether another manual save is needed.",
  },
  "recording-reading-mode": {
    id: "recording-reading-mode",
    label: "Read mode",
    title: "The manuscript puts down the pen",
    body: "Recording / Reading mode makes the manuscript easier to use while reading aloud or navigating on a smaller screen.",
    whatItDoes:
      "It makes the editor view-only, emphasizes outline and navigation controls, and keeps accidental edits out of the way.",
    whatItDoesNot:
      "It does not save, publish, rewrite, or remove manuscript data.",
    whenToUse:
      "Use it for phone reading, recording sessions, and review passes where navigation matters more than editing.",
  },
  "focus-view": {
    id: "focus-view",
    label: "Focus",
    title: "The rest of the manuscript is behind a curtain",
    body: "Focus View hides nonmatching blocks visually only. The manuscript has not been eaten. It is merely standing very still behind a curtain.",
    whatItDoes:
      "It narrows what you see by search, author, semantic tag, structure region, quote status, or quote focus.",
    whatItDoesNot:
      "It does not delete, split, rewrite, or remove hidden blocks from the draft JSON.",
    whenToUse:
      "Use it when the manuscript wall is too large and you need to work one pattern at a time.",
  },
  "author-marks": {
    id: "author-marks",
    label: "Authors",
    title: "Colored thread through the prose",
    body: "Author marks label spans as Charlie, Homer / Scott, or unassigned. They are editorial markings, not authorship law carved in stone.",
    whatItDoes:
      "It helps separate voices and see who a stretch of text currently belongs to.",
    whatItDoesNot:
      "It does not change file ownership, permissions, or canonical manuscript status.",
    whenToUse:
      "Use it after import, during voice cleanup, and when Charlie additions need to stay visibly distinct.",
  },
  "semantic-meaning-tags": {
    id: "semantic-meaning-tags",
    label: "Meaning tags",
    title: "Labels for what the words are doing",
    body: "Semantic tags mark why a span matters: quote, story, insight, research, question, thesis, transition, or review need.",
    whatItDoes:
      "It turns meaning into visible editorial metadata without moving the text.",
    whatItDoesNot:
      "It does not create public tags, public pages, or approved projection content.",
    whenToUse:
      "Use it to make important material findable before a later editorial decision.",
  },
  "cited-quotation": {
    id: "cited-quotation",
    label: "Citation",
    title: "A quote that wants its papers checked",
    body: "A cited quotation is a marked span that should carry source attention. Treat it as a bright ribbon saying: before this goes public, check me.",
    whatItDoes:
      "It makes quotation spans searchable, exportable, and available in Quote Focus.",
    whatItDoesNot:
      "It does not verify the quote by itself. The label is a request for care, not proof.",
    whenToUse:
      "Use it when a passage quotes, paraphrases closely, or needs source tracking.",
  },
  "quote-review-metadata": {
    id: "quote-review-metadata",
    label: "Quote review",
    title: "The little ledger beside the quote",
    body: "Quote review metadata stores the source title, locator, review status, rights note, and editor note for a cited quotation.",
    whatItDoes:
      "It tracks whether a quote needs a source, needs verification, is verified, or should not be used.",
    whatItDoesNot:
      "It does not change the quoted text or grant rights by magic.",
    whenToUse:
      "Use it during source review, permissions review, and final quote cleanup.",
  },
  "structure-region": {
    id: "structure-region",
    label: "Structure",
    title: "A named stretch of manuscript road",
    body: "A structure region names a range of blocks, such as a chapter, episode, or section. It is a map overlay, not a knife.",
    whatItDoes:
      "It helps navigate, outline, filter, and prepare reading or recording passes.",
    whatItDoesNot:
      "It does not split the manuscript, move paragraphs, or write canonical files.",
    whenToUse:
      "Use it when a block range has a useful editorial identity.",
  },
  "chapter-book-region": {
    id: "chapter-book-region",
    label: "Book region",
    title: "Book-shaped scaffolding",
    body: "A Chapter / book region marks manuscript ranges like Preface, Introduction, Chapter 0, Chapter One, or Appendix.",
    whatItDoes:
      "It helps the desk understand book-scale shape without committing public structure.",
    whatItDoesNot:
      "It does not publish a chapter or alter the living manuscript file.",
    whenToUse:
      "Use it when organizing the book manuscript for review, reading, or recording.",
  },
  "episode-region": {
    id: "episode-region",
    label: "Episode",
    title: "A recording-sized path through the book",
    body: "An Episode region marks the manuscript range that may support an episode or recording pass.",
    whatItDoes:
      "It helps a phone or recording view jump through episode-sized chunks.",
    whatItDoesNot:
      "It does not create a podcast episode, update arrangements, or publish content.",
    whenToUse:
      "Use it when a range has a practical show or reading purpose.",
  },
  "backup-mode": {
    id: "backup-mode",
    label: "Backup",
    title: "The cautious drawer behind Dev Mode",
    body: "Backup mode is where the desk keeps old travel papers, spare keys, raw exports, and serious warnings without crowding the everyday writing surface.",
    whatItDoes:
      "It handles local downloads, JSON import/export, named manuscript selection, manual server snapshots, and selected snapshot loading.",
    whatItDoesNot:
      "It does not autosave or turn server snapshots into collaboration.",
    whenToUse:
      "Use it from Dev Mode before risky imports, raw JSON work, or selected-snapshot recovery.",
  },
  "mark-mode": {
    id: "mark-mode",
    label: "Mark",
    title: "Ink for meaning, not for panic",
    body: "Mark mode is for applying author marks and meaning tags to selected text.",
    whatItDoes:
      "It adds inline editorial metadata that travels inside the browser-local draft and manual snapshots.",
    whatItDoesNot:
      "It does not rewrite the words, publish anything, or promote material to canonical truth.",
    whenToUse:
      "Use it while classifying voice, quotes, stories, insights, and review needs.",
  },
  "find-mode": {
    id: "find-mode",
    label: "Find",
    title: "A lantern, not scissors",
    body: "Find mode narrows what you can see so the manuscript becomes workable in pieces.",
    whatItDoes:
      "It searches and filters by text, author, semantic tag, structure, block type, and review state.",
    whatItDoesNot:
      "It does not change the draft unless you click a separate editing action.",
    whenToUse:
      "Use it when looking for a pattern, a missing mark, or a specific type of cleanup.",
  },
  "quotes-mode": {
    id: "quotes-mode",
    label: "Quotes",
    title: "The citation desk with a sharper lamp",
    body: "Quotes mode gathers cited quotations and their review state so source work can happen without hunting through the whole manuscript.",
    whatItDoes:
      "It focuses cited quotations, moves between them, edits review metadata, and exports quote Markdown.",
    whatItDoesNot:
      "It does not verify quotes automatically or change rights status by declaration.",
    whenToUse:
      "Use it for source cleanup, permissions review, and final quote triage.",
  },
  "publish-mode": {
    id: "publish-mode",
    label: "Publish",
    title: "The export table before the public square",
    body: "Publish mode gathers readiness warnings and handoff exports. It lives in Dev Mode until the packet workflow is part of ordinary editorial work.",
    whatItDoes:
      "It reports structure, author, quote review, and snapshot cautions, then prepares browser-downloadable Markdown packets.",
    whatItDoesNot:
      "It does not publish public pages, write server files, save snapshots, or declare the manuscript finished.",
    whenToUse:
      "Use it from Dev Mode before recording, sharing a handoff packet, or checking whether a synthetic draft is ready for real-manuscript work.",
  },
  "publishing-packet": {
    id: "publishing-packet",
    label: "Packet",
    title: "A working bundle, not a royal decree",
    body: "A publishing packet gathers structure, manuscript text, quote warnings, and notes into portable Markdown for humans to inspect.",
    whatItDoes:
      "It creates a browser-only Markdown export from the current draft and metadata.",
    whatItDoesNot:
      "It does not create canonical content, public pages, database records, or an approved final manuscript.",
    whenToUse:
      "Use it when someone needs to review the current draft outside the Manuscript Desk.",
  },
  "recording-handoff-packet": {
    id: "recording-handoff-packet",
    label: "Handoff",
    title: "A packet Homer can actually use",
    body: "The recording handoff packet turns structure, author summaries, and citation cautions into a practical guide for a recording pass.",
    whatItDoes:
      "It lists episode and chapter outlines, quote cautions, before-recording checks, and after-recording note space.",
    whatItDoesNot:
      "It does not switch devices, save a server snapshot, or make Recording / Reading mode live-collaborative.",
    whenToUse:
      "Use it before handing a draft to Homer or opening the manuscript on a phone for recording.",
  },
  "publish-readiness-report": {
    id: "publish-readiness-report",
    label: "Readiness",
    title: "A kindly inspector with a clipboard",
    body: "The readiness report counts structure, authorship, quotes, and snapshot cautions. It is meant to reduce surprises, not scold the manuscript.",
    whatItDoes:
      "It flags missing structure, unresolved quote review states, unassigned author spans, and local changes since server save.",
    whatItDoesNot:
      "It does not prove legal readiness, citation rights, or final editorial quality.",
    whenToUse:
      "Use it before publishing exports, recording handoff, or the first real-manuscript checkpoint.",
  },
  "quote-review-appendix": {
    id: "quote-review-appendix",
    label: "Quote appendix",
    title: "All the bright ribbons in one place",
    body: "The quote appendix lists cited quotation text, source fields, review status, rights notes, editor notes, block IDs, and structure context.",
    whatItDoes:
      "It makes citation cleanup portable without searching the full manuscript wall.",
    whatItDoesNot:
      "It does not verify sources or grant permissions.",
    whenToUse:
      "Use it for source review, rights review, and final quote cleanup.",
  },
  "author-contribution-export": {
    id: "author-contribution-export",
    label: "Authors export",
    title: "A thread count, not a courtroom",
    body: "The author contribution export summarizes Charlie, Homer / Scott, and unassigned spans from editorial marks.",
    whatItDoes:
      "It estimates marked spans, words, and characters by author label for review and handoff.",
    whatItDoesNot:
      "It is not legal authorship truth and does not change permissions or canonical status.",
    whenToUse:
      "Use it when the handoff needs a quick sense of whose material is where.",
  },
  "synthetic-smoke-draft": {
    id: "synthetic-smoke-draft",
    label: "Smoke draft",
    title: "A fake manuscript built to trip every wire",
    body: "The synthetic smoke draft is invented text designed to exercise author marks, structure, cited quotations, quote reviews, snapshots, Recording mode, and Publish exports before the real manuscript walks in wearing its good shoes.",
    whatItDoes:
      "It loads a complete fake Manuscript Desk draft into this browser so the whole workflow can be tested without real manuscript material.",
    whatItDoesNot:
      "It does not save itself to the server, replace canonical content, or prove the real manuscript is imported correctly.",
    whenToUse:
      "Use it before first real manuscript import, after deploys, and whenever the cross-device workflow needs a calm rehearsal.",
  },
  "real-manuscript-readiness-gate": {
    id: "real-manuscript-readiness-gate",
    label: "Real gate",
    title: "The velvet rope before real words enter",
    body: "The readiness gate is a browser-local checklist for proving the synthetic workflow first. It is less a guard dog than a doorperson with a clipboard and excellent memory.",
    whatItDoes:
      "It checks whether the synthetic draft is loaded, metadata paths are present, exports were generated, a snapshot was saved, phone load was confirmed, and a full draft JSON backup was downloaded.",
    whatItDoesNot:
      "It does not inspect private real manuscript quality, save to the server, or unlock any hidden publishing system.",
    whenToUse:
      "Use it immediately before importing the real manuscript for the first time.",
  },
  "phone-load-smoke": {
    id: "phone-load-smoke",
    label: "Phone smoke",
    title: "Make the second device prove it was invited",
    body: "Phone load smoke means saving a synthetic server snapshot on desktop, loading it on a phone or second browser, and confirming the text plus metadata survived the trip.",
    whatItDoes:
      "It verifies the manual snapshot path that Homer will depend on for Recording / Reading mode.",
    whatItDoesNot:
      "It is not simultaneous editing, not autosave, and not proof that two devices can edit at the same time.",
    whenToUse:
      "Use it before the first real manuscript save and before any real recording handoff.",
  },
  "first-real-manuscript-import": {
    id: "first-real-manuscript-import",
    label: "First import",
    title: "Opening the door for the real manuscript",
    body: "The first real manuscript import should happen only after the synthetic rehearsal works. The desk is sturdy, but real words deserve a clean floor and a spare key.",
    whatItDoes:
      "It reminds Charlie to download a JSON backup immediately after import, then save the first real server snapshot with a clear note.",
    whatItDoesNot:
      "It does not move material into canonical public content or turn snapshots into publication.",
    whenToUse:
      "Use it as the final checklist before and immediately after the real manuscript enters Studio.",
  },
} satisfies Record<ManuscriptHelpNoteId, ManuscriptHelpNote>;

export function getManuscriptHelpNote(id: ManuscriptHelpNoteId) {
  return manuscriptHelpNotes[id];
}
