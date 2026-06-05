export const STUDIO_WORKSPACE_SLUG = "tonight-pack";
export const STUDIO_WORKSPACE_NAME = "Quipsly Nest Workspace";

export const LEGACY_PROJECT_SLUG = "quipsly-live";
export const DEV_PROJECT_SLUG = "quipsly-dev-lab";
export const STARTER_DEMO_PROJECT_SLUG = "quipsly-starter-demo";
export const HGO_PROJECT_SLUG = "high-ground-odyssey-manuscript";
export const OWNER_PROJECT_SLUG = HGO_PROJECT_SLUG;

// Keep a non-customer fallback for legacy dev-only surfaces that still call
// projectConfig() without a slug. Customer-facing routes should require a Nest
// explicitly and redirect to /projects when one is missing.
export const DEFAULT_PROJECT_SLUG = DEV_PROJECT_SLUG;

export type StudioProjectConfig = {
  slug: string;
  name: string;
  documentStableId: string;
  documentTitle: string;
  seedFromLatestSnapshot: boolean;
  nestKind: StudioNestKind;
};

export type StudioProjectOption = {
  id: string;
  slug: string;
  name: string;
  documentTitle?: string | null;
  nestKind: StudioNestKind;
  updatedAt?: Date | string | null;
};

export type StudioNestKind =
  | "writing"
  | "study"
  | "production"
  | "research"
  | "course"
  | "gallery"
  | "fiction"
  | "mixed";

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
    update?: (args: any) => Promise<any>;
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
    nestKind: "writing",
  },
  [DEV_PROJECT_SLUG]: {
    name: "Quipsly Dev Lab",
    documentStableId: "doc-dev-lab",
    documentTitle: "Quipsly Dev Lab Manuscript",
    seedFromLatestSnapshot: false,
    nestKind: "mixed",
  },
  [STARTER_DEMO_PROJECT_SLUG]: {
    name: "Quipsly Starter Demo",
    documentStableId: "doc-quipsly-starter-demo",
    documentTitle: "Quipsly Starter Demo",
    seedFromLatestSnapshot: false,
    nestKind: "study",
  },
  [LEGACY_PROJECT_SLUG]: {
    name: "Quipsly Live Legacy",
    documentStableId: "doc-live",
    documentTitle: "High Ground Odyssey Tonight Pack",
    seedFromLatestSnapshot: true,
    nestKind: "writing",
  },
};

export const NEST_KIND_LABELS: Record<StudioNestKind, string> = {
  writing: "Writing Nest",
  study: "Study Nest",
  production: "Production Nest",
  research: "Research Nest",
  course: "Course Nest",
  gallery: "Gallery Nest",
  fiction: "Fiction Nest",
  mixed: "Mixed Nest",
};

export function normalizeNestKind(input?: string | null): StudioNestKind {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "book" || value === "article" || value === "talk" || value === "podcast") return "writing";
  if (value === "study-notes" || value === "study notes" || value === "source-library" || value === "source library") return "study";
  if (value === "media" || value === "episode-production" || value === "episode production") return "production";
  if (value === "research-packet" || value === "research packet") return "research";
  if (value === "blank") return "writing";
  if (["writing", "study", "production", "research", "course", "gallery", "fiction", "mixed"].includes(value)) {
    return value as StudioNestKind;
  }
  return "writing";
}

export function sourceLabelForNestKind(kind: StudioNestKind) {
  return `nest-kind:${kind}`;
}

export function nestKindFromSourceLabel(sourceLabel?: string | null): StudioNestKind {
  const match = String(sourceLabel ?? "").match(/nest-kind:([a-z-]+)/i);
  return normalizeNestKind(match?.[1]);
}

export function defaultDocumentTitleForNest(name: string, kind: StudioNestKind) {
  if (kind === "study") return `${name} Study Document`;
  if (kind === "production") return `${name} Production Document`;
  if (kind === "research") return `${name} Research Packet`;
  if (kind === "course") return `${name} Course Source`;
  if (kind === "gallery") return `${name} Gallery Notes`;
  if (kind === "fiction") return `${name} Story Bible`;
  return `${name} Original Content Document`;
}

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
  return slugifyProjectName(input ?? "");
}

export function resolveProjectSlug(input?: string | null, fallback = DEFAULT_PROJECT_SLUG) {
  return normalizeProjectSlug(input) || fallback;
}

export function requireProjectSlug(input?: string | null, label = "Project") {
  const slug = normalizeProjectSlug(input);
  if (!slug) throw new Error(`${label} requires an explicit Nest/project slug.`);
  return slug;
}

export function humanizeProjectSlug(value: string) {
  return resolveProjectSlug(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function projectConfig(projectSlug = DEFAULT_PROJECT_SLUG): StudioProjectConfig {
  const slug = resolveProjectSlug(projectSlug);
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
    documentTitle: defaultDocumentTitleForNest(name, "writing"),
    seedFromLatestSnapshot: false,
    nestKind: "writing",
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

export async function lookupStudioProjectDocument(
  prisma: StudioPrismaClient,
  projectSlug = DEFAULT_PROJECT_SLUG
) {
  const config = projectConfig(projectSlug);
  const workspace = await ensureStudioWorkspace(prisma);

  const existingProject = await prisma.studioProject.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: config.slug } },
  });

  if (!existingProject) {
    throw new Error(`Project ${config.slug} not found. Please create it first.`);
  }

  const document = await prisma.studioDocument.findUnique({
    where: { stableId: config.documentStableId },
  }) ?? await prisma.studioDocument.findFirst({
    where: { projectId: existingProject.id },
    orderBy: { updatedAt: "desc" },
  });

  if (!document) {
    throw new Error(`No document found for project ${config.slug}.`);
  }

  return {
    config,
    workspace,
    project: existingProject,
    document,
  };
}

export async function createStudioProject(
  prisma: StudioPrismaClient,
  input: {
    name: string;
    documentTitle?: string;
    nestKind?: StudioNestKind | string;
  },
) {
  const workspace = await ensureStudioWorkspace(prisma);
  const baseSlug = slugifyProjectName(input.name) || "untitled-project";
  const nestKind = normalizeNestKind(input.nestKind);
  let slug = baseSlug;
  let suffix = 2;

  while (await prisma.studioProject.findUnique({ where: { workspaceId_slug: { workspaceId: workspace.id, slug } } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const project = await prisma.studioProject.create({
    data: {
      workspaceId: workspace.id,
      slug,
      name: input.name,
      sourceLabel: sourceLabelForNestKind(nestKind),
      documents: {
        create: {
          stableId: `doc-${slug}`,
          title: input.documentTitle || defaultDocumentTitleForNest(input.name, nestKind),
        },
      },
    },
    include: { documents: true },
  });

  return { workspace, project, document: project.documents[0] };
}

export async function listStudioProjectOptions(prisma: StudioPrismaClient): Promise<StudioProjectOption[]> {
  const projects = await prisma.studioProject.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      sourceLabel: true,
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
    nestKind: nestKindFromSourceLabel(project.sourceLabel),
    updatedAt: project.updatedAt,
  }));
}
