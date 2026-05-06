import "server-only";

import {
  sendSmsNotification,
  type SmsNotificationResult,
} from "@/lib/server/sms";

function formatPreferredContactMethod(value: string) {
  switch (value) {
    case "EMAIL":
      return "email";
    case "PHONE_CALL":
      return "phone call";
    case "TEXT":
      return "text";
    default:
      return value.toLowerCase().replace(/_/g, " ");
  }
}

function buildQueueUrl(siteUrl: string) {
  return `${siteUrl.replace(/\/$/, "")}/team/coaching-requests`;
}

export async function notifyNewCoachingRequest({
  requestId,
  clientDisplayName,
  preferredContactMethod,
  phone,
  email,
}: {
  requestId: string;
  clientDisplayName: string;
  preferredContactMethod: string;
  phone?: string | null;
  email: string;
}): Promise<SmsNotificationResult> {
  const to = process.env.HGO_COACHING_NOTIFY_PHONE?.trim() ?? "";
  const siteUrl = process.env.HGO_SITE_URL?.trim() ?? "";

  if (!to || !siteUrl) {
    return { ok: false, error: "Coaching notification env vars are not configured" };
  }

  const queueUrl = buildQueueUrl(siteUrl);
  const message = [
    `New High Ground coaching request from ${clientDisplayName}.`,
    `Preferred contact: ${formatPreferredContactMethod(preferredContactMethod)}.`,
    `Phone: ${phone?.trim() || "not provided"}.`,
    `Email: ${email}.`,
    `Ref: ${requestId.slice(0, 8)}.`,
    `View: ${queueUrl}`,
  ].join(" ");

  return sendSmsNotification({ to, body: message });
}
