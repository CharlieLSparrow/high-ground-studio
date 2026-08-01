import { getPrismaClient } from "@/lib/prisma";
import { renderCalendarFeed } from "@/lib/server/calendar-feed";

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
      origin: new URL(request.url).origin,
    });
    if (!rendered) return missingFeed();
    return new Response(rendered.calendar, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "inline; filename=quipsly-calendar.ics",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
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
