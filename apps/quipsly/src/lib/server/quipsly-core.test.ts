import {
  createWorkflowJob,
  createNestWithOwner,
  QuipslyNestCreateIdentityConflictError,
} from "@/lib/server/quipsly-core";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { ensureStudioProjectOwnerGrant } from "@/lib/server/studio-project-access";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/invite-login-token", () => ({ createInviteLoginToken: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({
  ensureHomeNestForEmail: jest.fn(),
  listProjectsVisibleToEmail: jest.fn(),
}));
jest.mock("@/lib/server/quipsly-onboarding", () => ({
  ensureQuipslyStarterStateForUser: jest.fn(),
}));
jest.mock("@/lib/server/studio-user-identity", () => ({
  ensureInvitedStudioUserByEmail: jest.fn(),
}));
jest.mock("@/lib/server/prisma-advisory-lock", () => ({
  acquirePrismaAdvisoryTransactionLock: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  ensureStudioProjectOwnerGrant: jest.fn(),
  normalizeAccessEmail: (value?: string | null) => (value || "").trim().toLowerCase(),
  resolveStudioProjectAccess: jest.fn(),
}));
jest.mock("@/lib/studio/live-work-nests", () => ({ LIVE_WORK_NESTS: [] }));
jest.mock("@/lib/studio/project-registry", () => ({
  defaultDocumentTitleForNest: (name: string) => `${name} Original Content Document`,
  ensureStudioWorkspace: jest.fn(async () => ({ id: "workspace-1" })),
  nestKindFromSourceLabel: (value?: string | null) => String(value || "").includes("production")
    ? "production"
    : "writing",
  normalizeNestKind: (value?: string | null) => String(value || "writing").trim().toLowerCase() || "writing",
  normalizeProjectSlug: (value?: string | null) => String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, ""),
  projectConfig: (slug: string) => ({ documentStableId: `doc-${slug}` }),
  slugifyProjectName: (value: string) => value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, ""),
  STUDIO_WORKSPACE_SLUG: "workspace",
}));

type PriorReceipt = {
  id: string;
  payloadJson: Record<string, unknown>;
  project: Record<string, unknown>;
  document: Record<string, unknown>;
} | null;

