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
  subtitle?: string;
  href: string;
  youtubeId: string;
  description: string;
  featured: boolean;
  pairingId: string;
  access?: "public" | "team" | "private" | "members";
  status?: string;
  views?: string[];
};

export const episodes: Episode[] = [
  {
    title: "Write It Down",
    subtitle: "Preface Pilot",
    href: "/docs/episodes/write-it-down",
    youtubeId: "96LN__TA-T8",
    description:
      "Scott and Charlie open the journey by explaining why a life is worth writing down, and why legacy begins with telling the truth about your own story.",
    featured: true,
    pairingId: "l2l-preface",
    access: "public",
    status: "published",
    views: ["skippy", "editor", "charlie"],
  },
  {
    title: "Look for Lessons",
    subtitle: "It's a Metaphor!",
    href: "/docs/episodes/look-for-lessons",
    youtubeId: "7Rn4rV2cLy4",
    description:
      "A first lesson in meaning, metaphor, and the discipline of testing the stories we tell against what is actually true.",
    featured: false,
    pairingId: "l2l-lessons",
    access: "public",
    status: "published",
    views: ["skippy", "editor", "charlie"],
  },
  {
    title: "Know Where You Came From",
    subtitle: "Chub and Jack",
    href: "/docs/episodes/know-where-you-came-from",
    youtubeId: "rf3L1xki_Nk",
    description:
      "An episode about ancestry, inherited stories, and the strength that comes from knowing where you came from.",
    featured: false,
    pairingId: "l2l-origins",
    access: "public",
    status: "published",
    views: ["skippy", "editor", "charlie"],
  },
];