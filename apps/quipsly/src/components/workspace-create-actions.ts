"use server";

import { auth } from "@/auth";
import { ensureHomeNestForEmail } from "@/lib/server/home-nest";
import { createDocumentInNest } from "@/app/(app)/nests/[slug]/actions";

export async function createPersonalNote() {
  const session = await auth();
  const email = session?.user?.primaryEmail || session?.user?.email;
  if (!email) return { href: "/login?callbackUrl=%2Flibrary" };
  const home = await ensureHomeNestForEmail(email);
  return createDocumentInNest(home.slug, "note");
}
