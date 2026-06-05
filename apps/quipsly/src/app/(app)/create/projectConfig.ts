export {
  DEFAULT_PROJECT_SLUG,
  DEV_PROJECT_SLUG,
  HGO_PROJECT_SLUG,
  LEGACY_PROJECT_SLUG,
  OWNER_PROJECT_SLUG,
  STARTER_DEMO_PROJECT_SLUG,
  STUDIO_WORKSPACE_NAME,
  STUDIO_WORKSPACE_SLUG,
  createStudioProject,
  lookupStudioProjectDocument,
  ensureStudioWorkspace,
  humanizeProjectSlug,
  listStudioProjectOptions,
  nestKindFromSourceLabel,
  normalizeProjectSlug,
  requireProjectSlug,
  resolveProjectSlug,
  projectConfig,
  slugifyProjectName,
} from "@/lib/studio/project-registry";

export type {
  StudioNestKind,
  StudioProjectConfig,
  StudioProjectOption,
} from "@/lib/studio/project-registry";
