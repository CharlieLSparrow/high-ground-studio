/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET, POST } from "./route";

jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

const runLocalDatabaseSmoke =
  process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;

if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for the episode collaboration smoke.",
    );
  }
  const database = new URL(process.env.QUIPSLY_LOCAL_DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)) {
    throw new Error("Conversation integration tests require a local disposable database.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/nest-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(projectSlug: string, episodeSlug: string) {
  const url = new URL("http://localhost/api/nest-chat");
  url.searchParams.set("projectSlug", projectSlug);
  url.searchParams.set("episodeSlug", episodeSlug);
  return new NextRequest(url);
}

runLocalDatabaseSmoke("episode collaboration local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const projectSlug = `episode-chat-${nonce}`;
  const episodeSlug = "retained-decision-thread";
  const editorEmail = `episode-chat-editor-${nonce}@example.test`;
  const viewerEmail = `episode-chat-viewer-${nonce}@example.test`;
  const outsiderEmail = `episode-chat-outsider-${nonce}@example.test`;
  const clientMessageId = randomUUID();
  let workspaceId = "";
  let projectId = "";

  beforeAll(async () => {
    const [editor, viewer, outsider] = await Promise.all([
      prisma.user.create({
        data: { primaryEmail: editorEmail, name: "Episode Chat Editor QA" },
      }),
      prisma.user.create({
        data: { primaryEmail: viewerEmail, name: "Episode Chat Viewer QA" },
      }),
      prisma.user.create({
        data: { primaryEmail: outsiderEmail, name: "Episode Chat Outsider QA" },
      }),
    ]);
    const workspace = await prisma.studioWorkspace.create({
      data: {
        slug: `episode-chat-workspace-${nonce}`,
        name: "Episode Chat QA",
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: {
        workspaceId,
        slug: projectSlug,
        name: "Episode Chat QA Nest",
      },
    });
    projectId = project.id;
    await prisma.studioProjectAccessGrant.createMany({
      data: [
        {
          projectId,
          email: editorEmail,
          role: "EDITOR",
          status: "ACTIVE",
          createdByUserId: editor.id,
          createdByEmail: editorEmail,
        },
        {
          projectId,
          email: viewerEmail,
          role: "VIEWER",
          status: "ACTIVE",
          createdByUserId: editor.id,
          createdByEmail: editorEmail,
        },
      ],
    });
    const document = await prisma.studioDocument.create({
      data: {
        projectId,
        stableId: `episode-chat-document-${nonce}`,
        title: "Episode collaboration QA",
      },
    });
    await prisma.studioEpisodeProduction.create({
      data: {
        projectId,
        documentId: document.id,
        slug: episodeSlug,
        title: "Episode collaboration QA",
        boundaryLabel: "Episode collaboration QA",
        status: "READY_TO_RECORD",
        productionJson: {},
      },
    });
    expect(outsider.primaryEmail).toBe(outsiderEmail);
  });

  afterAll(async () => {
    try {
      if (workspaceId) {
        await prisma.studioWorkspace.delete({
          where: { id: workspaceId },
        });
      }
      await prisma.user.deleteMany({
        where: {
          primaryEmail: {
            in: [editorEmail, viewerEmail, outsiderEmail],
          },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("converges simultaneous first loads onto one empty thread without demo messages", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "episode-chat-editor",
        primaryEmail: editorEmail,
        name: "Episode Chat Editor QA",
      },
    } as never);

    const responses = await Promise.all(
      Array.from({ length: 12 }, () => GET(get(projectSlug, episodeSlug))),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);

    const threads = await prisma.studioNestChatThread.findMany({
      where: { projectId, key: `episode:${episodeSlug}` },
      select: { id: true },
    });
    expect(threads).toHaveLength(1);

    const messages = await prisma.studioNestChatMessage.findMany({
      where: {
        projectId,
        threadId: threads[0]?.id,
      },
      select: { id: true },
    });
    expect(messages).toHaveLength(0);
  });

  it("persists one exact episode message and deduplicates the retry", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "episode-chat-editor",
        primaryEmail: editorEmail,
        name: "Episode Chat Editor QA",
      },
    } as never);
    const body = {
      projectSlug,
      episodeSlug,
      body: "QA decision: cue the saved range after the opening question.",
      clientMessageId,
      clientSurface: "capture-ios",
    };

    const first = await POST(post(body));
    const retry = await POST(post(body));
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      ok: true,
      idempotentReplay: true,
    });

    const messages = await prisma.studioNestChatMessage.findMany({
      where: {
        projectId,
        authorEmail: editorEmail,
      },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      body: body.body,
      metadataJson: {
        source: "capture-ios",
        episodeSlug,
        clientMessageId,
      },
    });
  });

  it("lets a Viewer read the canonical thread but never author it", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "episode-chat-viewer",
        primaryEmail: viewerEmail,
        name: "Episode Chat Viewer QA",
      },
    } as never);

    const read = await GET(get(projectSlug, episodeSlug));
    const write = await POST(post({
      projectSlug,
      episodeSlug,
      body: "This read-only collaborator must not write.",
      clientMessageId: randomUUID(),
      clientSurface: "capture-ios",
    }));

    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({
      ok: true,
      actor: { role: "VIEWER" },
      episode: { slug: episodeSlug },
    });
    expect(write.status).toBe(404);
    await expect(
      prisma.studioNestChatMessage.count({
        where: { projectId, authorEmail: viewerEmail },
      }),
    ).resolves.toBe(0);
  });

  it("reads every message once across pages even when timestamps tie", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: { id: "episode-chat-editor", primaryEmail: editorEmail } } as never);
    const thread = await prisma.studioNestChatThread.create({ data: { projectId, key: "default", title: "History QA" } });
    const timestamp = new Date("2026-09-06T12:00:00Z");
    await prisma.studioNestChatMessage.createMany({ data: Array.from({ length: 112 }, (_, index) => ({
      id: `history-${nonce}-${String(index).padStart(3, "0")}`, projectId, threadId: thread.id,
      body: `Message ${index}`, authorEmail: editorEmail, createdAt: timestamp,
    })) });
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 4; page++) {
      const url = new URL("http://localhost/api/nest-chat");
      url.searchParams.set("projectSlug", projectSlug);
      if (cursor) url.searchParams.set("cursor", cursor);
      const result = await GET(new NextRequest(url));
      expect(result.status).toBe(200);
      const payload = await result.json();
      ids.push(...payload.messages.map((message: { id: string }) => message.id));
      cursor = payload.nextCursor;
      if (!cursor) break;
    }
    expect(ids).toHaveLength(112);
    expect(new Set(ids).size).toBe(112);
    expect(cursor).toBeNull();
  });

  it("does not disclose the episode or create a shadow thread for an outsider", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "episode-chat-outsider",
        primaryEmail: outsiderEmail,
        name: "Episode Chat Outsider QA",
      },
    } as never);

    const read = await GET(get(projectSlug, episodeSlug));
    const invented = await POST(post({
      projectSlug,
      episodeSlug: "invented-shadow-episode",
      body: "This must not create a thread.",
      clientMessageId: randomUUID(),
    }));

    expect(read.status).toBe(404);
    expect(invented.status).toBe(404);
    await expect(
      prisma.studioNestChatThread.count({
        where: {
          projectId,
          key: "episode:invented-shadow-episode",
        },
      }),
    ).resolves.toBe(0);
  });
});
