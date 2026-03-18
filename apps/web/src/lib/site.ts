export const site = {
  title: "High Ground Odyssey",
  description:
    "Leadership, legacy, family, and the stories that shape us.",
  social: {
    facebook: "https://www.facebook.com/HighGroundOdyssey",
    instagram: "https://www.instagram.com/highgroundodyssey/",
    patreon: "https://www.patreon.com/c/HighGroundOdyssey",
  },
};

export type Episode = {
  title: string;
  href: string;
  youtubeId: string;
  description: string;
  featured: boolean;
};

export const episodes: Episode[] = [
  {
    title: "Preface Pilot Episode",
    href: "/docs/episode-001",
    youtubeId: "96LN__TA-T8",
    description:
      "The opening preface to Learning to Lead — why this story exists, and why it matters.",
    featured: true,
  },
  {
    title: "It’s a Metaphor!",
    href: "/docs/episode-002",
    youtubeId: "7Rn4rV2cLy4",
    description:
      "Finding life lessons in ordinary things, and learning to make good meaning.",
    featured: false,
  },
  {
    title: "In the Beginning",
    href: "/docs/episode-003",
    youtubeId: "rf3L1xki_Nk",
    description:
      "Family history, legacy, and the power of knowing where you came from.",
    featured: false,
  },
];