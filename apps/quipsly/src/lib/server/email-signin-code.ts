import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import type { StudioUserIdentity } from "@/lib/server/studio-user-identity";
import { getPrismaClient } from "@/lib/prisma";
import { hasQuipslyBetaAccess } from "@/lib/server/patreon-authz";
import { isStudioEmailAllowed } from "@/lib/server/studio-auth-mode";
import {
  ensureStudioUserFromGoogle,
  normalizeEmail,
} from "@/lib/server/studio-user-identity";

const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
const EMAIL_CODE_IDENTIFIER_PREFIX = "quipsly-email-code:";

type EmailCodeRequestResult = {
  ok: true;
  email: string;
  sent: boolean;
  message: string;
  devCode?: string;
  reason?: "not-eligible" | "email-not-configured" | "send-failed";
};

function authSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required for email sign-in codes.");
  }
  return secret;
}

function configuredOwnerEmails() {
  return [
    "charlie@highgroundodyssey.com",
    process.env.HGO_OWNER_EMAILS,
    process.env.HGO_TEAM_SCHEDULER_EMAILS,
    process.env.HGO_COACH_EMAILS,
    process.env.QUIPSLY_ADMIN_EMAILS,
    process.env.USER_MANAGEMENT_ADMIN_EMAILS,
  ]
    .join(",")
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
}

function emailCodeIdentifier(email: string) {
  return `${EMAIL_CODE_IDENTIFIER_PREFIX}${normalizeEmail(email)}`;
}

function normalizeCode(code: string) {
  return code.replace(/[^0-9a-z]/gi, "").toUpperCase();
}

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function hashCode(email: string, code: string) {
  return createHmac("sha256", authSecret())
    .update(emailCodeIdentifier(email))
    .update(":")
    .update(normalizeCode(code))
    .digest("hex");
}

function hashesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function canRequestEmailCode(email: string) {
  if (configuredOwnerEmails().includes(email)) return true;
  if (isStudioEmailAllowed(email)) return true;
  return hasQuipslyBetaAccess(email);
}

async function sendEmailCode(email: string, code: string, callbackUrl?: string | null) {
  const resendApiKey = process.env.RESEND_API_KEY || process.env.AUTH_RESEND_KEY;
  const from = process.env.AUTH_EMAIL_FROM || process.env.EMAIL_FROM || process.env.HGO_EMAIL_FROM || "Quipsly <noreply@quipsly.com>";
  const publicUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://nest.quipsly.com";
  const safeCallback = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
    ? callbackUrl
    : "/projects";
  const loginUrl = new URL(`/api/auth/signin?callbackUrl=${encodeURIComponent(safeCallback)}`, publicUrl).toString();
  const prettyCode = formatCode(code);

  if (!resendApiKey) {
    if (process.env.NODE_ENV !== "production" || process.env.QUIPSLY_EMAIL_LOGIN_DEV_CODES === "true") {
      return {
        sent: false,
        devCode: prettyCode,
        reason: "email-not-configured" as const,
      };
    }

    return {
      sent: false,
      reason: "email-not-configured" as const,
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Your Quipsly Nest sign-in code",
      text: [
        `Your Quipsly Nest sign-in code is ${prettyCode}.`,
        "",
        "This code expires in 15 minutes and can be used once.",
        "",
        `Return to ${loginUrl} and enter the code to sign in.`,
      ].join("\n"),
      html: [
        "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#3f3028;line-height:1.55\">",
        "<p>Your Quipsly Nest sign-in code is:</p>",
        `<p style=\"font-size:32px;font-weight:900;letter-spacing:0.18em\">${prettyCode}</p>`,
        "<p>This code expires in 15 minutes and can be used once.</p>",
        `<p><a href=\"${loginUrl}\">Return to Quipsly Nest</a> and enter the code to sign in.</p>`,
        "</div>",
      ].join(""),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("Quipsly email code send failed.", {
      status: response.status,
      detail: text.slice(0, 500),
    });
    return {
      sent: false,
      reason: "send-failed" as const,
    };
  }

  return { sent: true };
}

export async function requestEmailSignInCode(input: {
  email: string;
  callbackUrl?: string | null;
}): Promise<EmailCodeRequestResult> {
  const email = normalizeEmail(input.email);

  if (!email || !email.includes("@")) {
    return {
      ok: true,
      email,
      sent: false,
      reason: "not-eligible",
      message: "If that email has Quipsly access, we will send a sign-in code.",
    };
  }

  const eligible = await canRequestEmailCode(email);
  if (!eligible) {
    return {
      ok: true,
      email,
      sent: false,
      reason: "not-eligible",
      message: "If that email has Quipsly access, we will send a sign-in code.",
    };
  }

  const prisma = getPrismaClient();
  const code = generateCode();
  const expires = new Date(Date.now() + EMAIL_CODE_TTL_MS);

  try {
    await prisma.$transaction([
      prisma.verificationToken.deleteMany({
        where: { identifier: emailCodeIdentifier(email) },
      }),
      prisma.verificationToken.create({
        data: {
          identifier: emailCodeIdentifier(email),
          token: hashCode(email, code),
          expires,
        },
      }),
    ]);
  } catch (error) {
    console.error("Quipsly email code persistence failed.", error);
    return {
      ok: true,
      email,
      sent: false,
      reason: "send-failed",
      message: "Quipsly could not prepare a sign-in code because the identity store is unavailable.",
    };
  }

  const sendResult = await sendEmailCode(email, code, input.callbackUrl);

  if (sendResult.sent) {
    return {
      ok: true,
      email,
      sent: true,
      message: "We sent a sign-in code. It expires in 15 minutes.",
    };
  }

  return {
    ok: true,
    email,
    sent: false,
    reason: sendResult.reason,
    devCode: sendResult.devCode,
    message:
      sendResult.reason === "email-not-configured"
        ? "Email sign-in is wired, but the email sender is not configured yet."
        : "We could not send a sign-in code right now. Try Google sign-in or ask an admin.",
  };
}

export async function verifyEmailSignInCode(input: {
  email: string;
  code: string;
}): Promise<StudioUserIdentity | null> {
  const email = normalizeEmail(input.email);
  const code = normalizeCode(input.code);

  if (!email || !code) return null;

  const prisma = getPrismaClient();
  const identifier = emailCodeIdentifier(email);
  const stored = await prisma.verificationToken.findFirst({
    where: {
      identifier,
      expires: { gt: new Date() },
    },
    orderBy: { expires: "desc" },
  });

  if (!stored || !hashesMatch(stored.token, hashCode(email, code))) {
    return null;
  }

  await prisma.verificationToken.delete({
    where: {
      identifier_token: {
        identifier,
        token: stored.token,
      },
    },
  });

  if (!(await canRequestEmailCode(email))) {
    return null;
  }

  return ensureStudioUserFromGoogle({ email });
}
