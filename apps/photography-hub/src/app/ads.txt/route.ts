export const dynamic = "force-dynamic";

function normalizeAdsTxtAccount() {
  const explicit = process.env.GOOGLE_ADSENSE_ADS_TXT_ACCOUNT?.trim();

  if (explicit) {
    return explicit;
  }

  const client = process.env.GOOGLE_ADSENSE_CLIENT?.trim();

  if (!client) {
    return null;
  }

  return client.replace(/^ca-/, "");
}

export function GET() {
  const account = normalizeAdsTxtAccount();

  if (!account) {
    return new Response("ads.txt is not configured for this site.\n", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
      status: 404,
    });
  }

  const relationship =
    process.env.GOOGLE_ADSENSE_ADS_TXT_RELATIONSHIP?.trim() || "DIRECT";
  const authority =
    process.env.GOOGLE_ADSENSE_ADS_TXT_AUTHORITY?.trim() ||
    "f08c47fec0942fa0";

  return new Response(`google.com, ${account}, ${relationship}, ${authority}\n`, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
