import { redirect } from "next/navigation";

import { getQuipslySession } from "@/lib/server/quipsly-session";

export async function auth() {
  return getQuipslySession();
}

export async function signIn(
  _provider?: string,
  options?: { redirectTo?: string; callbackUrl?: string },
) {
  const callbackUrl = options?.redirectTo || options?.callbackUrl || "/projects";
  redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
}

export async function signOut(options?: { redirectTo?: string }) {
  redirect(options?.redirectTo || "/");
}
