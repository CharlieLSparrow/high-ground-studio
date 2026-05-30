import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";

// Mocking Stripe SDK for now to prevent build errors
// In the future, install `stripe` via pnpm and import:
// import Stripe from "stripe";
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });

export async function POST(req: Request) {
  try {
    const { email, itemSlug } = await req.json();

    if (!email || !itemSlug) {
      return NextResponse.json({ error: "Missing email or itemSlug" }, { status: 400 });
    }

    const prisma = getPrismaClient();

    // 1. Fetch the item from our catalog
    const catalogItem = await prisma.worldHubCatalogItem.findUnique({
      where: { slug: itemSlug },
    });

    if (!catalogItem) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // 2. Here we would create a Stripe Checkout session.
    // For now, we simulate a successful URL generation.
    /*
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: catalogItem.name },
            unit_amount: 1999, // In cents, would be dynamically fetched
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/cancel`,
      metadata: {
        itemSlug: catalogItem.slug,
      },
    });
    */

    const mockSessionUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/success?session_id=mock_stripe_session_12345`;

    console.log(`[Stripe Checkout] Generated checkout session for ${email} purchasing ${itemSlug}`);

    return NextResponse.json({ url: mockSessionUrl });

  } catch (err: any) {
    console.error("[Stripe Checkout] Error creating session:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