function prismaHarness({
  existingSlugs = [],
  priorReceipt = null,
}: {
  existingSlugs?: string[];
  priorReceipt?: PriorReceipt;
} = {}) {
  const slugs = new Set(existingSlugs);
  const transaction = {
    studioProject: {
      findUnique: jest.fn(async ({ where }: any) => {
        const slug = where?.workspaceId_slug?.slug;
        return slug && slugs.has(slug) ? { id: `existing-${slug}` } : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        slugs.add(data.slug);
        return {
          id: "project-created",
          slug: data.slug,
          name: data.name,
          sourceLabel: data.sourceLabel,
          isPrivate: data.isPrivate,
        };
      }),
    },
    studioDocument: {
      create: jest.fn(async ({ data }: any) => ({
        id: "document-created",
        stableId: data.stableId,
        title: data.title,
      })),
    },
    studioDocumentBlock: {
      createMany: jest.fn(async () => ({ count: 2 })),
    },
    studioDocumentOperation: {
      findFirst: jest.fn(async () => priorReceipt),
      create: jest.fn(async () => ({ id: "receipt-created" })),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  };
  return { prisma, transaction };
}

describe("createNestWithOwner ownership and replay boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allocates a new slug instead of reopening an existing human-readable project", async () => {
    const { prisma, transaction } = prismaHarness({ existingSlugs: ["episode-nine"] });

    const result = await createNestWithOwner({
      name: "Episode Nine",
      nestKind: "production",
      ownerEmail: " Owner@Example.com ",
      clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
      prisma: prisma as never,
    });

    expect(result).toMatchObject({
      nest: { id: "project-created", slug: "episode-nine-2", name: "Episode Nine" },
      document: { id: "document-created", stableId: "doc-episode-nine-2" },
      idempotentReplay: false,
      receiptId: "receipt-created",
    });
    expect(transaction.studioProject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: "episode-nine-2",
        name: "Episode Nine",
        isPrivate: true,
      }),
    });
    expect(ensureStudioProjectOwnerGrant).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-created",
      ownerEmail: "owner@example.com",
      createdByEmail: "owner@example.com",
    }));
    expect(acquirePrismaAdvisoryTransactionLock).toHaveBeenCalledTimes(2);
  });

  it("returns the original project for an exact client retry without another write", async () => {
    const priorReceipt = {
      id: "receipt-prior",
      payloadJson: {
        name: "Episode Nine",
        nestKind: "production",
        documentTitle: "Episode Nine Original Content Document",
        ownerEmail: "owner@example.com",
        description: null,
      },
      project: {
        id: "project-prior",
        slug: "episode-nine",
        name: "Episode Nine",
        sourceLabel: "nest-kind:production",
      },
      document: {
        id: "document-prior",
        stableId: "doc-episode-nine",
        title: "Episode Nine Original Content Document",
      },
    };
    const { prisma, transaction } = prismaHarness({ priorReceipt });

    const result = await createNestWithOwner({
      name: "Episode Nine",
      nestKind: "production",
      ownerEmail: "owner@example.com",
      clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
      prisma: prisma as never,
    });

    expect(result).toMatchObject({
      nest: { id: "project-prior", slug: "episode-nine" },
      document: { id: "document-prior" },
      idempotentReplay: true,
      receiptId: "receipt-prior",
    });
    expect(transaction.studioProject.create).not.toHaveBeenCalled();
    expect(transaction.studioDocument.create).not.toHaveBeenCalled();
  });

  it("holds a reused client identity when its project request differs", async () => {
    const { prisma } = prismaHarness({
      priorReceipt: {
        id: "receipt-prior",
        payloadJson: {
          name: "Original project",
          nestKind: "writing",
          documentTitle: "Original project Original Content Document",
          ownerEmail: "owner@example.com",
          description: null,
        },
        project: {
          id: "project-prior",
          slug: "original-project",
          name: "Original project",
          sourceLabel: "nest-kind:writing",
        },
        document: {
          id: "document-prior",
          stableId: "doc-original-project",
          title: "Original project Original Content Document",
        },
      },
    });

    await expect(createNestWithOwner({
      name: "Different project",
      nestKind: "writing",
      ownerEmail: "owner@example.com",
      clientRequestId: "123e4567-e89b-42d3-a456-426614174000",
      prisma: prisma as never,
    })).rejects.toBeInstanceOf(QuipslyNestCreateIdentityConflictError);
  });

  it("rejects names that cannot produce a private project slug", async () => {
    const { prisma } = prismaHarness();

    await expect(createNestWithOwner({
      name: "!!!",
      ownerEmail: "owner@example.com",
      prisma: prisma as never,
    })).rejects.toThrow("readable name");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("createWorkflowJob synchronous registration receipts", () => {
  it("records an already-attached asset as completed instead of queueing nonexistent work", async () => {
    const create = jest.fn(async ({ data }: any) => ({
      id: "job-register-1",
      ...data,
      error: null,
    }));

    const result = await createWorkflowJob({
      type: "asset-register",
      source: "recording-media-promotion",
      projectId: "project-1",
      assetId: "asset-1",
      inputJson: { sourceId: "source-1" },
      prisma: { studioWorkflowJob: { create } } as never,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "asset-register",
        status: "completed",
        startedAt: expect.any(Date),
        completedAt: expect.any(Date),
        inputJson: { sourceId: "source-1" },
        resultJson: {
          schema: "quipsly-asset-registration-receipt-v1",
          state: "completed",
          assetId: "asset-1",
          projectId: "project-1",
          source: "recording-media-promotion",
          completedSynchronously: true,
          originalRemainsSourceTruth: true,
        },
      }),
    });
    const data = create.mock.calls[0]?.[0]?.data;
    expect(data.startedAt).toEqual(data.completedAt);
    expect(result).toMatchObject({
      id: "job-register-1",
      type: "asset-register",
      status: "completed",
      assetId: "asset-1",
      result: {
        schema: "quipsly-asset-registration-receipt-v1",
        state: "completed",
      },
    });
  });

  it("leaves real asynchronous work on the database queue default", async () => {
    const create = jest.fn(async ({ data }: any) => ({
      id: "job-proxy-1",
      ...data,
      status: "queued",
      resultJson: null,
      startedAt: null,
      completedAt: null,
      error: null,
    }));

    const result = await createWorkflowJob({
      type: "asset-proxy",
      source: "recording-media-promotion",
      assetId: "asset-video-1",
      prisma: { studioWorkflowJob: { create } } as never,
    });

    const data = create.mock.calls[0]?.[0]?.data;
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("startedAt");
    expect(data).not.toHaveProperty("completedAt");
    expect(result.status).toBe("queued");
  });
});
