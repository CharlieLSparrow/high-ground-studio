export {
  DEFAULT_PROJECT_SLUG,
  DEV_PROJECT_SLUG,
  HGO_PROJECT_SLUG,
  LEGACY_PROJECT_SLUG,
  STARTER_DEMO_PROJECT_SLUG,
  STUDIO_WORKSPACE_NAME,
  STUDIO_WORKSPACE_SLUG,
  createStudioProject,
  ensureStudioProjectDocument,
  ensureStudioWorkspace,
  humanizeProjectSlug,
  listStudioProjectOptions,
  normalizeProjectSlug,
  projectConfig,
  slugifyProjectName,
} from "@/lib/studio/project-registry";

export type {
  StudioProjectConfig,
  StudioProjectOption,
} from "@/lib/studio/project-registry";
