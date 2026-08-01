import { getPrismaClient } from "@/lib/prisma";
import { renderCalendarFeed } from "@/lib/server/calendar-feed";
import { resolveCalendarPublicOrigin } from "@/lib/server/calendar-public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function missingFeed() {
  return new Response(
    "Calendar subscription not found. It may have been replaced or revoked.\n",
    {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  try {
    const rendered = await renderCalendarFeed({
      prisma: getPrismaClient(),
      token,
      origin: resolveCalendarPublicOrigin(request.url),
    });
    if (!rendered) return missingFeed();
    const entityTag = `"${rendered.contentDigest}"`;
    const headers = {
      ETag: entityTag,
      "Cache-Control": "private, max-age=300, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    };
    if (
      request.headers
        .get("if-none-match")
        ?.split(",")
        .some((value) => {
          const candidate = value.trim().replace(/^W\//, "");
          return candidate === entityTag || candidate === "*";
        })
    ) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(rendered.calendar, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "inline; filename=quipsly-calendar.ics",
        ...headers,
      },
    });
  } catch (error) {
    console.error("[calendar-feed] Failed to render subscription", error);
    return new Response("Calendar subscription is temporarily unavailable.\n", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  }
}
