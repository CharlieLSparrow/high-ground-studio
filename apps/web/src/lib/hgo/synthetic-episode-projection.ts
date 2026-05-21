export type SyntheticCitationStatus =
  | "verified-synthetic"
  | "needs-source-synthetic"
  | "needs-verification-synthetic"
  | "do-not-use-synthetic";

export type SyntheticEpisodeProjection = {
  title: string;
  subtitle: string;
  slug: string;
  episodeNumber: string;
  eyebrow: string;
  heroVisualDescriptor: string;
  audio: {
    status: "placeholder";
    label: string;
    durationLabel: string;
  };
  summary: string;
  thesis: string;
  beats: Array<{
    label: string;
    title: string;
    summary: string;
    sourceStructure: "chapter" | "episode" | "section";
    timingHint: string;
  }>;
  voiceCards: Array<{
    speaker: "Homer / Scott" | "Charlie" | "Unassigned";
    label: string;
    summary: string;
    wordEstimate: number;
  }>;
  pullQuotes: Array<{
    text: string;
    attribution: string;
    semanticTag: "story" | "insight" | "question" | "transition";
    citationStatus: SyntheticCitationStatus;
  }>;
  citedSources: Array<{
    title: string;
    sourceType: string;
    locator: string;
    note: string;
    status: SyntheticCitationStatus;
  }>;
  relatedBookChapter: {
    title: string;
    summary: string;
    status: "synthetic-placeholder";
  };
  backstageNotes: Array<{
    label: string;
    note: string;
  }>;
  navigation: {
    previous: {
      label: string;
      title: string;
    };
    next: {
      label: string;
      title: string;
    };
  };
};

export const syntheticEpisodeProjection: SyntheticEpisodeProjection = {
  title: "The Bridge That Was Built Twice",
  subtitle: "A synthetic episode projection for testing the future public HGO page model.",
  slug: "synthetic-episode",
  episodeNumber: "SYN-001",
  eyebrow: "Synthetic Projection Preview",
  heroVisualDescriptor:
    "A dusk mesa, a workbench of index cards, and a thin orange radio waveform crossing the horizon.",
  audio: {
    status: "placeholder",
    label: "Audio placeholder",
    durationLabel: "42 min draft target",
  },
  summary:
    "A made-up leadership story about a team that discovers the second version of a bridge matters more than the first: the one built in language, trust, and repair.",
  thesis:
    "A public episode page should carry the listener from promise to proof. This synthetic projection shows how Studio metadata can become story beats, voice cards, quotes, source notes, and recording context without exposing private draft machinery.",
  beats: [
    {
      label: "Chapter Region",
      title: "The map says cross here",
      summary:
        "The episode opens with a fake field team facing a practical crossing problem and an emotional one: nobody agrees what the crossing is really for.",
      sourceStructure: "chapter",
      timingHint: "00:00-08:00",
    },
    {
      label: "Episode Region",
      title: "The first bridge works, then fails",
      summary:
        "The crew builds the obvious solution and learns that completion is not the same as confidence.",
      sourceStructure: "episode",
      timingHint: "08:00-18:00",
    },
    {
      label: "Section Region",
      title: "A question under the bolts",
      summary:
        "A quiet question reframes the problem from engineering output to shared ownership.",
      sourceStructure: "section",
      timingHint: "18:00-27:00",
    },
    {
      label: "Episode Region",
      title: "The second bridge is a promise",
      summary:
        "The team rebuilds the plan around trust, maintenance, and the person who has to cross last.",
      sourceStructure: "episode",
      timingHint: "27:00-36:00",
    },
    {
      label: "Section Region",
      title: "What gets handed forward",
      summary:
        "The close turns the invented story into a portable lesson about handoff, record keeping, and the cost of unclear ownership.",
      sourceStructure: "section",
      timingHint: "36:00-42:00",
    },
  ],
  voiceCards: [
    {
      speaker: "Homer / Scott",
      label: "Source voice",
      summary:
        "Plainspoken field memory and practical judgment carry the core story. This card represents authored/source material without claiming legal authorship truth.",
      wordEstimate: 1180,
    },
    {
      speaker: "Charlie",
      label: "Editorial bridge",
      summary:
        "Charlie connects the synthetic story to the public promise, adds transitions, and calls out what a listener should watch for.",
      wordEstimate: 620,
    },
    {
      speaker: "Unassigned",
      label: "Needs cleanup",
      summary:
        "A small amount of draft material remains intentionally unassigned so the projection can show readiness cautions before real content is imported.",
      wordEstimate: 140,
    },
  ],
  pullQuotes: [
    {
      text: "A bridge is not finished when it reaches the other bank; it is finished when the last person trusts it.",
      attribution: "Synthetic narrator",
      semanticTag: "insight",
      citationStatus: "verified-synthetic",
    },
    {
      text: "The team had plans, tools, and weather reports. What they lacked was a shared definition of done.",
      attribution: "Synthetic episode draft",
      semanticTag: "story",
      citationStatus: "needs-verification-synthetic",
    },
    {
      text: "If the handoff only works for the person who wrote it, it is not a handoff yet.",
      attribution: "Synthetic recording note",
      semanticTag: "transition",
      citationStatus: "needs-source-synthetic",
    },
  ],
  citedSources: [
    {
      title: "Synthetic Field Notebook",
      sourceType: "Invented internal note",
      locator: "Notebook A, page 3",
      note: "Safe fake source used to test citation display.",
      status: "verified-synthetic",
    },
    {
      title: "Synthetic Safety Memo",
      sourceType: "Invented memo",
      locator: "Draft memo, section 2",
      note: "Needs verification state is visible for prototype behavior only.",
      status: "needs-verification-synthetic",
    },
    {
      title: "Synthetic Campfire Saying",
      sourceType: "Invented oral note",
      locator: "No locator",
      note: "Marked do-not-use to test public caution styling.",
      status: "do-not-use-synthetic",
    },
  ],
  relatedBookChapter: {
    title: "Synthetic Book Chapter: Handoff Is A Structure",
    summary:
      "A placeholder chapter relationship showing how an episode could point back to an approved book projection without exposing the manuscript source.",
    status: "synthetic-placeholder",
  },
  backstageNotes: [
    {
      label: "Recording watch",
      note: "Keep the first bridge practical and the second bridge emotional, or the metaphor gets too proud of itself.",
    },
    {
      label: "Citation watch",
      note: "Only one pull quote is synthetic-verified; the rest demonstrate why Studio quote review matters before publication.",
    },
    {
      label: "Projection watch",
      note: "This page should prove the public shape, not replace Studio as the editing surface.",
    },
  ],
  navigation: {
    previous: {
      label: "Previous synthetic projection",
      title: "The Road That Needed A Name",
    },
    next: {
      label: "Next synthetic projection",
      title: "The Lantern Test",
    },
  },
};
