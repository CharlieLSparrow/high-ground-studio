import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const agents = await prisma.agentNode.findMany({
      include: {
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      },
      orderBy: { lastActiveAt: 'desc' }
    });

    return NextResponse.json({ success: true, agents });
  } catch (error) {
    console.error("Failed to fetch agents:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, agentId, instruction, name, role } = body;

    if (action === "SPAWN") {
      if (!name || !role) return NextResponse.json({ error: "Name and role required" }, { status: 400 });
      
      const newAgent = await prisma.agentNode.create({
        data: {
          conversationId: `mock_conv_${Date.now()}`,
          name,
          role,
          status: "IDLE"
        }
      });
      return NextResponse.json({ success: true, agent: newAgent });
    }

    if (action === "DISPATCH") {
      if (!agentId || !instruction) return NextResponse.json({ error: "Agent ID and instruction required" }, { status: 400 });

      const task = await prisma.agentTask.create({
        data: {
          agentId,
          instruction,
          status: "QUEUED"
        }
      });

      // Update agent status
      await prisma.agentNode.update({
        where: { id: agentId },
        data: { status: "RUNNING", lastActiveAt: new Date() }
      });

      return NextResponse.json({ success: true, task });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Failed to process agent command:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
