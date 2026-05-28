import { createHmac } from "node:crypto";
import { StudioAccessShell } from "./studio-access-shell";
import { StudioWorkbenchClient } from "./studio-workbench-client";
import { getStudioAccessState } from "@/lib/server/studio-access";
import { loadStudioWorkbenchData } from "@/lib/server/studio-data";

export const dynamic = "force-dynamic";

function base64UrlEncode(input: string | Buffer): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buffer.toString("base64url");
}

function generateCollabToken(roomName: string, email: string) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      roomName,
      email,
      actorId: "charlie", // Using 'charlie' or 'homer' as expected by server.mjs
      role: "editor",
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
    })
  );
  
  const secret = process.env.STUDIO_COLLAB_TOKEN_SECRET || process.env.AUTH_SECRET || "";
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  
  return `${header}.${payload}.${signature}`;
}

export default async function StudioHomePage() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return <StudioAccessShell mode="signed-out" />;
  }

  if (!access.canAccess) {
    return (
      <StudioAccessShell
        mode="denied"
        email={access.actorLabel || undefined}
        roles={access.roles}
      />
    );
  }

  const data = await loadStudioWorkbenchData();
  const collabRoom = "primary-manuscript";
  const collabToken = generateCollabToken(collabRoom, access.actorLabel || "anonymous@example.com");

  return (
    <StudioWorkbenchClient
      {...data}
      actor={{
        primaryEmail: access.actorLabel || "anonymous@example.com",
      }}
      collabRoom={collabRoom}
      collabToken={collabToken}
    />
  );
}
