import "server-only";

export async function authorizeGoogleOidcWorker(input: {
  authorization: string | null;
  expectedEmail: string | null | undefined;
  audience: string | null | undefined;
  verifyIdToken?: (input: { idToken: string; audience: string }) => Promise<{
    email?: string | null;
    emailVerified?: boolean | null;
  }>;
}) {
  const expectedEmail = input.expectedEmail?.trim();
  const audience = input.audience?.trim();
  if (!expectedEmail || !audience) return "not-configured" as const;
  try {
    const parsed = new URL(audience);
    if (parsed.protocol !== "https:" || parsed.origin !== parsed.toString().replace(/\/$/, "")) {
      return "not-configured" as const;
    }
  } catch {
    return "not-configured" as const;
  }
  const token = input.authorization?.startsWith("Bearer ")
    ? input.authorization.slice("Bearer ".length).trim()
    : "";
  if (!token) return "unauthorized" as const;
  try {
    const identity = await (input.verifyIdToken ?? verifyGoogleOidcToken)({
      idToken: token,
      audience,
    });
    return identity.email === expectedEmail && identity.emailVerified !== false
      ? ("authorized" as const)
      : ("unauthorized" as const);
  } catch {
    return "unauthorized" as const;
  }
}

async function verifyGoogleOidcToken(input: { idToken: string; audience: string }) {
  const { google } = await import("googleapis");
  const client = new google.auth.OAuth2();
  const ticket = await client.verifyIdToken({
    idToken: input.idToken,
    audience: input.audience,
  });
  const payload = ticket.getPayload();
  return {
    email: payload?.email || null,
    emailVerified: payload?.email_verified ?? null,
  };
}
