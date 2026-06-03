export const LEGACY_PROJECT_SLUG = "quipsly-live";
export const DEV_PROJECT_SLUG = "quipsly-dev-lab";
export const STARTER_DEMO_PROJECT_SLUG = "quipsly-starter-demo";
export const HGO_PROJECT_SLUG = "high-ground-odyssey-manuscript";
export const DEFAULT_PROJECT_SLUG = DEV_PROJECT_SLUG;

export function projectConfig(projectSlug = DEFAULT_PROJECT_SLUG) {
  if (projectSlug === STARTER_DEMO_PROJECT_SLUG) {
    return {
      slug: STARTER_DEMO_PROJECT_SLUG,
      name: "Quipsly Starter Demo",
      documentStableId: "doc-quipsly-starter-demo",
      documentTitle: "Quipsly Starter Demo",
      seedFromLatestSnapshot: false,
    };
  }

  if (projectSlug === HGO_PROJECT_SLUG) {
    return {
      slug: HGO_PROJECT_SLUG,
      name: "High Ground Odyssey Manuscript",
      documentStableId: "doc-hgo-manuscript",
      documentTitle: "High Ground Odyssey Manuscript",
      seedFromLatestSnapshot: true,
    };
  }

  if (projectSlug === LEGACY_PROJECT_SLUG) {
    return {
      slug: LEGACY_PROJECT_SLUG,
      name: "Quipsly Live Legacy",
      documentStableId: "doc-live",
      documentTitle: "High Ground Odyssey Tonight Pack",
      seedFromLatestSnapshot: true,
    };
  }

  return {
    slug: DEV_PROJECT_SLUG,
    name: "Quipsly Dev Lab",
    documentStableId: "doc-dev-lab",
    documentTitle: "Quipsly Dev Lab Manuscript",
    seedFromLatestSnapshot: false,
  };
}
