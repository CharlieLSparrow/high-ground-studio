import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccessPrivateFictionNest } from "@/lib/fiction/private-fiction-access";
import {
  isKnownPrivateFictionSeed,
  isPrivateFictionArtifactKey,
  readPrivateFictionArtifact,
} from "@/lib/fiction/private-fiction-seeds";

function privateNotFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ seriesSlug: string; issueSlug: string }>;
  },
) {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!actorEmail) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  if (!(await canAccessPrivateFictionNest(actorEmail))) {
    return privateNotFound();
  }

  const { seriesSlug, issueSlug } = await context.params;
  if (!isKnownPrivateFictionSeed(seriesSlug, issueSlug)) {
    return privateNotFound();
  }

  const artifactParam = request.nextUrl.searchParams.get("artifact");
  const artifact = isPrivateFictionArtifactKey(artifactParam) ? artifactParam : "issue";

  try {
    const contents = await readPrivateFictionArtifact(seriesSlug, issueSlug, artifact);
    if (artifact === "source" || artifact === "summary") {
      return new NextResponse(contents, {
        headers: { "content-type": "text/markdown; charset=utf-8" },
      });
    }

    return NextResponse.json(JSON.parse(contents));
  } catch {
    return privateNotFound();
  }
}
