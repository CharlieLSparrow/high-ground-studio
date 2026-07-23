import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import {
  createResearchStudioHandoff,
  RESEARCH_STUDIO_HANDOFF_KIND,
  RESEARCH_STUDIO_HANDOFF_SCHEMA,
} from "./research-studio-handoff";

const immutableText = "Before the edit. Exact source truth. After the edit.";
const exactText = "Exact source truth.";
const startOffset = immutableText.indexOf(exactText);
const updatedAt = new Date("2026-07-19T02:00:00.000Z");

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function annotationFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "annotation-1",
    projectId: "project-1",
    project: { id: "project-1", slug: "episode-4", name: "Episode 4" },
    sourceUnit: {
      id: "source-1",
      slug: "transcript-v3",
      kind: "transcript",
      title: "Episode 4 transcript",
      sourceUrl: null,
      sourcePath: "reports/episode-4.md",
      author: "High Ground",
      immutableText,
      documentId: null,
    },
    revisions: [
      { id: "revision-1", revision: 1, operation: "created" },
      { id: "revision-3", revision: 3, operation: "reopened" },
    ],
    tags: [{ tag: { id: "tag-1", slug: "episode-sync", label: "Episode sync", category: "production_breakdown" } }],
    uses: [{
      id: "use-private",
      useKind: "evidence",
      citationKey: "source:annotation-1",
      quoteSnapshot: exactText,
      document: { id: "private-doc", stableId: "private-doc-stable", title: "Secret draft", isPrivate: true },
      block: { id: "private-block", stableId: "private-block-stable", externalId: "annotation:annotation-1" },
      createdAt: new Date("2026-07-19T02:01:00.000Z"),
    }],
    visibility: "project",
    status: "active",
    kind: "correction",
    body: "Use the transcript-anchored baseline.",
    selectorKind: "text-quote",
    startOffset,
    endOffset: startOffset + exactText.length,
    exactText,
    prefixText: "Before the edit. ",
    suffixText: " After the edit.",
    sourceFingerprint: sha256(immutableText),
    updatedAt,
    ...overrides,
  };
}

function prismaHarness(annotation: ReturnType<typeof annotationFixture>, existing: unknown = null) {
  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "packet-1", data }));
  const tx = {
    studioSourceAnnotation: { findFirst: jest.fn(async () => annotation) },
    studioOutputPacket: {
      findUnique: jest.fn(async () => existing),
      create,
    },
  };
  const prisma = {
    $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
  } as unknown as PrismaClient;
  return { prisma, tx, create };
}

const input = {
  annotationId: "annotation-1",
  projectId: "project-1",
  actorUserId: "user-1",
  actorEmail: "producer@example.com",
  expectedUpdatedAt: updatedAt,
};

describe("createResearchStudioHandoff", () => {
  it("creates a revision-pinned packet without disclosing private writing", async () => {
    const { prisma, create } = prismaHarness(annotationFixture());
    const result = await createResearchStudioHandoff(prisma, input);

    expect(result).toEqual({
      ok: true,
      packetId: "packet-1",
      packetSlug: "research-annotation-annotation-1-r3",
      revision: 3,
      reused: false,
    });
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data as Record<string, any>;
    expect(data.kind).toBe(RESEARCH_STUDIO_HANDOFF_KIND);
    expect(data.status).toBe("ready-for-studio");
    expect(data.packetJson.schema).toBe(RESEARCH_STUDIO_HANDOFF_SCHEMA);
    expect(data.packetJson.source.contentSha256).toBe(sha256(immutableText));
    expect(data.packetJson.annotation).toMatchObject({ id: "annotation-1", revision: 3, exactText });
    expect(data.packetJson.writing).toMatchObject({ publicUses: [], privateUseCount: 1 });
    expect(JSON.stringify(data.packetJson)).not.toContain("Secret draft");
    expect(JSON.stringify(data.packetJson)).not.toContain("private-doc");
    expect(data.packetJson.safety).toEqual({
      sourceMutated: false,
      mediaMutated: false,
      privateWritingDisclosed: false,
      publishAuthorized: false,
      humanReviewRequired: true,
    });
  });

  it("keeps private annotations out of the project-wide Studio inbox", async () => {
    const { prisma, create } = prismaHarness(annotationFixture({ visibility: "private" }));
    const result = await createResearchStudioHandoff(prisma, input);

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "PRIVATE" }));
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses an annotation whose source fingerprint no longer verifies", async () => {
    const { prisma, create } = prismaHarness(annotationFixture({ sourceFingerprint: "stale" }));
    const result = await createResearchStudioHandoff(prisma, input);

    expect(result).toEqual(expect.objectContaining({ ok: false, code: "CONFLICT" }));
    expect(create).not.toHaveBeenCalled();
  });

  it("reuses the immutable annotation revision packet on retry", async () => {
    const { prisma, create } = prismaHarness(annotationFixture(), {
      id: "existing-packet",
      kind: RESEARCH_STUDIO_HANDOFF_KIND,
      packetJson: { schema: RESEARCH_STUDIO_HANDOFF_SCHEMA },
    });
    const result = await createResearchStudioHandoff(prisma, input);

    expect(result).toEqual({
      ok: true,
      packetId: "existing-packet",
      packetSlug: "research-annotation-annotation-1-r3",
      revision: 3,
      reused: true,
    });
    expect(create).not.toHaveBeenCalled();
  });
});
