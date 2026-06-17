import { getPrismaClient } from "@/lib/prisma";
import ManuscriptRoomClient from "./ManuscriptRoomClient";

function getCollabUrl() {
  const configured = (
    process.env.NEXT_PUBLIC_STUDIO_COLLAB_URL ||
    process.env.STUDIO_COLLAB_URL ||
    ""
  ).trim();

  if (configured) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "" : "ws://localhost:8789";
}

export default async function ManuscriptRoomPage({
  params,
}: {
  params: Promise<{ roomName: string }>;
}) {
  const { roomName } = await params;
  
  // In a real app, you would fetch user session and auth token here
  const token = "demo-jwt-token-replace-me"; // This would come from next-auth/cookies
  const userName = "Writer_" + Math.floor(Math.random() * 1000);
  const userColor = "#" + Math.floor(Math.random() * 16777215).toString(16);

  const prisma = getPrismaClient();
  const project = await prisma.studioProject.findFirst({
    where: { slug: roomName },
    include: {
      storyboards: {
        orderBy: { createdAt: "asc" },
        include: {
          frames: {
            orderBy: { sortOrder: "asc" }
          }
        }
      }
    }
  });

  const storyboards = project?.storyboards || [];

  return (
    <ManuscriptRoomClient
      roomName={roomName}
      token={token}
      collabUrl={getCollabUrl()}
      userName={userName}
      userColor={userColor}
      initialStoryboards={storyboards}
    />
  );
}

