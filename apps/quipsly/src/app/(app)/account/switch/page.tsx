import { auth } from "@/auth";
import { AccountSwitchClient } from "./account-switch-client";

export const dynamic = "force-dynamic";

function safeCallbackUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "/projects";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return "/projects";
  if (trimmed.startsWith("//")) return "/projects";
  return trimmed;
}

export default async function AccountSwitchPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string }> | { callbackUrl?: string };
}) {
  const params = await searchParams;
  const session = await auth();
  const user = session?.user
    ? {
        email: session.user.primaryEmail || session.user.email || "",
        name: session.user.name || null,
        image: session.user.image || null,
        isStaff: Boolean(session.user.isStaff),
      }
    : null;

  return (
    <AccountSwitchClient
      callbackUrl={safeCallbackUrl(params?.callbackUrl)}
      currentUser={user}
    />
  );
}
