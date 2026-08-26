import "server-only";

import { normalizeEmail } from "@/lib/server/studio-user-identity";

export type SessionInvitationEmailResult =
  | {
      ok: true;
      provider: "resend";
      providerMessageId: string;
    }
  | {
      ok: false;
      provider: "resend";
      code:
        | "EMAIL_NOT_CONFIGURED"
        | "PUBLIC_URL_NOT_CONFIGURED"
        | "INVALID_RECIPIENT"
        | "INVALID_INVITE_URL"
        | "LOCAL_TEST_RECIPIENT"
        | "RATE_LIMITED"
        | "PROVIDER_REJECTED"
        | "PROVIDER_UNAVAILABLE";
      message: string;
      retryAfterSeconds: number | null;
    };

function compact(value: unknown, max = 320) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function validSender(value: string) {
  const bracketed = value.match(/<([^<>]+)>\s*$/)?.[1] || value;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bracketed.trim());
}

function isLoopbackUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * The recovery lab needs to exercise the exact rendered invitation workflow,
 * but it must never deliver synthetic or accidentally real mail. This adapter
 * is deliberately impossible to enable in production or for a non-loopback
 * origin.
 */
function localReceiptDeliveryEnabled(origin: string) {
  return (
    process.env.QUIPSLY_SESSION_INVITATION_DELIVERY_MODE === "local-receipt" &&
    process.env.NODE_ENV !== "production" &&
    isLoopbackUrl(origin)
  );
}

function publicBaseUrl(requestUrl: string) {
  const configured =
    process.env.QUIPSLY_SITE_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  const candidate =
    configured || (process.env.NODE_ENV === "production" ? "" : requestUrl);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if (
      parsed.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && local)
    ) {
      return null;
    }
    parsed.username = "";
    parsed.password = "";
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed;
  } catch {
    return null;
  }
}

export type SessionInvitationEmailReadiness = {
  available: boolean;
  status: "AVAILABLE" | "EMAIL_NOT_CONFIGURED" | "PUBLIC_URL_NOT_CONFIGURED";
};

/**
 * Projects only the user-actionable delivery capability. It never exposes a
 * provider key, sender value, or deployment detail to the client.
 */
export function sessionInvitationEmailReadiness(
  requestUrl: string,
): SessionInvitationEmailReadiness {
  if (localReceiptDeliveryEnabled(requestUrl)) {
    return { available: true, status: "AVAILABLE" };
  }
  const apiKey =
    process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    "";
  const from =
    process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM?.trim() ||
    process.env.HGO_EMAIL_FROM?.trim() ||
    "";
  if (!apiKey || !from || !validSender(from)) {
    return { available: false, status: "EMAIL_NOT_CONFIGURED" };
  }
  if (!publicBaseUrl(requestUrl)) {
    return { available: false, status: "PUBLIC_URL_NOT_CONFIGURED" };
  }
  return { available: true, status: "AVAILABLE" };
}

