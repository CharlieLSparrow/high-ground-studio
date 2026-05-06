import "server-only";

export type SmsNotificationResult =
  | { ok: true }
  | { ok: false; error: string };

function getRequiredSmsEnv() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const fromPhone = process.env.TWILIO_FROM_PHONE?.trim() ?? "";

  if (!accountSid || !authToken || !fromPhone) {
    return null;
  }

  return { accountSid, authToken, fromPhone };
}

export async function sendSmsNotification({
  to,
  body,
}: {
  to: string;
  body: string;
}): Promise<SmsNotificationResult> {
  const env = getRequiredSmsEnv();

  if (!env) {
    return { ok: false, error: "SMS env vars are not configured" };
  }

  const normalizedTo = to.trim();
  const normalizedBody = body.trim();

  if (!normalizedTo || !normalizedBody) {
    return { ok: false, error: "SMS destination or body is missing" };
  }

  const auth = Buffer.from(`${env.accountSid}:${env.authToken}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Messages.json`;
  const form = new URLSearchParams({
    To: normalizedTo,
    From: env.fromPhone,
    Body: normalizedBody,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
    });

    if (response.ok) {
      return { ok: true };
    }

    const errorText = (await response.text()).slice(0, 400);
    return {
      ok: false,
      error: `Twilio request failed (${response.status}): ${errorText || response.statusText}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown SMS error",
    };
  }
}
