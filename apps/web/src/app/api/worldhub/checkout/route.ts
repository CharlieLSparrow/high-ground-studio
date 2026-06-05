import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const offerId = url.searchParams.get("offerId");
  const successUrl = url.searchParams.get("successUrl") || `${url.origin}/dashboard?success=1`;
  const cancelUrl = url.searchParams.get("cancelUrl") || `${url.origin}/`;

  if (!offerId) {
    return new NextResponse("Missing offerId", { status: 400 });
  }

  const [{ auth }, { createStripeCheckoutSession }] = await Promise.all([
    import("@/auth"),
    import("@/lib/server/stripe"),
  ]);

  const session = await auth();
  const userEmail = session?.user?.primaryEmail || null;
  const userId = session?.user?.id || null;

  try {
    const { checkoutUrl } = await createStripeCheckoutSession({
      offerId,
      userEmail,
      userId,
      successUrl,
      cancelUrl,
    });

    if (checkoutUrl) {
      return NextResponse.redirect(checkoutUrl);
    }

    return new NextResponse("Failed to create checkout session", { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return new NextResponse(message, { status: 500 });
  }
}