export function sessionInvitationJoinUrl(input: {
  requestUrl: string;
  invitePath: string;
}) {
  const base = publicBaseUrl(input.requestUrl);
  if (!base) return null;
  try {
    const joined = new URL(input.invitePath, base);
    if (joined.origin !== base.origin || joined.pathname !== "/sessions/join")
      return null;
    if (!joined.searchParams.get("token")?.startsWith("qsinv_")) return null;
    return joined.toString();
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function retryAfter(response: Response) {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value >= 0 ? Math.ceil(value) : null;
}

export async function sendSessionInvitationEmail(input: {
  recipientEmail: string;
  recipientName?: string | null;
  hostName?: string | null;
  roomTitle: string;
  scheduledStart?: Date | null;
  joinUrl: string | null;
  idempotencyKey: string;
}): Promise<SessionInvitationEmailResult> {
  const recipientEmail = normalizeEmail(input.recipientEmail);
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return {
      ok: false,
      provider: "resend",
      code: "INVALID_RECIPIENT",
      message: "The invitation recipient email is invalid.",
      retryAfterSeconds: null,
    };
  }
  // `.dev.test` is Quipsly's reserved local acceptance namespace. Refuse it
  // before reading provider configuration or making an outbound request so a
  // developer machine can safely exercise the real invitation action without
  // leaking synthetic recipients to Resend.
  if (recipientEmail.endsWith("@dev.test")) {
    return {
      ok: false,
      provider: "resend",
      code: "LOCAL_TEST_RECIPIENT",
      message:
        "Quipsly kept this local test invitation on this device. Use the private client entry to continue; no external email was sent.",
      retryAfterSeconds: null,
    };
  }
  if (
    input.joinUrl &&
    localReceiptDeliveryEnabled(input.joinUrl)
  ) {
    return {
      ok: false,
      provider: "resend",
      code: "LOCAL_TEST_RECIPIENT",
      message:
        "Quipsly recorded this invitation in the isolated local delivery lab. Use the private client entry to continue; no external email was sent.",
      retryAfterSeconds: null,
    };
  }
  const apiKey =
    process.env.QUIPSLY_SESSION_INVITATION_RESEND_API_KEY?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    "";
  const from =
    process.env.QUIPSLY_SESSION_INVITATION_EMAIL_FROM?.trim() ||
    process.env.HGO_EMAIL_FROM?.trim() ||
    "";
  if (!apiKey || !from || !validSender(from)) {
    return {
      ok: false,
      provider: "resend",
      code: "EMAIL_NOT_CONFIGURED",
      message:
        "Invitation email is not configured yet. Copy or share the private link instead.",
      retryAfterSeconds: null,
    };
  }

  if (!input.joinUrl) {
    return {
      ok: false,
      provider: "resend",
      code: "PUBLIC_URL_NOT_CONFIGURED",
      message:
        "Quipsly needs a trusted public site URL before it can email this invitation.",
      retryAfterSeconds: null,
    };
  }
  let joinUrl: URL;
  try {
    joinUrl = new URL(input.joinUrl);
    if (
      joinUrl.pathname !== "/sessions/join" ||
      !joinUrl.searchParams.get("token")?.startsWith("qsinv_")
    ) {
      throw new Error("invalid invitation URL");
    }
  } catch {
    return {
      ok: false,
      provider: "resend",
      code: "INVALID_INVITE_URL",
      message: "Quipsly refused to send an invalid invitation URL.",
      retryAfterSeconds: null,
    };
  }

  const recipient = compact(input.recipientName, 120) || "there";
  const host = compact(input.hostName, 120) || "Your coach";
  const title = compact(input.roomTitle, 180) || "Coaching Session";
  const scheduled = input.scheduledStart
    ? input.scheduledStart.toLocaleString("en-US", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "UTC",
      }) + " UTC"
    : "Open Quipsly to review the scheduled time.";
  const subject = `${host} invited you to ${title}`;
  const text = [
    `Hi ${recipient},`,
    "",
    `${host} invited you to a private Quipsly coaching Session: ${title}`,
    `Scheduled: ${scheduled}`,
    "",
    "Open your private Session:",
    joinUrl.toString(),
    "",
    "Use a browser on your phone, tablet, or desktop. After Quipsly verifies the invited email, choose whether to continue in the browser or use Quipsly Capture on iPhone.",
    "",
    `For your privacy, sign in with ${recipientEmail}. The link grants access only to this Session and never starts recording.`,
    "",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(recipient)},</p><p>${escapeHtml(host)} invited you to a private Quipsly coaching Session: <strong>${escapeHtml(title)}</strong>.</p><p><strong>Scheduled:</strong> ${escapeHtml(scheduled)}</p><p><a href="${escapeHtml(joinUrl.toString())}">Open your private Session</a></p><p>Use a browser on your phone, tablet, or desktop. After Quipsly verifies the invited email, choose whether to continue in the browser or use Quipsly Capture on iPhone.</p><p>For your privacy, sign in with <strong>${escapeHtml(recipientEmail)}</strong>. The link grants access only to this Session and never starts recording.</p><p>If you were not expecting this invitation, you can ignore this email.</p>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey.slice(0, 256),
        "user-agent": "Quipsly/1.0 session-invitations",
      },
      body: JSON.stringify({ from, to: [recipientEmail], subject, text, html }),
      cache: "no-store",
    });
    const raw = await response.text();
    let packet: { id?: unknown; message?: unknown; name?: unknown } = {};
    try {
      packet = raw ? JSON.parse(raw) : {};
    } catch {
      packet = {};
    }
    if (response.ok && typeof packet.id === "string" && packet.id.trim()) {
      return {
        ok: true,
        provider: "resend",
        providerMessageId: packet.id.trim(),
      };
    }
    const rateLimited = response.status === 429;
    return {
      ok: false,
      provider: "resend",
      code: rateLimited ? "RATE_LIMITED" : "PROVIDER_REJECTED",
      message: rateLimited
        ? "Invitation email is temporarily rate limited. Wait briefly, then resend or share the private link now."
        : `Invitation email was not accepted by the provider${compact(packet.message) ? `: ${compact(packet.message)}` : "."}`,
      retryAfterSeconds: retryAfter(response),
    };
  } catch {
    return {
      ok: false,
      provider: "resend",
      code: "PROVIDER_UNAVAILABLE",
      message:
        "Invitation email could not reach the delivery provider. The private link is still available to copy or share.",
      retryAfterSeconds: null,
    };
  }
}
