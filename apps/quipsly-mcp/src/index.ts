import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const server = new Server(
  {
    name: "quipsly-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper for authenticating the Agent User
async function getAgentUser() {
  return prisma.user.upsert({
    where: { primaryEmail: "antigravity@quipsly.com" },
    update: {},
    create: {
      primaryEmail: "antigravity@quipsly.com",
      name: "Antigravity Agent",
      isActive: true,
    },
  });
}

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_projects",
        description: "Returns a list of available Quipsly projects (Nests).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_tasks",
        description: "Returns a list of tasks (Goals) in a project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
          },
          required: ["projectId"],
        },
      },
      {
        name: "list_tags",
        description: "Returns a list of tags defined in a project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
          },
          required: ["projectId"],
        },
      },
      {
        name: "create_task",
        description: "Creates a new task in a project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
          },
          required: ["projectId", "title"],
        },
      },
      {
        name: "update_task_status",
        description: "Updates the status of an existing task.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            status: { type: "string", enum: ["TODO", "IN_PROGRESS", "DONE", "CANCELED"] },
          },
          required: ["taskId", "status"],
        },
      },
      {
        name: "send_chat_message",
        description: "Posts a message to the HybridStream chat of a project.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            message: { type: "string" },
          },
          required: ["projectId", "message"],
        },
      },
    ],
  };
});

// Handle tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Authenticate Agent on every tool call for ledger transparency
    const agentUser = await getAgentUser();

    switch (name) {
      case "list_projects": {
        const projects = await prisma.studioProject.findMany({
          select: { id: true, name: true, slug: true, workspaceId: true },
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(projects, null, 2),
            },
          ],
        };
      }
      
      case "list_tasks": {
        const { projectId } = args as any;
        const tasks = await prisma.goal.findMany({
          where: { projectId },
          select: { id: true, title: true, status: true },
        });
        return {
          content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
        };
      }

      case "list_tags": {
        const { projectId } = args as any;
        const tags = await prisma.studioTag.findMany({
          where: { projectId },
          select: { id: true, label: true, category: true },
        });
        return {
          content: [{ type: "text", text: JSON.stringify(tags, null, 2) }],
        };
      }

      case "create_task": {
        const { projectId, title, description } = args as any;
        
        // Create the task (Goal) tied to the Agent User
        const task = await prisma.goal.create({
          data: {
            projectId,
            title,
            description,
            status: "ACTIVE", 
            owner: { connect: { id: agentUser.id } },
            sourceType: "USER",
          },
        });
        return {
          content: [{ type: "text", text: `Task created with ID: ${task.id}` }],
        };
      }

      case "update_task_status": {
        const { taskId, status } = args as any;
        const task = await prisma.goal.update({
          where: { id: taskId },
          data: { status },
        });
        return {
          content: [{ type: "text", text: `Task ${taskId} updated to ${status}` }],
        };
      }

      case "send_chat_message": {
        const { projectId, message } = args as any;
        
        // Add message to chat thread
        let thread = await prisma.studioNestChatThread.findFirst({
          where: { projectId },
        });

        if (!thread) {
          thread = await prisma.studioNestChatThread.create({
            data: {
              projectId,
              title: "Main Thread",
              threadType: "STANDARD",
            }
          });
        }

        const chatMessage = await prisma.studioNestChatMessage.create({
          data: {
            threadId: thread.id,
            projectId,
            authorEmail: agentUser.primaryEmail,
            authorName: agentUser.name,
            body: message,
          }
        });

        return {
          content: [{ type: "text", text: `Message sent with ID: ${chatMessage.id}` }],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: any) {
    // Robust JSON-RPC error mapping for Prisma
    if (error.code) {
      if (error.code === 'P2002') {
        throw new McpError(ErrorCode.InvalidParams, `Unique constraint failed: ${error.message}`);
      }
      if (error.code === 'P2034') {
        throw new McpError(ErrorCode.InternalError, `Transaction conflict/Concurrency issue: ${error.message}`);
      }
      throw new McpError(ErrorCode.InternalError, `Database error (${error.code}): ${error.message}`);
    }

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing tool ${name}: ${error.message}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Quipsly MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
