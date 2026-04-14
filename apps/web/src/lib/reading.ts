export type ReadingEntry = {
  title: string;
  subtitle?: string;
  href: string;
  description: string;
  pairingId: string;
  access?: "public" | "team" | "private" | "members";
  status?: string;
  views?: string[];
};

export const bookSections: ReadingEntry[] = [
  {
    title: "Preface",
    href: "/episodes/book/preface", // <-- Fixed
    description: "Scott and Charlie open the project by explaining why this book exists and why a life is worth writing down.",
    pairingId: "l2l-preface",
    access: "public",
    status: "published",
    views: ["skippy", "editor", "charlie"],
  },
  {
    title: "Introduction",
    subtitle: "Look for Lessons",
    href: "/episodes/book/introduction", // <-- Fixed
    description: "A chapter about learning to find wisdom in ordinary life, and about testing the meanings we make against what is true.",
    pairingId: "l2l-lessons",
    access: "public",
    status: "published",
    views: ["skippy", "editor", "charlie"],
  },
  {
    title: "In the Beginning",
    href: "/episodes/book/in-the-beginning", // <-- Fixed
    description: "A chapter about ancestry, family legend, and the power of knowing where you came from.",
    pairingId: "l2l-origins",
    access: "public",
    status: "published",
    views: ["skippy", "editor", "charlie"],
  },
];