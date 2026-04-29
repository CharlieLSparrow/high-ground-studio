import type { LayoutVariant } from "@/lib/layout-variant";

export type LayoutSurface =
  | "home"
  | "coaching"
  | "library"
  | "docs"
  | "episode";

export type LayoutPanelTreatment =
  | "standard"
  | "featured"
  | "featuredBadge";

export type LayoutTextTreatment =
  | "collectionKicker"
  | "featureLabel"
  | "body"
  | "bodyStrong"
  | "title"
  | "link"
  | "rail"
  | "heroKicker";

type VariantClassMap = Record<LayoutVariant, string>;

const layoutSurfaceBackgrounds: Record<LayoutSurface, VariantClassMap> = {
  home: {
    cinematic:
      "bg-[linear-gradient(180deg,#0d2328_0%,#16353a_20%,#2b4a43_42%,#7d5b34_72%,#f3eadb_100%)]",
    editorial:
      "bg-[linear-gradient(180deg,#1f1814_0%,#463326_28%,#7e5c39_62%,#f1e5d2_100%)]",
    signal:
      "bg-[linear-gradient(180deg,#0b1318_0%,#132127_28%,#223239_55%,#d9e1e3_100%)]",
  },
  coaching: {
    cinematic:
      "bg-[linear-gradient(180deg,#08171b_0%,#10272d_16%,#18383d_40%,#6f5636_78%,#f3eadb_100%)]",
    editorial:
      "bg-[linear-gradient(180deg,#17110d_0%,#3a2a21_24%,#765438_62%,#f1e5d2_100%)]",
    signal:
      "bg-[linear-gradient(180deg,#0b1216_0%,#131f26_20%,#1f2f37_48%,#dbe3e5_100%)]",
  },
  library: {
    cinematic:
      "bg-[linear-gradient(180deg,#0d2328_0%,#16353a_20%,#2b4a43_42%,#7d5b34_72%,#f3eadb_100%)]",
    editorial:
      "bg-[linear-gradient(180deg,#1b140f_0%,#453124_24%,#745336_64%,#f1e5d2_100%)]",
    signal:
      "bg-[linear-gradient(180deg,#0c1418_0%,#152228_22%,#23343d_55%,#dbe3e5_100%)]",
  },
  docs: {
    cinematic: "bg-gradient-to-b from-void via-void-light to-flora-light/20",
    editorial:
      "bg-[linear-gradient(180deg,#1a1410_0%,#433024_24%,#76563a_60%,#efe3cf_100%)]",
    signal:
      "bg-[linear-gradient(180deg,#0d1519_0%,#15242b_28%,#22343d_54%,#dbe3e5_100%)]",
  },
  episode: {
    cinematic:
      "bg-[linear-gradient(180deg,#0b2025_0%,#133238_16%,#22443f_38%,#6f5636_72%,#f3eadb_100%)]",
    editorial:
      "bg-[linear-gradient(180deg,#1a130f_0%,#402e23_24%,#735338_64%,#f0e4d0_100%)]",
    signal:
      "bg-[linear-gradient(180deg,#0c1519_0%,#14252d_22%,#243640_52%,#dce4e6_100%)]",
  },
};

const layoutPanelTreatments: Record<LayoutPanelTreatment, VariantClassMap> = {
  standard: {
    cinematic: "",
    editorial: "border-[rgba(255,244,225,0.16)] bg-[rgba(74,54,37,0.42)]",
    signal: "border-white/8 bg-[rgba(255,255,255,0.035)]",
  },
  featured: {
    cinematic: "",
    editorial: "border-[rgba(255,244,225,0.18)] bg-[rgba(77,57,39,0.45)]",
    signal: "border-white/12 bg-[rgba(255,255,255,0.04)]",
  },
  featuredBadge: {
    cinematic: "border border-flare/30 bg-flare/15 text-flare",
    editorial:
      "border border-[rgba(255,244,225,0.22)] bg-[rgba(255,244,225,0.08)] text-[rgba(255,244,225,0.9)]",
    signal: "border border-white/14 bg-white/6 text-[rgba(230,236,238,0.92)]",
  },
};

// What this does:
// These text tiers deliberately bias toward public readability over ultra-subtle
// mood. In screenshots, "slightly cinematic" survives; "beautiful but faint"
// does not. If the site later gets a more formal token system, this table is the
// seam to evolve instead of scattering contrast tweaks through page components.
const layoutTextTreatments: Record<LayoutTextTreatment, VariantClassMap> = {
  collectionKicker: {
    cinematic: "text-flare/78",
    editorial: "text-[rgba(245,239,230,0.8)]",
    signal: "text-[rgba(230,236,238,0.78)]",
  },
  featureLabel: {
    cinematic: "text-flare",
    editorial: "text-[rgba(255,244,225,0.78)]",
    signal: "text-[rgba(230,236,238,0.72)]",
  },
  body: {
    cinematic: "text-[rgba(245,239,230,0.9)]",
    editorial: "text-[rgba(245,239,230,0.9)]",
    signal: "text-[rgba(230,236,238,0.88)]",
  },
  bodyStrong: {
    cinematic: "text-[rgba(245,239,230,0.96)]",
    editorial: "text-[rgba(245,239,230,0.96)]",
    signal: "text-[rgba(230,236,238,0.92)]",
  },
  title: {
    cinematic: "text-subject",
    editorial: "text-subject",
    signal: "text-[var(--text-light)]",
  },
  link: {
    cinematic: "text-subject hover:text-flare",
    editorial: "text-subject hover:text-flare",
    signal: "text-[var(--text-light)] hover:text-white",
  },
  rail: {
    cinematic: "text-[rgba(255,184,112,0.94)]",
    editorial: "text-[rgba(255,244,225,0.84)]",
    signal: "text-[rgba(230,236,238,0.84)]",
  },
  heroKicker: {
    cinematic: "text-flare/88",
    editorial: "text-[rgba(245,239,230,0.82)]",
    signal: "text-flare/88",
  },
};

export function getLayoutSurfaceBackground(
  variant: LayoutVariant,
  surface: LayoutSurface,
) {
  return layoutSurfaceBackgrounds[surface][variant];
}

export function getLayoutPanelTreatment(
  variant: LayoutVariant,
  treatment: LayoutPanelTreatment,
) {
  return layoutPanelTreatments[treatment][variant];
}

export function getLayoutTextTreatment(
  variant: LayoutVariant,
  treatment: LayoutTextTreatment,
) {
  return layoutTextTreatments[treatment][variant];
}

export function getLayoutGlowEnabled(variant: LayoutVariant) {
  return variant !== "signal";
}
