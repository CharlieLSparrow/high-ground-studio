import { auth } from "@/auth";
import { cleanQuipslyCallbackUrl } from "@/lib/firebase/quipsly-auth-input";
import { AccountSwitchClient } from "./account-switch-client";

export const dynamic = "force-dynamic";

export default async function AccountSwitchPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
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
      callbackUrl={cleanQuipslyCallbackUrl(params?.callbackUrl)}
      currentUser={user}
    />
  );
}
