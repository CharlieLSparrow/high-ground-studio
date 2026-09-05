import { LoginClient } from "./LoginClient";
import {
  cleanQuipslyCallbackUrl,
  cleanQuipslyInviteToken,
  cleanSessionInviteToken,
} from "@/lib/firebase/quipsly-auth-input";

type LoginPageSearchParams = {
  callbackUrl?: string;
  inviteToken?: string;
  sessionInviteToken?: string;
  error?: string;
  emailAction?: string;
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<LoginPageSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  return (
    <LoginClient
      callbackUrl={cleanQuipslyCallbackUrl(params.callbackUrl)}
      inviteToken={cleanQuipslyInviteToken(params.inviteToken)}
      sessionInviteToken={cleanSessionInviteToken(params.sessionInviteToken)}
      initialError={
        typeof params.error === "string"
          ? params.error
          : params.emailAction === "verify"
            ? "email-verified"
            : params.emailAction === "reset"
              ? "password-reset"
              : ""
      }
    />
  );
}
