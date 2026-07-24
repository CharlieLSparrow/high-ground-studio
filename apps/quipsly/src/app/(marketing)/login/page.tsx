import { LoginClient } from "./LoginClient";

type LoginPageSearchParams = {
  callbackUrl?: string;
  inviteToken?: string;
  error?: string;
};

function safeCallbackUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "/projects";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/projects";
  return trimmed;
}

function safeInviteToken(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed.startsWith("qinv_")) return "";
  if (trimmed.length > 160) return "";
  return trimmed;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<LoginPageSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  return (
    <LoginClient
      callbackUrl={safeCallbackUrl(params.callbackUrl)}
      inviteToken={safeInviteToken(params.inviteToken)}
    />
  );
}
