import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const issueDir = path.join(
  repoRoot,
  "content/private/fiction/charlie-l-sparrow/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design"
);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
function ownerWorkspaceSlug(ownerEmail) {
  return `${normalizeEmail(ownerEmail).replace(/[^a-z0-9]+/g, "-")}-workspace`;
}

function hashContent(content) {
  return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

async function readJson(fileName) {
  try {
    const raw = await fs.readFile(path.join(issueDir, fileName), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to read ${fileName}: ${err.message}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set. Skipping real DB connection.");
    console.log("Mocking Comic Issue Manuscript Sync worker run.");
    console.log("Simulating ingest: Issue 001 - Tenderness of Unlawful Design.");
    console.log("Simulating snapshot: StudioManuscriptSnapshot generated.");
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(process.env.DATABASE_URL),
    log: ["error"],
  });

  try {
    console.log("Starting Comic Issue Manuscript Importer...");
    const issueSeed = await readJson("issue.json");

    const ownerEmail = issueSeed.access?.ownerEmail || "CharlieLSparrow@gmail.com";
    const workspaceSlug = ownerWorkspaceSlug(ownerEmail);
    const projectSlug = issueSeed.projectSlug || "charlie-melissa-fiction-lab";
    const issueTitle = issueSeed.title || "Issue 001";

    // 1. Resolve Workspace and Project
    const workspace = await prisma.studioWorkspace.upsert({
      where: { slug: workspaceSlug },
      update: {},
      create: {
        slug: workspaceSlug,
        name: "Charlie L. Sparrow - Fiction Nest",
        ownerLabel: ownerEmail,
        isPrivate: true,
      },
    });

    const project = await prisma.studioProject.upsert({
      where: {
        workspaceId_slug: {
          workspaceId: workspace.id,
          slug: projectSlug,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        slug: projectSlug,
        name: "My Heart Is a Junkyard Starship",
        description: "Private comic and fiction development nest.",
        sourceLabel: "nest-kind:fiction",
        isPrivate: true,
      },
    });

    // 2. Upsert the Canonical Manuscript
    let manuscript = await prisma.studioManuscript.findFirst({
      where: {
        ownerEmail,
        title: issueTitle
      }
    });

    if (!manuscript) {
      manuscript = await prisma.studioManuscript.create({
        data: {
          ownerEmail,
          title: issueTitle,
          description: `Comic Script for ${issueTitle}`,
          sourceFileName: "issue.json",
          kind: "WORKING",
          project: { connect: { id: project.id } }
        }
      });
      console.log(`Created new Manuscript: ${issueTitle}`);
    } else {
      console.log(`Found existing Manuscript: ${issueTitle}`);
    }

    // 3. Compute Hash to ensure Idempotency of Snapshots
    const contentHash = hashContent(issueSeed);

    const latestSnapshot = await prisma.studioManuscriptSnapshot.findFirst({
      where: { manuscriptId: manuscript.id },
      orderBy: { createdAt: 'desc' }
    });

    // 4. Create Snapshot if changed
    if (!latestSnapshot || latestSnapshot.contentHash !== contentHash) {
      const snapshot = await prisma.studioManuscriptSnapshot.create({
        data: {
          manuscriptId: manuscript.id,
          ownerEmail,
          title: issueTitle,
          schemaVersion: 1,
          sourceFileName: "issue.json",
          draftJson: issueSeed, // Store the entire structure
          contentHash: contentHash,
        }
      });
      
      // Update Manuscript's last snapshot timestamp
      await prisma.studioManuscript.update({
        where: { id: manuscript.id },
        data: { lastSnapshotAt: snapshot.createdAt }
      });
      
      console.log(`Created new Manuscript Snapshot! ID: ${snapshot.id}`);
      console.log(`Ingested ${issueSeed.acts?.length || 0} Acts and ${issueSeed.panels?.length || 0} Panels into draftJson.`);
    } else {
      console.log(`No changes detected in issue.json. Snapshot skipped.`);
    }

    console.log("Manuscript ingestion complete.");

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Comic Issue import failed:", error);
  process.exit(1);
});
