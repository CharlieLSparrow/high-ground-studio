import {
  type HgoEpisodeProjection,
  type HgoProjectionFilter,
  getProjectionMapStats,
  projectionMatchesFilter,
} from "./projection-types";

export const syntheticEpisodeProjections: HgoEpisodeProjection[] = [
  {
    id: "synthetic-bridge",
    status: "synthetic",
    visibility: "staged",
    slug: "synthetic-episode",
    episodeNumber: "SYN-001",
    title: "The Bridge That Was Built Twice",
    subtitle:
      "A fake episode projection for testing the future public HGO page model.",
    summary:
      "A made-up leadership story about a team that discovers the second version of a bridge matters more than the first: the one built in language, trust, and repair.",
    thesis:
      "A public episode page should carry the listener from promise to proof. This synthetic projection shows how Studio metadata can become story beats, voice cards, quotes, source notes, and recording context without exposing private draft machinery.",
    lifecycleNote:
      "Synthetic content in a staged preview shell. Nothing here is public HGO canon.",
    hero: {
      eyebrow: "Synthetic Projection Preview",
      visualPrompt:
        "A dusk mesa, a workbench of index cards, and a thin orange radio waveform crossing the horizon.",
      colorMood: "ember, blue-black, parchment, oxidized teal",
    },
    audio: {
      state: "not-recorded",
      placeholderLabel: "Audio placeholder",
      durationLabel: "42 min draft target",
    },
    scopes: ["book-and-episode", "internal"],
    beats: [
      {
        title: "The map says cross here",
        summary:
          "The fake field team faces a practical crossing problem and an emotional one: nobody agrees what the crossing is for.",
        scope: "book-and-episode",
        timingHint: "00:00-08:00",
      },
      {
        title: "The first bridge works, then fails",
        summary:
          "The obvious solution is completed, then immediately exposes the difference between a finished object and a trusted one.",
        scope: "episode-only",
        timingHint: "08:00-18:00",
      },
      {
        title: "A question under the bolts",
        summary:
          "A quiet question reframes the work from output to ownership.",
        scope: "book-and-episode",
        timingHint: "18:00-27:00",
      },
      {
        title: "The second bridge is a promise",
        summary:
          "The rebuilt plan centers maintenance, handoff, and the person who has to cross last.",
        scope: "book-only",
        timingHint: "27:00-42:00",
      },
    ],
    voiceCards: [
      {
        speaker: "Homer",
        summary:
          "Plainspoken field memory carries the core story and keeps the lesson practical.",
      },
      {
        speaker: "Charlie",
        summary:
          "Charlie connects the invented scene to the public promise and marks what a listener should watch for.",
      },
    ],
    pullQuotes: [
      {
        text: "A bridge is not finished when it reaches the other bank; it is finished when the last person trusts it.",
        attribution: "Synthetic narrator",
        citationState: "verified",
      },
      {
        text: "The team had plans, tools, and weather reports. What they lacked was a shared definition of done.",
        attribution: "Synthetic episode draft",
        citationState: "synthetic",
      },
      {
        text: "If the handoff only works for the person who wrote it, it is not a handoff yet.",
        attribution: "Synthetic recording note",
        citationState: "needs-source",
      },
    ],
    sourceNotes: [
      {
        label: "Synthetic Field Notebook",
        detail: "Safe fake source used to test citation display.",
        status: "synthetic",
      },
      {
        label: "Synthetic Safety Memo",
        detail: "Needs-review state is visible for prototype behavior only.",
        status: "needs-review",
      },
    ],
    relatedBookChapter: {
      title: "Synthetic Book Chapter: Handoff Is A Structure",
      summary:
        "A placeholder chapter relationship showing how an episode could point back to an approved book projection without exposing the manuscript source.",
      status: "synthetic",
    },
    backstageNotes: [
      {
        label: "Recording watch",
        note: "Keep the first bridge practical and the second bridge emotional, or the metaphor gets too proud of itself.",
      },
      {
        label: "Projection watch",
        note: "This page proves a public shape. Studio remains the editing surface.",
      },
    ],
    navigation: {
      nextSlug: "synthetic-field-radio",
    },
  },
  {
    id: "synthetic-field-radio",
    status: "staged",
    visibility: "staged",
    slug: "synthetic-field-radio",
    episodeNumber: "SYN-002",
    title: "The Field Radio That Would Not Stay Quiet",
    subtitle:
      "A staged fake episode for Homer review before anything becomes public.",
    summary:
      "An invented crew carries a radio across a dry valley and learns that the loudest signal is not always the most useful one.",
    thesis:
      "Staged projections let Homer see the shape of an episode page while Charlie is still working across the whole book, without pretending the page is live.",
    lifecycleNote:
      "Staged synthetic preview. This demonstrates Homer handoff before public release.",
    hero: {
      eyebrow: "Staged Homer Preview",
      visualPrompt:
        "A cracked field radio glowing on a canyon ledge with paper tabs fluttering like signal flags.",
      colorMood: "canyon red, brass, sage, moonlit charcoal",
    },
    audio: {
      state: "recorded",
      placeholderLabel: "Recording captured, not published",
      durationLabel: "35 min rough cut",
    },
    scopes: ["episode-only", "internal"],
    beats: [
      {
        title: "The wrong signal",
        summary:
          "The fake crew mistakes volume for clarity and starts solving the wrong problem.",
        scope: "episode-only",
        timingHint: "00:00-09:00",
      },
      {
        title: "Charlie marks the gap",
        summary:
          "A synthetic editorial bridge names the missing question before the story turns.",
        scope: "internal",
        timingHint: "09:00-16:00",
      },
      {
        title: "Homer hears the quiet part",
        summary:
          "The useful signal arrives softly, which gives the staged page its recording note.",
        scope: "episode-only",
        timingHint: "16:00-35:00",
      },
    ],
    voiceCards: [
      {
        speaker: "Homer",
        summary:
          "The staged voice card gives Homer a clean read on what the episode asks him to carry.",
      },
      {
        speaker: "Charlie",
        summary:
          "Charlie shapes the episode promise and marks where the public page still needs source cleanup.",
      },
    ],
    pullQuotes: [
      {
        text: "A loud signal can still leave everyone guessing.",
        attribution: "Synthetic Homer line",
        citationState: "synthetic",
      },
      {
        text: "The page is not public just because it looks finished.",
        attribution: "Synthetic Studio note",
        citationState: "verified",
      },
    ],
    sourceNotes: [
      {
        label: "Synthetic Radio Log",
        detail: "Fake recording prep note for staged workflow testing.",
        status: "needs-review",
      },
      {
        label: "Synthetic Equipment Card",
        detail: "Fake public-safe source card for preview styling.",
        status: "verified",
      },
    ],
    relatedBookChapter: {
      title: "Synthetic Book Chapter: Signal Versus Noise",
      summary:
        "The staged episode maps to a future book-only section about attention, urgency, and quiet judgment.",
      status: "staged",
    },
    backstageNotes: [
      {
        label: "Homer pass",
        note: "This staged page should be readable before public launch and before the final audio asset exists.",
      },
      {
        label: "Citation pass",
        note: "One fake note remains needs-review to show why staged is not live.",
      },
    ],
    navigation: {
      previousSlug: "synthetic-episode",
      nextSlug: "synthetic-book-map",
    },
  },
  {
    id: "synthetic-book-map",
    status: "live",
    visibility: "public",
    slug: "synthetic-book-map",
    episodeNumber: "BOOK-004",
    title: "The Map In The Margin",
    subtitle:
      "A public-safe synthetic book projection that can be viewed without episode audio.",
    summary:
      "A fake book-only projection shows how a chapter lens can exist beside episode pages without becoming the editing source.",
    thesis:
      "Book and episode pages are different lenses over one manuscript world. A public-safe book projection can carry structure, voice, and verified notes without needing a podcast player.",
    lifecycleNote:
      "Live-status synthetic page for renderer testing. The status is data, not separate page code.",
    hero: {
      eyebrow: "Public-Safe Book Lens",
      visualPrompt:
        "A topographic map drawn in the margin of a cream notebook, lit by a small desk lamp.",
      colorMood: "paper, ink, moss, warm lamplight",
    },
    audio: {
      state: "not-recorded",
      placeholderLabel: "No episode audio for this book lens",
      durationLabel: "Book-only projection",
    },
    scopes: ["book-only", "book-and-episode"],
    beats: [
      {
        title: "A chapter can carry the compass",
        summary:
          "The fake chapter opens with orientation rather than a cold podcast hook.",
        scope: "book-only",
      },
      {
        title: "The same world, another lens",
        summary:
          "The book projection points to episode candidates without flattening the chapter into show notes.",
        scope: "book-and-episode",
      },
      {
        title: "Only verified notes pass through",
        summary:
          "Public-safe projection filters source notes before they reach the page.",
        scope: "book-only",
      },
    ],
    voiceCards: [
      {
        speaker: "Homer",
        summary:
          "Homer's synthetic source voice anchors the chapter in remembered practice.",
      },
      {
        speaker: "Charlie",
        summary:
          "Charlie creates the public chapter promise and keeps the page out of private editorial language.",
      },
    ],
    pullQuotes: [
      {
        text: "A map is a promise that the next person will not have to start from panic.",
        attribution: "Synthetic book projection",
        citationState: "verified",
      },
    ],
    sourceNotes: [
      {
        label: "Synthetic Chapter Note",
        detail: "Verified fake note used to demonstrate public-safe filtering.",
        status: "verified",
      },
    ],
    relatedBookChapter: {
      title: "Synthetic Book Chapter: The Map In The Margin",
      summary:
        "This page is itself a book lens, showing how future chapters can stand without becoming manuscript truth.",
      status: "live",
    },
    backstageNotes: [
      {
        label: "Projection pass",
        note: "Public-safe status should be earned from data, not from being placed in a public route.",
      },
    ],
    navigation: {
      previousSlug: "synthetic-field-radio",
      nextSlug: "synthetic-lantern-archive",
    },
  },
  {
    id: "synthetic-lantern-archive",
    status: "archived",
    visibility: "private",
    slug: "synthetic-lantern-archive",
    episodeNumber: "ARC-000",
    title: "The Lantern Test",
    subtitle:
      "An archived fake projection showing how old draft directions can remain visible without becoming current.",
    summary:
      "A synthetic lantern story was useful for testing the visual system, then retired when the bridge and radio pages became clearer.",
    thesis:
      "Archived projections keep history available without confusing Charlie or Homer about the current page direction.",
    lifecycleNote:
      "Archived private synthetic page. It is intentionally not public-safe.",
    hero: {
      eyebrow: "Archived Internal Draft",
      visualPrompt:
        "A lantern turned down low beside a stack of obsolete page mockups and blue pencil marks.",
      colorMood: "charcoal, dim gold, slate, erased pencil",
    },
    audio: {
      state: "not-recorded",
      placeholderLabel: "Retired audio idea",
      durationLabel: "Archived",
    },
    scopes: ["episode-only", "internal"],
    beats: [
      {
        title: "A useful wrong turn",
        summary:
          "The fake lantern metaphor helped find the page rhythm but is no longer the active direction.",
        scope: "internal",
      },
      {
        title: "Do not promote by accident",
        summary:
          "Archived projections stay visible in the map but clearly out of the release path.",
        scope: "internal",
      },
    ],
    voiceCards: [
      {
        speaker: "Homer",
        summary:
          "Homer's synthetic read would need a new setup before this became useful again.",
      },
      {
        speaker: "Charlie",
        summary:
          "Charlie keeps the lesson from the discarded direction without carrying the whole draft forward.",
      },
    ],
    pullQuotes: [
      {
        text: "Not every good image deserves to become the page.",
        attribution: "Synthetic archive note",
        citationState: "needs-source",
      },
    ],
    sourceNotes: [
      {
        label: "Synthetic Archive Card",
        detail: "Archived note intentionally marked do-not-use for renderer testing.",
        status: "do-not-use",
      },
    ],
    relatedBookChapter: {
      title: "Synthetic Book Chapter: Retired Images",
      summary:
        "An internal-only relationship showing why old directions need visible lifecycle labels.",
      status: "archived",
    },
    backstageNotes: [
      {
        label: "Archive pass",
        note: "The map should show this exists, but the page should not look release-ready.",
      },
    ],
    navigation: {
      previousSlug: "synthetic-book-map",
    },
  },
];

export const syntheticEpisodeProjection = syntheticEpisodeProjections[0];

export function getSyntheticEpisodeProjection(slug: string) {
  return syntheticEpisodeProjections.find((projection) => projection.slug === slug);
}

export function getFilteredSyntheticEpisodeProjections(
  filter: HgoProjectionFilter,
) {
  return syntheticEpisodeProjections.filter((projection) =>
    projectionMatchesFilter(projection, filter),
  );
}

export function getSyntheticProjectionMapStats() {
  return getProjectionMapStats(syntheticEpisodeProjections);
}
