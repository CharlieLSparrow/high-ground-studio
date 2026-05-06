import "server-only";

export type EmailResult =
  | { ok: true }
  | { ok: false; error: string };

function getRequiredEmailEnv() {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const from = process.env.HGO_EMAIL_FROM?.trim() ?? "";

  if (!apiKey || !from) {
    return null;
  }

  return { apiKey, from };
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailResult> {
  const env = getRequiredEmailEnv();

  if (!env) {
    return { ok: false, error: "Email env vars are not configured" };
  }

  const recipients = to.map((value) => value.trim()).filter(Boolean);

  if (recipients.length === 0) {
    return { ok: false, error: "Email recipients are missing" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.from,
        to: recipients,
        subject: subject.trim(),
        text: text.trim(),
        html: html?.trim(),
      }),
      cache: "no-store",
    });

    if (response.ok) {
      return { ok: true };
    }

    const errorText = (await response.text()).slice(0, 400);
    return {
      ok: false,
      error: `Resend request failed (${response.status}): ${errorText || response.statusText}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown email error",
    };
  }
}
