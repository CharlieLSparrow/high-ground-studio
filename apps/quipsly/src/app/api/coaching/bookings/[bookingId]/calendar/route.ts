import { getPrismaClient } from "@/lib/prisma";
import { buildIcsCalendar } from "@/lib/server/calendar-ics";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateError(status: number, message: string) {
  return Response.json(
    { ok: false, error: message, externalSideEffects: false },
    { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ bookingId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) return privateError(401, "Sign in before adding a private coaching session to a calendar.");

  const { bookingId } = await context.params;
  const prisma = getPrismaClient() as any;
  const booking = await prisma.coachingBooking.findFirst({
    where: {
      id: bookingId,
      ...(session.user.isStaff ? {} : {
        OR: [
          { clientUserId: session.user.id },
          { coachUserId: session.user.id },
          { callRoom: { createdByUserId: session.user.id } },
        ],
      }),
    },
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      updatedAt: true,
      offering: { select: { title: true } },
      callRoom: { select: { id: true, title: true } },
    },
  });
  if (!booking) return privateError(404, "That coaching calendar event was not found.");

  const publicOrigin = new URL(request.url).origin;
  const roomUrl = booking.callRoom?.id
    ? new URL(`/sessions/${encodeURIComponent(booking.callRoom.id)}`, publicOrigin).toString()
    : new URL("/coaching", publicOrigin).toString();
  const title = booking.callRoom?.title || booking.offering?.title || "Quipsly coaching session";
  const calendar = buildIcsCalendar({
    sourceType: "COACHING_BOOKING",
    sourceId: booking.id,
    title,
    description: "Open Quipsly for session details. Private notes, transcript text, goals, and recordings are not included in this calendar event.",
    location: "Quipsly Capture",
    startsAt: booking.scheduledStart,
    endsAt: booking.scheduledEnd,
    updatedAt: booking.updatedAt,
    url: roomUrl,
    status: booking.status === "CANCELED" ? "CANCELLED" : "CONFIRMED",
  });
  return new Response(calendar, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="quipsly-coaching-${booking.id}.ics"`,
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
