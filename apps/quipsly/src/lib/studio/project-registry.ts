export const STUDIO_WORKSPACE_SLUG = "tonight-pack";
export const STUDIO_WORKSPACE_NAME = "Quipsly Nest Workspace";

export const LEGACY_PROJECT_SLUG = "quipsly-live";
export const DEV_PROJECT_SLUG = "quipsly-dev-lab";
export const STARTER_DEMO_PROJECT_SLUG = "quipsly-starter-demo";
export const HGO_PROJECT_SLUG = "high-ground-odyssey-manuscript";
export const DEFAULT_PROJECT_SLUG = HGO_PROJECT_SLUG;

export type StudioProjectConfig = {
  slug: string;
  name: string;
  documentStableId: string;
  documentTitle: string;
  seedFromLatestSnapshot: boolean;
};

export type StudioProjectOption = {
  id: string;
  slug: string;
  name: string;
  documentTitle?: string | null;
  updatedAt?: Date | string | null;
};

type StudioPrismaClient = {
  studioWorkspace: {
    upsert: (args: any) => Promise<any>;
    findUnique?: (args: any) => Promise<any>;
  };
  studioProject: {
    create: (args: any) => Promise<any>;
    findFirst: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
    findUnique: (args: any) => Promise<any>;
  };
  studioDocument: {
    create: (args: any) => Promise<any>;
    findFirst: (args: any) => Promise<any>;
    findUnique: (args: any) => Promise<any>;
  };
};

const PROJECT_TEMPLATES: Record<string, Omit<StudioProjectConfig, "slug">> = {
  [HGO_PROJECT_SLUG]: {
    name: "High Ground Odyssey Manuscript",
    documentStableId: "doc-hgo-manuscript",
    documentTitle: "High Ground Odyssey Manuscript",
    seedFromLatestSnapshot: true,
  },
  [DEV_PROJECT_SLUG]: {
    name: "Quipsly Dev Lab",
    documentStableId: "doc-dev-lab",
    documentTitle: "Quipsly Dev Lab Manuscript",
    seedFromLatestSnapshot: false,
  },
  [STARTER_DEMO_PROJECT_SLUG]: {
    name: "Quipsly Starter Demo",
    documentStableId: "doc-quipsly-starter-demo",
    documentTitle: "Quipsly Starter Demo",
    seedFromLatestSnapshot: false,
  },
  [LEGACY_PROJECT_SLUG]: {
    name: "Quipsly Live Legacy",
    documentStableId: "doc-live",
    documentTitle: "High Ground Odyssey Tonight Pack",
    seedFromLatestSnapshot: true,
  },
};

export function slugifyProjectName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

export function normalizeProjectSlug(input?: string | null) {
  return slugifyProjectName(input ?? "") || DEFAULT_PROJECT_SLUG;
}

export function humanizeProjectSlug(value: string) {
  return normalizeProjectSlug(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function projectConfig(projectSlug = DEFAULT_PROJECT_SLUG): StudioProjectConfig {
  const slug = normalizeProjectSlug(projectSlug);
  const template = PROJECT_TEMPLATES[slug];

  if (template) {
    return {
      slug,
      ...template,
    };
  }

  const name = humanizeProjectSlug(slug);
  return {
    slug,
    name,
    documentStableId: `doc-${slug}`,
    documentTitle: `${name} Manuscript`,
    seedFromLatestSnapshot: false,
  };
}

export async function ensureStudioWorkspace(prisma: StudioPrismaClient) {
  return prisma.studioWorkspace.upsert({
    where: { slug: STUDIO_WORKSPACE_SLUG },
    update: {
      name: STUDIO_WORKSPACE_NAME,
    },
    create: {
      slug: STUDIO_WORKSPACE_SLUG,
      name: STUDIO_WORKSPACE_NAME,
    },
  });
}

export async function ensureStudioProjectDocument(
  prisma: StudioPrismaClient,
  projectSlug = DEFAULT_PROJECT_SLUG,
  options: {
    name?: string;
    documentTitle?: string;
  } = {},
) {
  const config = projectConfig(projectSlug);
  const workspace = await ensureStudioWorkspace(prisma);

  const existingProject = await prisma.studioProject.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: config.slug } },
  });

  const project = existingProject ?? await prisma.studioProject.create({
    data: {
      workspaceId: workspace.id,
      slug: config.slug,
      name: options.name?.trim() || config.name,
    },
  });

  const document = await prisma.studioDocument.findUnique({
    where: { stableId: config.documentStableId },
  }) ?? await prisma.studioDocument.findFirst({
    where: { projectId: project.id },
    orderBy: { updatedAt: "desc" },
  }) ?? await prisma.studioDocument.create({
    data: {
      projectId: project.id,
      stableId: config.documentStableId,
      title: options.documentTitle?.trim() || config.documentTitle,
    },
  });

  return {
    config,
    workspace,
    project,
    document,
  };
}

export async function createStudioProject(
  prisma: StudioPrismaClient,
  input: {
    name: string;
    documentTitle?: string;
  },
) {
  const workspace = await ensureStudioWorkspace(prisma);
  const baseSlug = slugifyProjectName(input.name) || "untitled-project";
  let slug = baseSlug;
  let suffix = 2;

  while (await prisma.studioProject.findUnique({ where: { workspaceId_slug: { workspaceId: workspace.id, slug } } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return ensureStudioProjectDocument(prisma, slug, {
    name: input.name,
    documentTitle: input.documentTitle || `${input.name} Manuscript`,
  });
}

export async function listStudioProjectOptions(prisma: StudioPrismaClient): Promise<StudioProjectOption[]> {
  const projects = await prisma.studioProject.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      updatedAt: true,
      documents: {
        select: {
          title: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return projects.map((project) => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    documentTitle: project.documents?.[0]?.title ?? null,
    updatedAt: project.updatedAt,
  }));
}
