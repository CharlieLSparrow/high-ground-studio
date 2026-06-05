"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function deleteSnippetAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.email) {
    throw new Error("Unauthorized. Please sign in.");
  }

  const snippetId = String(formData.get("snippetId") ?? "").trim();
  if (!snippetId) {
    throw new Error("Snippet ID is required.");
  }

  // Resolve user identity record
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
    throw new Error("User record not found.");
  }

  // Delete the snippet, ensuring it belongs to the logged-in user
  await prisma.snippet.delete({
    where: {
      id: snippetId,
      userId: user.id,
    },
  });

  revalidatePath("/library");
  revalidatePath("/dashboard");
}
