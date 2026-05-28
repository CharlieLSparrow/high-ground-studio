import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return Response.json(
        { error: "Unauthorized. Please sign in first." },
        { status: 401 }
      );
    }

    // Resolve user from email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { primaryEmail: session.user.email.toLowerCase() },
          {
            aliases: {
              some: {
                email: session.user.email.toLowerCase(),
              },
            },
          },
        ],
      },
    });

    if (!user) {
      return Response.json(
        { error: "User identity record not found in system database." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { highlightedText, sourceUrl, sourceTitle, note } = body;

    if (!highlightedText || typeof highlightedText !== "string" || !highlightedText.trim()) {
      return Response.json(
        { error: "Missing or invalid highlighted text." },
        { status: 400 }
      );
    }

    // Find or create default Patreon Highlights Collection for this user
    const collectionSlug = "patreon-highlights";
    let collection = await prisma.collection.findFirst({
      where: {
        userId: user.id,
        slug: collectionSlug,
      },
    });

    if (!collection) {
      collection = await prisma.collection.create({
        data: {
          userId: user.id,
          slug: collectionSlug,
          name: "Patreon Highlights",
          description: "Curated passages saved from my interactive reading feed.",
          isPublic: false,
        },
      });
    }

    // Create the Snippet
    const snippet = await prisma.snippet.create({
      data: {
        userId: user.id,
        collectionId: collection.id,
        sourceUrl: sourceUrl || null,
        sourceTitle: sourceTitle || null,
        highlightedText: highlightedText.trim(),
        note: note || null,
      },
    });

    return Response.json(
      {
        success: true,
        message: "Snippet saved successfully to your collection.",
        snippet,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating snippet:", error);
    return Response.json(
      { error: "Internal server error.", details: error.message },
      { status: 500 }
    );
  }
}
