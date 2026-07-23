import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { createStudioProject, normalizeNestKind } from '@/lib/studio/project-registry';

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // 1. Validate API Key
    const authHeader = req.headers.get('authorization');
    const expectedKey = process.env.ANTIGRAVITY_API_KEY;
    
    if (!expectedKey) {
      return NextResponse.json({ error: "Server missing ANTIGRAVITY_API_KEY" }, { status: 500 });
    }
    
    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse Payload
    const body = await req.json();
    const { userEmail, projectName, documentTitle, nestKind, blocks } = body;
    
    if (!userEmail || !projectName || !blocks || !Array.isArray(blocks)) {
      return NextResponse.json({ error: "Missing required fields (userEmail, projectName, blocks)" }, { status: 400 });
    }

    const prisma = getPrismaClient();

    // 3. Resolve User
    const email = userEmail.toLowerCase().trim();
    let user = await prisma.user.findUnique({ where: { primaryEmail: email } });
    if (!user) {
      user = await prisma.user.create({ data: { primaryEmail: email, name: email.split('@')[0] } });
    }

    // 4. Create Nest (Project)
    const { project, document } = await createStudioProject(prisma, {
      name: projectName,
      documentTitle: documentTitle || `${projectName} Document`,
      nestKind: normalizeNestKind(nestKind),
      seedStarter: false
    });

    // 5. Grant Access
    await prisma.studioProjectAccessGrant.upsert({
      where: {
        projectId_email: {
          projectId: project.id,
          email: email
        }
      },
      create: {
        projectId: project.id,
        email: email,
        role: "OWNER"
      },
      update: {
        role: "OWNER"
      }
    });

    // 6. Write Blocks
    if (!document) {
      return NextResponse.json({ error: "Failed to resolve default document" }, { status: 500 });
    }

    const blockRows = blocks.map((b: any, i: number) => ({
      documentId: document.id,
      stableId: `doc-${project.slug}-block-${i}`,
      order: b.order ?? i,
      title: b.title || null,
      body: b.body || ""
    }));

    if (blockRows.length > 0) {
      await prisma.studioDocumentBlock.createMany({
        data: blockRows,
        skipDuplicates: true
      });
    }

    return NextResponse.json({
      success: true,
      projectSlug: project.slug,
      documentId: document.id,
      blockCount: blockRows.length
    });
    
  } catch (err: any) {
    console.error("Ingestion Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
