export type QuipslyArtRole =
  | "librarian"
  | "scribe"
  | "producer"
  | "quote-curator"
  | "publisher"
  | "teacher"
  | "gallery-guide";

export type QuipslyArtBriefInput = {
  readonly role?: QuipslyArtRole | string;
  readonly subject?: string;
  readonly mood?: string;
  readonly surface?: string;
};

export type QuipslyArtRoleRecipe = {
  readonly label: string;
  readonly prompt: string;
};

export type QuipslyArtBrief = {
  readonly version: 1;
  readonly createdAt: string;
  readonly role: QuipslyArtRole;
  readonly roleLabel: string;
  readonly subject: string;
  readonly mood: string;
  readonly surface: string;
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly recommendedSize: "1254x1254";
  readonly manifestPath: string;
  readonly ingestTargets: readonly string[];
  readonly comfyUi: {
    readonly note: string;
    readonly defaultLocalUrl: string;
  };
};

export const QUIPSLY_ART_STYLE_BASE =
  "warm storybook illustration, friendly sparrow-like Quipsly mascot, expressive eyes, cozy parchment palette, handmade texture, soft lantern light, charming useful details, no photorealism";

export const QUIPSLY_ART_NEGATIVE_PROMPT =
  "scary, aggressive, uncanny, extra limbs, broken wings, distorted face, unreadable text, watermark, logo artifacts, harsh neon, photorealistic human, corporate clipart";

export const QUIPSLY_ART_ROLE_RECIPES: Record<QuipslyArtRole, QuipslyArtRoleRecipe> = {
  librarian: {
    label: "Research Librarian",
    prompt:
      "Quipsly research librarian with round glasses, notebook, tiny index cards, source citations, old books, warm library desk, curious and trustworthy",
  },
  scribe: {
    label: "Writing Scribe",
    prompt:
      "tiny Quipsly writing with a feather pen on parchment, manuscript pages, gentle focus, helpful but not authoring for the human",
  },
  producer: {
    label: "Podcast Producer",
    prompt:
      "two Quipsly podcast producers with microphones, camera, laptop, show notes, cozy recording desk, collaborative and excited",
  },
  "quote-curator": {
    label: "Quote Curator",
    prompt:
      "Quipsly quote curator sorting quote cards, labeled drawers, magnifying glass, attribution notes, warm archive",
  },
  publisher: {
    label: "Publishing Messenger",
    prompt:
      "Quipsly messenger preparing publish packets, envelopes, tiny satchel, destination labels, careful and organized",
  },
  teacher: {
    label: "Course Teacher",
    prompt:
      "Quipsly teacher preparing flashcards, lesson cards, quiz notes, little chalkboard, patient and joyful",
  },
  "gallery-guide": {
    label: "Gallery Guide",
    prompt:
      "Quipsly gallery guide arranging photo proofs, selection cards, client notes, warm studio table",
  },
};

export function normalizeQuipslyArtRole(role: string | null | undefined): QuipslyArtRole {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(QUIPSLY_ART_ROLE_RECIPES, normalized)) {
    return normalized as QuipslyArtRole;
  }
  return "librarian";
}

export function createQuipslyArtBrief(input: QuipslyArtBriefInput = {}, now = new Date()): QuipslyArtBrief {
  const role = normalizeQuipslyArtRole(input.role);
  const roleRecipe = QUIPSLY_ART_ROLE_RECIPES[role];
  const subject = String(input.subject || "helping a creator organize source material").trim();
  const mood = String(input.mood || "curious, cheerful, useful").trim();
  const surface = String(input.surface || "Quipsly").trim();

  return {
    version: 1,
    createdAt: now.toISOString(),
    role,
    roleLabel: roleRecipe.label,
    subject,
    mood,
    surface,
    prompt: [
      QUIPSLY_ART_STYLE_BASE,
      roleRecipe.prompt,
      `specific subject: ${subject}`,
      `mood: ${mood}`,
      `intended surface: ${surface}`,
      "square composition, clear mascot silhouette, enough empty space for product copy if needed",
    ].join(", "),
    negativePrompt: QUIPSLY_ART_NEGATIVE_PROMPT,
    recommendedSize: "1254x1254",
    manifestPath: "packages/quipsly-domain/src/generated-art.ts",
    ingestTargets: [
      "apps/quipsly/public/images/quipsly-generated",
      "apps/quiplore/public/images/quipsly-generated",
    ],
    comfyUi: {
      note:
        "Use this prompt in the local ComfyUI workflow. After export, ingest the approved PNG and add a named manifest entry.",
      defaultLocalUrl: "http://127.0.0.1:8188",
    },
  };
}
