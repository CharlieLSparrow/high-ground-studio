export type GeneratedQuipslyArtRole =
  | "hero"
  | "research"
  | "writing"
  | "publishing"
  | "quote"
  | "podcast"
  | "founders"
  | "generator";

export type GeneratedQuipslyArt = {
  readonly id: string;
  readonly src: string;
  readonly alt: string;
  readonly title: string;
  readonly role: GeneratedQuipslyArtRole;
  readonly promptSeed: string;
};

export type GeneratedQuipslyArtManifest = {
  readonly version: 1;
  readonly generatedAt: string;
  readonly count: number;
  readonly roles: readonly GeneratedQuipslyArtRole[];
  readonly assets: readonly GeneratedQuipslyArt[];
};

const generatedPath = "/images/quipsly-generated";

export const generatedQuipslyArt: readonly GeneratedQuipslyArt[] = [
  {
    id: "curious-librarian",
    src: `${generatedPath}/quipsly-generated-01.png`,
    alt: "A warm Quipsly librarian writing wisdom notes by lantern light.",
    title: "The Curious Librarian",
    role: "hero",
    promptSeed: "cozy sparrow research librarian, warm lantern desk, wisdom notes, storybook illustration",
  },
  {
    id: "tiny-scribe",
    src: `${generatedPath}/quipsly-generated-08.png`,
    alt: "A tiny Quipsly lying on parchment and writing with a feather.",
    title: "The Tiny Scribe",
    role: "writing",
    promptSeed: "small friendly bird mascot writing with quill on parchment, warm cream background",
  },
  {
    id: "playwright-scribe",
    src: `${generatedPath}/quipsly-generated-16.png`,
    alt: "A Quipsly dressed like an old playwright holding a quill and scroll.",
    title: "The Playwright Scribe",
    role: "writing",
    promptSeed: "storybook bird mascot as a renaissance playwright, quill, scroll, expressive friendly face",
  },
  {
    id: "quip-lore-curators",
    src: `${generatedPath}/quipsly-generated-23.png`,
    alt: "Two Quipslys curating quote cards and wisdom notes in a library.",
    title: "The QuipLore Curators",
    role: "quote",
    promptSeed: "two friendly sparrow librarians curating quote cards in warm storybook archive",
  },
  {
    id: "podcast-producers",
    src: `${generatedPath}/quipsly-generated-24.png`,
    alt: "Two Quipslys recording a podcast with microphones, camera gear, and notebooks.",
    title: "The Podcast Producers",
    role: "podcast",
    promptSeed: "two friendly bird podcast producers, microphones, camera, laptop, warm studio desk",
  },
  {
    id: "generated-02",
    src: `${generatedPath}/quipsly-generated-02.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 02",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-03",
    src: `${generatedPath}/quipsly-generated-03.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 03",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-04",
    src: `${generatedPath}/quipsly-generated-04.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 04",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-05",
    src: `${generatedPath}/quipsly-generated-05.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 05",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-06",
    src: `${generatedPath}/quipsly-generated-06.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 06",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-07",
    src: `${generatedPath}/quipsly-generated-07.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 07",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-09",
    src: `${generatedPath}/quipsly-generated-09.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 09",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-10",
    src: `${generatedPath}/quipsly-generated-10.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 10",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-11",
    src: `${generatedPath}/quipsly-generated-11.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 11",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-12",
    src: `${generatedPath}/quipsly-generated-12.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 12",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-13",
    src: `${generatedPath}/quipsly-generated-13.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 13",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-14",
    src: `${generatedPath}/quipsly-generated-14.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 14",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-15",
    src: `${generatedPath}/quipsly-generated-15.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 15",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-17",
    src: `${generatedPath}/quipsly-generated-17.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 17",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-18",
    src: `${generatedPath}/quipsly-generated-18.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 18",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-19",
    src: `${generatedPath}/quipsly-generated-19.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 19",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-20",
    src: `${generatedPath}/quipsly-generated-20.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 20",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-21",
    src: `${generatedPath}/quipsly-generated-21.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 21",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
  {
    id: "generated-22",
    src: `${generatedPath}/quipsly-generated-22.png`,
    alt: "A generated Quipsly character study from the beta art batch.",
    title: "Quipsly Character Study 22",
    role: "generator",
    promptSeed: "Quipsly mascot character study, warm storybook illustration",
  },
];

export function getGeneratedQuipslyArt(id: string) {
  return generatedQuipslyArt.find((item) => item.id === id) ?? generatedQuipslyArt[0]!;
}

export function getGeneratedQuipslyArtByRole(role: GeneratedQuipslyArtRole) {
  return generatedQuipslyArt.filter((item) => item.role === role);
}

export function listGeneratedQuipslyArtRoles() {
  return Array.from(new Set(generatedQuipslyArt.map((item) => item.role))).sort() as GeneratedQuipslyArtRole[];
}

export function createGeneratedQuipslyArtManifest(now = new Date()): GeneratedQuipslyArtManifest {
  return {
    version: 1,
    generatedAt: now.toISOString(),
    count: generatedQuipslyArt.length,
    roles: listGeneratedQuipslyArtRoles(),
    assets: generatedQuipslyArt,
  };
}
